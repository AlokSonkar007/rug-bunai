import type { Product } from '../data/products';
import { rugImage } from './rugArt';
import { productGalleryImages } from './productGallery';

export type ProductWithImage = Product & { imageUrl?: string | null };

/** Uses an admin-uploaded image when present and preserves the existing art fallback. */
export function productImage(product: ProductWithImage, angle: number, width: number, height: number): string {
  return product.imageUrl || rugImage(product, angle, width, height);
}

/** The real photograph shown at gallery position `index` for a product:
 *  position 0 is the persisted primary image, later positions are the
 *  admin-managed additional photos — each genuine photo exactly once. Only
 *  when a product has NO uploaded photography at all does this fall back to
 *  the generated artwork views (so legacy seed products keep rendering).
 *  Never returns repeated copies of one photo to fill empty slots. */
export function galleryImageAt(product: ProductWithImage, index: number, width: number, height: number): string {
  const images = productGalleryImages(product);
  if (images.length) return images[Math.min(Math.max(index, 0), images.length - 1)] ?? images[0];
  return rugImage(product, index, width, height);
}

/** How many distinct views the PDP gallery strip should render: one per real
 *  photo when photography exists; the generated-angle count otherwise. */
export function galleryViewCount(product: ProductWithImage): number {
  const images = productGalleryImages(product);
  return images.length ? images.length : Math.max(1, product.thumbnailCount ?? 1);
}

/** Homepage variant of productImage: prefers the Studio's homepage-only photo
 *  override (`homeImageUrl`), then the catalogue image, then generated art.
 *  The public homepage consumes this so a homepage edit never changes the
 *  product detail page or catalogue imagery. */
export function homeProductImage(
  product: ProductWithImage & { homeImageUrl?: string | null },
  angle: number,
  width: number,
  height: number,
): string {
  return product.homeImageUrl || productImage(product, angle, width, height);
}
