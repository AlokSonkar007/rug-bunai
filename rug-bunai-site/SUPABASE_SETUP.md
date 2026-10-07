# Supabase setup for Rug Bunai

This project uses **Supabase Free** for email/password authentication, PostgreSQL data, and product-photo storage. The free plan is appropriate for the first release and keeps the auth, customer data, and product images in one system.

## 1. Create the free project

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. In **Authentication → Providers**, keep **Email** enabled. For a production site, configure the Site URL and redirect URLs in **Authentication → URL Configuration**.
3. Open **SQL Editor → New query**, paste the complete contents of `supabase/schema.sql`, and run it.

The schema enables Row Level Security. Customers can access only their own cart and wishlist; product management and photo uploads require an admin role.

## 2. Add the browser credentials

1. Copy `.env.example` to a local file named `.env`.
2. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy anon key).
3. Paste them exactly here:

| File | Line | Value |
| --- | ---: | --- |
| `.env` | 5 | `VITE_SUPABASE_URL` |
| `.env` | 6 | `VITE_SUPABASE_ANON_KEY` |

The key is intentionally a browser-safe publishable/anon key. **Never paste a `service_role` or secret key into `.env` for this Vite app, and never commit `.env`.** Add the same two variables in your hosting provider’s environment-variable settings before deployment.

## 3. Create the first administrator

1. Run the site, open `/login`, and create your own customer account.
2. In Supabase **SQL Editor**, run this once, replacing the email:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

3. Sign in at `/admin/login`. That account can now add products, remove products, and change product photos.

All newly registered users receive the `customer` role. The public `/login` page cannot create administrator accounts.

## Local run

```bash
npm install
npm run dev
```
