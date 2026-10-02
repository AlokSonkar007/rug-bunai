-- ═══════════════════════════════════════════════════════════════════════════
-- RUG BUNAI — Supabase schema (Free tier)
-- Apply via: supabase db push  ·  or paste into the Supabase SQL editor.
-- Idempotent: safe to re-run. Includes tables, indexes, RLS policies,
-- storage bucket + policies, and a controlled vocabulary seed.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Roles & profiles ────────────────────────────────────────────────────────
-- Role lives ONLY server-side (public.profiles). The public signup trigger can
-- ever create 'customer'; promotion to 'admin' is possible only by an existing
-- admin (RLS below) or a service-role operation — never from untrusted clients.

do $$ begin
  create type public.user_role as enum ('customer', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-side admin check: reads the SECURITY-DEFINER function so policies
-- never trust anything the client sends.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Auto-create a customer profile for every new auth user (never admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'customer', coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Controlled vocabularies (PIM dictionaries) ──────────────────────────────

create table if not exists public.terms (
  id int generated always as identity primary key,
  kind text not null,            -- technique | material | style | room | color | classification
  slug text not null,
  label text not null,
  hex text,                      -- colour swatch only
  sort int not null default 0,
  unique (kind, slug)
);
create index if not exists terms_kind_idx on public.terms (kind);

-- ── Taxonomy: categories (navigable paths) & collections ───────────────────

create table if not exists public.categories (
  id int generated always as identity primary key,
  path text not null unique,     -- e.g. rugs/hand-knotted/wool
  title text not null,
  axis text not null check (axis in ('technique', 'room', 'style')),
  sort int not null default 0
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  blurb text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Products (parent) & variants (size+colour children) ────────────────────

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  craft_story text not null default '',
  material_slug text not null,
  technique_slug text not null,
  classification_slug text not null,
  style_slugs text[] not null default '{}',
  room_slugs text[] not null default '{}',
  tags text[] not null default '{}',
  collection_id uuid references public.collections (id) on delete set null,
  specs jsonb not null default '{}'::jsonb,
  rating numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  reviews_count int not null default 0,
  best_seller_rank int,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  is_latest boolean not null default false,
  featured_order int not null default 0,
  latest_order int not null default 0,
  sort_order int not null default 0,
  image_seed text not null default '',
  thumbnail_count int not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_published_idx on public.products (is_published, sort_order);
create index if not exists products_featured_idx on public.products (is_featured, featured_order) where is_featured;
create index if not exists products_latest_idx on public.products (is_latest, latest_order, created_at desc) where is_latest;
create index if not exists products_technique_idx on public.products (technique_slug);
create index if not exists products_material_idx on public.products (material_slug);
create index if not exists products_styles_idx on public.products using gin (style_slugs);
create index if not exists products_rooms_idx on public.products using gin (room_slugs);
create index if not exists products_tags_idx on public.products using gin (tags);
create index if not exists products_search_idx on public.products
  using gin (to_tsvector('english', name || ' ' || tagline || ' ' || description || ' ' || craft_story));

create table if not exists public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique,
  size_label text not null,
  width_cm numeric not null check (width_cm >= 30),
  length_cm numeric not null check (length_cm >= 30),
  width_in numeric not null,
  length_in numeric not null,
  color_slug text not null,
  price_inr int not null check (price_inr > 0),
  stock int not null default 0 check (stock >= 0),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists variants_product_idx on public.variants (product_id, sort);
create index if not exists variants_color_idx on public.variants (color_slug);

-- ── Product images (metadata only — binaries live in Supabase Storage) ─────

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text,             -- e.g. products/{product-id}/gallery-02.webp
  seed_angle int not null default 0,  -- fallback: procedural weave render angle
  is_primary boolean not null default false,
  sort int not null default 0,
  alt text,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id, sort);
create unique index if not exists product_images_one_primary
  on public.product_images (product_id) where is_primary;

-- ── Joins: category paths & typed relationships ─────────────────────────────

create table if not exists public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_path text not null references public.categories (path) on delete cascade,
  primary key (product_id, category_path)
);
create index if not exists product_categories_path_idx on public.product_categories (category_path);

create table if not exists public.product_relationships (
  source_id uuid not null references public.products (id) on delete cascade,
  target_id uuid not null references public.products (id) on delete cascade,
  type text not null check (type in ('completes-the-look', 'same-collection', 'alternative')),
  sort int not null default 0,
  primary key (source_id, target_id)
);

-- ── Wishlist (future-ready customer account feature) ────────────────────────

create table if not exists public.wishlist_items (
  id int generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ── updated_at maintenance ──────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ═══ ROW LEVEL SECURITY ════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.terms enable row level security;
alter table public.categories enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.product_images enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_relationships enable row level security;
alter table public.wishlist_items enable row level security;

-- Profiles: own row readable/updatable (role NOT updatable by owner — enforced
-- via column policy below); admins read everyone.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update
  using (id = auth.uid() and role <> 'admin')
  with check (id = auth.uid() and role = 'customer');
  -- Owners may edit their name but never promote themselves: WITH CHECK keeps
  -- role='customer' on any self-update. Admin role changes go through the
  -- admin policy below.

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Catalogue reference data: public read, admin write.
drop policy if exists terms_public_read on public.terms;
create policy terms_public_read on public.terms for select using (true);
drop policy if exists terms_admin_write on public.terms;
create policy terms_admin_write on public.terms for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select using (true);
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections for select using (true);
drop policy if exists collections_admin_write on public.collections;
create policy collections_admin_write on public.collections for all using (public.is_admin()) with check (public.is_admin());

-- Products: anonymous world sees PUBLISHED rows only; admins see everything.
-- No customer-facing INSERT/UPDATE/DELETE policy exists → writes are impossible
-- for non-admins regardless of frontend manipulation.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select using (is_published = true or public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- Variants / images / joins: visible only through published parents.
drop policy if exists variants_public_read on public.variants;
create policy variants_public_read on public.variants
  for select using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_published or public.is_admin()))
  );
drop policy if exists variants_admin_write on public.variants;
create policy variants_admin_write on public.variants
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists images_public_read on public.product_images;
create policy images_public_read on public.product_images
  for select using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_published or public.is_admin()))
  );
drop policy if exists images_admin_write on public.product_images;
create policy images_admin_write on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pc_public_read on public.product_categories;
create policy pc_public_read on public.product_categories
  for select using (
    exists (select 1 from public.products p where p.id = product_id and (p.is_published or public.is_admin()))
  );
drop policy if exists pc_admin_write on public.product_categories;
create policy pc_admin_write on public.product_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pr_public_read on public.product_relationships;
create policy pr_public_read on public.product_relationships
  for select using (
    exists (select 1 from public.products p where p.id = source_id and (p.is_published or public.is_admin()))
  );
drop policy if exists pr_admin_write on public.product_relationships;
create policy pr_admin_write on public.product_relationships
  for all using (public.is_admin()) with check (public.is_admin());

-- Wishlist: strictly per-user.
drop policy if exists wishlist_own on public.wishlist_items;
create policy wishlist_own on public.wishlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═══ STORAGE: product-images bucket ═════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_admin_write on storage.objects;
create policy product_images_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ═══ CONTROLLED VOCABULARY SEED ═════════════════════════════════════════════

insert into public.terms (kind, slug, label, hex, sort) values
  ('technique','hand-knotted','Hand-Knotted',null,1),
  ('technique','hand-tufted','Hand-Tufted',null,2),
  ('technique','flat-woven','Flat-Woven',null,3),
  ('technique','loom-woven','Loom-Woven',null,4),
  ('material','wool','Wool',null,1),
  ('material','silk-blend','Silk Blend',null,2),
  ('material','cotton','Cotton',null,3),
  ('material','jute','Jute',null,4),
  ('material','bamboo-silk','Bamboo Silk',null,5),
  ('style','geometric','Geometric',null,1),
  ('style','abstract','Abstract',null,2),
  ('style','traditional','Traditional',null,3),
  ('style','modern','Modern',null,4),
  ('style','botanical','Botanical',null,5),
  ('room','living-room','Living Room',null,1),
  ('room','bedroom','Bedroom',null,2),
  ('room','dining-room','Dining Room',null,3),
  ('room','hallway','Hallway',null,4),
  ('room','office','Office',null,5),
  ('color','ivory','Ivory','#F3EDE2',1),
  ('color','sand','Sand','#D8C7A9',2),
  ('color','taupe','Taupe','#A89684',3),
  ('color','charcoal','Charcoal','#3B3A38',4),
  ('color','deep-brown','Deep Brown','#5A4232',5),
  ('color','navy','Navy','#2C3A4D',6),
  ('color','sage','Sage','#9AA88F',7),
  ('color','terracotta','Terracotta','#B0714F',8),
  ('color','black','Black','#191919',9),
  ('classification','hand-knotted-wool-rug','Hand-Knotted Wool Rug',null,1),
  ('classification','hand-knotted-silk-blend-rug','Hand-Knotted Silk Blend Rug',null,2),
  ('classification','hand-tufted-wool-rug','Hand-Tufted Wool Rug',null,3),
  ('classification','flat-woven-cotton-rug','Flat-Woven Cotton Rug',null,4),
  ('classification','flat-woven-jute-runner','Flat-Woven Jute Runner',null,5),
  ('classification','loom-woven-bamboo-silk-rug','Loom-Woven Bamboo Silk Rug',null,6)
on conflict (kind, slug) do nothing;

insert into public.categories (path, title, axis, sort) values
  ('rugs/hand-knotted/wool','Hand-Knotted Wool Rugs','technique',1),
  ('rugs/hand-knotted/silk-blend','Hand-Knotted Silk Blend Rugs','technique',2),
  ('rugs/hand-tufted/wool','Hand-Tufted Wool Rugs','technique',3),
  ('rugs/flat-woven/cotton','Flat-Woven Cotton Rugs','technique',4),
  ('rugs/flat-woven/jute','Flat-Woven Jute Runners','technique',5),
  ('rugs/loom-woven/bamboo-silk','Loom-Woven Bamboo Silk Rugs','technique',6),
  ('rugs/living-room','Living Room Rugs','room',1),
  ('rugs/bedroom','Bedroom Rugs','room',2),
  ('rugs/dining-room','Dining Room Rugs','room',3),
  ('rugs/hallway','Hallway Runners','room',4),
  ('rugs/office','Office Rugs','room',5),
  ('rugs/geometric','Geometric Rugs','style',1),
  ('rugs/abstract','Abstract Rugs','style',2),
  ('rugs/traditional','Traditional Rugs','style',3),
  ('rugs/modern','Modern Rugs','style',4),
  ('rugs/botanical','Botanical Rugs','style',5)
on conflict (path) do nothing;
