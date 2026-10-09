// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL SIZE SYSTEM — imperial (feet) is the primary unit across the site.
// Six size options: five regular Indian high-sale carpet sizes + one custom
// "___ × ___ ft" option that opens a dialog and prices per square foot.
// cm/inch values are derived from feet so legacy data keeps working everywhere.
// ─────────────────────────────────────────────────────────────────────────────

export interface SizeOption {
  readonly key: string;
  readonly label: string;   // e.g. `6' × 4'`
  readonly ft: [number, number]; // [width, length] in feet
  readonly cm: [number, number];
  readonly inches: [number, number];
  readonly custom?: boolean;
}

const CM_PER_FT = 30.48;

const build = (key: string, w: number, l: number): SizeOption => ({
  key,
  label: `${w}' × ${l}'`,
  ft: [w, l],
  cm: [Math.round(w * CM_PER_FT), Math.round(l * CM_PER_FT)],
  inches: [Math.round(w * 12), Math.round(l * 12)],
});

/** The six size options shown on every product page & in the Studio. */
export const SIZE_OPTIONS: readonly SizeOption[] = [
  build('4x6', 4, 6),      // 4'×6'  — bedside / small space (India's best-seller)
  build('5x8', 5, 8),      // 5'×8'  — living room standard
  build('6x9', 6, 9),      // 6'×9'  — most popular living-room size
  build('8x10', 8, 10),    // 8'×10' — large living / dining
  build('9x12', 9, 12),    // 9'×12' — extra-large statement piece
  {
    key: 'custom',
    label: 'Custom size',
    ft: [0, 0],
    cm: [0, 0],
    inches: [0, 0],
    custom: true,
  },
];

export const CUSTOM_SIZE = SIZE_OPTIONS[SIZE_OPTIONS.length - 1];

export const sizeByKey = (key: string): SizeOption | undefined =>
  SIZE_OPTIONS.find((s) => s.key === key);

/** Human label for any size pair, preferring exact canonical matches. */
export function sizeLabelFor(widthFt: number, lengthFt: number): string {
  const match = SIZE_OPTIONS.find(
    (s) => !s.custom && ((s.ft[0] === widthFt && s.ft[1] === lengthFt) || (s.ft[0] === lengthFt && s.ft[1] === widthFt)),
  );
  if (match) return match.label;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(widthFt)}' × ${fmt(lengthFt)}'`;
}

/** Legacy products stored cm dimensions — recover the nearest canonical size. */
export function canonicalizeSize(cmW: number, cmL: number): SizeOption {
  let best = SIZE_OPTIONS[1];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const s of SIZE_OPTIONS) {
    if (s.custom) continue;
    const diff = Math.abs(s.cm[0] - cmW) + Math.abs(s.cm[1] - cmL);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best;
}

/** Nearest INR price-per-square-foot for a base price (used by custom sizing). */
export function ratePerSqft(basePriceInr: number, size: SizeOption): number {
  const sqft = Math.max(size.ft[0] * size.ft[1], 1);
  return Math.round(basePriceInr / sqft);
}

export const isValidCustomPair = (w: number, l: number): boolean =>
  w >= 1 && l >= 1 && w <= 15 && l <= 15 && w * l >= 2 && w * l <= 150;

// ── Stain-resistant coating add-on ───────────────────────────────────────────
// ₹90 per square foot, applied at the end of checkout (cart lines only).

export const STAIN_COAT_RATE_INR_PER_SQFT = 90;

export function stainCoatCost(sqft: number): number {
  return Math.round(Math.max(sqft, 0) * STAIN_COAT_RATE_INR_PER_SQFT);
}

export const lineSqft = (variant: { width: { cm: number }; length: { cm: number } }): number =>
  (variant.width.cm / CM_PER_FT) * (variant.length.cm / CM_PER_FT);
