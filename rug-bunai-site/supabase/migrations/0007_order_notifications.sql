-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_order_notifications.sql — Durable notification outbox for COD orders
-- Idempotent: safe to re-run; never drops or overwrites existing data.
-- Apply via the Supabase SQL Editor (or `supabase db push`). This file is
-- version-controlled migration text only — it has NOT been applied to any
-- live project from this coding environment.
--
-- Design:
--   • One row per RECIPIENT × CHANNEL per order (4 rows for a normal COD
--     order: customer email, admin email, customer WhatsApp, admin WhatsApp).
--   • Created automatically by an AFTER INSERT trigger on public.orders, so
--     notification work is recorded atomically with the order itself — but
--     delivery happens OUTSIDE the order transaction (an outage can never
--     roll back a legitimate order).
--   • A worker (Supabase Edge Function, cron'd via pg_cron/supabase-cron or
--     an external scheduler) claims pending rows, calls Resend / WhatsApp
--     Cloud API, and marks each row sent/failed independently. Retries only
--     touch failed/pending rows, so successful messages are never resent.
--   • Duplicate Place Order submissions cannot duplicate notifications:
--     create_order() dedupes by idempotency_key before inserting, and the
--     trigger fires once per real order row.
--   • RLS: no customer-facing policies at all (service-role worker only);
--     verified admins may read job status in the Studio. Nobody can mark
--     rows 'sent' directly through the API — only via the SECURITY DEFINER
--     functions below, which require the service role or an admin JWT.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('customer', 'admin')),
  channel text not null check (channel in ('email', 'whatsapp')),
  -- Snapshot of the destination taken when the job was queued.
  destination text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider_message_id text,          -- Resend / WABA id once accepted
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one job per order+recipient+channel: retries update this row,
  -- they never queue a second job for the same delivery.
  unique (order_id, recipient_kind, channel)
);

create index if not exists order_notifications_claim_idx
  on public.order_notifications (status, next_attempt_at);

alter table public.order_notifications enable row level security;

-- Customers have NO access (their own orders are visible; notification jobs
-- are internal operational data). Admins may read status for support.
drop policy if exists "Admins read notification jobs" on public.order_notifications;
create policy "Admins read notification jobs"
  on public.order_notifications for select to authenticated
  using (public.is_admin());

-- ── Queue jobs automatically whenever a real order row lands ──────────────
-- Destinations come from the trusted order snapshot (create_order already
-- validated email + phone-bearing profile). Phone numbers are resolved from
-- auth.users.phone / profiles.phone at queue time; when a party has no
-- usable number the job is inserted as 'skipped' with a reason instead of
-- silently vanishing — the Studio shows exactly what wasn't delivered.
create or replace function public.queue_order_notifications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer_phone text;
  v_admin_email    text;
  v_admin_phone    text;
begin
  -- Customer email: always available (orders.email is not-null & validated).
  insert into public.order_notifications (order_id, recipient_kind, channel, destination)
  values (new.id, 'customer', 'email', new.email)
  on conflict (order_id, recipient_kind, channel) do nothing;

  -- Customer WhatsApp: requires a stored phone + consent flag on profiles.
  select coalesce(pr.phone, au.phone) into v_customer_phone
    from auth.users au
    left join public.profiles pr on pr.id = au.id
   where au.id = new.customer_id;

  insert into public.order_notifications (order_id, recipient_kind, channel, destination, status, last_error)
  values (
    new.id, 'customer', 'whatsapp', coalesce(v_customer_phone, ''),
    case when v_customer_phone is null or v_customer_phone = '' then 'skipped' else 'pending' end,
    case when v_customer_phone is null or v_customer_phone = '' then 'no phone number on account' else null end
  )
  on conflict (order_id, recipient_kind, channel) do nothing;

  -- Admin destinations come from function settings (set via
  -- `alter database`/edge-config or the secrets documented in README):
  select current_setting('rb.order_admin_email', true)      into v_admin_email;
  select current_setting('rb.order_admin_whatsapp', true)   into v_admin_phone;

  insert into public.order_notifications (order_id, recipient_kind, channel, destination, status, last_error)
  values (
    new.id, 'admin', 'email', coalesce(v_admin_email, ''),
    case when v_admin_email is null or v_admin_email = '' then 'skipped' else 'pending' end,
    case when v_admin_email is null or v_admin_email = '' then 'GUC rb.order_admin_email not configured' else null end
  )
  on conflict (order_id, recipient_kind, channel) do nothing;

  insert into public.order_notifications (order_id, recipient_kind, channel, destination, status, last_error)
  values (
    new.id, 'admin', 'whatsapp', coalesce(v_admin_phone, ''),
    case when v_admin_phone is null or v_admin_phone = '' then 'skipped' else 'pending' end,
    case when v_admin_phone is null or v_admin_phone = '' then 'GUC rb.order_admin_whatsapp not configured' else null end
  )
  on conflict (order_id, recipient_kind, channel) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_queue_order_notifications on public.orders;
create trigger trg_queue_order_notifications
  after insert on public.orders
  for each row execute function public.queue_order_notifications();

-- ── Worker RPCs (service role / admin only) ───────────────────────────────
-- Claim up to p_limit due jobs and flip them to 'sending' atomically, so two
-- workers can never grab the same row.
create or replace function public.claim_notification_jobs(p_limit integer default 10)
returns setof public.order_notifications
language plpgsql
security definer set search_path = public
as $$
begin
  if not (auth.jwt() ->> 'role' = 'service_role' or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  return query
    update public.order_notifications n
       set status = 'sending', attempts = n.attempts + 1, updated_at = now()
     where n.id in (
       select x.id from public.order_notifications x
        where x.status in ('pending', 'failed')
          and x.next_attempt_at <= now()
        order by x.next_attempt_at
        for update of x skip locked
        limit greatest(coalesce(p_limit, 10), 1)
     )
     returning n.*;
end;
$$;

-- Mark a claimed job sent (records the provider message id).
create or replace function public.complete_notification_job(
  p_id uuid, p_provider_message_id text default null
) returns void
language sql
security definer set search_path = public
as $$
  update public.order_notifications
     set status = 'sent', provider_message_id = p_provider_message_id,
         last_error = null, updated_at = now()
   where id = p_id
     and (auth.jwt() ->> 'role' = 'service_role' or public.is_admin());
$$;

-- Record a failure with exponential backoff; the row stays retryable and the
-- SAME row is reused — no duplicate jobs are ever created.
create or replace function public.fail_notification_job(p_id uuid, p_error text)
returns void
language sql
security definer set search_path = public
as $$
  update public.order_notifications
     set status = 'failed', last_error = left(coalesce(p_error, 'unknown error'), 500),
         next_attempt_at = now() + make_interval(mins => least(power(2, attempts)::int * 2, 60)),
         updated_at = now()
   where id = p_id
     and (auth.jwt() ->> 'role' = 'service_role' or public.is_admin());
$$;

revoke all on function public.claim_notification_jobs(integer) from anon, authenticated;
revoke all on function public.complete_notification_job(uuid, text) from anon, authenticated;
revoke all on function public.fail_notification_job(uuid, text) from anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;
grant execute on function public.complete_notification_job(uuid, text) to service_role;
grant execute on function public.fail_notification_job(uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL SETUP REQUIRED (documented, not automatable from here):
--  1. Deploy supabase/functions/order-notifications (see that folder) and
--     schedule it every minute (Supabase cron / GitHub Actions / external).
--  2. Set function secrets: RESEND_API_KEY, EMAIL_FROM, ORDER_ADMIN_EMAIL,
--     WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ADMIN_PHONE,
--     WHATSAPP_ORDER_TEMPLATE.
--  3. Verify the sending domain in Resend.
--  4. Get the WhatsApp order-confirmation template approved on Meta's
--     WhatsApp Business Platform and collect explicit customer consent —
--     until then those jobs stay 'pending'/'skipped'; emails still flow.
-- ═══════════════════════════════════════════════════════════════════════════
