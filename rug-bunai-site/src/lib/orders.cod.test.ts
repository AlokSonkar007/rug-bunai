/**
 * Behaviour tests for the trusted COD order boundary (src/lib/orders.ts).
 *
 * The Supabase client is mocked: these tests verify WHAT THE CLIENT SENDS
 * and HOW IT VALIDATES — they do not prove database-side behaviour, which
 * lives in supabase/migrations/0007_cod_orders_trusted_pricing.sql and must
 * be verified against a real project during manual setup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (hoisted before importing the module under test) ─────────────────
const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'cust-1' } } } }) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock('./images', () => ({
  // Deterministic stand-in; orders.ts only snapshots whatever URL resolves.
  productImage: () => 'https://cdn.test/rug.jpg',
}));

import type { CatalogProduct } from './catalog';
import type { ResolvedCartLine } from './cart';
import { makeVariant, type Product } from '../data/products';
import { buildOrderItems, newIdempotencyKey, normalizePhoneForWhatsapp, placeOrder } from './orders';
import { coatInrForFt, customEstimateInr } from './pricing';

/** Minimal but fully-typed catalogue product for the tests. */
const base: Product = {
  id: 'p1',
  slug: 'test-weave',
  name: 'Test Weave Runner',
  tagline: 'tagline',
  description: 'desc',
  craftStory: 'story',
  colorSlugs: ['ivory'],
  materialSlug: 'wool',
  techniqueSlug: 'hand-knotted',
  styleSlugs: [],
  roomSlugs: [],
  classificationSlug: 'hand-knotted-wool-rug',
  categoryPaths: [],
  specs: { pileHeightMm: 8, weightKgPerSqm: 3, backing: 'cotton', countryOfOrigin: 'India', careInstructions: 'vacuum' },
  rating: 5,
  reviewsCount: 1,
  addedDaysAgo: 1,
  imageSeed: 'seed',
  thumbnailCount: 5,
  relationships: [],
  variants: [
    makeVariant('v-3x5', 'TW', '3 × 5 ft', 3, 5, 'ivory', 18000, 5),
    makeVariant('v-4x6', 'TW', '4 × 6 ft', 4, 6, 'ivory', 28000, 5),
  ],
};
const product: CatalogProduct = { ...base };

const products = [product];

/** Build a resolved line EXACTLY the way the cart does (trusted maths). */
function line(overrides: Partial<ResolvedCartLine> = {}): ResolvedCartLine {
  const variant = product.variants[0];
  const widthFt = 3, lengthFt = 5;
  const coating = overrides.coating ?? false;
  const base: ResolvedCartLine = {
    product,
    variant,
    qty: 2,
    coating,
    widthFt,
    lengthFt,
    sqft: 15,
    unitPriceInr: variant.priceInr,
    coatPerUnitInr: coating ? coatInrForFt(widthFt, lengthFt) : 0,
    lineTotalInr: (variant.priceInr + (coating ? coatInrForFt(widthFt, lengthFt) : 0)) * 2,
  };
  return { ...base, ...overrides };
}

beforeEach(() => rpc.mockReset());

describe('buildOrderItems — trusted payload', () => {
  it('produces items that contain NO monetary fields at all', () => {
    const items = buildOrderItems([line()], products);
    expect(items).toHaveLength(1);
    const json = JSON.stringify(items[0]);
    for (const banned of ['price', 'total', 'amount', 'paise', 'charge']) {
      expect(json.toLowerCase()).not.toContain(banned);
    }
    expect(items[0].quantity).toBe(2);
    expect(items[0].variant_id).toBe('v-3x5');
  });

  it('rejects tampered browser prices instead of sending them', () => {
    // A compromised cart claims ₹1 per rug — the local recompute must refuse.
    expect(() => buildOrderItems([line({ unitPriceInr: 1 })], products))
      .toThrow(/changed while you were checking out/);
    // Tampered coating charge likewise refuses.
    expect(() => buildOrderItems([line({ coating: true, coatPerUnitInr: 0 })], products))
      .toThrow(/coating charge .* changed/);
    // Tampered line total likewise refuses.
    expect(() => buildOrderItems([line({ lineTotalInr: 10 })], products))
      .toThrow(/total for .* changed/);
  });

  it('fails closed when the catalogue is empty or a line is unlisted', () => {
    expect(() => buildOrderItems([line()], [])).toThrow(/still loading/);
    const rogue = { ...product, slug: 'deleted-rug' };
    expect(() => buildOrderItems([{ ...line(), product: rogue }], products)).toThrow(/no longer listed/);
  });

  it('prices custom Studio offers with the canonical min-price rule', () => {
    const offer = {
      id: 'custom-abc', productSlug: product.slug, sizeLabel: "2' × 3'",
      widthFt: 2, lengthFt: 3, colorSlug: 'custom', colorName: 'Teal Dream',
      colorHex: '#123456', priceInr: customEstimateInr(18000, 2, 3), coating: false as const,
    };
    const l = line({
      variant: { ...product.variants[0], id: offer.id, priceInr: offer.priceInr },
      custom: offer, widthFt: 2, lengthFt: 3, sqft: 6,
      unitPriceInr: offer.priceInr, coatPerUnitInr: 0, lineTotalInr: offer.priceInr, qty: 1,
    });
    const items = buildOrderItems([l], products);
    expect(items[0].is_custom_size).toBe(true);
    expect(items[0].variant_id).toBe('custom-abc');
    expect(items[0].colour_hex).toBe('#123456');
  });

  it('rejects quantities outside 1–20', () => {
    expect(() => buildOrderItems([line({ qty: 0 })], products)).toThrow(/between 1 and 20/);
    expect(() => buildOrderItems([line({ qty: 21 })], products)).toThrow(/between 1 and 20/);
  });
});

describe('placeOrder — RPC contract with migration 0007', () => {
  const input = {
    email: 'buyer@example.com', fullName: 'Asha Menon', phone: '9876543210',
    whatsappConsent: true, address: '12 Loom Lane, Bandra West', city: 'Mumbai', pin: '400050',
    lines: [line()], products, idempotencyKey: '11111111-2222-3333-4444-555555555555',
  };

  it('calls create_order with normalised phone and zero money fields', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o-1', order_reference: 'RB-20261011-ABC123', replayed: false }, error: null });
    const res = await placeOrder(input);
    expect(res.orderReference).toBe('RB-20261011-ABC123');
    expect(rpc).toHaveBeenCalledWith('create_order', expect.objectContaining({
      p_idempotency_key: input.idempotencyKey,
      p_phone: '+919876543210',
      p_whatsapp_consent: true,
    }));
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(args.p_items).toLowerCase()).not.toMatch(/price|paise|total/);
  });

  it('surfaces a replayed duplicate as success with the ORIGINAL reference', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o-1', order_reference: 'RB-OLD', replayed: true }, error: null });
    const res = await placeOrder(input);
    expect(res.replayed).toBe(true);
    expect(res.orderId).toBe('o-1');
  });

  it('throws (keeping the cart intact) when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'item v-x is not in the trusted price book' } });
    await expect(placeOrder(input)).rejects.toThrow(/trusted price book/);
  });

  it('refuses to submit an invalid phone number', async () => {
    await expect(placeOrder({ ...input, phone: '12345' })).rejects.toThrow(/valid contact phone/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('phone normalisation & idempotency keys', () => {
  it('normalises Indian numbers to +91 E.164 and keeps international forms', () => {
    expect(normalizePhoneForWhatsapp('98765 43210')).toBe('+919876543210');
    expect(normalizePhoneForWhatsapp('+91 9876543210')).toBe('+919876543210');
    expect(normalizePhoneForWhatsapp('00919876543210')).toBe('+919876543210');
    expect(normalizePhoneForWhatsapp('+14155552671')).toBe('+14155552671');
    expect(normalizePhoneForWhatsapp('abc')).toBeNull();
  });

  it('generates unique uuid-shaped keys per checkout attempt', () => {
    const a = newIdempotencyKey(), b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
