import { describe, expect, it } from 'vitest';
import { STAIN_COAT_RATE_INR_PER_SQFT, stainCoatCost, stainCoatCostForFt, lineTotalInr, ROOM_SIZE_GUIDANCE, sizeByKey } from './sizes';

describe('stain-resistant coating pricing', () => {
  it('rate is ₹90 per sq ft', () => {
    expect(STAIN_COAT_RATE_INR_PER_SQFT).toBe(90);
  });
  it('a 5 × 6 ft rug costs exactly ₹2,700 (30 sq ft × ₹90)', () => {
    expect(stainCoatCostForFt(5, 6)).toBe(2700);
  });
  it('standard-size labels derive charge from numeric feet, not the label', () => {
    const opt = sizeByKey('8x10');
    expect(opt).toBeDefined();
    const [w, l] = opt!.ft;
    expect(stainCoatCostForFt(w, l)).toBe(Math.round(w * l * 90));
  });
  it('decimals round to whole rupees', () => {
    expect(stainCoatCostForFt(4.5, 7.5)).toBe(Math.round(33.75 * 90)); // 3038 → ₹3,038
  });
  it('invalid dimensions never produce a charge', () => {
    expect(stainCoatCostForFt(0, 6)).toBe(0);
    expect(stainCoatCostForFt(-2, 6)).toBe(0);
    expect(stainCoatCostForFt(NaN, 6)).toBe(0);
    expect(stainCoatCost(-5)).toBe(0);
  });
  it('line total adds coating exactly once per unit', () => {
    expect(lineTotalInr(10000, 2700, 2)).toBe((10000 + 2700) * 2);
    expect(lineTotalInr(10000, 0, 2)).toBe(20000); // deselected → no charge
  });
});

describe('room-specific size guidance', () => {
  it('kids-room recommends smaller sizes than living-room', () => {
    const kids = ROOM_SIZE_GUIDANCE.find((g) => g.roomSlug === 'kids-room')!;
    const living = ROOM_SIZE_GUIDANCE.find((g) => g.roomSlug === 'living-room')!;
    expect(kids.recommendedKeys).toEqual(['4x6', '5x8', '6x9']);
    expect(living.recommendedKeys).toContain('9x12');
    expect(kids.recommendedKeys).not.toContain('9x12');
  });
  it('every recommended key exists in the shared SIZE_OPTIONS catalogue', () => {
    for (const g of ROOM_SIZE_GUIDANCE) {
      for (const k of g.recommendedKeys) {
        const opt = sizeByKey(k);
        expect(opt, `missing ${k}`).toBeTruthy();
        expect(opt!.custom).toBe(false);
      }
    }
  });
});
