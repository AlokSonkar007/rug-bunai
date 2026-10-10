// ─────────────────────────────────────────────────────────────────────────────
// FACETED SEARCH ENGINE (client-side analogue of the Algolia/Searchanise layer)
//  • OR logic WITHIN a facet group, AND logic ACROSS groups.
//  • Facet counts are computed dynamically against the *other* active filters
//    so users never hit a dead end; zero-count options are shown disabled.
//  • Filter state lives in the URL query string (shareable, back/forward safe);
//    canonical + noindex guidance for filtered URLs is documented server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { PRODUCTS, priceRange, type Product, type Variant } from '../data/products';
import { CARPET_CATEGORIES, carpetCategoryPath, COLORS, findCarpetCategory, MATERIALS, ROOMS, STYLES, TECHNIQUES } from '../data/vocabularies';

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'best-selling' | 'newest';

export const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'relevance', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'rating', label: 'User Rating' },
  { key: 'best-selling', label: 'Best Selling' },
  { key: 'newest', label: 'Newest' },
];

export interface FacetState {
  readonly techniques: readonly string[];
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly rooms: readonly string[];
  readonly styles: readonly string[];
  readonly sizeBucket: string | null; // 'small' | 'medium' | 'large' | 'runner'
  readonly priceMin: number | null;
  readonly priceMax: number | null;
  readonly query: string;
  readonly sort: SortKey;
}

export const EMPTY_FACETS: FacetState = {
  techniques: [], materials: [], colors: [], rooms: [], styles: [],
  sizeBucket: null, priceMin: null, priceMax: null, query: '', sort: 'relevance',
};

// ── URL <-> state serialisation ----------------------------------------------

const csv = (s: string) => (s ? s.split(',').filter(Boolean) : []);

export function facetsFromSearch(sp: URLSearchParams): FacetState {
  return {
    techniques: csv(sp.get('tech') ?? ''),
    materials: csv(sp.get('material') ?? ''),
    colors: csv(sp.get('color') ?? ''),
    rooms: csv(sp.get('room') ?? ''),
    styles: csv(sp.get('style') ?? ''),
    sizeBucket: sp.get('size'),
    priceMin: sp.get('min') ? Number(sp.get('min')) : null,
    priceMax: sp.get('max') ? Number(sp.get('max')) : null,
    query: sp.get('q') ?? '',
    sort: (sp.get('sort') as SortKey) || 'relevance',
  };
}

export function facetsToSearch(f: FacetState): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.techniques.length) sp.set('tech', f.techniques.join(','));
  if (f.materials.length) sp.set('material', f.materials.join(','));
  if (f.colors.length) sp.set('color', f.colors.join(','));
  if (f.rooms.length) sp.set('room', f.rooms.join(','));
  if (f.styles.length) sp.set('style', f.styles.join(','));
  if (f.sizeBucket) sp.set('size', f.sizeBucket);
  if (f.priceMin != null) sp.set('min', String(f.priceMin));
  if (f.priceMax != null) sp.set('max', String(f.priceMax));
  if (f.query) sp.set('q', f.query);
  if (f.sort !== 'relevance') sp.set('sort', f.sort);
  return sp;
}

// ── Predicate helpers ----------------------------------------------------------

export type SizeBucketKey = 'small' | 'medium' | 'large' | 'runner';
export const SIZE_BUCKETS: ReadonlyArray<{ key: SizeBucketKey; label: string }> = [
  { key: 'small', label: 'Small — up to 160 cm' },
  { key: 'medium', label: 'Medium — 161–250 cm' },
  { key: 'large', label: 'Large — over 250 cm' },
  { key: 'runner', label: 'Runner — narrow format' },
];

export const bucketOf = (v: Variant): SizeBucketKey => {
  const longest = Math.max(v.width.cm, v.length.cm);
  const shortest = Math.min(v.width.cm, v.length.cm);
  if (shortest <= 90 && longest >= 240) return 'runner';
  if (longest <= 160) return 'small';
  if (longest <= 250) return 'medium';
  return 'large';
};

const matchesExceptColor = (p: Product, f: FacetState): boolean => {
  if (f.techniques.length && !f.techniques.includes(p.techniqueSlug)) return false;
  if (f.materials.length && !f.materials.includes(p.materialSlug)) return false;
  if (f.rooms.length && !f.rooms.some((r) => p.roomSlugs.includes(r))) return false;
  if (f.styles.length && !f.styles.some((s) => p.styleSlugs.includes(s))) return false;
  if (f.query.trim()) {
    const q = f.query.toLowerCase();
    const hay = `${p.name} ${p.tagline} ${p.description} ${p.craftStory}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  // Price & size evaluate per-variant below; parent passes if any variant fits.
  const variantsFit = p.variants.filter((v) => {
    if (f.priceMin != null && v.priceInr < f.priceMin) return false;
    if (f.priceMax != null && v.priceInr > f.priceMax) return false;
    if (f.sizeBucket && bucketOf(v) !== f.sizeBucket) return false;
    return true;
  });
  return variantsFit.length > 0;
};

/** Full predicate including colour (OR within group). */
const matchesAll = (p: Product, f: FacetState): boolean => {
  if (!matchesExceptColor(p, f)) return false;
  if (f.colors.length) {
    const anyVariantColor = p.variants.some((v) => f.colors.includes(v.colorSlug));
    if (!anyVariantColor) return false;
  }
  return true;
};

// ── Facet computation -----------------------------------------------------------

export type FacetOption = { slug: string; label: string; count: number; extra?: string };
export type FacetGroup = { id: keyof FacetState & string; label: string; options: FacetOption[] };

function countFor(
  dimension: 'techniques' | 'materials' | 'colors' | 'rooms' | 'styles',
  dict: readonly { slug: string; label: string }[],
  f: FacetState,
  products: readonly Product[] = PRODUCTS,
): FacetOption[] {
  // Count products matching every OTHER active filter (dynamic facet counts),
  // then test membership in this dimension.
  const relaxed: FacetState = { ...f, [dimension]: [] };
  return dict.map((term) => {
    const pool = products.filter((p) => {
      if (!matchesAll(p, relaxed)) return false;
      switch (dimension) {
        case 'techniques': return p.techniqueSlug === term.slug;
        case 'materials': return p.materialSlug === term.slug;
        case 'colors': return p.variants.some((v) => v.colorSlug === term.slug);
        case 'rooms': return p.roomSlugs.includes(term.slug);
        case 'styles': return p.styleSlugs.includes(term.slug);
      }
    });
    return { slug: term.slug, label: term.label, count: pool.length };
  });
}

export function computeFacets(f: FacetState, products: readonly Product[] = PRODUCTS): FacetGroup[] {
  const sizeOptions = SIZE_BUCKETS.map((b) => ({
    slug: b.key,
    label: b.label,
    count: products.filter(
      (p) => matchesAll(p, f) && p.variants.some((v) => bucketOf(v) === b.key),
    ).length,
  }));

  return [
    { id: 'techniques', label: 'Technique', options: countFor('techniques', TECHNIQUES, f, products) },
    { id: 'materials', label: 'Material', options: countFor('materials', MATERIALS, f, products) },
    { id: 'colors', label: 'Colour', options: countFor('colors', COLORS, f, products) },
    { id: 'sizeBucket', label: 'Size', options: sizeOptions },
    { id: 'rooms', label: 'Room', options: countFor('rooms', ROOMS, f, products) },
    { id: 'styles', label: 'Style', options: countFor('styles', STYLES, f, products) },
  ];
}

// ── Result pipeline ---------------------------------------------------------------

const relevanceScore = (p: Product) =>
  p.rating * 2 + (p.bestSellerRank ? 1 / p.bestSellerRank : 0) + p.reviewsCount / 500;

export function runSearch(f: FacetState, products: readonly Product[] = PRODUCTS): { results: Product[]; facets: FacetGroup[]; total: number } {
  let results = products.filter((p) => matchesAll(p, f));
  switch (f.sort) {
    case 'price-asc':
      results = [...results].sort((a, b) => priceRange(a).min - priceRange(b).min); break;
    case 'price-desc':
      results = [...results].sort((a, b) => priceRange(b).max - priceRange(a).max); break;
    case 'rating':
      results = [...results].sort((a, b) => b.rating - a.rating); break;
    case 'best-selling':
      results = [...results].sort(
        (a, b) => (a.bestSellerRank ?? 99) - (b.bestSellerRank ?? 99) || b.reviewsCount - a.reviewsCount,
      ); break;
    case 'newest':
      results = [...results].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo); break;
    default:
      results = [...results].sort((a, b) => relevanceScore(b) - relevanceScore(a));
  }
  return { results, facets: computeFacets(f, products), total: results.length };
}

// ── Applied-filter chips ------------------------------------------------------------
// A chip represents one *removable filter concept*. Most chips map 1:1 to a
// FacetState key; price is a single logical chip that spans the paired
// priceMin/priceMax keys, so it gets its own group id instead of leaking
// internal state field names into the UI layer.

export type ChipGroup = Exclude<keyof FacetState, 'priceMin' | 'priceMax'> | 'price';
export type Chip = { group: ChipGroup; value: string; label: string };

const termLabel = (dict: readonly { slug: string; label: string }[], slug: string) =>
  dict.find((x) => x.slug === slug)?.label ?? slug;

export function appliedChips(f: FacetState): Chip[] {
  const chips: Chip[] = [];
  f.techniques.forEach((s) => chips.push({ group: 'techniques', value: s, label: termLabel(TECHNIQUES, s) }));
  f.materials.forEach((s) => chips.push({ group: 'materials', value: s, label: termLabel(MATERIALS, s) }));
  f.colors.forEach((s) => chips.push({ group: 'colors', value: s, label: termLabel(COLORS, s) }));
  f.rooms.forEach((s) => chips.push({ group: 'rooms', value: s, label: termLabel(ROOMS, s) }));
  f.styles.forEach((s) => chips.push({ group: 'styles', value: s, label: termLabel(STYLES, s) }));
  if (f.sizeBucket)
    chips.push({ group: 'sizeBucket', value: f.sizeBucket, label: SIZE_BUCKETS.find((b) => b.key === f.sizeBucket)?.label ?? f.sizeBucket });
  if (f.priceMin != null || f.priceMax != null) {
    const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');
    chips.push({
      group: 'price',
      value: 'price',
      label: `Price ${f.priceMin != null ? fmt(f.priceMin) : ''}${f.priceMin != null && f.priceMax != null ? ' – ' : ''}${f.priceMax != null ? fmt(f.priceMax) : ''}`,
    });
  }
  if (f.query.trim()) chips.push({ group: 'query', value: f.query, label: `“${f.query.trim()}”` });
  return chips;
}

export function removeChip(f: FacetState, chip: Chip): FacetState {
  switch (chip.group) {
    case 'techniques': return { ...f, techniques: f.techniques.filter((x) => x !== chip.value) };
    case 'materials': return { ...f, materials: f.materials.filter((x) => x !== chip.value) };
    case 'colors': return { ...f, colors: f.colors.filter((x) => x !== chip.value) };
    case 'rooms': return { ...f, rooms: f.rooms.filter((x) => x !== chip.value) };
    case 'styles': return { ...f, styles: f.styles.filter((x) => x !== chip.value) };
    case 'sizeBucket': return { ...f, sizeBucket: null };
    case 'price': return { ...f, priceMin: null, priceMax: null };
    case 'query': return { ...f, query: '' };
    default: return f;
  }
}

// ── Category browsing (dual-axis taxonomy) --------------------------------------------
// A product may live on several category paths without duplication in the data model.

export function productsInCategory(path: string): Product[] {
  return PRODUCTS.filter((p) => p.categoryPaths.includes(path));
}

// ── Category-path titles for every dual-axis taxonomy node (curated + derived).

export const CATEGORY_TITLES: Record<string, string> = {
  'rugs/hand-knotted/wool': 'Hand-Knotted Wool Rugs',
  'rugs/hand-knotted/silk-blend': 'Hand-Knotted Silk Blend Rugs',
  'rugs/hand-tufted/wool': 'Hand-Tufted Wool Rugs',
  'rugs/flat-woven/cotton': 'Flat-Woven Cotton Rugs',
  'rugs/flat-woven/jute': 'Flat-Woven Jute Runners',
  'rugs/loom-woven/bamboo-silk': 'Loom-Woven Bamboo Silk Rugs',
  'rugs/living-room': 'Living Room Rugs',
  'rugs/bedroom': 'Bedroom Rugs',
  'rugs/dining-room': 'Dining Room Rugs',
  'rugs/hallway': 'Hallway Runners',
  'rugs/office': 'Office Rugs',
  'rugs/geometric': 'Geometric Rugs',
  'rugs/abstract': 'Abstract Rugs',
  'rugs/traditional': 'Traditional Rugs',
  'rugs/modern': 'Modern Rugs',
  'rugs/botanical': 'Botanical Rugs',
  'rugs/kids-room': 'Kids Room Rugs',
};

// ── Category-path titles for every dual-axis taxonomy node (curated + derived).
// Covers the 15 curated design categories (`rugs/category/<slug>`), room,
// style and technique×material paths — so collection pages never lose a title.


export function categoryTitle(path: string): string | undefined {
  if (CATEGORY_TITLES[path]) return CATEGORY_TITLES[path];
  const parts = path.split('/');
  if (parts[0] === 'rugs' && parts[1] === 'category') {
    return findCarpetCategory(parts.slice(2).join('-'))?.label;
  }
  if (parts[0] === 'rugs' && parts.length === 3) {
    const tech = findTerm(TECHNIQUES, parts[1]);
    const mat = findTerm(MATERIALS, parts[2]);
    if (tech && mat) return `${tech.label} ${mat.label} Rugs`;
  }
  if (parts[0] === 'rugs' && parts.length === 2) {
    const term = findTerm(ROOMS, parts[1]) ?? findTerm(STYLES, parts[1]) ?? findTerm(MATERIALS, parts[1]);
    if (term) return `${term.label} Rugs`;
  }
  return undefined;
}

/** All category paths present in the catalogue, incl. every curated category. */
export function allCategoryPaths(products: readonly Product[] = PRODUCTS): string[] {
  const seen = new Set<string>();
  products.forEach((p) => p.categoryPaths.forEach((path) => seen.add(path)));
  CARPET_CATEGORIES.forEach((c) => seen.add(carpetCategoryPath(c.slug)));
  return [...seen].sort();
}
