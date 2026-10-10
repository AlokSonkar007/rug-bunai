/**
 * Persistent COD orders — trusted client boundary for
 * supabase/migrations/0007_cod_orders_trusted_pricing.sql.
 *
 * Trust model (defence in depth):
 *  1. THE DATABASE OWNS MONEY. `create_order()` takes NO price arguments at
 *     all — unit prices come from public.product_prices (admin-synced),
 *     coating charges from the immutable ₹90/sq ft rule, and totals are
 *     re-derived inside a SECURITY DEFINER function. Anything a browser
 *     claims about a price is structurally ignored.
 *  2. The client additionally RECOMPUTES every line with the same rules
 *     (lib/pricing.ts) before submitting and refuses to place an order when
 *     its own displayed numbers disagree — so users never see a surprise.
 *  3. The customer id derives from auth.uid() server-side; quantities are
 *     clamped; a per-attempt idempotency key makes network retries return
 *     the ORIGINAL order instead of duplicating it.
 *  4. Notification jobs (customer/admin × email/WhatsApp) are enqueued in
 *     the SAME transaction as the order rows (outbox pattern) and sent by
 *     the `order-notifications` Edge Function — never from the browser.
 *
 * Money is stored as INTEGER PAISE everywhere (1 INR = 100 paise).
 */
import { formatINR } from '../data/products';
import { COLORS } from '../data/vocabularies';
import type { CatalogProduct } from './catalog';
import { productImage } from './images';
import type { ResolvedCartLine } from './cart';
import { coatInrForFt, customEstimateInr, minVariantPriceInr, standardUnitPriceInr } from './pricing';
import { feetOf } from './sizes';
import { supabase } from './supabase';

export const INR_TO_PAISE = 100;
export const inrToPaise = (inr: number): number => Math.round(inr * INR_TO_PAISE);
export const paiseToInr = (paise: number): number => paise / INR_TO_PAISE;
export const formatPaise = (paise: number): string => formatINR(paiseToInr(paise));

/**
 * A checkout item WITHOUT any monetary fields — the RPC payload shape for
 * migration 0007. Prices exist only server-side; we snapshot descriptive
 * details here so history stays accurate even if the catalogue changes.
 */
export type OrderItemPayload = {
  product_slug: string;
  product_name: string;
  image_url: string | null;
  variant_id: string;
  size_label: string;
  width_ft: number;
  length_ft: number;
  is_custom_size: boolean;
  colour_slug: string | null;
  colour_name: string | null;
  colour_hex: string | null;
  quantity: number;
  coating: boolean;
  note: string | null;
};

export type PlaceOrderInput = {
  email: string;
  fullName: string;
  phone: string;
  whatsappConsent: boolean;
  address: string;
  city: string;
  pin: string;
  lines: ResolvedCartLine[];
  /** Catalogue products used to recompute trusted prices locally. */
  products: readonly CatalogProduct[];
  /** One uuid per checkout attempt — reused on retry so duplicates can't occur. */
  idempotencyKey: string;
};

export type PlacedOrder = { orderId: string; orderReference: string; replayed: boolean };

/** Generate an idempotency key once per checkout attempt (crypto-backed). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Extremely old fallback; Supabase requires uuid format either way.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Normalise an Indian mobile into E.164-ish form for WhatsApp (+91…). */
export function normalizePhoneForWhatsapp(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  // International dialling prefix "00" → "+".
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  const bare = digits.replace(/\D/g, '');
  if (bare.length === 10) return `+91${bare}`;          // India local without code
  if (bare.length === 12 && bare.startsWith('91')) return `+${bare}`;
  if (bare.length >= 8 && bare.length <= 15) return `+${bare}`;
  return null;
}

/**
 * Build the validated RPC item array from resolved cart lines.
 * Throws when any line fails integrity checks — the caller must then keep
 * the cart intact and show the error (never place a partially trusted order).
 * NOTE: the returned items deliberately contain NO prices.
 */
export function buildOrderItems(lines: ResolvedCartLine[], products: readonly CatalogProduct[]): OrderItemPayload[] {
  if (lines.length === 0) throw new Error('Your cart is empty.');
  // Fail closed when the catalogue hasn't loaded — every line must be
  // verifiable against a trusted source before we submit anything.
  const catalogSlugs = new Set(products.map((pr) => pr.slug));
  if (catalogSlugs.size === 0) throw new Error('The catalogue is still loading — please try again in a moment.');
  return lines.map((l) => {
    if (!catalogSlugs.has(l.product.slug)) {
      throw new Error(`"${l.product.name}" is no longer listed — remove it from your cart and refresh the Archive.`);
    }
    if (!Number.isFinite(l.widthFt) || !Number.isFinite(l.lengthFt) || l.widthFt <= 0 || l.lengthFt <= 0) {
      throw new Error(`"${l.product.name}" has invalid dimensions — refresh the page and select the size again.`);
    }
    if (!Number.isInteger(l.qty) || l.qty <= 0 || l.qty > 20) {
      throw new Error(`Quantity for "${l.product.name}" must be between 1 and 20.`);
    }
    // Recompute EVERY rupee from the trusted rules (lib/pricing.ts mirrors
    // the SQL) and compare against what the UI showed the customer. If they
    // disagree the catalogue changed under them — refuse, never re-price.
    let trustedUnit: number;
    if (l.custom) {
      trustedUnit = customEstimateInr(minVariantPriceInr(l.product), l.widthFt, l.lengthFt);
    } else {
      trustedUnit = standardUnitPriceInr(l.variant.priceInr);
    }
    if (trustedUnit !== l.unitPriceInr) {
      throw new Error(`The price for "${l.product.name}" changed while you were checking out — review your cart.`);
    }
    const trustedCoat = l.coating ? coatInrForFt(l.widthFt, l.lengthFt) : 0;
    if (trustedCoat !== l.coatPerUnitInr) {
      throw new Error(`The coating charge for "${l.product.name}" changed — review your cart before placing the order.`);
    }
    const expectedTotal = (trustedUnit + trustedCoat) * l.qty;
    if (expectedTotal !== l.lineTotalInr) {
      throw new Error(`The total for "${l.product.name}" changed while you were checking out — review your cart.`);
    }
    return {
      product_slug: l.product.slug,
      product_name: l.product.name,
      // Snapshot the resolved photo URL (admin override or generated art)
      // so order history stays accurate even if the catalogue changes later.
      image_url: productImage(l.product, 0, 220, 165),
      variant_id: l.variant.id,
      size_label: l.custom ? `${l.widthFt} × ${l.lengthFt} ft` : l.variant.sizeLabel,
      width_ft: l.widthFt,
      length_ft: l.lengthFt,
      is_custom_size: Boolean(l.custom),
      colour_slug: l.custom?.colorSlug ?? l.variant.colorSlug ?? null,
      colour_name: l.custom?.colorName
        ?? COLORS.find((c) => c.slug === l.variant.colorSlug)?.label
        ?? l.variant.colorSlug
        ?? null,
      colour_hex: l.custom?.colorHex ?? null,
      quantity: l.qty,
      coating: l.coating,
      note: l.custom?.note ?? null,
    };
  });
}

/**
 * Admin-only best-effort sync of the catalogue into the trusted price book.
 * Customers cannot run this (the RPC raises) — their orders then price from
 * whatever the admin last synced. Failure here must NOT block browsing;
 * placeOrder surfaces a precise message if the book is missing an item.
 */
export async function syncTrustedPrices(products: readonly CatalogProduct[]): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const items = products.flatMap((p) => p.variants.map((v) => ({
    variant_id: v.id,
    product_slug: p.slug,
    price_inr: v.priceInr,
    width_ft: feetOf(v.width),
    length_ft: feetOf(v.length),
  })));
  const { data, error } = await supabase.rpc('sync_product_prices', { p_items: items });
  if (error) throw new Error(`Could not sync the trusted price book: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Persist the COD order via the trusted RPC. Returns the real Supabase order
 * id + human reference. Throws on any failure (auth missing, validation,
 * network) so the caller can retain the cart and surface a useful message.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  if (!supabase) throw new Error('Orders need the Supabase backend — add the VITE_SUPABASE values to .env first.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Please sign in before placing your order.');

  const phone = normalizePhoneForWhatsapp(input.phone);
  if (!phone) throw new Error('Enter a valid contact phone number (with country code if outside India).');

  const items = buildOrderItems(input.lines, input.products);

  const { data, error } = await supabase.rpc('create_order', {
    p_idempotency_key: input.idempotencyKey,
    p_email: input.email,
    p_full_name: input.fullName,
    p_phone: phone,
    p_whatsapp_consent: Boolean(input.whatsappConsent),
    p_address: input.address,
    p_city: input.city,
    p_pin: input.pin,
    p_items: items,
  });
  if (error) {
    // Surface the real database message (e.g. policy/function missing) so
    // admins know exactly which migration step is outstanding.
    throw new Error(`We could not save your order: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    { order_id?: string; order_reference?: string; replayed?: boolean } | null;
  if (!row?.order_id) throw new Error('The order service returned no order id. Your cart has been kept — please try again.');
  return {
    orderId: row.order_id,
    orderReference: row.order_reference ?? `#${row.order_id.slice(0, 8).toUpperCase()}`,
    replayed: Boolean(row.replayed),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export type OrderSummaryRow = {
  id: string;
  order_reference: string | null;
  created_at: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_paise: number;
  items_subtotal_paise: number;
  coating_subtotal_paise: number;
};

export type OrderDetailRow = OrderSummaryRow & {
  email: string;
  full_name: string;
  phone: string | null;
  whatsapp_consent: boolean;
  address: string;
  city: string;
  pin: string;
};

export type OrderItemRow = {
  id: string;
  product_slug: string;
  product_name: string;
  image_url: string | null;
  size_label: string;
  width_ft: number;
  length_ft: number;
  is_custom_size: boolean;
  colour_name: string | null;
  colour_hex: string | null;
  quantity: number;
  unit_price_paise: number;
  coating: boolean;
  coating_charge_paise: number;
  line_total_paise: number;
  note: string | null;
};

export type NotificationJobRow = {
  id: string;
  order_id: string;
  recipient_kind: 'customer' | 'admin';
  channel: 'email' | 'whatsapp';
  destination: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  next_attempt_at: string;
};

/** Newest-first list of the signed-in customer's own orders (RLS-enforced). */
export async function fetchMyOrders(): Promise<OrderSummaryRow[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_reference, created_at, status, payment_status, payment_method, total_paise, items_subtotal_paise, coating_subtotal_paise')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as OrderSummaryRow[];
}

/** A single order owned by the signed-in customer (RLS denies others). */
export async function fetchMyOrder(orderId: string): Promise<{ order: OrderDetailRow; items: OrderItemRow[] }> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error('Order not found (or you are signed in with a different account).');
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (itemsError) throw itemsError;
  return { order: order as OrderDetailRow, items: (items ?? []) as OrderItemRow[] };
}

/** Admin detail view — same queries, but RLS grants admins all rows. */
export const fetchMyOrderForAdmin = fetchMyOrder;

/** Admin-only: every order (RLS restricts this to verified admins). */
export async function fetchAllOrders(): Promise<(OrderDetailRow & { customer_id: string })[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as (OrderDetailRow & { customer_id: string })[];
}

export const ORDER_STATUSES = ['placed', 'in_production', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Admin fulfilment update through the guarded security-definer function. */
export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!ORDER_STATUSES.includes(status)) throw new Error('Unknown order status.');
  const { error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_status: status });
  if (error) throw new Error(`Could not update the order: ${error.message}`);
}

/**
 * Admin COD collection confirmation — ONLY after cash was physically
 * received (server enforces: delivered + cod + admin role). Idempotent.
 */
export async function markCodCollected(orderId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('mark_order_paid', { p_order_id: orderId });
  if (error) throw new Error(`Could not confirm the cash payment: ${error.message}`);
}

/** Admin retry of ONE failed/skipped notification — never touches the order. */
export async function retryNotification(jobId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('retry_order_notification', { p_id: jobId });
  if (error) throw new Error(`Could not requeue the notification: ${error.message}`);
}

/** Per-recipient delivery state of the order's email/WhatsApp notifications
 *  (outbox rows from migration 0007). Returns {} when the outbox migration
 *  hasn't been applied yet so the panel degrades gracefully. */
export async function fetchOrderNotifications(orderIds: string[]): Promise<Record<string, NotificationJobRow[]>> {
  if (!supabase || orderIds.length === 0) return {};
  const { data, error } = await supabase
    .from('order_notifications')
    .select('id, order_id, recipient_kind, channel, destination, status, attempts, last_error, provider_message_id, next_attempt_at')
    .in('order_id', orderIds.slice(0, 50));
  if (error) return {}; // outbox table not created yet — non-fatal for the panel
  const grouped: Record<string, NotificationJobRow[]> = {};
  for (const row of (data ?? []) as NotificationJobRow[]) {
    (grouped[row.order_id] ??= []).push(row);
  }
  return grouped;
}
