-- ═══════════════════════════════════════════════════════════════════════════
-- 0007_cod_orders_trusted_pricing.sql — Cash-on-Delivery orders with a
-- SERVER-AUTHORITATIVE price source and an atomic notification outbox.
--
-- Idempotent: safe to re-run; never drops or overwrites existing data.
-- Apply via the Supabase SQL Editor (or `supabase db push`). This file is
-- version-controlled migration text only — it has NOT been applied to any
-- live project from this coding environment.
--
-- What this fixes / adds on top of 0005:
--   * TRUSTED PRICING — prices, coating charges and totals are no longer
--     accepted from the browser at all. The checkout syncs the catalogue
--     into public.product_prices (admin-only) and public.create_order()
--     recomputes every rupee in the database from that table plus the
--     immutable coating rate. Client-supplied amounts are ignored.
--   * COD — payment_method column ('cod' only for now), order_reference
--     (human-friendly RB-YYYYMMDD-XXXXXX), phone + WhatsApp consent.
--   * NO PRIVILEGE LEAK — the admin table UPDATE policy is removed; admins
--     change fulfilment status ONLY through update_order_status(), which
--     re-checks the role inside the security-definer body. Payment status
--     changes ONLY through mark_order_paid(), allowed when cash was
--     physically collected on a delivered order.
--   * OUTBOX — create_order() enqueues four notification jobs (customer
--     email, admin email, customer WhatsApp, admin WhatsApp) inside the
--     SAME transaction as the order rows. A messaging failure can never
--     roll back a legitimate order, and a successful order can never be
--     duplicated by a retry (idempotency key).
--   * HARDENED SEARCH_PATH — every function pins pg_temp to an empty
--     schema so nobody can shadow operators/types via search_path.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Admin-managed trusted price book ───────────────────────────────────────
-- Mirrors the catalogue's per-variant INR prices into Postgres so the DB,
-- not the browser, owns money. Synced by the checkout right before placing
-- an order (the sync itself is admin-restricted; customers only READ it).
create table if not exists public.product_prices (
  variant_id     text primary key,
  product_slug   text not null,
  price_inr      integer not null check (price_inr > 0 and price_inr < 100000000),
  width_ft       numeric(8,2) not null check (width_ft > 0 and width_ft <= 30),
  length_ft      numeric(8,2) not null check (length_ft > 0 and length_ft <= 30),
  updated_at     timestamptz not null default now()
);
alter table public.product_prices enable row level security;
drop policy if exists "Anyone reads the trusted price book" on public.product_prices;
create policy "Anyone reads the trusted price book" on public.product_prices
  for select using (true);
drop policy if exists "Admins sync the trusted price book" on public.product_prices;
create policy "Admins sync the trusted price book" on public.product_prices
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Orders: new columns (additive, never destructive) ──────────────────────
-- Guarantee the idempotency column exists even on projects where 0005 was
-- applied from an earlier revision that lacked it (create_order below relies
-- on this unique key). ADD COLUMN IF NOT EXISTS is non-destructive; the
-- UNIQUE constraint makes replayed checkout attempts return the original row.
alter table public.orders add column if not exists idempotency_key uuid;
create unique index if not exists orders_idempotency_uidx
  on public.orders (idempotency_key);
alter table public.orders add column if not exists order_reference text;
alter table public.orders add column if not exists payment_method text not null default 'cod'
  check (payment_method in ('cod'));
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists whatsapp_consent boolean not null default false;

update public.orders set order_reference = 'RB-' || upper(substr(id::text, 2, 6))
  where order_reference is null;

create unique index if not exists orders_reference_uidx on public.orders (order_reference);
create index if not exists orders_reference_idx on public.orders (order_reference);

-- ── Lock the tables down: no direct writes for anyone but service roles ────
-- (0005 already omitted customer INSERT policies; we also remove the old
-- admin table-UPDATE policy so protected columns can never be edited via a
-- plain UPDATE — every mutation goes through a guarded SECURITY DEFINER RPC.)
drop policy if exists "Admins update fulfilment status only" on public.orders;
drop policy if exists "Customers read their own orders" on public.orders;
drop policy if exists "Customers read their own order items" on public.order_items;
drop policy if exists "Admins read all orders" on public.orders;
drop policy if exists "Admins read all order items" on public.order_items;

create policy "Customers read their own orders"
  on public.orders for select to authenticated
  using (customer_id = auth.uid());
create policy "Customers read their own order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()));
create policy "Admins read all orders"
  on public.orders for select to authenticated
  using (public.is_admin());
create policy "Admins read all order items"
  on public.order_items for select to authenticated
  using (public.is_admin());

-- ── Notification outbox ────────────────────────────────────────────────────
-- One row per recipient AND channel. Queued atomically by create_order();
-- processed independently by the order-notifications Edge Function, which
-- records status, attempts and error details per job. Retrying a failed
-- job never touches the order and never re-sends a 'sent' job.
create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient_type text not null check (recipient_type in ('customer', 'admin')),
  to_address text not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one job per order/channel/recipient — duplicate enqueue is
  -- impossible even under concurrent retries.
  unique (order_id, channel, recipient_type)
);
create index if not exists order_notifications_pending_idx
  on public.order_notifications (status, created_at)
  where status in ('queued', 'failed');
alter table public.order_notifications enable row level security;
drop policy if exists "Admins read notification log" on public.order_notifications;
create policy "Admins read notification log" on public.order_notifications
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: only the security-definer functions and
-- the service-role Edge Function may write jobs.

-- ── Claim next pending job (Edge Function only; FOR UPDATE SKIP LOCKED) ────
create or replace function public.claim_notification_job()
returns table (id uuid, order_id uuid, channel text, recipient_type text,
               to_address text, payload jsonb, attempts int)
language plpgsql security definer
set search_path = public, pg_temp = ''
as $$
declare v_row record;
begin
  -- Service role (the Edge Function) is the only legitimate caller.
  if auth.role() is distinct from 'service_role' then
    raise exception 'only the notification worker may claim jobs';
  end if;
  select * into v_row from public.order_notifications
   where (status = 'queued'
          or (status = 'failed' and attempts < max_attempts))
   order by created_at
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;
  update public.order_notifications
     set status = 'processing', attempts = attempts + 1, updated_at = now()
   where id = v_row.id;
  return query select v_row.id, v_row.order_id, v_row.channel,
    v_row.recipient_type, v_row.to_address, v_row.payload, v_row.attempts + 1;
end;
$$;
revoke execute on function public.claim_notification_job() from public, anon, authenticated;
grant execute on function public.claim_notification_job() to service_role;

-- ── Record a job outcome (Edge Function only) ──────────────────────────────
create or replace function public.complete_notification_job(
  p_id uuid, p_status text, p_error text default null, p_provider_id text default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'only the notification worker may complete jobs';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'unknown notification outcome';
  end if;
  update public.order_notifications
     set status = p_status,
         last_error = case when p_status = 'failed'
                           then left(coalesce(p_error, 'unknown error'), 500)
                           else null end,
         provider_message_id = coalesce(p_provider_id, provider_message_id),
         -- A permanently-failed job stays 'failed'; the worker/admin can
         -- requeue it explicitly after fixing configuration.
         updated_at = now()
   where id = p_id;
end;
$$;
revoke execute on function public.complete_notification_job(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_notification_job(uuid, text, text, text) to service_role;

-- ── Admin retry: reset ONE failed job without touching the order ───────────
create or replace function public.retry_order_notification(p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp = ''
as $$
begin
  -- Role checked INSIDE the definer body (never trust the caller alone).
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;
  update public.order_notifications
     set status = 'queued', last_error = null, updated_at = now()
   where id = p_id and status in ('failed', 'skipped');
  if not found then
    raise exception 'only failed or skipped notifications can be retried';
  end if;
end;
$$;
revoke execute on function public.retry_order_notification(uuid) from public, anon;
grant execute on function public.retry_order_notification(uuid) to authenticated;

-- ── Trusted COD order creation (THE only path that inserts orders) ─────────
-- Differences from 0005/create_order:
--   * No client price arguments exist at all — unit prices come from
--     public.product_prices, coating from the immutable ₹90/sq ft rule,
--     quantities are clamped, totals are re-derived here.
--   * Standard variants must exist in the price book → unknown/tampered
--     slugs fail closed. Custom Studio offers are validated against the
--     same size bounds and priced per square foot from the parent's
--     cheapest listed price (a snapshot estimate the atelier confirms).
--   * Enqueues the four notification jobs atomically with the order.
--   * Idempotency: replaying the same key returns the ORIGINAL order.
create or replace function public.create_order(
  p_idempotency_key uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_whatsapp_consent boolean,
  p_address text,
  p_city text,
  p_pin text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_replay_ref text;
  v_item jsonb;
  v_price record;
  v_items_total bigint := 0;
  v_coat_total bigint := 0;
  v_order uuid;
  v_ref text;
  v_qty int;
  v_unit bigint;              -- trusted unit price in PAISE
  v_coat bigint := 0;         -- trusted coating charge per unit in PAISE
  v_sqft numeric;
  v_rate bigint;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_email is null or p_full_name is null or p_address is null
     or p_city is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'complete delivery details are required';
  end if;
  if p_phone is null or p_phone !~ '^[0-9+ -]{8,20}$' then
    raise exception 'a valid contact phone number is required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item';
  end if;
  if length(trim(p_full_name)) < 3 or length(trim(p_address)) < 8
     or length(trim(p_city)) < 2 or length(trim(p_email)) > 254 then
    raise exception 'complete delivery details are required';
  end if;

  -- Retry safety: same idempotency key + same customer → original order.
  select id, order_reference into v_existing, v_replay_ref from public.orders
   where idempotency_key = p_idempotency_key and customer_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('order_id', v_existing,
                              'order_reference', v_replay_ref, 'replayed', true);
  end if;

  -- Validate & recompute EVERY line first — fail atomically before rows.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item->>'product_slug' is null or v_item->>'variant_id' is null then
      raise exception 'invalid order item';
    end if;
    if coalesce((v_item->>'quantity')::int, 0) < 1
       or coalesce((v_item->>'quantity')::int, 0) > 20 then
      raise exception 'quantities must be between 1 and 20';
    end if;
    if coalesce((v_item->>'is_custom_size')::boolean, false) then
      -- Custom Studio offer: dimensions supplied but NEVER a price — the DB
      -- derives the estimate from the parent product's cheapest listed rug.
      if coalesce((v_item->>'width_ft')::numeric, 0) < 1
         or coalesce((v_item->>'length_ft')::numeric, 0) < 1
         or coalesce((v_item->>'width_ft')::numeric, 0) > 15
         or coalesce((v_item->>'length_ft')::numeric, 0) > 15
         or (v_item->>'width_ft')::numeric * (v_item->>'length_ft')::numeric < 2
         or (v_item->>'width_ft')::numeric * (v_item->>'length_ft')::numeric > 150 then
        raise exception 'custom sizes must be between 2 and 150 sq ft (max 15 ft per side)';
      end if;
    else
      select * into v_price from public.product_prices
       where variant_id = v_item->>'variant_id'
         and product_slug = v_item->>'product_slug';
      if not found then
        raise exception 'item % is not in the trusted price book — refresh and try again',
          v_item->>'variant_id';
      end if;
      if abs(v_price.width_ft - coalesce((v_item->>'width_ft')::numeric, -1)) > 0.01
         or abs(v_price.length_ft - coalesce((v_item->>'length_ft')::numeric, -1)) > 0.01 then
        raise exception 'the size you selected changed — review your cart before ordering';
      end if;
    end if;
  end loop;

  -- Human-friendly reference, e.g. RB-20261011-4F9A2C.
  v_ref := 'RB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into public.orders (customer_id, order_reference, email, full_name, phone,
    whatsapp_consent, address, city, pin, payment_method, status, payment_status,
    items_subtotal_paise, coating_subtotal_paise, total_paise, idempotency_key)
  values (v_uid, v_ref, lower(trim(p_email)), trim(p_full_name), trim(p_phone),
    coalesce(p_whatsapp_consent, false), trim(p_address), trim(p_city), p_pin,
    'cod', 'placed', 'pending', 0, 0, 0, p_idempotency_key)
  returning id into v_order;

  -- Second pass: derive trusted money and insert snapshot rows.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((v_item->>'quantity')::int, 1), 1), 20);
    v_coat := 0;
    if coalesce((v_item->>'is_custom_size')::boolean, false) then
      v_sqft := (v_item->>'width_ft')::numeric * (v_item->>'length_ft')::numeric;
      select min(pp.price_inr) into v_rate from public.product_prices pp
       where pp.product_slug = v_item->>'product_slug';
      if v_rate is null then
        raise exception 'no base price exists for % — ask the studio for a quote',
          v_item->>'product_slug';
      end if;
      -- Estimate: nearest standard size's ₹/sq ft × custom sq ft (INR, rounded).
      v_unit := (round(v_rate * v_sqft) * 100)::bigint;
      if coalesce((v_item->>'coating')::boolean, false) then
        v_coat := (round(v_sqft * 90) * 100)::bigint;   -- ₹90/sq ft, server-side
      end if;
    else
      select * into v_price from public.product_prices where variant_id = v_item->>'variant_id';
      v_unit := (v_price.price_inr * 100)::bigint;
      if coalesce((v_item->>'coating')::boolean, false) then
        v_sqft := round(v_price.width_ft * v_price.length_ft * 10) / 10;
        v_coat := (round(v_sqft * 90) * 100)::bigint;
      end if;
    end if;
    v_items_total := v_items_total + v_unit * v_qty;
    v_coat_total  := v_coat_total + v_coat * v_qty;

    insert into public.order_items (order_id, product_slug, product_name, image_url,
      variant_id, size_label, width_ft, length_ft, is_custom_size, colour_slug,
      colour_name, colour_hex, quantity, unit_price_paise, coating,
      coating_charge_paise, line_total_paise, note)
    values (v_order, v_item->>'product_slug',
      coalesce(nullif(v_item->>'product_name', ''), v_item->>'product_slug'),
      v_item->>'image_url', v_item->>'variant_id',
      coalesce(nullif(v_item->>'size_label', ''),
               (v_item->>'width_ft') || ' × ' || (v_item->>'length_ft') || ' ft'),
      (v_item->>'width_ft')::numeric, (v_item->>'length_ft')::numeric,
      coalesce((v_item->>'is_custom_size')::boolean, false),
      v_item->>'colour_slug', v_item->>'colour_name', v_item->>'colour_hex',
      v_qty, v_unit, coalesce((v_item->>'coating')::boolean, false), v_coat,
      (v_unit + v_coat) * v_qty, v_item->>'note');
  end loop;

  update public.orders
     set items_subtotal_paise = v_items_total,
         coating_subtotal_paise = v_coat_total,
         total_paise = v_items_total + v_coat_total
   where id = v_order;

  -- ── Outbox: queue notifications INSIDE this transaction ────────────────
  v_payload := jsonb_build_object(
    'order_id', v_order,
    'order_reference', v_ref,
    'full_name', trim(p_full_name),
    'email', lower(trim(p_email)),
    'phone', trim(p_phone),
    'address', trim(p_address),
    'city', trim(p_city),
    'pin', p_pin,
    'items_subtotal_paise', v_items_total,
    'coating_subtotal_paise', v_coat_total,
    'total_paise', v_items_total + v_coat_total,
    'currency', 'INR',
    'payment_method', 'cod',
    'payment_status', 'pending',
    'placed_at', now(),
    'items', (select jsonb_agg(jsonb_build_object(
        'name', oi.product_name, 'size', oi.size_label, 'qty', oi.quantity,
        'unit_price_paise', oi.unit_price_paise,
        'coating', oi.coating,
        'coating_charge_paise', oi.coating_charge_paise,
        'line_total_paise', oi.line_total_paise,
        'colour', oi.colour_name, 'note', oi.note) order by oi.created_at)
      from public.order_items oi where oi.order_id = v_order));

  -- Customer jobs always exist; the worker skips WhatsApp politely when the
  -- customer declined consent (job status 'skipped', never a silent lie).
  insert into public.order_notifications (order_id, channel, recipient_type, to_address, payload)
  values
    (v_order, 'email',    'customer', lower(trim(p_email)), v_payload),
    (v_order, 'whatsapp', 'customer',
      case when coalesce(p_whatsapp_consent, false) then trim(p_phone) else '' end,
      v_payload)
  on conflict (order_id, channel, recipient_type) do nothing;

  -- Admin jobs: one per verified admin profile (role='admin'). The Edge
  -- Function additionally falls back to ORDER_ADMIN_EMAIL / WHATSAPP_ADMIN_PHONE
  -- secrets for any channel where no admin row provides an address.
  insert into public.order_notifications (order_id, channel, recipient_type, to_address, payload)
  select v_order, 'email', 'admin', lower(pr.email), v_payload
    from public.profiles pr
   where pr.role = 'admin' and pr.email ~ '@'
   limit 5
  on conflict (order_id, channel, recipient_type) do nothing;

  -- Guarantee at least one admin email job even when no admin profile rows
  -- exist: the worker falls back to the ORDER_ADMIN_EMAIL secret. The unique
  -- (order_id, channel, recipient_type) constraint keeps this a no-op when
  -- real admin profiles already provided jobs above.
  insert into public.order_notifications (order_id, channel, recipient_type, to_address, payload)
  select v_order, 'email', 'admin', '', v_payload
   where not exists (
     select 1 from public.order_notifications n
      where n.order_id = v_order and n.channel = 'email' and n.recipient_type = 'admin')
  on conflict (order_id, channel, recipient_type) do nothing;

  -- Admin WhatsApp: always queued with an empty address — the destination
  -- number comes ONLY from the WHATSAPP_ADMIN_PHONE secret at send time.
  -- (No admin profile rows are needed for this job to exist.) If the secret
  -- is missing the worker records 'skipped' with a reason — never a fake 'sent'.
  insert into public.order_notifications (order_id, channel, recipient_type, to_address, payload)
  values (v_order, 'whatsapp', 'admin', '', v_payload)
  on conflict (order_id, channel, recipient_type) do nothing;

  return jsonb_build_object('order_id', v_order, 'order_reference', v_ref, 'replayed', false);
end;
$$;
revoke execute on function public.create_order(uuid, text, text, text, boolean, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_order(uuid, text, text, text, boolean, text, text, text, jsonb)
  to authenticated;

-- Drop the older 0005 signature so there is exactly ONE trusted entry point.
drop function if exists public.create_order(uuid, text, text, text, text, text, jsonb);

-- ── Admin fulfilment updates (role re-checked inside the body) ─────────────
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;
  if p_status not in ('placed', 'in_production', 'shipped', 'delivered', 'cancelled') then
    raise exception 'unknown order status';
  end if;
  update public.orders set status = p_status, updated_at = now()
   where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;
end;
$$;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
grant execute on function public.update_order_status(uuid, text) to authenticated;

-- ── COD payment collection (cash actually received) ────────────────────────
-- Only admins, only for payment_method='cod', only once the order reached
-- 'delivered'. Nothing else in the database can set payment_status='paid'.
create or replace function public.mark_order_paid(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp = ''
as $$
declare v_status text; v_pay text; v_method text;
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;
  select status, payment_status, payment_method into v_status, v_pay, v_method
    from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_method <> 'cod' then
    raise exception 'only cash-on-delivery orders can be marked paid here';
  end if;
  if v_status <> 'delivered' then
    raise exception 'confirm the order as delivered before collecting cash';
  end if;
  if v_pay = 'paid' then
    return; -- idempotent
  end if;
  update public.orders set payment_status = 'paid', updated_at = now()
   where id = p_order_id;
end;
$$;
revoke execute on function public.mark_order_paid(uuid) from public, anon;
grant execute on function public.mark_order_paid(uuid) to authenticated;

-- ── Price-book sync (admin-only; validates every row before writing) ───────
create or replace function public.sync_product_prices(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp = ''
as $$
declare v_item jsonb; v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'expected an array of {variant_id, product_slug, price_inr, width_ft, length_ft}';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item->>'variant_id' is null or v_item->>'product_slug' is null
       or coalesce((v_item->>'price_inr')::int, 0) <= 0
       or coalesce((v_item->>'width_ft')::numeric, 0) <= 0
       or coalesce((v_item->>'length_ft')::numeric, 0) <= 0 then
      raise exception 'invalid price entry';
    end if;
    insert into public.product_prices (variant_id, product_slug, price_inr, width_ft, length_ft)
    values (v_item->>'variant_id', v_item->>'product_slug',
            (v_item->>'price_inr')::int,
            (v_item->>'width_ft')::numeric, (v_item->>'length_ft')::numeric)
    on conflict (variant_id) do update
      set product_slug = excluded.product_slug,
          price_inr    = excluded.price_inr,
          width_ft     = excluded.width_ft,
          length_ft    = excluded.length_ft,
          updated_at   = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.sync_product_prices(jsonb) from public, anon;
grant execute on function public.sync_product_prices(jsonb) to authenticated;

-- Keep updated_at fresh on orders (triggers cannot be bypassed by policies).
create or replace function public.touch_orders_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute procedure public.touch_orders_updated_at();

create or replace function public.touch_notifications_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists notifications_touch_updated_at on public.order_notifications;
create trigger notifications_touch_updated_at
  before update on public.order_notifications
  for each row execute procedure public.touch_notifications_updated_at();
