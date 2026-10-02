// ─────────────────────────────────────────────────────────────────────────────
// Database types for the Rug Bunai Supabase schema (supabase/schema.sql).
// Hand-written to mirror the SQL exactly — regenerate with
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// once your project exists. Keep in sync with migrations.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'admin';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface ProductSpecs extends Record<string, unknown> {
  pileHeightMm: number;
  weightKgPerSqm: number;
  backing: string;
  countryOfOrigin: string;
  careInstructions: string;
  /** Only present on hand-knotted classifications (attribute-set rule). */
  knotsPerSqIn?: number;
  warpMaterial?: string;
  weaveMonthsApprox?: number;
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermRow {
  id: number;
  kind: string;
  slug: string;
  label: string;
  hex: string | null;
  sort: number;
}

export interface CategoryRow {
  id: number;
  path: string;
  title: string;
  axis: 'technique' | 'room' | 'style';
  sort: number;
}

export interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  sort: number;
  created_at: string;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  craft_story: string;
  material_slug: string;
  technique_slug: string;
  classification_slug: string;
  style_slugs: string[];
  room_slugs: string[];
  tags: string[];
  collection_id: string | null;
  specs: ProductSpecs;
  rating: number;
  reviews_count: number;
  best_seller_rank: number | null;
  is_published: boolean;
  is_featured: boolean;
  is_latest: boolean;
  featured_order: number;
  latest_order: number;
  sort_order: number;
  image_seed: string;
  thumbnail_count: number;
  created_at: string;
  updated_at: string;
}

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  size_label: string;
  width_cm: number;
  length_cm: number;
  width_in: number;
  length_in: number;
  color_slug: string;
  price_inr: number;
  stock: number;
  sort: number;
  created_at: string;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  storage_path: string | null;
  seed_angle: number;
  is_primary: boolean;
  sort: number;
  alt: string | null;
  created_at: string;
}

export interface ProductCategoryRow {
  product_id: string;
  category_path: string;
}

export interface ProductRelationshipRow {
  source_id: string;
  target_id: string;
  type: 'completes-the-look' | 'same-collection' | 'alternative';
  sort: number;
}

export interface WishlistItemRow {
  id: number;
  user_id: string;
  product_id: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id'>; Update: Partial<Profile> };
      terms: { Row: TermRow; Insert: Partial<TermRow> & Pick<TermRow, 'kind' | 'slug' | 'label'>; Update: Partial<TermRow> };
      categories: { Row: CategoryRow; Insert: CategoryRow; Update: Partial<CategoryRow> };
      collections: { Row: CollectionRow; Insert: Partial<CollectionRow> & Pick<CollectionRow, 'slug' | 'name'>; Update: Partial<CollectionRow> };
      products: { Row: ProductRow; Insert: Partial<ProductRow> & Pick<ProductRow, 'slug' | 'name'>; Update: Partial<ProductRow> };
      variants: { Row: VariantRow; Insert: Partial<VariantRow> & Pick<VariantRow, 'product_id' | 'sku' | 'size_label' | 'color_slug' | 'price_inr'>; Update: Partial<VariantRow> };
      product_images: { Row: ProductImageRow; Insert: Partial<ProductImageRow> & Pick<ProductImageRow, 'product_id'>; Update: Partial<ProductImageRow> };
      product_categories: { Row: ProductCategoryRow; Insert: ProductCategoryRow; Update: Partial<ProductCategoryRow> };
      product_relationships: { Row: ProductRelationshipRow; Insert: ProductRelationshipRow; Update: Partial<ProductRelationshipRow> };
      wishlist_items: { Row: WishlistItemRow; Insert: Partial<WishlistItemRow> & Pick<WishlistItemRow, 'user_id' | 'product_id'>; Update: Partial<WishlistItemRow> };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
  };
}
