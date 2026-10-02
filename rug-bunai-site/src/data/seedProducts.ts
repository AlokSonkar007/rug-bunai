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

export const SEED_PRODUCTS: readonly Product[] = [
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
      { id: 'v-kr-1', sku: 'KR-2316-IV', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'ivory', priceInr: 184000, stock: 2 },
      { id: 'v-kr-2', sku: 'KR-3002-IV', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'ivory', priceInr: 296000, stock: 1 },
      { id: 'v-kr-3', sku: 'KR-2316-SA', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'sand', priceInr: 184000, stock: 3 },
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
      { id: 'v-mg-1', sku: 'MG-3602-DB', sizeLabel: '360 × 240 cm (11\'10" × 7\'10")', width: { cm: 240, in: 94.5 }, length: { cm: 360, in: 141.7 }, colorSlug: 'deep-brown', priceInr: 342000, stock: 1 },
      { id: 'v-mg-2', sku: 'MG-2316-DB', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'deep-brown', priceInr: 168000, stock: 2 },
      { id: 'v-mg-3', sku: 'MG-2316-SG', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'sage', priceInr: 168000, stock: 4 },
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
      { id: 'v-dl-1', sku: 'DL-3002-TA', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'taupe', priceInr: 224000, stock: 3 },
      { id: 'v-dl-2', sku: 'DL-2316-TA', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'taupe', priceInr: 138000, stock: 5 },
      { id: 'v-dl-3', sku: 'DL-1601-SA', sizeLabel: '160 × 120 cm (5\'3" × 4\')', width: { cm: 120, in: 47 }, length: { cm: 160, in: 63 }, colorSlug: 'sand', priceInr: 78000, stock: 6 },
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
      { id: 'v-ss-1', sku: 'SS-2316-CH', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'charcoal', priceInr: 74000, stock: 8 },
      { id: 'v-ss-2', sku: 'SS-1601-BK', sizeLabel: '160 × 120 cm (5\'3" × 4\')', width: { cm: 120, in: 47 }, length: { cm: 160, in: 63 }, colorSlug: 'black', priceInr: 46000, stock: 10 },
      { id: 'v-ss-3', sku: 'SS-3002-CH', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'charcoal', priceInr: 118000, stock: 4 },
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
      { id: 'v-rs-1', sku: 'RS-3002-IV', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'ivory', priceInr: 52000, stock: 7 },
      { id: 'v-rs-2', sku: 'RS-2316-TC', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'terracotta', priceInr: 38000, stock: 9 },
      { id: 'v-rs-3', sku: 'RS-1601-IV', sizeLabel: '160 × 120 cm (5\'3" × 4\')', width: { cm: 120, in: 47 }, length: { cm: 160, in: 63 }, colorSlug: 'ivory', priceInr: 24000, stock: 12 },
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
      { id: 'v-mr-1', sku: 'MR-30008-SG', sizeLabel: '300 × 80 cm (9\'10" × 2\'7")', width: { cm: 80, in: 31.5 }, length: { cm: 300, in: 118 }, colorSlug: 'sage', priceInr: 28000, stock: 11 },
      { id: 'v-mr-2', sku: 'MR-40008-SA', sizeLabel: '400 × 80 cm (13\'1" × 2\'7")', width: { cm: 80, in: 31.5 }, length: { cm: 400, in: 157.5 }, colorSlug: 'sand', priceInr: 36000, stock: 6 },
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
      { id: 'v-ld-1', sku: 'LD-2316-CH', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'charcoal', priceInr: 96000, stock: 5 },
      { id: 'v-ld-2', sku: 'LD-3002-IV', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'ivory', priceInr: 148000, stock: 2 },
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
      { id: 'v-ah-1', sku: 'AH-3602-NV', sizeLabel: '360 × 240 cm (11\'10" × 7\'10")', width: { cm: 240, in: 94.5 }, length: { cm: 360, in: 141.7 }, colorSlug: 'navy', priceInr: 388000, stock: 1 },
      { id: 'v-ah-2', sku: 'AH-3002-NV', sizeLabel: '300 × 200 cm (9\'10" × 6\'7")', width: { cm: 200, in: 79 }, length: { cm: 300, in: 118 }, colorSlug: 'navy', priceInr: 268000, stock: 2 },
      { id: 'v-ah-3', sku: 'AH-2316-SA', sizeLabel: '230 × 160 cm (7\'6" × 5\'3")', width: { cm: 160, in: 63 }, length: { cm: 230, in: 90.5 }, colorSlug: 'sand', priceInr: 156000, stock: 3 },
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

SEED_PRODUCTS.forEach(validateProduct);

// ── Derived accessors ---------------------------------------------------------

export const getProduct = (slug: string) => SEED_PRODUCTS.find((p) => p.slug === slug);

export const priceRange = (p: Product) => {
  const prices = p.variants.map((v) => v.priceInr);
  return { min: Math.min(...prices), max: Math.max(...prices) };
};

export const formatINR = (n: number) =>
  '₹' + n.toLocaleString('en-IN');
