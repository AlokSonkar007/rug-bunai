// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DATA ACCESS (single source of truth for every page)
//
//  • Supabase configured → catalogue loads from Postgres through the anon key;
//    Row Level Security decides what is visible (published rows for the world,
//    everything for admins).
//  • Not configured      → deterministic local demo catalogue (src/data/seedProducts.ts)
//    so the site remains fully browsable during setup / CI / previews.
//
// Mapping layer converts DB rows into the existing Product view-model so no UI
// code had to change shape.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase, PRODUCT_IMAGES_BUCKET } from './supabase';
import type {
  ProductImageRow,
  ProductRow,
  ProductSpecs,
  VariantRow,
} from './database.types';
import type { Product, RelationshipType, Specifications, Variant } from '../data/products';
import { SEED_PRODUCTS } from '../data/seedProducts';
import { COLORS } from '../data/vocabularies';
import { rugImage as seedRugImage } from './rugArt';

// ── Row → view-model mapping ─────────────────────────────────────────────────

interface JoinedProductRow extends ProductRow {
  variants?: VariantRow[];
  product_images?: ProductImageRow[];
  product_categories?: { category_path: string }[];
  target_product?: ProductRow | null;
}

const COLOR_TO_SLUG = new Map(COLORS.map((c) => [c.slug.toLowerCase(), c.slug]));

/** Normalise legacy free-text colour names ("Deep Brown") to dictionary slugs. */
export const normalizeColorSlug = (raw: string): string => {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return COLOR_TO_SLUG.get(key) ?? key;
};

const asNumber = (v: number | string): number =>
  typeof v === 'number' ? v : Number(v);

function mapVariant(v: VariantRow): Variant {
  return {
    id: v.id,
    sku: v.sku,
    sizeLabel: v.size_label,
    width: { cm: asNumber(v.width_cm), in: asNumber(v.width_in) },
    length: { cm: asNumber(v.length_cm), in: asNumber(v.length_in) },
    colorSlug: normalizeColorSlug(v.color_slug),
    priceInr: asNumber(v.price_inr),
    stock: asNumber(v.stock),
  };
}

/** Runtime guard for the jsonb specs blob — fixes root cause instead of casting. */
function parseSpecs(raw: ProductSpecs | null | undefined): Specifications {
  if (!raw || typeof raw !== 'object') {
    return {
      pileHeightMm: 8,
      weightKgPerSqm: 3.2,
      backing: 'Hand-finished cotton foundation',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without beater bar; professional wash every 18–24 months.',
    };
  }
  const n = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const s = (x: unknown, d: string): string => (typeof x === 'string' && x ? x : d);
  const specs: Specifications = {
    pileHeightMm: n(raw.pileHeightMm, 8),
    weightKgPerSqm: n(raw.weightKgPerSqm, 3.2),
    backing: s(raw.backing, 'Hand-finished cotton foundation'),
    countryOfOrigin: s(raw.countryOfOrigin, 'Bhadohi, Uttar Pradesh, India'),
    careInstructions: s(raw.careInstructions, 'Vacuum without beater bar; professional wash periodically.'),
  };
  if (typeof raw.knotsPerSqIn === 'number') specs.knotsPerSqIn = raw.knotsPerSqIn;
  if (typeof raw.warpMaterial === 'string') specs.warpMaterial = raw.warpMaterial;
  if (typeof raw.weaveMonthsApprox === 'number') specs.weaveMonthsApprox = raw.weaveMonthsApprox;
  return specs;
}

const daysSince = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function mapProduct(row: JoinedProductRow): Product {
  const variants = [...(row.variants ?? [])]
    .sort((a, b) => a.sort - b.sort)
    .map(mapVariant);
  const parentColors = [...new Set(variants.map((v) => v.colorSlug))];
  const rel = row.target_product
    ? [{ targetId: row.target_product.id, type: row.product_relationship_type satisfies RelationshipType }]
    : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    craftStory: row.craft_story,
    colorSlugs: parentColors.length ? parentColors : (row.tags ?? []),
    materialSlug: row.material_slug,
    techniqueSlug: row.technique_slug,
    styleSlugs: row.style_slugs,
    roomSlugs: row.room_slugs,
    classificationSlug: row.classification_slug,
    categoryPaths: (row.product_categories ?? []).map((c) => c.category_path),
    specs: parseSpecs(row.specs),
    variants,
    rating: asNumber(row.rating),
    reviewsCount: asNumber(row.reviews_count),
    bestSellerRank: row.best_seller_rank ?? undefined,
    addedDaysAgo: daysSince(row.created_at),
    imageSeed: row.image_seed || row.slug,
    thumbnailCount: Math.max(asNumber(row.thumbnail_count), 5),
    relationships: rel,
    // Database-driven flags & gallery (consumed by new UI sections):
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    isLatest: row.is_latest,
    featuredOrder: asNumber(row.featured_order),
    latestOrder: asNumber(row.latest_order),
    sortOrder: asNumber(row.sort_order),
    tags: row.tags,
    collectionId: row.collection_id,
    images: [...(row.product_images ?? [])].sort((a, b) => a.sort - b.sort),
  };
}

// Give seed products sensible defaults for the new fields so consumers can
// treat demo + DB modes uniformly.
const seedWithFlags: Product[] = SEED_PRODUCTS.map((p) => ({
  ...p,
  isPublished: true,
  isFeatured: Boolean(p.bestSellerRank),
  isLatest: p.addedDaysAgo <= 90,
  featuredOrder: p.bestSellerRank ?? 99,
  latestOrder: p.addedDaysAgo,
  sortOrder: 0,
  tags: [],
  collectionId: null,
  images: Array.from({ length: Math.min(p.thumbnailCount, 5) }, (_, i) => ({
    id: `seed-${p.id}-${i}`,
    product_id: p.id,
    storage_path: null,
    seed_angle: i,
    is_primary: i === 0,
    sort: i,
    alt: null,
    created_at: new Date().toISOString(),
  })),
}));

// ── Image URL resolution (Storage first, procedural weave render as fallback) ─

const publicUrlCache = new Map<string, string>();

/** Resolve a product-image row to a displayable URL. */
export function productImageUrl(product: Product, img: ProductImageRow | undefined): string {
  if (img?.storage_path && isSupabaseConfigured) {
    const cached = publicUrlCache.get(img.storage_path);
    if (cached) return cached;
    const { data } = requireSupabase().storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(img.storage_path);
    publicUrlCache.set(img.storage_path, data.publicUrl);
    return data.publicUrl;
  }
  // No uploaded photo yet → deterministic SVG weaving (existing visual system).
  return seedRugImage(product, img?.seed_angle ?? 0);
}

export function primaryImage(product: Product): ProductImageRow | undefined {
  const imgs = product.images ?? [];
  return imgs.find((i) => i.is_primary) ?? imgs[0];
}

export function galleryImages(product: Product): ProductImageRow[] {
  const imgs = [...(product.images ?? [])].sort((a, b) => a.sort - b.sort);
  if (imgs.length > 0) return imgs;
  return Array.from({ length: product.thumbnailCount }, (_, i) => ({
    id: `synthetic-${product.id}-${i}`,
    product_id: product.id,
    storage_path: null,
    seed_angle: i,
    is_primary: i === 0,
    sort: i,
    alt: null,
    created_at: new Date().toISOString(),
  }));
}

// ── Queries ───────────────────────────────────────────────────────────────────

const PRODUCT_SELECT = `
  *,
  variants (*),
  product_images (*),
  product_categories (category_path)
` as const;

async function fetchCatalogue(admin: boolean): Promise<Product[]> {
  const supabase = requireSupabase();
  let query = supabase.from('products').select(PRODUCT_SELECT);
  if (!admin) query = query.eq('is_published', true);
  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as JoinedProductRow[];
  return rows.map(mapProduct);
}

async function fetchRelationships(): Promise<Map<string, { targetId: string; type: RelationshipType }[]>> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('product_relationships')
    .select('source_id, target_id, type, sort')
    .order('sort');
  if (error) throw new Error(error.message);
  const map = new Map<string, { targetId: string; type: RelationshipType }[]>();
  for (const r of data ?? []) {
    const list = map.get(r.source_id) ?? [];
    list.push({ targetId: r.target_id, type: r.type });
    map.set(r.source_id, list);
  }
  return map;
}

// ── Catalogue context hook ────────────────────────────────────────────────────

export interface CatalogueState {
  products: Product[];
  loading: boolean;
  error: string | null;
  /** Admin view includes unpublished rows when the session is an admin. */
  includeUnpublished: boolean;
  setIncludeUnpublished: (v: boolean) => void;
  refresh: () => void;
  bySlug: (slug: string) => Product | undefined;
  byId: (id: string) => Product | undefined;
  featured: Product[];
  latest: Product[];
}

export function useCatalogue(session: Session | null, isAdmin: boolean): CatalogueState {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeUnpublished, setIncludeUnpublished] = useState(false);
  const [nonce, setNonce] = useState(0);

  const effectiveAdmin = isAdmin && includeUnpublished;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured) {
        setProducts(seedWithFlags);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [rows, relMap] = await Promise.all([
          fetchCatalogue(effectiveAdmin),
          fetchRelationships(),
        ]);
        if (cancelled) return;
        const withRel = rows.map((p) => {
          const rel = relMap.get(p.id);
          return rel && rel.length > 0 ? { ...p, relationships: rel } : p;
        });
        setProducts(withRel);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the catalogue.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
    // session identity changes visibility rules (customer vs admin)
  }, [session?.user?.id, effectiveAdmin, nonce]);

  const bySlug = useCallback(
    (slug: string) => products.find((p) => p.slug === slug),
    [products],
  );
  const byId = useCallback((id: string) => products.find((p) => p.id === id), [products]);

  const featured = useMemo(
    () => products.filter((p) => p.isFeatured).sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99)),
    [products],
  );
  const latest = useMemo(
    () =>
      products
        .filter((p) => p.isLatest)
        .sort((a, b) => (a.latestOrder ?? 99) - (b.latestOrder ?? 99) || a.addedDaysAgo - b.addedDaysAgo),
    [products],
  );

  return {
    products,
    loading,
    error,
    includeUnpublished,
    setIncludeUnpublished,
    refresh: () => setNonce((n) => n + 1),
    bySlug,
    byId,
    featured,
    latest,
  };
}

// ── Similar products (attribute-based, DB-driven — replaces random picks) ────

export function similarProducts(source: Product, pool: readonly Product[], limit = 4): Product[] {
  const scored = pool
    .filter((p) => p.id !== source.id && (p.isPublished ?? true))
    .map((p) => {
      let score = 0;
      if (p.techniqueSlug === source.techniqueSlug) score += 3;
      if (p.materialSlug === source.materialSlug) score += 2;
      score += 2 * p.styleSlugs.filter((s) => source.styleSlugs.includes(s)).length;
      score += 1.5 * p.roomSlugs.filter((r) => source.roomSlugs.includes(r)).length;
      score += 1.5 * p.colorSlugs.filter((c) => source.colorSlugs.includes(c)).length;
      score += 1 * (p.tags ?? []).filter((t) => (source.tags ?? []).includes(t)).length;
      if (p.collectionId && p.collectionId === source.collectionId) score += 2;
      if (source.relationships.some((r) => r.targetId === p.id)) score += 4;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating);
  return scored.slice(0, limit).map((x) => x.p);
}

/** Alternate colourways of the same design (variants), used by hover panels. */
export function colorwayVariants(product: Product): Variant[] {
  return product.variants.filter((v) => v.stock > 0);
}
