// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DATA MODEL (mirrors the Sanity schema)
//
// Strict separation of concerns:
//  • Category      → navigable browse paths (dual-axis taxonomy). A product can
//                    belong to many categories without being duplicated.
//  • Classification→ logical type that determines the attribute set
//                    (e.g. knot density only exists on Hand-Knotted rugs).
//  • Product       → parent entity (one rug design).
//  • Variant       → child entity (a specific size + colour), owns stock/price.
// ─────────────────────────────────────────────────────────────────────────────

import { CLASSIFICATIONS, COLORS, MATERIALS, ROOMS, STYLES, TECHNIQUES } from './vocabularies';

export type Dimension = { readonly cm: number; readonly in: number };

/** Attribute set for size+colour children. Price stored in whole INR. */
export interface Variant {
  readonly id: string;
  readonly sku: string;
  readonly sizeLabel: string;
  readonly width: Dimension;
  readonly length: Dimension;
  readonly colorSlug: string; // controlled vocabulary term
  readonly priceInr: number;
  readonly stock: number;
}

/** Build a variant whose dimensions come from the canonical feet size system. */
export function makeVariant(
  id: string,
  skuPrefix: string,
  label: string,
  ftW: number,
  ftL: number,
  colorSlug: string,
  priceInr: number,
  stock: number,
): Variant {
  const cm = (ft: number) => Math.round(ft * 30.48);
  return {
    id,
    sku: `${skuPrefix}-${String(Math.round(ftW * 10)).padStart(2, '0')}${String(Math.round(ftL * 10)).padStart(2, '0')}-${colorSlug.slice(0, 2).toUpperCase()}`,
    sizeLabel: label,
    width: { cm: cm(ftW), in: Math.round(ftW * 12) },
    length: { cm: cm(ftL), in: Math.round(ftL * 12) },
    colorSlug,
    priceInr,
    stock,
  };
}

/** Exhaustive specification block shown on the PDP. */
export interface Specifications {
  readonly pileHeightMm: number;
  readonly weightKgPerSqm: number;
  readonly backing: string;
  readonly countryOfOrigin: string;
  readonly careInstructions: string;
  /** Only present when the classification defines it (see attribute sets). */
  readonly knotsPerSqIn?: number;
  readonly warpMaterial?: string;
  readonly weaveMonthsApprox?: number;
}

export type RelationshipType = 'completes-the-look' | 'same-collection' | 'alternative';

export interface ProductRelationship {
  readonly targetId: string;
  readonly type: RelationshipType;
}

export interface Product {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly craftStory: string;
  /** Parent-level list of normalised colours across all variants. */
  readonly colorSlugs: readonly string[];
  /**
   * Admin-managed colour options for this rug (Studio > Colours). When
   * present, the PDP shows these swatches instead of deriving them from
   * `colorSlugs`. Optional so existing catalogue records stay valid.
   */
  readonly colourOptions?: readonly import('../lib/colours').ProductColourOption[];
  readonly materialSlug: string;
  readonly techniqueSlug: string;
  readonly styleSlugs: readonly string[];
  readonly roomSlugs: readonly string[];
  readonly classificationSlug: string;
  /** Dual-axis category paths, e.g. "rugs/hand-knotted/wool" & "rugs/living-room". */
  readonly categoryPaths: readonly string[];
  readonly specs: Specifications;
  readonly variants: readonly Variant[];
  readonly rating: number; // 0..5
  readonly reviewsCount: number;
  readonly bestSellerRank?: number;
  readonly addedDaysAgo: number;
  readonly imageSeed: string;
  readonly thumbnailCount: number; // 5–15 macro/lifestyle angles per spec
  readonly relationships: readonly ProductRelationship[];
}

// ── Validation helpers -------------------------------------------------------
// Referential integrity checks so no product can reference a non-dictionary term.

const has = (list: readonly { slug: string }[], slug: string) =>
  list.some((x) => x.slug === slug);

export function validateProduct(p: Product): void {
  const fail = (msg: string) => {
    throw new Error(`PIM validation error [${p.slug}]: ${msg}`);
  };
  if (!has(TECHNIQUES, p.techniqueSlug)) fail(`technique "${p.techniqueSlug}" not in dictionary`);
  if (!has(MATERIALS, p.materialSlug)) fail(`material "${p.materialSlug}" not in dictionary`);
  if (!has(CLASSIFICATIONS, p.classificationSlug))
    fail(`classification "${p.classificationSlug}" not defined`);
  p.styleSlugs.forEach((s) => !has(STYLES, s) && fail(`style "${s}" not in dictionary`));
  p.roomSlugs.forEach((s) => !has(ROOMS, s) && fail(`room "${s}" not in dictionary`));
  p.colorSlugs.forEach((c) => !has(COLORS, c) && fail(`colour "${c}" not in dictionary`));
  if (p.variants.length === 0) fail('must have at least one variant');
  p.variants.forEach((v) => {
    if (!has(COLORS, v.colorSlug)) fail(`variant colour "${v.colorSlug}" not in dictionary`);
    if (v.priceInr <= 0) fail(`variant ${v.sku} has non-positive price`);
    if (v.width.cm < 30 || v.length.cm < 30) fail(`variant ${v.sku} below minimum size (30cm)`);
  });
  // Knot density must only exist where the classification defines it.
  const knotted = p.classificationSlug.startsWith('hand-knotted');
  if (knotted && p.specs.knotsPerSqIn === undefined)
    fail('Hand-Knotted classification requires knotsPerSqIn');
  if (!knotted && p.specs.knotsPerSqIn !== undefined)
    fail('knotsPerSqIn does not belong to this classification\'s attribute set');
}

// ── Catalogue ----------------------------------------------------------------

export const PRODUCTS: readonly Product[] = [
  {
    id: 'p-kashmir-rose',
    slug: 'kashmiri-rose-medallion',
    name: 'Kashmiri Rose Medallion',
    tagline: 'Silk-blend hand-knotted masterpiece',
    description:
      'A central rose medallion blooms across an ivory field, rendered in mulberry silk blend and fine Bhadohi wool. Each medallion curve is drawn from nineteenth-century court patterns preserved in weaver sketch-books.',
    craftStory:
      'Knotted on vertical looms by third-generation karigars, the silk blend catches light differently at every hour — the pattern literally shifts as the sun crosses the room.',
    colorSlugs: ['ivory', 'sand'],
    materialSlug: 'silk-blend',
    techniqueSlug: 'hand-knotted',
    styleSlugs: ['traditional'],
    roomSlugs: ['living-room', 'bedroom'],
    classificationSlug: 'hand-knotted-silk-blend-rug',
    categoryPaths: ['rugs/hand-knotted/silk-blend', 'rugs/living-room', 'rugs/traditional'],
    specs: {
      pileHeightMm: 9,
      weightKgPerSqm: 3.4,
      backing: 'Hand-finished cotton warp & weft',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions:
        'Rotate seasonally. Vacuum without beater bar; professional wash every 24 months. Blot spills immediately, never rub.',
      knotsPerSqIn: 169,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 11,
    },
    variants: [
      makeVariant('v-kr-1', 'KR', '5 × 8 ft', 5, 8, 'ivory', 184000, 2),
      makeVariant('v-kr-2', 'KR', '6 × 9 ft', 6, 9, 'ivory', 296000, 1),
      makeVariant('v-kr-3', 'KR', '5 × 8 ft', 5, 8, 'sand', 184000, 3),
    ],
    rating: 4.9,
    reviewsCount: 41,
    bestSellerRank: 1,
    addedDaysAgo: 210,
    imageSeed: 'kashmiri-rose',
    thumbnailCount: 12,
    relationships: [
      { targetId: 'p-mughal-garden', type: 'same-collection' },
      { targetId: 'p-desert-line', type: 'alternative' },
    ],
  },
  {
    id: 'p-mughal-garden',
    slug: 'mughal-garden-floral',
    name: 'Mughal Garden Floral',
    tagline: 'Hand-knotted wool, Persian-knot field',
    description:
      'Inspired by the char-bagh gardens of the subcontinent, a scrolling vine carries seventeen distinct blossoms across a deep brown ground. Pure hand-spun Bhadohi wool, naturally lanolin-rich and stain-resistant.',
    craftStory:
      'The vine is knotted using the asymmetric Persian (Senneh) knot, allowing the curved lines that symmetric Turkish knots cannot hold — a technique kept alive in Bhadohi workshops.',
    colorSlugs: ['deep-brown', 'sage'],
    materialSlug: 'wool',
    techniqueSlug: 'hand-knotted',
    styleSlugs: ['traditional', 'botanical'],
    roomSlugs: ['living-room', 'dining-room'],
    classificationSlug: 'hand-knotted-wool-rug',
    categoryPaths: ['rugs/hand-knotted/wool', 'rugs/living-room', 'rugs/dining-room', 'rugs/traditional'],
    specs: {
      pileHeightMm: 11,
      weightKgPerSqm: 4.1,
      backing: 'Hand-woven cotton foundation',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without beater bar. Professional wash every 18–24 months. Use a natural-fibre underlay.',
      knotsPerSqIn: 100,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 8,
    },
    variants: [
      makeVariant('v-mg-1', 'MG', '9 × 12 ft', 9, 12, 'deep-brown', 342000, 1),
      makeVariant('v-mg-2', 'MG', '5 × 8 ft', 5, 8, 'deep-brown', 168000, 2),
      makeVariant('v-mg-3', 'MG', '5 × 8 ft', 5, 8, 'sage', 168000, 4),
    ],
    rating: 4.8,
    reviewsCount: 63,
    bestSellerRank: 2,
    addedDaysAgo: 320,
    imageSeed: 'mughal-garden',
    thumbnailCount: 10,
    relationships: [{ targetId: 'p-kashmir-rose', type: 'same-collection' }],
  },
  {
    id: 'p-desert-line',
    slug: 'desert-line-geometric',
    name: 'Desert Line Geometric',
    tagline: 'Modern hand-knotted wool',
    description:
      'Parallel tonal bands in taupe and sand evoke dune ridges at dusk. A quiet statement piece engineered for minimalist interiors — texture does the talking, colour stays restrained.',
    craftStory:
      'The gradation is achieved by hand-dyeing small batches of wool in graduated dips, then blending fibre by hand before knotting — no two rows catch light identically.',
    colorSlugs: ['taupe', 'sand'],
    materialSlug: 'wool',
    techniqueSlug: 'hand-knotted',
    styleSlugs: ['geometric', 'modern'],
    roomSlugs: ['living-room', 'office'],
    classificationSlug: 'hand-knotted-wool-rug',
    categoryPaths: ['rugs/hand-knotted/wool', 'rugs/living-room', 'rugs/geometric', 'rugs/modern'],
    specs: {
      pileHeightMm: 8,
      weightKgPerSqm: 3.6,
      backing: 'Cotton foundation, hand-carved fringe',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without beater bar; rotate 180° every season; professional cleaning annually for heavy use.',
      knotsPerSqIn: 81,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 6,
    },
    variants: [
      makeVariant('v-dl-1', 'DL', '6 × 9 ft', 6, 9, 'taupe', 224000, 3),
      makeVariant('v-dl-2', 'DL', '5 × 8 ft', 5, 8, 'taupe', 138000, 5),
      makeVariant('v-dl-3', 'DL', '4 × 6 ft', 4, 6, 'sand', 78000, 6),
    ],
    rating: 4.7,
    reviewsCount: 88,
    bestSellerRank: 3,
    addedDaysAgo: 95,
    imageSeed: 'desert-line',
    thumbnailCount: 9,
    relationships: [
      { targetId: 'p-stone-shadow', type: 'completes-the-look' },
      { targetId: 'p-kashmir-rose', type: 'alternative' },
    ],
  },
  {
    id: 'p-stone-shadow',
    slug: 'stone-shadow-tufted',
    name: 'Stone Shadow',
    tagline: 'Hand-tufted wool with carved relief',
    description:
      'Concentric charcoal rings, hand-carved into the pile so each ridge throws a soft shadow. Dense New Zealand wool blend underfoot, with a low profile suited to dining chairs.',
    craftStory:
      'Tufting is a dialogue between needle and shears: after the yarn face is punched, the carver sculpts depth by hand — the reason no two Stone Shadows are identical.',
    colorSlugs: ['charcoal', 'black'],
    materialSlug: 'wool',
    techniqueSlug: 'hand-tufted',
    styleSlugs: ['abstract', 'modern'],
    roomSlugs: ['bedroom', 'office'],
    classificationSlug: 'hand-tufted-wool-rug',
    categoryPaths: ['rugs/hand-tufted/wool', 'rugs/bedroom', 'rugs/abstract', 'rugs/modern'],
    specs: {
      pileHeightMm: 14,
      weightKgPerSqm: 3.0,
      backing: 'Latex-treated primary cloth with cotton canvas secondary',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum on low suction. Spot-clean with cold water and mild detergent. Avoid prolonged direct sunlight.',
    },
    variants: [
      makeVariant('v-ss-1', 'SS', '5 × 8 ft', 5, 8, 'charcoal', 74000, 8),
      makeVariant('v-ss-2', 'SS', '4 × 6 ft', 4, 6, 'black', 46000, 10),
      makeVariant('v-ss-3', 'SS', '6 × 9 ft', 6, 9, 'charcoal', 118000, 4),
    ],
    rating: 4.6,
    reviewsCount: 134,
    bestSellerRank: 4,
    addedDaysAgo: 60,
    imageSeed: 'stone-shadow',
    thumbnailCount: 8,
    relationships: [{ targetId: 'p-desert-line', type: 'completes-the-look' }],
  },
  {
    id: 'p-riverstone',
    slug: 'riverstone-flatweave',
    name: 'Riverstone Flatweave',
    tagline: 'Flat-woven cotton kilim',
    description:
      'A reversible dhurrie in ivory and sand whose pebble-like motifs were woven for riverbank courtyards generations ago. Lightweight, layerable, and machine-friendly on low spin.',
    craftStory:
      'Flat-weaving interlocks weft over warp without a pile — the pattern is structural, visible identically from both sides, which is why kilims survive decades of daily use.',
    colorSlugs: ['ivory', 'terracotta'],
    materialSlug: 'cotton',
    techniqueSlug: 'flat-woven',
    styleSlugs: ['geometric', 'traditional'],
    roomSlugs: ['dining-room', 'hallway'],
    classificationSlug: 'flat-woven-cotton-rug',
    categoryPaths: ['rugs/flat-woven/cotton', 'rugs/dining-room', 'rugs/hallway', 'rugs/geometric'],
    specs: {
      pileHeightMm: 4,
      weightKgPerSqm: 2.2,
      backing: 'None — fully woven flat structure, reversible',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Shake or vacuum both faces. Gentle cold machine wash separately; dry flat in shade.',
    },
    variants: [
      makeVariant('v-rs-1', 'RF', '6 × 9 ft', 6, 9, 'ivory', 52000, 7),
      makeVariant('v-rs-2', 'RF', '5 × 8 ft', 5, 8, 'terracotta', 38000, 9),
      makeVariant('v-rs-3', 'RF', '4 × 6 ft', 4, 6, 'ivory', 24000, 12),
    ],
    rating: 4.5,
    reviewsCount: 212,
    addedDaysAgo: 400,
    imageSeed: 'riverstone',
    thumbnailCount: 7,
    relationships: [{ targetId: 'p-monsoon-reeds', type: 'completes-the-look' }],
  },
  {
    id: 'p-monsoon-reeds',
    slug: 'monsoon-reeds-runner',
    name: 'Monsoon Reeds Runner',
    tagline: 'Flat-woven jute hallway runner',
    description:
      'Undyed jute with sage-dyed reed stripes, woven for long passages. Natural fibres, zero synthetic backing, quietly sound-dampening underfoot.',
    craftStory:
      'Jute is spun from the stalk of the golden fibre plant harvested in the Gangetic belt; its tensile strength made it the working-class ancestor of every luxury floorcovering in the region.',
    colorSlugs: ['sand', 'sage'],
    materialSlug: 'jute',
    techniqueSlug: 'flat-woven',
    styleSlugs: ['botanical', 'modern'],
    roomSlugs: ['hallway', 'bedroom'],
    classificationSlug: 'flat-woven-jute-runner',
    categoryPaths: ['rugs/flat-woven/jute', 'rugs/hallway', 'rugs/botanical'],
    specs: {
      pileHeightMm: 6,
      weightKgPerSqm: 2.6,
      backing: 'None — woven jute on jute warp',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum frequently; keep away from persistent damp. Dry-clean only for stains.',
    },
    variants: [
      makeVariant('v-mr-1', 'MR', '5 × 8 ft', 5, 8, 'sage', 28000, 11),
      makeVariant('v-mr-2', 'MR', '5 × 8 ft', 5, 8, 'sand', 36000, 6),
    ],
    rating: 4.4,
    reviewsCount: 57,
    addedDaysAgo: 150,
    imageSeed: 'monsoon-reeds',
    thumbnailCount: 6,
    relationships: [{ targetId: 'p-riverstone', type: 'completes-the-look' }],
  },
  {
    id: 'p-lunar-drift',
    slug: 'lunar-drift-silk',
    name: 'Lunar Drift',
    tagline: 'Loom-woven bamboo silk abstract',
    description:
      'Charcoal drifting into ivory like cloud over moonwater. Bamboo silk is woven on a pit loom so the sheen runs lengthwise — the rug changes character as you walk across it.',
    craftStory:
      'Bamboo viscose yarn is regenerated from fast-growing grass; woven at tension it reads as silk at a fraction of the environmental cost — heritage technique, contemporary conscience.',
    colorSlugs: ['charcoal', 'ivory'],
    materialSlug: 'bamboo-silk',
    techniqueSlug: 'loom-woven',
    styleSlugs: ['abstract', 'modern'],
    roomSlugs: ['bedroom', 'living-room'],
    classificationSlug: 'loom-woven-bamboo-silk-rug',
    categoryPaths: ['rugs/loom-woven/bamboo-silk', 'rugs/bedroom', 'rugs/abstract', 'rugs/modern'],
    specs: {
      pileHeightMm: 7,
      weightKgPerSqm: 2.8,
      backing: 'Cotton canvas secondary, hand-stitched edges',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without beater bar. Blot spills; professional clean recommended. Rotate quarterly.',
    },
    variants: [
      makeVariant('v-ld-1', 'LD', '5 × 8 ft', 5, 8, 'charcoal', 96000, 5),
      makeVariant('v-ld-2', 'LD', '6 × 9 ft', 6, 9, 'ivory', 148000, 2),
    ],
    rating: 4.8,
    reviewsCount: 29,
    addedDaysAgo: 21,
    imageSeed: 'lunar-drift',
    thumbnailCount: 11,
    relationships: [{ targetId: 'p-stone-shadow', type: 'alternative' }],
  },
  {
    id: 'p-anchal-heritage',
    slug: 'anchal-heritage-border',
    name: 'Anchal Heritage Border',
    tagline: 'Hand-knotted wool, palace-border motif',
    description:
      'A navy field framed by an anchal (pallu) border adapted from temple textile traditions — the same motif language found on Banarasi saris, translated to the loom floor.',
    craftStory:
      'Bhadohi sits sixty kilometres from Varanasi; saris and carpets grew up sharing draftsmen. This border is a direct quotation of a 1911 pallu sketch held in a weaver family archive.',
    colorSlugs: ['navy', 'sand'],
    materialSlug: 'wool',
    techniqueSlug: 'hand-knotted',
    styleSlugs: ['traditional'],
    roomSlugs: ['dining-room', 'office'],
    classificationSlug: 'hand-knotted-wool-rug',
    categoryPaths: ['rugs/hand-knotted/wool', 'rugs/dining-room', 'rugs/office', 'rugs/traditional'],
    specs: {
      pileHeightMm: 10,
      weightKgPerSqm: 3.9,
      backing: 'Hand-woven cotton foundation',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without beater bar; pads recommended under dining chairs; professional wash biennially.',
      knotsPerSqIn: 121,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 9,
    },
    variants: [
      makeVariant('v-ah-1', 'AH', '9 × 12 ft', 9, 12, 'navy', 388000, 1),
      makeVariant('v-ah-2', 'AH', '6 × 9 ft', 6, 9, 'navy', 268000, 2),
      makeVariant('v-ah-3', 'AH', '5 × 8 ft', 5, 8, 'sand', 156000, 3),
    ],
    rating: 4.9,
    reviewsCount: 36,
    bestSellerRank: 5,
    addedDaysAgo: 480,
    imageSeed: 'anchal-heritage',
    thumbnailCount: 14,
    relationships: [{ targetId: 'p-mughal-garden', type: 'same-collection' }],
  },
] as const;

PRODUCTS.forEach(validateProduct);

// ── Derived accessors ---------------------------------------------------------

export const getProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

export const priceRange = (p: Product) => {
  const prices = p.variants.map((v) => v.priceInr);
  return { min: Math.min(...prices), max: Math.max(...prices) };
};

export const formatINR = (n: number) =>
  '₹' + n.toLocaleString('en-IN');
