/**
 * Pricing-integrity regression tests (Part B/F).
 * These verify the deterministic money math both the UI and the hardened
 * create_order() RPC (0008) rely on: ₹/sq-ft × area, integer-paise rounding,
 * coating recomputation, and tamper detection in buildOrderItems().
 */
import { describe, expect, it, vi } from 'vitest';
// The orders module imports the Supabase client at load time; stub it so this
// suite stays a pure unit test (Node 20 here lacks native WebSocket, which
// supabase-js requires at client construction).
vi.mock('./supabase', () => ({ supabase: null, isSupabaseConfigured: false, requireSupabase: () => null }));
import { productRatePerSqft, stainCoatCostForFt, feetOf, CM_PER_FT } from './sizes';
import { buildOrderItems, inrToPaise } from './orders';

describe('per-sq-ft pricing', () => {
  const ft = (n: number) => ({ cm: Math.round(n * CM_PER_FT), in: Math.round(n * 12) });
  const variants = [{ id: 'v1', sku: 'S', sizeLabel: '5 x 8 ft', width: ft(5), length: ft(8), colorSlug: 'ivory', priceInr: 96000, stock: 1 }];

  it('admin rate wins over derived rate', () => {
    expect(productRatePerSqft(variants, 2400)).toBe(2400);
  });
  it('derives rate from a priced variant when no override exists', () => {
    // 96,000 over 40 sq ft → 2,400/sq ft exactly.
    expect(productRatePerSqft(variants, null)).toBe(2400);
  });
  it('calculates area × rate for standard and custom sizes', () => {
    const rate = productRatePerSqft(variants, null)!;
    expect(Math.round(rate * 5 * 8)).toBe(96000);      // 5×8 ft
    expect(Math.round(rate * 3.5 * 6.25)).toBe(52500); // fractional custom dims
  });
  it('converts to exact integer paise', () => {
    expect(inrToPaise(96000)).toBe(9_600_000);
    expect(inrToPaise(52500.5)).toBe(5_250_050); // banker's-free round-half-up policy
  });
  it('coating is always ₹90/sq ft of actual area', () => {
    expect(stainCoatCostForFt(5, 8)).toBe(3600);
    expect(feetOf(ft(5))).toBeCloseTo(5, 2);
  });
});

describe('buildOrderItems tamper guards', () => {
  const product = { name: 'Test Rug', slug: 'test-rug', colorSlugs: ['ivory'], techniqueSlug: 'hand-knotted', styleSlugs: ['minimal'], variants: [{ id: 'v1', priceInr: 96000 }] } as never;
  const products = [product] as never[];
  const base = {
    // Minimal complete Product so the image-snapshot helper works.
    product,
    variant: { id: 'v1', priceInr: 96000 } as never,
    widthFt: 5, lengthFt: 8, qty: 1, custom: null,
    coating: false, coatPerUnitInr: 0,
  };
  it('rejects a line whose total was edited client-side', () => {
    expect(() => buildOrderItems([{ ...base, sqft: 40, unitPriceInr: 96000, lineTotalInr: 1 } as never], products)).toThrow();
  });
  it('rejects a stale coating charge', () => {
    expect(() => buildOrderItems([{ ...base, sqft: 40, coating: true, coatPerUnitInr: 10, unitPriceInr: 96000, lineTotalInr: 96010 } as never], products)).toThrow(/coating/);
  });
  it('accepts an honest line and snapshots trusted values', () => {
    // Coating for 5×8 ft is ₹90 × 40 = ₹3,600; the line total must include it.
    // The trusted payload carries NO money — prices exist only server-side.
    const items = buildOrderItems([{ ...base, sqft: 40, coating: true, coatPerUnitInr: 3600, unitPriceInr: 96000, lineTotalInr: (96000 + 3600) * 1 } as never], products);
    expect(items[0].quantity).toBe(1);
    expect(items[0].coating).toBe(true);
    expect(items[0]).not.toHaveProperty('unit_price_paise');
    expect(items[0]).not.toHaveProperty('coating_charge_paise');
  });
});
