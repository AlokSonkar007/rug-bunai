/**
 * Behaviour tests for the notification outbox worker logic
 * (supabase/functions/order-notifications/sendLogic.ts).
 *
 * These are MOCKED-PROVIDER tests: they assert exactly what payload would be
 * sent to Resend / Meta WhatsApp Cloud API and when a job must be honestly
 * 'skipped' instead of falsely 'sent'. Real delivery is verified manually
 * during setup (see docs/COD_SETUP.md) — nothing here contacts any provider.
 */
import { describe, expect, it } from 'vitest';
import {
  adminEmail,
  buildWhatsappMessage,
  customerEmail,
  formatPaiseINR,
  itemLines,
  type JobRow,
  type NotificationPayload,
} from '../../supabase/functions/order-notifications/sendLogic';

const payload: NotificationPayload = {
  order_id: 'o-1',
  order_reference: 'RB-20261011-ABC123',
  full_name: 'Asha Menon',
  email: 'asha@example.com',
  phone: '+919876543210',
  address: '12 Loom Lane, Bandra West',
  city: 'Mumbai',
  pin: '400050',
  items_subtotal_paise: 3600000,
  coating_subtotal_paise: 135000,
  total_paise: 3735000,
  currency: 'INR',
  payment_method: 'cod',
  payment_status: 'pending',
  placed_at: '2026-10-11T10:00:00Z',
  whatsapp_consent: true,
  items: [
    { name: 'Test Weave Runner', size: '3 × 5 ft', qty: 2, unit_price_paise: 1800000, coating: true, coating_charge_paise: 135000, line_total_paise: 3870000 },
  ],
};

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'j-1', order_id: 'o-1', channel: 'email', recipient_type: 'customer',
  to_address: payload.email, payload, attempts: 1, ...over,
});

describe('email builders', () => {
  it('customer confirmation carries reference, items, total, delivery and COD status', () => {
    const msg = customerEmail(job(), 'orders@rugbunai.com');
    expect(msg.to).toEqual(['asha@example.com']);
    expect(msg.from).toBe('orders@rugbunai.com');
    expect(msg.subject).toContain('RB-20261011-ABC123');
    for (const needle of ['Test Weave Runner', '3 × 5 ft', '× 2', formatPaiseINR(3735000), 'Cash on Delivery', 'Bandra West', '400050']) {
      expect(msg.text).toContain(needle);
    }
    expect(msg.html).toContain('RB-20261011-ABC123');
  });

  it('admin alert carries contact info and falls back to ORDER_ADMIN_EMAIL', () => {
    const named = adminEmail(job({ recipient_type: 'admin', to_address: 'boss@rugbunai.com' }), 'from@x', 'fallback@x');
    expect(named.to).toEqual(['boss@rugbunai.com']);
    const fallback = adminEmail(job({ recipient_type: 'admin', to_address: '' }), 'from@x', 'fallback@rugbunai.com');
    expect(fallback.to).toEqual(['fallback@rugbunai.com']);
    expect(fallback.text).toContain('+919876543210');   // customer phone
    expect(fallback.text).toContain('asha@example.com'); // customer email
    expect(fallback.subject).toContain('New COD order RB-20261011-ABC123');
  });

  it('item lines show quantity, coating charge and line totals in INR', () => {
    const lines = itemLines(payload);
    expect(lines[0]).toContain('× 2');
    expect(lines[0]).toContain(formatPaiseINR(135000 * 2));
    expect(lines[0]).toContain(formatPaiseINR(3870000));
  });
});

describe('WhatsApp builder — honest skip vs send', () => {
  const configured = {
    WHATSAPP_PHONE_NUMBER_ID: 'wamid.PNID',
    WHATSAPP_ORDER_TEMPLATE: 'cod_order_confirmation',
    WHATSAPP_ADMIN_PHONE: '+919900000000',
  };

  it('sends the approved template with correct recipient and params', () => {
    const res = buildWhatsappMessage(job({ channel: 'whatsapp', to_address: '+919876543210' }), configured);
    expect(res.kind).toBe('send');
    if (res.kind !== 'send') return;
    expect(res.to).toBe('+919876543210');
    const p = res.payload as Record<string, unknown>;
    expect(p.type).toBe('template');
    expect((p.template as { name: string }).name).toBe('cod_order_confirmation');
    expect(JSON.stringify(p)).not.toContain('+'); // Cloud API wants bare digits
    const params = ((p.template as { components: Array<{ parameters: Array<{ text: string }> }> }).components[0].parameters);
    expect(params.map((x) => x.text)).toEqual(['Asha Menon', 'RB-20261011-ABC123', formatPaiseINR(3735000), 'Cash on Delivery']);
  });

  it('routes admin jobs to WHATSAPP_ADMIN_PHONE, not the customer number', () => {
    const res = buildWhatsappMessage(job({ channel: 'whatsapp', recipient_type: 'admin', to_address: '' }), configured);
    // `res.to` keeps the stored E.164 form; the API payload strips '+'.
    expect(res.kind === 'send' && res.to).toBe('+919900000000');
    if (res.kind === 'send') expect(res.payload.to).toBe('919900000000');
  });

  it('skips (never fakes) when the customer declined consent', () => {
    const res = buildWhatsappMessage(job({ channel: 'whatsapp', to_address: '' }), configured);
    expect(res.kind).toBe('skip');
    if (res.kind === 'skip') expect(res.reason).toMatch(/declined|consent/);
  });

  it('skips when no approved template or phone-number id is configured', () => {
    expect(buildWhatsappMessage(job({ channel: 'whatsapp' }), { ...configured, WHATSAPP_ORDER_TEMPLATE: '' }).kind).toBe('skip');
    expect(buildWhatsappMessage(job({ channel: 'whatsapp' }), { ...configured, WHATSAPP_PHONE_NUMBER_ID: undefined }).kind).toBe('skip');
  });

  it('skips admin job when WHATSAPP_ADMIN_PHONE is missing', () => {
    const res = buildWhatsappMessage(job({ channel: 'whatsapp', recipient_type: 'admin', to_address: '' }), { ...configured, WHATSAPP_ADMIN_PHONE: undefined });
    expect(res.kind).toBe('skip');
  });

  it('supports parametric templates via WHATSAPP_TEMPLATE_BODY_PARAMS', () => {
    const res = buildWhatsappMessage(job({ channel: 'whatsapp', to_address: '+919876543210' }), { ...configured, WHATSAPP_TEMPLATE_BODY_PARAMS: '{reference}|{total}' });
    expect(res.kind === 'send' && JSON.stringify(res.payload)).toContain('RB-20261011-ABC123');
    const p = res.kind === 'send' ? res.payload : {};
    const params = ((p as { template: { components: Array<{ parameters: Array<{ text: string }> }> } }).template.components[0].parameters);
    expect(params.map((x) => x.text)).toEqual(['RB-20261011-ABC123', formatPaiseINR(3735000)]);
  });
});
