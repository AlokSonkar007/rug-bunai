import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PRODUCTS, type Product } from '../data/products';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type CatalogProduct = Product & {
  imageUrl?: string | null;
  isManaged?: boolean;
  managedId?: string;
};

type ProductOverride = { product_slug: string; image_url: string | null; is_hidden: boolean };
type ManagedRow = { id: string; slug: string; product: unknown; image_url: string | null };

type NewProduct = {
  name: string;
  slug: string;
  description: string;
  priceInr: number;
  imageUrl?: string | null;
};

type CatalogContextValue = {
  products: CatalogProduct[];
  loading: boolean;
  refresh: () => Promise<void>;
  uploadProductPhoto: (file: File) => Promise<string>;
  createManagedProduct: (input: NewProduct) => Promise<void>;
  removeProduct: (product: CatalogProduct) => Promise<void>;
  changeProductPhoto: (product: CatalogProduct, file: File) => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

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
      sizeLabel: '230 × 160 cm (7\'6" × 5\'3")',
      width: { cm: 160, in: 63 },
      length: { cm: 230, in: 90.5 },
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

function newProductPayload(input: NewProduct): Product {
  const id = crypto.randomUUID();
  return {
    id,
    slug: input.slug,
    name: input.name,
    tagline: 'A new hand-finished Rug Bunai piece',
    description: input.description,
    craftStory: 'Each Rug Bunai piece carries the marks of the hands and loom that made it.',
    colorSlugs: ['ivory'],
    materialSlug: 'wool',
    techniqueSlug: 'hand-knotted',
    styleSlugs: ['modern'],
    roomSlugs: ['living-room'],
    classificationSlug: 'hand-knotted-wool-rug',
    categoryPaths: ['rugs/hand-knotted/wool', 'rugs/living-room', 'rugs/modern'],
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
    variants: [{
      id: 'variant-' + id,
      sku: 'RB-' + id.slice(0, 8).toUpperCase(),
      sizeLabel: '230 × 160 cm (7\'6" × 5\'3")',
      width: { cm: 160, in: 63 },
      length: { cm: 230, in: 90.5 },
      colorSlug: 'ivory',
      priceInr: input.priceInr,
      stock: 1,
    }],
    rating: 5,
    reviewsCount: 0,
    addedDaysAgo: 0,
    imageSeed: input.slug,
    thumbnailCount: 1,
    relationships: [],
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([...PRODUCTS]);
  const [loading, setLoading] = useState(Boolean(supabase));

  const refresh = useCallback(async () => {
    if (!supabase) {
      setProducts([...PRODUCTS]);
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
    setProducts([...base, ...managed]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setLoading(false));
  }, [refresh]);

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

  const createManagedProduct = useCallback(async (input: NewProduct) => {
    if (!supabase || !user) throw new Error('Sign in as an admin before adding a product.');
    const { error } = await supabase.from('managed_products').insert({
      slug: input.slug,
      product: newProductPayload(input),
      image_url: input.imageUrl ?? null,
      created_by: user.id,
    });
    if (error) throw error;
    await refresh();
  }, [refresh, user]);

  const removeProduct = useCallback(async (product: CatalogProduct) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const result = product.isManaged
      ? await supabase.from('managed_products').delete().eq('id', product.managedId!)
      : await supabase.from('product_overrides').upsert({
          product_slug: product.slug,
          is_hidden: true,
          image_url: product.imageUrl ?? null,
        });
    if (result.error) throw result.error;
    await refresh();
  }, [refresh]);

  const changeProductPhoto = useCallback(async (product: CatalogProduct, file: File) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const imageUrl = await uploadProductPhoto(file);
    const result = product.isManaged
      ? await supabase.from('managed_products').update({ image_url: imageUrl }).eq('id', product.managedId!)
      : await supabase.from('product_overrides').upsert({
          product_slug: product.slug,
          image_url: imageUrl,
          is_hidden: false,
        });
    if (result.error) throw result.error;
    await refresh();
  }, [refresh, uploadProductPhoto]);

  const value = useMemo(() => ({
    products, loading, refresh, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto,
  }), [changeProductPhoto, createManagedProduct, loading, products, refresh, uploadProductPhoto]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider.');
  return context;
}
