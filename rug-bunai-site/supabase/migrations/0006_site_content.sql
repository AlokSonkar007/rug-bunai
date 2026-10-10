-- ═══════════════════════════════════════════════════════════════════════════
-- 0006_site_content.sql — Homepage / site content store (Studio editor).
--
-- ROOT CAUSE THIS MIGRATION FIXES:
--   The `public.site_content` table was defined only in the manual bootstrap
--   file supabase/schema.sql ("TASK 6" section) and never received a numbered
--   migration under supabase/migrations/. Projects bootstrapped from an older
--   schema.sql (before TASK 6 existed) therefore have no site_content table,
--   and PostgREST answers the Studio's first read with:
--     PGRST205 "Could not find the table 'public.site_content' in the schema cache"
--
-- This migration is ADDITIVE and IDEMPOTENT: it never drops or overwrites any
-- existing table, policy, trigger, function or row. Safe to re-run. Apply via
-- the Supabase SQL Editor (paste the whole file) or `supabase db push`.
-- It has NOT been applied to any live project from this coding environment.
--
-- Schema contract (matches src/lib/siteContent.tsx exactly):
--   id        integer, single-row table pinned to id = 1 (CHECK constraint;
--             the app always reads/writes the row with id 1).
--   data      jsonb — the full SiteContent object deep-merged over defaults,
--             plus a `productOverrides` key (slug → { text, imageUrl,
--             homeImageUrl, hidden }). Homepage image URLs saved by the
--             Studio are absolute public URLs from the Supabase Storage
--             bucket 'product-images' (see src/lib/catalog.tsx uploadProductPhoto),
--             stored inside this JSONB payload — no extra columns needed.
--   updated_at timestamptz — written by the app on every save
--             (`{ data: payload, updated_at: new Date().toISOString() }`).
-- ═══════════════════════════════════════════════════════════════════════════

-- Prerequisite guard: RLS policies below depend on public.is_admin() from the
-- base schema (schema.sql). Fail loudly instead of half-applying if missing.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception
      'Migration 0006 requires public.is_admin(); run supabase/schema.sql first.';
  end if;
end $$;

create table if not exists public.site_content (
  id integer primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_content_single_row check (id = 1)
);

alter table public.site_content enable row level security;

-- Customers & visitors read the published homepage content (the storefront
-- hydrates from this row on every page load — public SELECT must stay).
drop policy if exists "Anyone can read site content" on public.site_content;
create policy "Anyone can read site content"
  on public.site_content for select
  using (true);

-- Only verified admins (profiles.role = 'admin', enforced server-side by
-- public.is_admin()) may insert/update/delete the content row. No other
-- write path exists, so anonymous or customer tokens cannot edit the homepage.
drop policy if exists "Admins manage site content" on public.site_content;
create policy "Admins manage site content"
  on public.site_content for all
  using (public.is_admin()) with check (public.is_admin());

-- Keep updated_at fresh even when an admin edits via the SQL editor directly.
create or replace function public.touch_site_content_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists site_content_touch_updated_at on public.site_content;
create trigger site_content_touch_updated_at
  before update on public.site_content
  for each row execute procedure public.touch_site_content_updated_at();

-- Do NOT seed a row here: absence of a row means "defaults + localStorage",
-- and the first Studio save upserts id = 1 through the admin policy above.
