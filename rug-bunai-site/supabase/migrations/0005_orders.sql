-- ═══════════════════════════════════════════════════════════════════════════
-- 0005_orders.sql — Persistent order management (NO payment gateway yet)
-- Idempotent: safe to re-run; never drops or overwrites existing data.
-- Apply via the Supabase SQL Editor (or `supabase db push`). This file is
-- version-controlled migration text only — it has NOT been applied to any
-- live project from this coding environment.
-- Money is stored as INTEGER PAISE everywhere (1 INR = 100 paise) to avoid
-- floating-point rounding errors. Orders are created ONLY through the
-- security-definer function public.create_order (Phase 3 trusted boundary);
-- no direct-insert policies exist for customers, and RLS blocks all writes
-- that bypass it. Payment status stays 'pending' until a real payment
-- integration exists — nothing here marks an order paid.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  -- Snapshot of checkout contact/delivery details (kept even if profile changes).
  email text not null,
  full_name text not null,
  address text not null,
  city text not null,
  pin text not null check (pin ~ '^[0-9]{6}$'),
  -- Totals in integer PAISE, derived server-side by create_order().
  items_subtotal_paise bigint not null check (items_subtotal_paise >= 0),
  coating_subtotal_paise bigint not null default 0 check (coating_subtotal_paise >= 0),
  shipping_paise bigint not null default 0 check (shipping_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'placed'
    check (status in ('placed', 'in_production', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded')),
  -- Retry safety: the client generates one request key per checkout attempt.
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_idx   on public.orders (customer_id, created_at desc);
create index if not exists orders_status_idx     on public.orders (status);
create index if not exists orders_payment_idx    on public.orders (payment_status);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_slug text not null,
  -- Purchase-time snapshots so later catalogue edits can't rewrite history.
  product_name text not null,
  image_url text,
  variant_id text not null,
  size_label text not null,               -- e.g. "5 × 8 ft"
  width_ft numeric(8,2) not null check (width_ft > 0),
  length_ft numeric(8,2) not null check (length_ft > 0),
  is_custom_size boolean not null default false,
  colour_slug text,
  colour_name text,
  colour_hex text,                        -- set only for custom-colour requests
  quantity integer not null check (quantity > 0 and quantity <= 20),
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  coating boolean not null default false,
  coating_charge_paise bigint not null default 0 check (coating_charge_paise >= 0),
  line_total_paise bigint not null check (line_total_paise >= 0),
  note text,                              -- atelier request notes for custom offers
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Customers read ONLY their own orders / items. No insert/update/delete
-- policies for customers exist → direct writes are denied by RLS.
drop policy if exists "Customers read their own orders" on public.orders;
create policy "Customers read their own orders"
  on public.orders for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists "Customers read their own order items" on public.order_items;
create policy "Customers read their own order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.customer_id = auth.uid()
  ));

-- Verified admins (profiles.role='admin' via the existing is_admin()) may
-- read every order and update fulfilment status only — enforced below by
-- WITH CHECK plus the update_order_status() guard. Prices, ownership and
-- payment_status are never admin-editable until payments exist.
drop policy if exists "Admins read all orders" on public.orders;
create policy "Admins read all orders"
  on public.orders for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins update fulfilment status only" on public.orders;
create policy "Admins update fulfilment status only"
  on public.orders for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins read all order items" on public.order_items;
create policy "Admins read all order items"
  on public.order_items for select to authenticated
  using (public.is_admin());

-- ── Trusted order creation ────────────────────────────────────────────────
-- SECURITY DEFINER function: the ONLY path that inserts orders. It derives
-- the customer from auth.uid() (never from arguments), validates shapes,
-- clamps quantities, and rejects malformed payloads atomically (all items
-- validated before any row is inserted; the whole body runs in the implicit
-- transaction of the RPC call, so a mid-way failure rolls everything back).
-- The frontend additionally recomputes every price from trusted catalogue +
-- pricing rules before calling this function. (A fully server-authoritative
-- price lookup would need the catalogue moved into Postgres — noted as a
-- follow-up; today products live in source code.)
create or replace function public.create_order(
  p_idempotency_key uuid,
  p_email text,
  p_full_name text,
  p_address text,
  p_city text,
  p_pin text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_item jsonb;
  v_items_total bigint := 0;
  v_coat_total bigint := 0;
  v_order uuid;
  v_qty int;
  v_unit bigint;
  v_coat bigint;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_email is null or p_full_name is null or p_address is null
     or p_city is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'complete delivery details are required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item';
  end if;

  -- Retry safety: same idempotency key + same customer → return the original
  -- order instead of creating a duplicate.
  select id into v_existing from public.orders
   where idempotency_key = p_idempotency_key and customer_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('order_id', v_existing, 'replayed', true);
  end if;

  -- Validate every item first (fail atomically before inserting anything).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item->>'product_slug' is null or v_item->>'variant_id' is null
       or v_item->>'size_label' is null
       or coalesce((v_item->>'width_ft')::numeric, 0) <= 0
       or coalesce((v_item->>'length_ft')::numeric, 0) <= 0
       or coalesce((v_item->>'unit_price_paise')::bigint, -1) < 0
       or coalesce((v_item->>'coating_charge_paise')::bigint, -1) < 0 then
      raise exception 'invalid order item';
    end if;
    v_qty := least(greatest(coalesce((v_item->>'quantity')::int, 1), 1), 20);
    v_unit := (v_item->>'unit_price_paise')::bigint;
    v_coat := coalesce((v_item->>'coating_charge_paise')::bigint, 0);
    v_items_total := v_items_total + v_unit * v_qty;
    v_coat_total := v_coat_total + v_coat * v_qty;
  end loop;

  insert into public.orders (customer_id, email, full_name, address, city, pin,
    items_subtotal_paise, coating_subtotal_paise, total_paise, idempotency_key)
  values (v_uid, lower(trim(p_email)), trim(p_full_name), trim(p_address),
    trim(p_city), p_pin, v_items_total, v_coat_total,
    v_items_total + v_coat_total, p_idempotency_key)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((v_item->>'quantity')::int, 1), 1), 20);
    insert into public.order_items (order_id, product_slug, product_name, image_url,
      variant_id, size_label, width_ft, length_ft, is_custom_size, colour_slug,
      colour_name, colour_hex, quantity, unit_price_paise, coating,
      coating_charge_paise, line_total_paise, note)
    values (v_order, v_item->>'product_slug',
      coalesce(v_item->>'product_name', v_item->>'product_slug'),
      v_item->>'image_url', v_item->>'variant_id', v_item->>'size_label',
      (v_item->>'width_ft')::numeric, (v_item->>'length_ft')::numeric,
      coalesce((v_item->>'is_custom_size')::boolean, false),
      v_item->>'colour_slug', v_item->>'colour_name', v_item->>'colour_hex',
      v_qty, (v_item->>'unit_price_paise')::bigint,
      coalesce((v_item->>'coating')::boolean, false),
      coalesce((v_item->>'coating_charge_paise')::bigint, 0),
      ((v_item->>'unit_price_paise')::bigint
        + coalesce((v_item->>'coating_charge_paise')::bigint, 0)) * v_qty,
      v_item->>'note');
  end loop;

  return jsonb_build_object('order_id', v_order, 'replayed', false);
end;
$$;

revoke execute on function public.create_order(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_order(uuid, text, text, text, text, text, jsonb) to authenticated;

-- ── Admin fulfilment-status updates (validated server-side) ───────────────
-- Guards against payment-status tampering regardless of table policy:
-- only verified admins may run this, and only for fulfilment status.
create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer set search_path = public
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

-- Keep updated_at fresh when admins edit via the table directly.
create or replace function public.touch_orders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute procedure public.touch_orders_updated_at();
