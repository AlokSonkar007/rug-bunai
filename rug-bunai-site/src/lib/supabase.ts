// ─────────────────────────────────────────────────────────────────────────────
// Supabase browser client — uses ONLY the public anon key (safe to ship in the
// bundle; RLS enforces every access rule server-side). The service-role key is
// never referenced from frontend code.
//
// When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent (fresh clone, CI,
// preview), we fall back to a local demo mode: the seeded catalogue + procedural
// imagery keep the whole site functional while you finish Supabase setup.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when real Supabase credentials are configured. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url as string, anonKey as string, {
      auth: {
        persistSession: true, // session survives reloads (free-tier friendly)
        autoRefreshToken: true,
        detectSessionInUrl: true, // email-confirmation / recovery links
        storageKey: 'rugbunai-auth-v1',
      },
    })
  : null;

/** Narrowed accessor for code paths that only run when configured. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
    );
  }
  return supabase;
}

export const PRODUCT_IMAGES_BUCKET = 'product-images';
