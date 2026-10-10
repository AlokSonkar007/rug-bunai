/**
 * Pure, testable core of the `order-notifications` Edge Function.
 *
 * IMPORTANT: these helpers are deliberately free of Deno/Supabase imports so
 * they can be unit-tested with vitest in the web workspace
 * (src/lib/orderNotifications.logic.test.ts). The thin runtime wrapper lives
 * in index.ts and is deployed to Supabase Edge Functions — privileged API
 * keys (Resend, WhatsApp Cloud) exist ONLY as Function Secrets there and are
 * never shipped to or callable from the browser.
 */

export type NotificationPayload = {
  order_id: string;
  order_reference: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pin: string;
  items_subtotal_paise: number;
  coating_subtotal_paise: number;
  total_paise: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  placed_at: string;
  /** Whether the customer opted in to WhatsApp updates (set by create_order). */
  whatsapp_consent?: boolean;
  items: Array<{
    name: string;
    size: string;
    qty: number;
    unit_price_paise: number;
    coating: boolean;
    coating_charge_paise: number;
    line_total_paise: number;
    colour?: string | null;
    note?: string | null;
  }>;
};

export type JobRow = {
  id: string;
  order_id: string;
  channel: 'email' | 'whatsapp';
  recipient_type: 'customer' | 'admin';
  to_address: string;
  payload: NotificationPayload;
  attempts: number;
};

export type WorkerSecrets = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ORDER_ADMIN_EMAIL?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_ADMIN_PHONE?: string;
  /** Approved transactional template NAME, e.g. "cod_order_confirmation". */
  WHATSAPP_ORDER_TEMPLATE?: string;
  /** Optional pipe-separated body params for a parametric template. */
  WHATSAPP_TEMPLATE_BODY_PARAMS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

/** ₹ formatting identical to the storefront (en-IN grouping). */
export function formatPaiseINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(paise / 100);
}

export function itemLines(p: NotificationPayload): string[] {
  return p.items.map((it) => {
    const coat = it.coating ? ` (+${formatPaiseINR(it.coating_charge_paise * it.qty)} coating)` : '';
    return `• ${it.name} — ${it.size}${it.colour ? ` · ${it.colour}` : ''} × ${it.qty}: ` +
      `${formatPaiseINR(it.unit_price_paise * it.qty)}${coat} → ${formatPaiseINR(it.line_total_paise)}`;
  });
}

// ── Email builders (Resend) ─────────────────────────────────────────────────

export function customerEmail(job: JobRow, from: string) {
  const p = job.payload;
  const subject = `Rug Bunai — order ${p.order_reference} confirmed`;
  const text = [
    `Hello ${p.full_name},`,
    '',
    `Thank you! Your Rug Bunai order ${p.order_reference} has been placed successfully.`,
    '',
    ...itemLines(p),
    '',
    `Items subtotal: ${formatPaiseINR(p.items_subtotal_paise)}`,
    `Coating charges: ${formatPaiseINR(p.coating_subtotal_paise)}`,
    `TOTAL: ${formatPaiseINR(p.total_paise)}`,
    '',
    'Payment: Cash on Delivery — payment is pending until your order is delivered.',
    '',
    'Deliver to:',
    `${p.full_name}`,
    `${p.address}, ${p.city} — ${p.pin}`,
    `${p.phone}`,
    '',
    'Our atelier weaves every piece to order; we will contact you if any bespoke',
    'size or colour needs confirmation before production.',
    '',
    '— The Rug Bunai Studio',
  ].join('\n');
  const html = `<div style="font-family:Georgia,serif"><p>Hello ${escapeHtml(p.full_name)},</p>` +
    `<p>Your <strong>Rug Bunai</strong> order <strong>${escapeHtml(p.order_reference)}</strong> has been placed.</p>` +
    `<ul>${p.items.map((it) => `<li>${escapeHtml(it.name)} — ${escapeHtml(it.size)} × ${it.qty}: ${formatPaiseINR(it.line_total_paise)}</li>`).join('')}</ul>` +
    `<p><strong>TOTAL: ${formatPaiseINR(p.total_paise)}</strong> (${escapeHtml(p.payment_method.toUpperCase())} — ${escapeHtml(p.payment_status)})</p>` +
    `<p>Deliver to: ${escapeHtml(p.full_name)}, ${escapeHtml(p.address)}, ${escapeHtml(p.city)} — ${escapeHtml(p.pin)}</p></div>`;
  return { from, to: [p.email], subject, text, html };
}

export function adminEmail(job: JobRow, from: string, adminFallback: string | undefined) {
  const p = job.payload;
  const to = (job.to_address || adminFallback || '').trim();
  const subject = `New COD order ${p.order_reference} — ${formatPaiseINR(p.total_paise)}`;
  const text = [
    `New Cash-on-Delivery order received on rugbunai.com`,
    '',
    `Order reference: ${p.order_reference}`,
    `Placed at: ${p.placed_at}`,
    `Customer: ${p.full_name} <${p.email}> ${p.phone}`,
    `Deliver to: ${p.address}, ${p.city} — ${p.pin}`,
    `WhatsApp consent: ${p.whatsapp_consent ? 'yes (opted in at checkout)' : 'no'}`,
    '',
    ...itemLines(p),
    '',
    `Items: ${formatPaiseINR(p.items_subtotal_paise)} · Coating: ${formatPaiseINR(p.coating_subtotal_paise)}`,
    `TOTAL: ${formatPaiseINR(p.total_paise)} (COD — collect cash on delivery)`,
  ].join('\n');
  return { from, to: [to], subject, text };
}

// ── WhatsApp builder (Meta Cloud API) ───────────────────────────────────────

export type WhatsappResult =
  | { kind: 'skip'; reason: string }
  | { kind: 'send'; to: string; payload: Record<string, unknown> };

/**
 * Decide what to do with a WhatsApp job WITHOUT ever pretending a message
 * was sent when it wasn't:
 *   - no approved template configured        → skip (recorded, visible to admin)
 *   - customer declined consent (empty addr) → skip politely
 *   - admin job without WHATSAPP_ADMIN_PHONE → skip
 * Anything else builds the official Cloud-API `template` message payload.
 */
export function buildWhatsappMessage(
  job: JobRow,
  secrets: Pick<WorkerSecrets, 'WHATSAPP_PHONE_NUMBER_ID' | 'WHATSAPP_ADMIN_PHONE' | 'WHATSAPP_ORDER_TEMPLATE' | 'WHATSAPP_TEMPLATE_BODY_PARAMS'>,
): WhatsappResult {
  const template = (secrets.WHATSAPP_ORDER_TEMPLATE ?? '').trim();
  if (!template) return { kind: 'skip', reason: 'WHATSAPP_ORDER_TEMPLATE not configured (approved template required by Meta policy)' };
  if (!secrets.WHATSAPP_PHONE_NUMBER_ID) return { kind: 'skip', reason: 'WHATSAPP_PHONE_NUMBER_ID not configured' };

  let to = job.to_address.trim();
  if (job.recipient_type === 'admin') to = (secrets.WHATSAPP_ADMIN_PHONE ?? '').trim();
  if (job.recipient_type === 'customer' && !to) {
    return { kind: 'skip', reason: 'customer declined WhatsApp updates (no consent)' };
  }
  if (!to) return { kind: 'skip', reason: 'no destination number available' };

  const p = job.payload;
  // Default parametric set matches a typical approved utility template:
  // {{1}} name, {{2}} order ref, {{3}} total, {{4}} payment method text.
  const params = (secrets.WHATSAPP_TEMPLATE_BODY_PARAMS ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tpl) => tpl
      .replaceAll('{name}', p.full_name)
      .replaceAll('{reference}', p.order_reference)
      .replaceAll('{total}', formatPaiseINR(p.total_paise))
      .replaceAll('{payment}', 'Cash on Delivery')
      .replaceAll('{items}', String(p.items.length)))
    .slice(0, 10);
  const bodyParams = params.length > 0
    ? params
    : [p.full_name, p.order_reference, formatPaiseINR(p.total_paise), 'Cash on Delivery'];

  return {
    kind: 'send',
    to,
    payload: {
      messaging_product: 'whatsapp',
      // Use the customer's own number only for marketing opt-ins; utility
      // templates go to the exact E.164 digits stored at checkout.
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }],
      },
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
