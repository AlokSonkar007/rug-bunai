import { describe, expect, it } from 'vitest';
import {
  ROOM_SIZE_GUIDANCE,
  SIZE_OPTIONS,
  STAIN_COAT_RATE_INR_PER_SQFT,
  customSizeEstimate,
  isValidCustomPair,
  lineTotalInr,
  stainCoatCost,
  stainCoatCostForFt,
  validateSizeFeet,
} from './sizes';

describe('standard size system', () => {
  it('provides exactly six options: five standard + one custom', () => {
    expect(SIZE_OPTIONS).toHaveLength(6);
    expect(SIZE_OPTIONS.filter((s) => s.custom)).toHaveLength(1);
    expect(SIZE_OPTIONS[5].key).toBe('custom');
  });

  it('uses the five common Indian rug sizes in feet', () => {
    expect(SIZE_OPTIONS.slice(0, 5).map((s) => s.key)).toEqual([
      '4x6', '5x8', '6x9', '8x10', '9x12',
    ]);
  });

  it('derives cm from feet without double conversions', () => {
    const sixByNine = SIZE_OPTIONS.find((s) => s.key === '6x9')!;
    expect(sixByNine.cm).toEqual([183, 274]);
  });
});

describe('stain-resistant coating (₹90 / sq ft)', () => {
  it('keeps the rate in a single constant', () => {
    expect(STAIN_COAT_RATE_INR_PER_SQFT).toBe(90);
  });

  it('charges exactly ₹2,700 for a 5 × 6 ft rug', () => {
    // Required business example: 5 × 6 = 30 sq ft → 30 × ₹90 = ₹2,700.
    expect(stainCoatCostForFt(5, 6)).toBe(2700);
    expect(stainCoatCost(30)).toBe(2700);
  });

  it('handles other standard and custom dimensions', () => {
    expect(stainCoatCostForFt(4, 6)).toBe(2160);   // 24 sq ft
    expect(stainCoatCostForFt(9, 12)).toBe(9720);  // 108 sq ft
    expect(stainCoatCostForFt(3.5, 5)).toBe(1575); // 17.5 sq ft
  });

  it('returns zero for invalid dimensions instead of a bogus charge', () => {
    expect(stainCoatCostForFt(0, 6)).toBe(0);
    expect(stainCoatCostForFt(-3, 6)).toBe(0);
    expect(stainCoatCostForFt(20, 20)).toBe(0);
  });

  it('computes line totals once — no double-applied coating', () => {
    // price 8000 + coating 2700, qty 2 → 21,400 (single rounding at the end)
    expect(lineTotalInr(8000, 2700, 2)).toBe(21400);
    expect(lineTotalInr(8000, 0, 2)).toBe(16000); // deselected coating adds nothing
  });
});

describe('custom-size validation', () => {
  it('accepts reasonable pairs', () => {
    expect(validateSizeFeet(5, 6)).toBeNull();
    expect(validateSizeFeet(1, 2)).toBeNull();
    expect(isValidCustomPair(7.5, 10)).toBe(true);
  });

  it('rejects empty, zero, negative, NaN and oversized dimensions', () => {
    expect(validateSizeFeet(NaN, 6)).not.toBeNull();
    expect(validateSizeFeet(0, 6)).not.toBeNull();
    expect(validateSizeFeet(-4, 6)).not.toBeNull();
    expect(validateSizeFeet(16, 6)).not.toBeNull();
    expect(validateSizeFeet(15, 15)).not.toBeNull(); // 225 sq ft > 150 cap
    expect(isValidCustomPair(0.5, 6)).toBe(false);
  });
});

describe('custom-size pricing estimate', () => {
  it('scales the piece\'s own derived per-sq-ft rate', () => {
    // Base ₹4,800 for 4×6 (24 sq ft) → ₹200/sq ft → 6×9 (54 sq ft) → ₹10,800.
    expect(customSizeEstimate(4800, 4, 6, 6, 9)).toBe(10800);
  });

  it('never silently inherits an unrelated standard price', () => {
    const est = customSizeEstimate(4800, 4, 6, 9, 12);
    expect(est).toBeGreaterThan(customSizeEstimate(4800, 4, 6, 4, 6));
  });
});

describe('room-specific size guidance', () => {
  it('includes Kids Room alongside the existing rooms', () => {
    expect(ROOM_SIZE_GUIDANCE.some((r) => r.roomSlug === 'kids-room')).toBe(true);
  });

  it('recommends only the five standard size keys, room-dependently', () => {
    const validKeys = new Set(SIZE_OPTIONS.filter((s) => !s.custom).map((s) => s.key));
    ROOM_SIZE_GUIDANCE.forEach((r) => {
      r.recommendedKeys.forEach((k) => expect(validKeys.has(k)).toBe(true));
    });
    const kids = ROOM_SIZE_GUIDANCE.find((r) => r.roomSlug === 'kids-room')!;
    const living = ROOM_SIZE_GUIDANCE.find((r) => r.roomSlug === 'living-room')!;
    expect(kids.recommendedKeys).not.toEqual(living.recommendedKeys);
  });
});
