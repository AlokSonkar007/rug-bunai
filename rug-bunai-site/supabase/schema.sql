-- Rug Bunai: authentication, customer data, product management, and photo storage.
-- Run this entire file once in Supabase Dashboard > SQL Editor > New query.

create type public.app_role as enum ('customer', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Promote your own initial account only after signing up:
-- update public.profiles set role = 'admin' where email = 'your-admin-email@example.com';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table public.wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_slug)
);

create table public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id text not null,
  quantity integer not null check (quantity > 0 and quantity <= 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

-- Existing catalogue products are stored in source code. This table overlays
-- their visibility/photo; managed_products stores new products added by an admin.
create table public.product_overrides (
  product_slug text primary key,
  image_url text,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.managed_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  product jsonb not null,
  image_url text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.cart_items enable row level security;
alter table public.product_overrides enable row level security;
alter table public.managed_products enable row level security;

create policy "Customers view their own profile" on public.profiles
  for select using (auth.uid() = id);

-- Self-heal: if the signup trigger ever failed to run (or profiles were created
-- before the trigger existed), the first sign-in inserts its own row. Without
-- this policy loadProfile()'s recovery insert is blocked by RLS and login breaks.
create policy "Users create their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Customers manage their own wishlist" on public.wishlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Customers manage their own cart" on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Anyone can read product display settings" on public.product_overrides
  for select using (true);
create policy "Admins manage product display settings" on public.product_overrides
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Anyone can browse active managed products" on public.managed_products
  for select using (is_active or public.is_admin());
create policy "Admins manage added products" on public.managed_products
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

create policy "Anyone can view product photos" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "Admins upload product photos" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());
create policy "Admins replace product photos" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());
create policy "Admins delete product photos" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());
