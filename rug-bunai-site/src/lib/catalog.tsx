import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeVariant, PRODUCTS, type Product } from '../data/products';
import { carpetCategoryPath, findCarpetCategory, MATERIALS, STYLES, TECHNIQUES } from '../data/vocabularies';
import { SIZE_OPTIONS, sizeLabelFor } from './sizes';
import { useSiteContent, type TextOverride } from './siteContent';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { dedupeColourOptions, isValidHex, type ProductColourOption } from './colours';

export type CatalogProduct = Product & {
  imageUrl?: string | null;
  /** Homepage-only photo override set in Studio > Homepage Products. */
  homeImageUrl?: string | null;
  isManaged?: boolean;
  managedId?: string;
};

type ProductOverride = { product_slug: string; image_url: string | null; is_hidden: boolean };
type ManagedRow = { id: string; slug: string; product: unknown; image_url: string | null };

/** A single size × colour offer chosen in the Studio. */
export type OfferInput = {
  sizeKey: string; widthFt: number; lengthFt: number; colorSlug: string; priceInr: number; stock: number;
};

/**
 * A customer-configured Studio offer (custom size and/or custom colour).
 * Persisted with the order record so the atelier can confirm feasibility —
 * a custom colour is a REQUEST, not an automatically available SKU.
 */
export type CustomOffer = {
  readonly id: string;               // synthetic variant id, unique per request
  readonly productSlug: string;
  readonly sizeLabel: string;        // e.g. `7.5' × 4.5'`
  readonly widthFt: number;
  readonly lengthFt: number;
  readonly colorSlug: string;        // standard slug when picked from palette
  readonly colorName: string;        // display name incl. custom colour names
  readonly colorHex?: string;        // set only for customer-requested colours
  readonly priceInr: number;         // derived estimate (studio confirms)
  readonly coating?: boolean;
  readonly note?: string;            // free-text request for the atelier
};

export type NewProductInput = {
  name: string;
  slug: string;
  description: string;
  imageUrl?: string | null;
  techniqueSlug: string;
  materialSlug: string;
  roomSlugs: string[];
  styleSlugs: string[];
  categorySlugs: string[];
  offers: OfferInput[];
  /** Admin-defined colour options for this rug (Studio > Colours). */
  colourOptions?: ProductColourOption[];
};

type CatalogContextValue = {
  products: CatalogProduct[];
  loading: boolean;
  refresh: () => Promise<void>;
  uploadProductPhoto: (file: File) => Promise<string>;
  createManagedProduct: (input: NewProductInput) => Promise<void>;
  removeProduct: (product: CatalogProduct) => Promise<void>;
  changeProductPhoto: (product: CatalogProduct, file: File) => Promise<void>;
  /** Persist admin-managed colour options for any catalogue product. */
  saveProductColours: (product: CatalogProduct, options: ProductColourOption[]) => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

const findStyle = (slugValue: string) => STYLES.some((s) => s.slug === slugValue);

function classificationFor(techniqueSlug: string, materialSlug: string): string {
  const tech = TECHNIQUES.find((x) => x.slug === techniqueSlug)?.slug ?? 'hand-knotted';
  const mat = MATERIALS.find((x) => x.slug === materialSlug);
  const matWord = mat && mat.slug !== 'wool' ? '-' + mat.slug : '-wool';
  return `${tech}${matWord}-rug`;
}

function baseCategoryPaths(input: Pick<NewProductInput, 'techniqueSlug' | 'materialSlug' | 'roomSlugs' | 'styleSlugs' | 'categorySlugs'>): string[] {
  const paths = [
    `rugs/${input.techniqueSlug}/${input.materialSlug}`,
    ...input.roomSlugs.map((r) => `rugs/${r}`),
    ...input.styleSlugs.filter(findStyle).map((s) => `rugs/${s}`),
    ...input.categorySlugs.filter(findCarpetCategory).map(carpetCategoryPath),
  ];
  return [...new Set(paths)];
}

function managedProduct(row: ManagedRow): CatalogProduct {
  const saved = (row.product && typeof row.product === 'object' ? row.product : {}) as Partial<Product>;
  const price = saved.variants?.[0]?.priceInr ?? 0;
  const id = saved.id ?? row.id;
  return {
    id,
    slug: saved.slug ?? row.slug,
    name: saved.name ?? 'Untitled rug',
    tagline: saved.tagline ?? 'A new addition to the Rug Bunai collection',
    description: saved.description ?? '',
    craftStory: saved.craftStory ?? 'Details from the atelier will be added shortly.',
    colorSlugs: saved.colorSlugs?.length ? saved.colorSlugs : ['ivory'],
    ...(Array.isArray(saved.colourOptions) && saved.colourOptions.length
      ? { colourOptions: (saved.colourOptions as ProductColourOption[]).filter((o) => o && typeof o.slug === 'string' && typeof o.label === 'string' && isValidHex(o.hex ?? '')) }
      : {}),
    materialSlug: saved.materialSlug ?? 'wool',
    techniqueSlug: saved.techniqueSlug ?? 'hand-knotted',
    styleSlugs: saved.styleSlugs?.length ? saved.styleSlugs : ['modern'],
    roomSlugs: saved.roomSlugs?.length ? saved.roomSlugs : ['living-room'],
    classificationSlug: saved.classificationSlug ?? 'hand-knotted-wool-rug',
    categoryPaths: saved.categoryPaths?.length ? saved.categoryPaths : ['rugs/hand-knotted/wool', 'rugs/living-room'],
    specs: saved.specs ?? {
      pileHeightMm: 10,
      weightKgPerSqm: 3,
      backing: 'Hand-finished foundation',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without a beater bar and rotate seasonally.',
      knotsPerSqIn: 100,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 4,
    },
    variants: saved.variants?.length ? saved.variants : [{
      id: 'variant-' + id,
      sku: 'RB-' + id.slice(0, 8).toUpperCase(),
      sizeLabel: '6 × 9 ft',
      width: { cm: 183, in: 72 },
      length: { cm: 274, in: 108 },
      colorSlug: 'ivory',
      priceInr: price,
      stock: 1,
    }],
    rating: saved.rating ?? 5,
    reviewsCount: saved.reviewsCount ?? 0,
    addedDaysAgo: saved.addedDaysAgo ?? 0,
    imageSeed: saved.imageSeed ?? row.slug,
    thumbnailCount: saved.thumbnailCount ?? 1,
    relationships: saved.relationships ?? [],
    imageUrl: row.image_url,
    isManaged: true,
    managedId: row.id,
  };
}

function newProductPayload(input: NewProductInput): Product {
  const id = crypto.randomUUID();
  const prefix = input.slug.split('-').map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'RB';
  const colors = [...new Set(input.offers.map((o) => o.colorSlug))];
  const variants = input.offers.map((offer, i) => {
    const canonical = SIZE_OPTIONS.find((s) => !s.custom && s.key === offer.sizeKey);
    const label = canonical ? canonical.label : sizeLabelFor(offer.widthFt, offer.lengthFt);
    return makeVariant(`variant-${id}-${i}`, prefix, label, offer.widthFt, offer.lengthFt, offer.colorSlug, offer.priceInr, offer.stock);
  });
  return {
    id,
    slug: input.slug,
    name: input.name,
    tagline: 'A new hand-finished Rug Bunai piece',
    description: input.description,
    craftStory: 'Each Rug Bunai piece carries the marks of the hands and loom that made it.',
    colorSlugs: colors.length ? colors : ['ivory'],
    ...(input.colourOptions?.length ? { colourOptions: dedupeColourOptions(input.colourOptions) } : {}),
    materialSlug: input.materialSlug,
    techniqueSlug: input.techniqueSlug,
    styleSlugs: input.styleSlugs.length ? input.styleSlugs : ['modern'],
    roomSlugs: input.roomSlugs.length ? input.roomSlugs : ['living-room'],
    classificationSlug: classificationFor(input.techniqueSlug, input.materialSlug),
    categoryPaths: baseCategoryPaths(input),
    specs: {
      pileHeightMm: 10,
      weightKgPerSqm: 3,
      backing: 'Hand-finished cotton foundation',
      countryOfOrigin: 'Bhadohi, Uttar Pradesh, India',
      careInstructions: 'Vacuum without a beater bar; rotate seasonally.',
      knotsPerSqIn: 100,
      warpMaterial: 'Cotton',
      weaveMonthsApprox: 4,
    },
    variants: variants.length ? variants : [makeVariant('variant-' + id, prefix, '6 × 9 ft', 6, 9, 'ivory', 0, 1)],
    rating: 5,
    reviewsCount: 0,
    addedDaysAgo: 0,
    imageSeed: input.slug,
    thumbnailCount: 1,
    relationships: [],
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { productOverrides, saveProductHidden, saveProductImage, saveProductText } = useSiteContent();
  const [remoteProducts, setRemoteProducts] = useState<CatalogProduct[]>([...PRODUCTS]);
  const [loading, setLoading] = useState(Boolean(supabase));

  const refresh = useCallback(async () => {
    if (!supabase) {
      setRemoteProducts([...PRODUCTS]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [overridesResult, managedResult] = await Promise.all([
      supabase.from('product_overrides').select('product_slug, image_url, is_hidden'),
      supabase.from('managed_products').select('id, slug, product, image_url').eq('is_active', true),
    ]);
    if (overridesResult.error) throw overridesResult.error;
    if (managedResult.error) throw managedResult.error;
    const overrides = new Map(
      ((overridesResult.data ?? []) as ProductOverride[]).map((item) => [item.product_slug, item]),
    );
    const base = PRODUCTS
      .filter((product) => !overrides.get(product.slug)?.is_hidden)
      .map((product) => ({ ...product, imageUrl: overrides.get(product.slug)?.image_url ?? null }));
    const managed = ((managedResult.data ?? []) as ManagedRow[]).map(managedProduct);
    setRemoteProducts([...base, ...managed]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setLoading(false));
  }, [refresh]);

  // Apply Studio text/image/hidden overrides on top of the DB-hydrated list.
  const products = useMemo<CatalogProduct[]>(() => {
    const merged = remoteProducts.map((product) => {
      const ov = productOverrides[product.slug];
      if (!ov) return product;
      // Merge (never replace) `specs` so a care-copy edit can't wipe numeric specs.
      const { specs: specPatch, ...textRest } = ov.text ?? {};
      return {
        ...product,
        ...textRest,
        ...(specPatch ? { specs: { ...product.specs, ...specPatch } } : {}),
        ...(ov.text?.customRatePerSqFt !== undefined ? { customRatePerSqFt: ov.text.customRatePerSqFt } : {}),
        imageUrl: ov.imageUrl !== undefined ? ov.imageUrl : product.imageUrl,
        homeImageUrl: ov.homeImageUrl ?? null,
      };
    });
    return merged.filter((product) => !productOverrides[product.slug]?.hidden);
  }, [remoteProducts, productOverrides]);

  const uploadProductPhoto = useCallback(async (file: File) => {
    if (!supabase || !user) throw new Error('Sign in as an admin before uploading a photo.');
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Product photos must be 10 MB or smaller.');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = user.id + '/' + crypto.randomUUID() + '.' + extension;
    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }, [user]);

  const createManagedProduct = useCallback(async (input: NewProductInput) => {
    if (!supabase || !user) throw new Error('Sign in as an admin before adding a product. Configure Supabase in .env to publish new designs.');
    const payload = newProductPayload(input);
    const { error } = await supabase.from('managed_products').insert({
      slug: input.slug,
      product: payload,
      image_url: input.imageUrl ?? null,
      created_by: user.id,
    });
    if (error) throw error;
    await refresh();
  }, [refresh, user]);

  const removeProduct = useCallback(async (product: CatalogProduct) => {
    if (product.isManaged && supabase) {
      const result = await supabase.from('managed_products').delete().eq('id', product.managedId!);
      if (result.error) throw result.error;
      await refresh();
      return;
    }
    if (supabase) {
      const result = await supabase.from('product_overrides').upsert({
        product_slug: product.slug,
        is_hidden: true,
        image_url: product.imageUrl ?? null,
      });
      if (result.error) throw result.error;
      await refresh();
    } else {
      await saveProductHidden(product.slug, true);
    }
  }, [refresh, saveProductHidden]);

  const changeProductPhoto = useCallback(async (product: CatalogProduct, file: File) => {
    const imageUrl = await uploadProductPhoto(file);
    if (supabase) {
      const result = product.isManaged
        ? await supabase.from('managed_products').update({ image_url: imageUrl }).eq('id', product.managedId!)
        : await supabase.from('product_overrides').upsert({
            product_slug: product.slug,
            image_url: imageUrl,
            is_hidden: false,
          });
      if (result.error) throw result.error;
      await refresh();
    } else {
      await saveProductImage(product.slug, imageUrl);
    }
  }, [refresh, uploadProductPhoto, saveProductImage]);

  /** Persist admin-managed colour options for a product.
   * Managed products update their JSON record directly; base catalogue items
   * use the text-override path (saveProductText) so colours survive refresh.
   */
  const saveProductColours = useCallback(async (product: CatalogProduct, options: ProductColourOption[]) => {
    if (!user || profile?.role !== 'admin') {
      throw new Error('Only administrators can manage product colours.');
    }
    const clean = dedupeColourOptions(options);
    // Validate every option before saving anything.
    for (const o of clean) {
      if (!isValidHex(o.hex)) throw new Error(`Invalid hex colour "${o.hex}" for ${o.label}. Use #RRGGBB.`);
    }
    const textPatch: TextOverride = { colourOptions: clean, colorSlugs: clean.map((c) => c.slug) };
    if (supabase && product.isManaged) {
      const { error } = await supabase
        .from('managed_products')
        .update({ product: { ...product, ...textPatch } })
        .eq('id', product.managedId!);
      if (error) throw error;
      await refresh();
      return;
    }
    if (supabase) {
      // Base catalogue item — store in the site-content overrides document,
      // which is admin-write protected (same path as other Studio text edits).
      await saveProductText(product.slug, textPatch);
      await refresh();
      return;
    }
    // No backend configured — persist through the local content store so the
    // edit survives a refresh on this device (documented limitation).
    await saveProductText(product.slug, textPatch);
    await refresh();
  }, [user, profile, refresh, saveProductText]);

  const value = useMemo(() => ({
    products, loading, refresh, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto, saveProductColours,
  }), [changeProductPhoto, createManagedProduct, loading, products, refresh, uploadProductPhoto, saveProductColours]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider.');
  return context;
}
