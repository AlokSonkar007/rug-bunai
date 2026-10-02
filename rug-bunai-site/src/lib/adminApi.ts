// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DATA MUTATIONS — every call is enforced a second time by Postgres RLS
// (products_admin_write etc.), so even if this module were invoked with a
// customer token the database would reject it. The client-side guard here only
// exists to fail fast with a clear message.
// ─────────────────────────────────────────────────────────────────────────────

import { requireSupabase, PRODUCT_IMAGES_BUCKET } from './supabase';
import type { ProductRow, VariantRow, ProductImageRow, Inserts } from './database.types';
import { normalizeColorSlug } from './products';

export class UnauthorizedError extends Error {
  constructor() {
    super('You must be signed in as an administrator to modify the catalogue.');
    this.name = 'UnauthorizedError';
  }
}

async function assertAdmin(): Promise<void> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  rethrow('Could not read the current session', error);
  const uid = data.session?.user.id;
  if (!uid) throw new UnauthorizedError();
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  rethrow('Could not read the user profile', profErr);
  if (profile?.role !== 'admin') throw new UnauthorizedError();
}

const rethrow = (label: string, error: { message: string } | null): void => {
  if (error) {
    if (error.message.toLowerCase().includes('row-level security')) {
      throw new UnauthorizedError();
    }
    throw new Error(`${label}: ${error.message}`);
  }
};

/**
 * Narrow a `.single()` result after the error has been checked. PostgREST
 * guarantees exactly one row when `error` is null, so this keeps the DB-backed
 * return types non-nullable without unsafe casts — and throws a clear runtime
 * error instead of handing callers `null`.
 */
function expectRow<T>(data: T | null, error: { message: string } | null, label: string): T {
  rethrow(label, error);
  if (data === null) throw new Error(`${label}: no row was returned.`);
  return data;
}

// ── Products ──────────────────────────────────────────────────────────────────

export type ProductDraft = Omit<
  Inserts<'products'>,
  'id' | 'created_at' | 'updated_at' | 'rating' | 'reviews_count'
>;

export async function createProduct(draft: ProductDraft): Promise<ProductRow> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('products')
    .insert({ ...draft, rating: 0, reviews_count: 0 })
    .select()
    .single();
  return expectRow(data, error, 'Could not create product');
}

export async function updateProduct(id: string, patch: Partial<ProductRow>): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  rethrow('Could not update product', error);
}

/**
 * Delete a product safely: first remove its Storage objects (scoped strictly to
 * `product-images/products/{id}/`), then the metadata rows (DB cascades take
 * care of variants/images/joins/relationships/wishlist references).
 */
export async function deleteProduct(id: string): Promise<{ removedFiles: number }> {
  await assertAdmin();
  const supabase = requireSupabase();

  const { data: images, error: imgErr } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('product_id', id);
  rethrow('Could not read image list', imgErr);

  const paths = (images ?? [])
    .map((i) => i.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.startsWith(`products/${id}/`)); // never touch unrelated files

  let removedFiles = 0;
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
    // Storage removal failure must not orphan DB rows pointing at dead files,
    // but also must not block deletion — surface count and continue.
    if (!rmErr) removedFiles = paths.length;
  }

  const { error } = await supabase.from('products').delete().eq('id', id);
  rethrow('Could not delete product', error);
  return { removedFiles };
}

// ── Variants ──────────────────────────────────────────────────────────────────

export type VariantDraft = Omit<Inserts<'variants'>, 'id' | 'created_at'>;

export async function addVariant(draft: VariantDraft): Promise<VariantRow> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('variants')
    .insert({ stock: 0, sort: 99, ...draft, color_slug: normalizeColorSlug(draft.color_slug) })
    .select()
    .single();
  return expectRow(data, error, 'Could not add variant');
}

export async function updateVariant(id: string, patch: Partial<VariantRow>): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { error } = await supabase.from('variants').update(patch).eq('id', id);
  rethrow('Could not update variant', error);
}

export async function deleteVariant(id: string): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { error } = await supabase.from('variants').delete().eq('id', id);
  rethrow('Could not delete variant', error);
}

// ── Images (Storage binaries + DB metadata) ───────────────────────────────────

export interface UploadResult {
  row: ProductImageRow;
  url: string;
}

/** Upload one file into products/{productId}/ and register its metadata row. */
export async function uploadProductImage(
  productId: string,
  file: File,
  opts: { makePrimary?: boolean; onProgress?: (fraction: number) => void } = {},
): Promise<UploadResult> {
  await assertAdmin();
  const supabase = requireSupabase();

  const ext = (file.name.split('.').pop() ?? 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
  const stamp = Date.now().toString(36);
  const path = `products/${productId}/${stamp}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  opts.onProgress?.(0.1);
  const { error: upErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType: file.type || undefined });
  opts.onProgress?.(0.9);
  if (upErr) throw new Error(`Upload failed — ${upErr.message}`);

  const { data: maxRow } = await supabase
    .from('product_images')
    .select('sort')
    .eq('product_id', productId)
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort ?? -1) + 1;

  const { data: hasAny } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);

  const insert: Inserts<'product_images'> = {
    product_id: productId,
    storage_path: path,
    seed_angle: nextSort % 5,
    sort: nextSort,
    is_primary: opts.makePrimary === true || (hasAny ?? 0) === 0,
    alt: file.name.replace(/\.[^.]+$/, ''),
  };
  const { data: row, error: insErr } = await supabase
    .from('product_images')
    .insert(insert)
    .select()
    .single();
  if (insErr) {
    // Roll back the just-uploaded object so no orphan files accumulate.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  }
  const imageRow = expectRow(row, insErr, 'Could not register image');
  opts.onProgress?.(1);
  const { data: pub } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return { row: imageRow, url: pub.publicUrl };
}

/** Replace an existing image: upload new object, swap metadata, drop old object. */
export async function replaceProductImage(
  productId: string,
  imageId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  await assertAdmin();
  const supabase = requireSupabase();
  const result = await uploadProductImage(productId, file, { onProgress });
  const { data: old, error: selErr } = await supabase
    .from('product_images')
    .select('storage_path, is_primary, sort')
    .eq('id', imageId)
    .maybeSingle();
  rethrow('Could not load image being replaced', selErr);

  if (old?.is_primary) {
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId);
    await supabase.from('product_images').update({ is_primary: true }).eq('id', result.row.id);
  } else {
    await supabase.from('product_images').update({ sort: old?.sort ?? result.row.sort }).eq('id', result.row.id);
  }

  if (old?.storage_path) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([old.storage_path]);
    await supabase.from('product_images').delete().eq('id', imageId);
  }
  return result;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { data: img, error } = await supabase
    .from('product_images')
    .select('storage_path, product_id')
    .eq('id', imageId)
    .maybeSingle();
  rethrow('Could not load image', error);
  if (!img) return;

  if (img.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([img.storage_path]);
    if (rmErr) throw new Error(`Image file could not be removed — ${rmErr.message}`);
  }
  const { error: delErr } = await supabase.from('product_images').delete().eq('id', imageId);
  rethrow('Could not delete image record', delErr);

  // Guarantee exactly one primary remains.
  const { data: remaining } = await supabase
    .from('product_images')
    .select('id, is_primary')
    .eq('product_id', img.product_id)
    .order('sort')
    .limit(1);
  if (remaining && remaining.length === 1 && !remaining[0].is_primary) {
    await supabase.from('product_images').update({ is_primary: true }).eq('id', remaining[0].id);
  }
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { error: offErr } = await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true);
  rethrow('Could not reset primary flag', offErr);
  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId)
    .eq('product_id', productId);
  rethrow('Could not set primary image', error);
}

/** Persist a new gallery order (array of image ids, front → back). */
export async function reorderImages(productId: string, orderedIds: readonly string[]): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('product_images')
        .update({ sort: index })
        .eq('id', id)
        .eq('product_id', productId),
    ),
  );
}

// ── Catalogue ordering / flags helpers ────────────────────────────────────────

export async function setSortOrder(productId: string, sortOrder: number): Promise<void> {
  await updateProduct(productId, { sort_order: sortOrder });
}

export async function moveProductInCatalogue(productId: string, direction: -1 | 1): Promise<void> {
  await assertAdmin();
  const supabase = requireSupabase();
  const { data: me, error } = await supabase
    .from('products')
    .select('id, sort_order')
    .eq('id', productId)
    .maybeSingle();
  rethrow('Could not read product for reorder', error);
  if (!me) return;
  const { data: neighbours } = await supabase
    .from('products')
    .select('id, sort_order')
    .neq('sort_order', me.sort_order)
    .order('sort_order');
  const target = neighbours?.find(
    (n) => (direction === 1 ? n.sort_order > me.sort_order : n.sort_order < me.sort_order),
  );
  if (!target) return;
  await Promise.all([
    supabase.from('products').update({ sort_order: target.sort_order }).eq('id', me.id),
    supabase.from('products').update({ sort_order: me.sort_order }).eq('id', target.id),
  ]);
}

export async function setFeatured(productId: string, featured: boolean, order: number): Promise<void> {
  await updateProduct(productId, { is_featured: featured, featured_order: order });
}

export async function setLatest(productId: string, latest: boolean, order: number): Promise<void> {
  await updateProduct(productId, { is_latest: latest, latest_order: order });
}

export async function setPublished(productId: string, published: boolean): Promise<void> {
  await updateProduct(productId, { is_published: published });
}
