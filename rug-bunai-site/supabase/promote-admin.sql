-- ═══════════════════════════════════════════════════════════════════════════
-- RUG BUNAI — First admin bootstrap  ($0, no service-role key needed)
--
-- 1. Create the admin account in Supabase → Authentication → Add user
--    (or run auth signup from the app), then set its email below.
-- 2. Run this file in the SQL editor. It is safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

update public.profiles
set role = 'admin'
where id = (
  select u.id from auth.users u
  where u.email = 'admin@rugbunai.example'   -- ← replace with your admin email
);
