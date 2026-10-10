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
  label: `${w} × ${l} ft`,
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
    label: 'Custom Size — Enter Width × Length (ft)',
    ft: [0, 0],
    cm: [0, 0],
    inches: [0, 0],
    custom: true,
  },
];

/** Format any numeric feet pair with the site-wide convention: `5 × 8 ft`. */
export function formatFtLabel(widthFt: number, lengthFt: number): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(widthFt)} × ${fmt(lengthFt)} ft`;
}

export const CUSTOM_SIZE = SIZE_OPTIONS[SIZE_OPTIONS.length - 1];

export const sizeByKey = (key: string): SizeOption | undefined =>
  SIZE_OPTIONS.find((s) => s.key === key);

/** The five standard size keys — the sixth option is always custom. */
export const STANDARD_SIZE_KEYS = SIZE_OPTIONS.filter((s) => !s.custom).map((s) => s.key);

/** Human label for any size pair, preferring exact canonical matches. */
export function sizeLabelFor(widthFt: number, lengthFt: number): string {
  const match = SIZE_OPTIONS.find(
    (s) => !s.custom && ((s.ft[0] === widthFt && s.ft[1] === lengthFt) || (s.ft[0] === lengthFt && s.ft[1] === widthFt)),
  );
  if (match) return match.label;
  return formatFtLabel(widthFt, lengthFt);
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
// THE single source of truth for the business rule: ₹90 per square foot.
// Coating cost = width ft × length ft × ₹90.  Example: a 5 × 6 ft rug is
// 30 sq ft → 30 × ₹90 = ₹2,700. Every screen (PDP, cart, checkout, order
// record, admin) must call these helpers — never re-derive the rate.

export const STAIN_COAT_RATE_INR_PER_SQFT = 90;

export function stainCoatCost(sqft: number): number {
  return Math.round(Math.max(sqft, 0) * STAIN_COAT_RATE_INR_PER_SQFT);
}

/** Coating cost directly from validated feet dimensions (canonical path). */
export function stainCoatCostForFt(widthFt: number, lengthFt: number): number {
  if (!isValidCustomPair(widthFt, lengthFt)) return 0;
  return stainCoatCost(widthFt * lengthFt);
}

/** Square footage from a stored variant (cm dimensions converted once, here). */
export const lineSqft = (variant: { width: { cm: number }; length: { cm: number } }): number =>
  (variant.width.cm / CM_PER_FT) * (variant.length.cm / CM_PER_FT);

/** Canonical feet for any dimension pair — exact match first, else raw value. */
export function feetOf(dimensions: { cm: number }): number {
  const ft = dimensions.cm / CM_PER_FT;
  const nearest = Math.round(ft * 10) / 10;
  // Snap tiny float drift (e.g. 182.88 cm → 183 cm → 6.002 ft) to 0.1 ft.
  return Math.abs(ft - nearest) < 0.02 ? nearest : Number(ft.toFixed(2));
}

/** Line total incl. optional coating: (price + coatingPerUnit) × qty, rounded once. */
export function lineTotalInr(priceInr: number, coatingPerUnitInr: number, qty: number): number {
  return Math.round((priceInr + coatingPerUnitInr) * Math.max(qty, 0));
}

// ── Custom-size validation ───────────────────────────────────────────────────
// Rejects empty / NaN / zero / negative / unreasonably large dimensions.
// w×l must fall between 2 and 150 sq ft and each side between 1 and 15 ft.

export function validateSizeFeet(w: number, l: number): string | null {
  if (!Number.isFinite(w) || !Number.isFinite(l)) return 'Enter numeric width and length in feet.';
  if (w <= 0 || l <= 0) return 'Dimensions must be greater than zero.';
  if (w < 1 || l < 1) return 'The smallest rug we weave is 1 ft on each side.';
  if (w > 15 || l > 15) return 'Each side must be 15 ft or less (larger pieces need a studio quote).';
  if (w * l < 2) return 'Total area must be at least 2 sq ft.';
  if (w * l > 150) return 'Total area must stay within 150 sq ft online — ask the atelier for larger.';
  return null;
}

/**
 * Custom-size price estimate. There is no authoritative published rate card
 * for bespoke dimensions, so we surface the piece's own derived rate
 * (base price ÷ base area) as an ESTIMATE that the studio confirms before
 * production. This keeps quotes honest instead of inventing a fixed markup.
 */
export function customSizeEstimate(basePriceInr: number, baseW: number, baseL: number, w: number, l: number): number {
  const rate = ratePerSqft(basePriceInr, build('tmp', baseW, baseL));
  return Math.round(rate * w * l);
}

// ── Size-availability resolution (single source of truth) ────────────────────
// Rug Bunai weaves every design to order in all five standard sizes. A missing
// variant record therefore means "not currently stocked", NOT "not offered".
// Prices come from real configured data only: an exact offer match first, then
// this rug's own trusted ₹/sq-ft rate (admin-configured `customRatePerSqFt`
// when present, otherwise the rate derived from its priced variants). Nothing
// here ever invents a price — if the product has no priced variants at all the
// size resolves as quote-only and the purchase flow must block it.

export interface ResolvedSize {
  readonly option: SizeOption;
  /** Existing configured offer, when this size×colour is already recorded. */
  readonly variant?: VariantLike;
  /** True when a price could be resolved from trusted data (never invented). */
  readonly priceable: boolean;
  /** 'stock' → offer exists with stock; 'made-to-order' → woven on request;
   *  'quote' → no trusted pricing, studio quote required before ordering. */
  readonly availability: 'stock' | 'made-to-order' | 'quote';
}

interface VariantLike {
  readonly id: string;
  readonly sku: string;
  readonly sizeLabel: string;
  readonly width: { cm: number; in: number };
  readonly length: { cm: number; in: number };
  readonly colorSlug: string;
  readonly priceInr: number;
  readonly stock: number;
}

/** Trusted ₹/sq-ft rate for a product: admin override first, else derived. */
export function productRatePerSqft(
  variants: readonly VariantLike[],
  customRatePerSqFt?: number | null,
): number | null {
  if (typeof customRatePerSqFt === 'number' && Number.isFinite(customRatePerSqFt) && customRatePerSqFt > 0) {
    return Math.round(customRatePerSqFt);
  }
  const priced = variants.find((v) => v.priceInr > 0);
  if (!priced) return null;
  return ratePerSqft(priced.priceInr, build('tmp', feetOf(priced.width), feetOf(priced.length)));
}

/** Synthesised made-to-order variant id — deterministic per size×colour. */
export const mtoVariantId = (slug: string, sizeKey: string, colorSlug: string) =>
  `mto-${slug}-${sizeKey}-${colorSlug}`;

/** Resolve one standard size for a product against its real offers. */
export function resolveStandardSize(
  option: SizeOption,
  variantsInColor: readonly VariantLike[],
  rate: number | null,
  opts: { slug: string; colorSlug: string },
): ResolvedSize {
  const exact = variantsInColor.find((v) => v.sizeLabel === option.label);
  if (exact) {
    return {
      option,
      variant: exact,
      priceable: true,
      availability: exact.stock > 0 ? 'stock' : 'made-to-order',
    };
  }
  if (rate === null) return { option, priceable: false, availability: 'quote' };
  const priceInr = Math.round(rate * option.ft[0] * option.ft[1]);
  if (!Number.isFinite(priceInr) || priceInr <= 0) return { option, priceable: false, availability: 'quote' };
  // Made-to-order synthesis: same numeric feet model the cart already accepts.
  const synth: VariantLike = {
    id: mtoVariantId(opts.slug, option.key, opts.colorSlug),
    sku: `MTO-${option.key.replace('x', '')}-${opts.colorSlug.slice(0, 2).toUpperCase()}`,
    sizeLabel: option.label,
    width: { cm: Math.round(option.ft[0] * CM_PER_FT), in: Math.round(option.ft[0] * 12) },
    length: { cm: Math.round(option.ft[1] * CM_PER_FT), in: Math.round(option.ft[1] * 12) },
    colorSlug: opts.colorSlug,
    priceInr,
    stock: 0,
  };
  return { option, variant: synth, priceable: true, availability: 'made-to-order' };
}

/** Resolve all five standard sizes for a product (used by PDP & cart). */
export function resolveAllStandardSizes(
  standardOptions: readonly SizeOption[],
  variantsInColor: readonly VariantLike[],
  rate: number | null,
  opts: { slug: string; colorSlug: string },
): ResolvedSize[] {
  return standardOptions.map((option) => resolveStandardSize(option, variantsInColor, rate, opts));
}

/** Per-side recommendation guidance for the floor-plan (room) selector. */
export interface RoomSizeGuidance {
  readonly roomSlug: string;
  readonly note: string;
  /** Recommended subset of the five standard sizes (keys into SIZE_OPTIONS). */
  readonly recommendedKeys: readonly string[];
}

export const ROOM_SIZE_GUIDANCE: readonly RoomSizeGuidance[] = [
  { roomSlug: 'living-room', note: 'Leave 15–30 cm of floor showing beyond every sofa leg. A 6 × 9 ft anchors most sofas; go 8 × 10 ft or 9 × 12 ft for open-plan rooms.', recommendedKeys: ['5x8', '6x9', '8x10', '9x12'] },
  { roomSlug: 'bedroom', note: 'A bedside 4 × 6 ft lands underfoot when you rise; for a king bed let the rug extend 60 cm past both sides — 6 × 9 ft or 8 × 10 ft.', recommendedKeys: ['4x6', '5x8', '6x9', '8x10'] },
  { roomSlug: 'dining-room', note: 'Add 2 ft on every side of the table so chairs stay on the rug when pulled out — usually 8 × 10 ft for six seats, 9 × 12 ft for eight.', recommendedKeys: ['6x9', '8x10', '9x12'] },
  { roomSlug: 'kids-room', note: 'Pick a soft pile sized to the play zone — 4 × 6 ft beside the bed or 5 × 8 ft / 6 × 9 ft for a floor-play area that wipes clean.', recommendedKeys: ['4x6', '5x8', '6x9'] },
  { roomSlug: 'hallway', note: 'Runners keep passages warm; 4 × 6 ft works at an entry, narrow long formats elsewhere.', recommendedKeys: ['4x6', '5x8'] },
  { roomSlug: 'office', note: 'A 5 × 8 ft under a desk chair keeps casters on pile; 4 × 6 ft suits a reading corner.', recommendedKeys: ['4x6', '5x8', '6x9'] },
];
