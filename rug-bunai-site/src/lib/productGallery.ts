// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT GALLERY MODEL — one required primary image + zero or more admin-
// managed additional photographs, persisted per product.
//
// Backward-compatible storage (no competing sources of truth):
//   • `imageUrl` / the `image_url` column stays the PRIMARY image everywhere.
//     Existing single-photo products keep working untouched.
//   • Additional photos live in a `gallery` array keyed by product slug:
//       – base catalogue products → `productOverrides[slug].gallery` inside the
//         admin-protected `site_content.data` document;
//       – managed products → the `gallery` key of their `managed_products.product`
//         JSONB record.
//   • The gallery NEVER contains the primary URL — so reordering/removing an
//     additional photo can never damage the primary, and the primary can never
//     appear twice in the strip.
// ─────────────────────────────────────────────────────────────────────────────

/** A product shape that may carry a persisted gallery alongside its primary image. */
export type GalleryCarrier = {
  imageUrl?: string | null;
  gallery?: readonly string[] | null;
};

const isHttpUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https?:\/\/\S+$/.test(u.trim());

/** Sanitise a persisted gallery list: valid URLs only, trimmed, de-duplicated,
 *  and never containing the primary image. Legacy/invalid entries degrade to
 *  "no additional images" instead of crashing the catalogue. */
export function sanitizeGallery(gallery: unknown, primary: string | null | undefined): string[] {
  const cleanPrimary = typeof primary === 'string' ? primary.trim() : '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of Array.isArray(gallery) ? gallery : []) {
    if (!isHttpUrl(entry)) continue;
    const url = entry.trim();
    if (url === cleanPrimary || seen.has(url)) continue; // no duplicates, no primary copies
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** The ordered image list a PDP gallery renders: primary first, then each real
 *  additional photograph exactly once. One photo ⇒ one thumbnail — fake
 *  duplicate thumbnails are never generated. */
export function productGalleryImages(product: GalleryCarrier): string[] {
  const primary = typeof product.imageUrl === 'string' && product.imageUrl.trim() ? product.imageUrl.trim() : '';
  const extras = sanitizeGallery(product.gallery, primary || undefined);
  return primary ? [primary, ...extras] : extras;
}

/** Studio preview order: index 0 is always the primary image. */
export function studioGalleryOrder(product: GalleryCarrier): string[] {
  return productGalleryImages(product);
}

/** Apply a Studio reorder (a permutation of the currently displayed images).
 *  Returns the split the persistence layer needs; malformed permutations
 *  (missing/extra URLs) are rejected by falling back to the current order. */
export function applyGalleryReorder(
  product: GalleryCarrier,
  ordered: readonly string[],
): { primary: string | null; gallery: string[] } {
  const current = productGalleryImages(product);
  const sameSet =
    ordered.length === current.length &&
    current.every((u) => ordered.includes(u)) &&
    ordered.every((u) => current.includes(u));
  const list = sameSet ? [...ordered] : current;
  const primary = list[0] ?? null;
  return { primary, gallery: sanitizeGallery(list.slice(1), primary) };
}

/** Remove one image from the gallery view model. Removing the primary while
 *  other photos exist promotes the next photo — the primary never disappears.
 *  With a single photo there is nothing to remove (primary is required). */
export function removeGalleryImageAt(
  product: GalleryCarrier,
  index: number,
): { primary: string | null; gallery: string[] } {
  const list = productGalleryImages(product);
  if (list.length <= 1) return { primary: list[0] ?? null, gallery: sanitizeGallery(list.slice(1), list[0]) };
  const next = list.filter((_, i) => i !== index);
  const primary = next[0] ?? null;
  return { primary, gallery: sanitizeGallery(next.slice(1), primary) };
}
