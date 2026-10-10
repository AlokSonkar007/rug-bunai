-- ═══════════════════════════════════════════════════════════════════════════
-- 0008_trusted_pricing_cod_payment.sql — server-side price verification + COD collection
-- Prerequisite: 0005_orders.sql (orders/order_items/create_order) and the
-- base schema (managed_products, product_overrides). Idempotent & additive:
-- no drops, no data resets. NOT applied to any live DB from this environment.
--
-- Why: create_order() in 0005 stored unit prices supplied by the browser.
-- Browser-submitted money is untrusted. This migration makes the database
-- recompute every line from trusted rows:
--   • managed products → managed_products.product JSONB (priceInr per variant,
--     customRatePerSqFt when the admin configured one)
--   • catalogue products → product_overrides.price_inr (per-sq-ft rate added here)
-- Legacy catalogue rugs whose variants live only in frontend source are
-- FLAGGED for admin review (rate column NULL ⇒ RPC refuses the order with a
-- clear message) instead of guessing a price. Until an admin sets a rate via
-- the Studio, such orders cannot be placed — which is exactly the safe
-- behaviour for real money.
-- ═══════════════════════════════════════════════════════════════════════════

-- Trusted per-sq-ft rate for catalogue products (admin-editable in Studio).
alter table public.product_overrides
  add column if not exists rate_per_sqft_inr numeric(10,2);

-- Explicit payment method on orders. COD is the only supported gateway today;
-- existing rows are backfilled to 'cod' (they were all cash-on-delivery flows).
alter table public.orders
  add column if not exists payment_method text not null default 'cod'
    check (payment_method in ('cod'));

-- ── Shared trusted-price resolver (used by both loops of create_order) ─────
-- Returns the verified unit price in PAISE for one requested line, or raises.
create or replace function public.trusted_unit_price_paise(
  p_slug text, p_variant_id text, p_width_ft numeric, p_length_ft numeric, p_custom boolean
) returns bigint
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_rate numeric;
begin
  if p_slug is null or coalesce(p_width_ft,0) <= 0 or coalesce(p_length_ft,0) <= 0 then
    raise exception 'invalid order item';
  end if;

  select mp.product into v_managed
    from public.managed_products mp where mp.slug = p_slug and mp.is_active;

  if v_managed is not null then
    if not p_custom then
      select (val->>'priceInr')::numeric into v_variant_price
        from jsonb_array_elements(v_managed->'variants') val
       where val->>'id' = p_variant_id;
      if v_variant_price is not null and v_variant_price > 0 then
        return round(v_variant_price * 100)::bigint;
      end if;
    end if;
    v_rate := coalesce(
      (v_managed->>'customRatePerSqFt')::numeric,
      (select po.rate_per_sqft_inr from public.product_overrides po where po.product_slug = p_slug),
      0);
    if v_rate <= 0 then
      raise exception 'product % has no configured price rate — contact the studio', p_slug;
    end if;
    return round(v_rate * p_width_ft * p_length_ft)::bigint;
  end if;

  -- Catalogue product: require an admin-set trusted per-sq-ft rate on the row.
  select po.rate_per_sqft_inr into v_rate
    from public.product_overrides po where po.product_slug = p_slug;
  if v_rate is null or v_rate <= 0 then
    raise exception 'product % pricing needs admin review (no per-sq-ft rate configured)', p_slug;
  end if;
  return round(v_rate * p_width_ft * p_length_ft)::bigint;
end;
$$;

revoke execute on function public.trusted_unit_price_paise(text, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.trusted_unit_price_paise(text, text, numeric, numeric, boolean) to service_role;

-- ── Hardened create_order: totals are ALWAYS recomputed from the DB ────────
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
  v_slug text;
  v_qty int;
  v_w numeric;
  v_l numeric;
  v_coat boolean;
  v_unit bigint;          -- verified unit price in paise
  v_coat_paise bigint;    -- coating at fixed ₹90/sq ft (paise)
  v_items_total bigint := 0;
  v_coat_total bigint := 0;
  v_order uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_email is null or p_full_name is null or p_address is null
     or p_city is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'complete delivery details are required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item';
  end if;

  select id into v_existing from public.orders
   where idempotency_key = p_idempotency_key and customer_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('order_id', v_existing, 'replayed', true);
  end if;

  -- Validate + RECOMPUTE every item before inserting anything (atomic).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_slug := v_item->>'product_slug';
    v_w := (v_item->>'width_ft')::numeric;
    v_l := (v_item->>'length_ft')::numeric;
    v_qty := least(greatest(coalesce((v_item->>'quantity')::int, 1), 1), 20);
    v_coat := coalesce((v_item->>'coating')::boolean, false);
    if v_slug is null or coalesce(v_w,0) <= 0 or coalesce(v_l,0) <= 0 then
      raise exception 'invalid order item';
    end if;

    -- 1. Resolve the trusted unit price via the shared DB-only resolver.
    v_unit := public.trusted_unit_price_paise(
      v_slug, v_item->>'variant_id', v_w, v_l,
      coalesce((v_item->>'is_custom_size')::boolean, false));

    -- 2. Coating is ALWAYS recomputed from trusted dims (₹90/sq ft = 9000 paise).
    v_coat_paise := case when v_coat then round(9000 * v_w * v_l)::bigint else 0 end;

    -- 3. Reject obvious client tampering early (helps debugging; DB value rules).
    if (v_item->>'unit_price_paise') is not null
       and abs(((v_item->>'unit_price_paise')::bigint - v_unit)) > 100 then
      raise exception 'price changed while checking out — refresh and review your cart';
    end if;

    v_items_total := v_items_total + v_unit * v_qty;
    v_coat_total  := v_coat_total + v_coat_paise * v_qty;

    -- (verified values are re-derived deterministically in the insert loop)
  end loop;

  insert into public.orders (customer_id, email, full_name, address, city, pin,
    items_subtotal_paise, coating_subtotal_paise, total_paise, idempotency_key)
  values (v_uid, lower(trim(p_email)), trim(p_full_name), trim(p_address),
    trim(p_city), p_pin, v_items_total, v_coat_total,
    v_items_total + v_coat_total, p_idempotency_key)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_slug := v_item->>'product_slug';
    v_w := (v_item->>'width_ft')::numeric;
    v_l := (v_item->>'length_ft')::numeric;
    v_qty := least(greatest(coalesce((v_item->>'quantity')::int, 1), 1), 20);
    v_coat := coalesce((v_item->>'coating')::boolean, false);
    -- Re-derive identically through the SAME trusted resolver (deterministic).
    v_unit := public.trusted_unit_price_paise(
      v_slug, v_item->>'variant_id', v_w, v_l,
      coalesce((v_item->>'is_custom_size')::boolean, false));
    v_coat_paise := case when v_coat then round(9000 * v_w * v_l)::bigint else 0 end;

    insert into public.order_items (order_id, product_slug, product_name, image_url,
      variant_id, size_label, width_ft, length_ft, is_custom_size, colour_slug,
      colour_name, colour_hex, quantity, unit_price_paise, coating,
      coating_charge_paise, line_total_paise, note)
    values (v_order, v_slug,
      coalesce(v_item->>'product_name', v_slug),
      v_item->>'image_url', v_item->>'variant_id', v_item->>'size_label',
      v_w, v_l, coalesce((v_item->>'is_custom_size')::boolean, false),
      v_item->>'colour_slug', v_item->>'colour_name', v_item->>'colour_hex',
      v_qty, v_unit, v_coat, v_coat_paise,
      (v_unit + v_coat_paise) * v_qty,
      v_item->>'note');
  end loop;

  return jsonb_build_object('order_id', v_order, 'replayed', false);
end;
$$;

revoke execute on function public.create_order(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_order(uuid, text, text, text, text, text, jsonb) to authenticated;

-- ── Admin-only COD collection (payment confirmed ONLY after cash received) ─
create or replace function public.mark_cod_collected(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;
  update public.orders set payment_status = 'paid', updated_at = now()
   where id = p_order_id and payment_status = 'pending';
  if not found then
    raise exception 'order not found or payment already processed';
  end if;
end;
$$;

revoke execute on function public.mark_cod_collected(uuid) from public, anon, authenticated;
grant execute on function public.mark_cod_collected(uuid) to authenticated;
-- is_admin() check inside enforces authorization even for authenticated callers.
