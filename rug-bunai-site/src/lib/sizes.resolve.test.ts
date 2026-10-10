// Focused tests for standard-size resolution & availability (Task 2).
import { describe, expect, it } from 'vitest';
import {
  SIZE_OPTIONS, STANDARD_SIZE_KEYS, resolveStandardSize, productRatePerSqft, formatFtLabel,
} from './sizes';

const variants = [
  { id: 'v1', sku: 'S1', sizeLabel: '5 × 8 ft', width: { cm: 152, in: 60 }, length: { cm: 244, in: 96 }, colorSlug: 'ivory', priceInr: 24000, stock: 3 },
];
const opts = { slug: 'mughal-garden-floral', colorSlug: 'ivory' };

describe('standard-size availability resolution', () => {
  it('exposes exactly five standard sizes plus custom', () => {
    expect(STANDARD_SIZE_KEYS).toEqual(['4x6', '5x8', '6x9', '8x10', '9x12']);
    expect(SIZE_OPTIONS).toHaveLength(6);
    expect(SIZE_OPTIONS[5].custom).toBe(true);
    expect(SIZE_OPTIONS[5].label).toBe('Custom Size — Enter Width × Length (ft)');
  });

  it('uses the configured offer price/stock when a matching offer exists', () => {
    const r = resolveStandardSize(SIZE_OPTIONS[1], variants, 3000, opts);
    expect(r.priceable).toBe(true);
    expect(r.availability).toBe('stock');
    expect(r.variant?.priceInr).toBe(24000);
  });

  it('does NOT mark missing offers as unavailable — synthesises made-to-order at the trusted rate', () => {
    const r = resolveStandardSize(SIZE_OPTIONS[3], variants, 3000, opts); // 8×10, no offer record
    expect(r.priceable).toBe(true);
    expect(r.availability).toBe('made-to-order');
    expect(r.variant?.priceInr).toBe(3000 * 8 * 10); // deterministic rate × area
    expect(r.variant?.width.cm).toBe(Math.round(8 * 30.48));
    expect(formatFtLabel(8, 10)).toBe('8 × 10 ft');
  });

  it('falls back to quote (not purchasable) when no trusted rate exists', () => {
    const r = resolveStandardSize(SIZE_OPTIONS[4], variants, null, opts);
    expect(r.priceable).toBe(false);
    expect(r.availability).toBe('quote');
    expect(r.variant).toBeUndefined();
  });

  it('productRatePerSqft prefers the admin-configured customRatePerSqFt', () => {
    expect(productRatePerSqft(variants, 3500)).toBe(3500);
    const derived = productRatePerSqft(variants, null);
    expect(derived).not.toBeNull();
    expect(derived!).toBeGreaterThan(0);
  });

  it('an out-of-stock configured offer still resolves as made-to-order, not hidden', () => {
    const oos = [{ ...variants[0], stock: 0 }];
    const r = resolveStandardSize(SIZE_OPTIONS[1], oos, 3000, opts);
    expect(r.priceable).toBe(true);
    expect(r.availability).toBe('made-to-order');
    expect(r.variant?.priceInr).toBe(24000); // preserves existing configured price
  });
});
