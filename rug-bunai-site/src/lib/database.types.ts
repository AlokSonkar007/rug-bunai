// ─────────────────────────────────────────────────────────────────────────────
// Database types for the Rug Bunai Supabase schema (supabase/schema.sql).
// Hand-written to mirror the SQL exactly — regenerate with
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// once your project exists. Keep in sync with migrations.
//
// This file uses the canonical supabase-js GenericSchema shape so that
// client.from('table') / .select() / .insert() / .update() are fully typed.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'admin';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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

// ── Row shapes (what Postgres returns) ───────────────────────────────────────

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export type TermRow = {
  id: number;
  kind: string;
  slug: string;
  label: string;
  hex: string | null;
  sort: number;
}

export type CategoryRow = {
  id: number;
  path: string;
  title: string;
  axis: 'technique' | 'room' | 'style';
  sort: number;
}

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  sort: number;
  created_at: string;
}

export type ProductRow = {
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

export type VariantRow = {
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

export type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string | null;
  seed_angle: number;
  is_primary: boolean;
  sort: number;
  alt: string | null;
  created_at: string;
}

export type ProductCategoryRow = {
  product_id: string;
  category_path: string;
}

export type ProductRelationshipRow = {
  source_id: string;
  target_id: string;
  type: 'completes-the-look' | 'same-collection' | 'alternative';
  sort: number;
}

export type WishlistItemRow = {
  id: number;
  user_id: string;
  product_id: string;
  created_at: string;
}

// ── Insert helpers ───────────────────────────────────────────────────────────
// Defaults live in Postgres (ids, timestamps, booleans, counters), so most
// columns are optional on insert; only genuinely required columns stay required.

type Upsertable<Row, RequiredKeys extends keyof Row> = {
  [K in keyof Row as K extends RequiredKeys ? K : never]: Row[K];
} & {
  [K in Exclude<keyof Row, RequiredKeys>]?: Row[K];
};

// NOTE: all row shapes below are declared as object *type aliases*, not
// interfaces: postgrest-js requires Row/Insert/Update to be assignable to
// Record<string, unknown>, and interfaces lack an implicit index signature.

// ── Canonical Supabase schema descriptor ─────────────────────────────────────
// NOTE: Views/Functions/Enums must be `Record<string, never>` (not indexed
// interfaces) so the shape stays assignable to postgrest-js GenericSchema.

export type DatabaseTables = {
  profiles: {
    Row: Profile;
    Insert: Upsertable<Profile, 'id'>;
    Update: Partial<Profile>;
    Relationships: [];
  };
  terms: {
    Row: TermRow;
    Insert: Upsertable<TermRow, 'kind' | 'slug' | 'label'>;
    Update: Partial<TermRow>;
    Relationships: [];
  };
  categories: {
    Row: CategoryRow;
    Insert: Upsertable<CategoryRow, 'path' | 'title' | 'axis'>;
    Update: Partial<CategoryRow>;
    Relationships: [];
  };
  collections: {
    Row: CollectionRow;
    Insert: Upsertable<CollectionRow, 'slug' | 'name'>;
    Update: Partial<CollectionRow>;
    Relationships: [];
  };
  products: {
    Row: ProductRow;
    Insert: Upsertable<
      ProductRow,
      | 'slug'
      | 'name'
      | 'tagline'
      | 'description'
      | 'craft_story'
      | 'material_slug'
      | 'technique_slug'
      | 'classification_slug'
    >;
    Update: Partial<ProductRow>;
    Relationships: [];
  };
  variants: {
    Row: VariantRow;
    Insert: Upsertable<
      VariantRow,
      | 'product_id'
      | 'sku'
      | 'size_label'
      | 'width_cm'
      | 'length_cm'
      | 'width_in'
      | 'length_in'
      | 'color_slug'
      | 'price_inr'
    >;
    Update: Partial<VariantRow>;
    Relationships: [];
  };
  product_images: {
    Row: ProductImageRow;
    Insert: Upsertable<ProductImageRow, 'product_id'>;
    Update: Partial<ProductImageRow>;
    Relationships: [];
  };
  product_categories: {
    Row: ProductCategoryRow;
    Insert: ProductCategoryRow;
    Update: Partial<ProductCategoryRow>;
    Relationships: [];
  };
  product_relationships: {
    Row: ProductRelationshipRow;
    Insert: ProductRelationshipRow;
    Update: Partial<ProductRelationshipRow>;
    Relationships: [];
  };
  wishlist_items: {
    Row: WishlistItemRow;
    Insert: Upsertable<WishlistItemRow, 'user_id' | 'product_id'>;
    Update: Partial<WishlistItemRow>;
    Relationships: [];
  };
};

// Convenience accessors mirroring common generated-type helpers.
export type Tables<T extends keyof DatabaseTables> = DatabaseTables[T]['Row'];
export type Inserts<T extends keyof DatabaseTables> = DatabaseTables[T]['Insert'];
export type Updates<T extends keyof DatabaseTables> = DatabaseTables[T]['Update'];

export type Database = {
  public: {
    Tables: DatabaseTables;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
