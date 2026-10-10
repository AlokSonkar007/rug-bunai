/**
 * Persistent orders — trusted client boundary for supabase/migrations/0005_orders.sql.
 *
 * Order creation goes through the SECURITY DEFINER `public.create_order` RPC:
 * the customer id is derived from auth.uid() server-side (never passed in),
 * quantities are clamped there, and a per-attempt idempotency key makes
 * network retries return the original order instead of duplicating it.
 *
 * Money is stored as INTEGER PAISE. Prices/coating charges are recomputed
 * here from the trusted catalogue + pricing rules (sizes.ts) at submit time;
 * anything that doesn't match what the UI displayed is rejected before the
 * request leaves the browser, and the DB re-validates shapes independently.
 */
import { formatINR } from '../data/products';
import { COLORS } from '../data/vocabularies';
import { productImage } from './images';
import type { ResolvedCartLine } from './cart';
import { STAIN_COAT_RATE_INR_PER_SQFT, stainCoatCostForFt } from './sizes';
import { supabase } from './supabase';

export const INR_TO_PAISE = 100;
export const inrToPaise = (inr: number): number => Math.round(inr * INR_TO_PAISE);
export const paiseToInr = (paise: number): number => paise / INR_TO_PAISE;
export const formatPaise = (paise: number): string => formatINR(paiseToInr(paise));

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
  unit_price_paise: number;
  coating: boolean;
  coating_charge_paise: number;
  note: string | null;
};

export type PlaceOrderInput = {
  email: string;
  fullName: string;
  address: string;
  city: string;
  pin: string;
  lines: ResolvedCartLine[];
  /** One uuid per checkout attempt — reused on retry so duplicates can't occur. */
  idempotencyKey: string;
};

export type PlacedOrder = { orderId: string; replayed: boolean };

/** Generate an idempotency key once per checkout attempt (crypto-backed). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Extremely old fallback; Supabase requires uuid format either way.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Build the validated RPC item array from resolved cart lines.
 * Throws when any line fails integrity checks — the caller must then keep
 * the cart intact and show the error (never place a partially trusted order).
 */
export function buildOrderItems(lines: ResolvedCartLine[]): OrderItemPayload[] {
  if (lines.length === 0) throw new Error('Your cart is empty.');
  return lines.map((l) => {
    if (!Number.isFinite(l.widthFt) || !Number.isFinite(l.lengthFt) || l.widthFt <= 0 || l.lengthFt <= 0) {
      throw new Error(`"${l.product.name}" has invalid dimensions — refresh the page and select the size again.`);
    }
    if (!Number.isInteger(l.unitPriceInr) || l.unitPriceInr <= 0) {
      throw new Error(`"${l.product.name}" is missing a valid price. Please contact the studio before ordering.`);
    }
    if (!Number.isInteger(l.qty) || l.qty <= 0 || l.qty > 20) {
      throw new Error(`Quantity for "${l.product.name}" must be between 1 and 20.`);
    }
    // Recompute the coating charge from the trusted rate and the ACTUAL
    // numeric feet on the line — never from the display label alone.
    const coatFromDims = l.coating ? stainCoatCostForFt(l.widthFt, l.lengthFt) : 0;
    if (l.coating && (coatFromDims !== l.coatPerUnitInr || l.coatPerUnitInr <= 0)) {
      throw new Error(`The coating charge for "${l.product.name}" changed (₹${STAIN_COAT_RATE_INR_PER_SQFT}/sq ft) — review your cart before placing the order.`);
    }
    const expectedTotal = (l.unitPriceInr + l.coatPerUnitInr) * l.qty;
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
      // Standard colours resolve their display name from the controlled
      // vocabulary; custom-colour requests carry their own name.
      colour_name: l.custom?.colorName
        ?? COLORS.find((c) => c.slug === l.variant.colorSlug)?.label
        ?? l.variant.colorSlug
        ?? null,
      colour_hex: l.custom?.colorHex ?? null,
      quantity: l.qty,
      unit_price_paise: inrToPaise(l.unitPriceInr),
      coating: l.coating,
      coating_charge_paise: inrToPaise(l.coatPerUnitInr),
      note: l.custom?.note ?? null,
    };
  });
}

/**
 * Persist the order via the trusted RPC. Returns the real Supabase order id.
 * Throws on any failure (auth missing, not configured, validation, network)
 * so the caller can retain the cart and surface a useful message.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  if (!supabase) throw new Error('Orders need the Supabase backend — add the VITE_SUPABASE values to .env first.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Please sign in before placing your order.');

  const items = buildOrderItems(input.lines);

  const { data, error } = await supabase.rpc('create_order', {
    p_idempotency_key: input.idempotencyKey,
    p_email: input.email,
    p_full_name: input.fullName,
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
  const row = (Array.isArray(data) ? data[0] : data) as { order_id?: string; replayed?: boolean } | null;
  if (!row?.order_id) throw new Error('The order service returned no order id. Your cart has been kept — please try again.');
  return { orderId: row.order_id, replayed: Boolean(row.replayed) };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export type OrderSummaryRow = {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  total_paise: number;
  items_subtotal_paise: number;
  coating_subtotal_paise: number;
};

export type OrderDetailRow = OrderSummaryRow & {
  email: string;
  full_name: string;
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

/** Newest-first list of the signed-in customer's own orders (RLS-enforced). */
export async function fetchMyOrders(): Promise<OrderSummaryRow[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, status, payment_status, total_paise, items_subtotal_paise, coating_subtotal_paise')
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

/** Admin: confirm the COD cash has physically been received. Server-side RPC
 *  (0008) enforces admin-only access and refuses double-collection. */
export async function markCodCollected(orderId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('mark_cod_collected', { p_order_id: orderId });
  if (error) throw new Error(`Could not record the cash collection: ${error.message}`);
}

/** Per-recipient delivery state of the order's email/WhatsApp notifications
 *  (outbox rows from migration 0007). Returns [] when the outbox migration
 *  hasn't been applied yet so the Studio degrades gracefully. */
export type NotificationJobRow = {
  id: string;
  recipient_kind: 'customer' | 'admin';
  channel: 'email' | 'whatsapp';
  destination: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  next_attempt_at: string;
};

export async function fetchOrderNotifications(orderIds: string[]): Promise<Record<string, NotificationJobRow[]>> {
  if (!supabase || orderIds.length === 0) return {};
  const { data, error } = await supabase
    .from('order_notifications')
    .select('id, order_id, recipient_kind, channel, destination, status, attempts, last_error, provider_message_id, next_attempt_at')
    .in('order_id', orderIds.slice(0, 50));
  if (error) return {}; // outbox table not created yet — non-fatal for the panel
  const grouped: Record<string, NotificationJobRow[]> = {};
  for (const row of (data ?? []) as (NotificationJobRow & { order_id: string })[]) {
    (grouped[row.order_id] ??= []).push(row);
  }
  return grouped;
}
