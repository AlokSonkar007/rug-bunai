import type { Product } from '../data/products';
import { rugImage } from './rugArt';

export type ProductWithImage = Product & { imageUrl?: string | null };

/** Uses an admin-uploaded image when present and preserves the existing art fallback. */
export function productImage(product: ProductWithImage, angle: number, width: number, height: number): string {
  return product.imageUrl || rugImage(product, angle, width, height);
}
