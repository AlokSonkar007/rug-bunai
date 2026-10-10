import type { Product } from '../data/products';
import { rugImage } from './rugArt';

export type ProductWithImage = Product & { imageUrl?: string | null };

/** Uses an admin-uploaded image when present and preserves the existing art fallback. */
export function productImage(product: ProductWithImage, angle: number, width: number, height: number): string {
  return product.imageUrl || rugImage(product, angle, width, height);
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
