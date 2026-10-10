import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
let publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

// Placeholder values left over from .env.example must never be handed to
// createClient — doing so produces a client that fails every auth request.
if (!/^https?:\/\//.test(projectUrl)) projectUrl = '';
if (!publishableKey || publishableKey.startsWith('PASTE_')) publishableKey = '';

/**
 * The anon/publishable key is designed for browser use. Database policies in
 * supabase/schema.sql—not secrecy of this key—protect customer data.
 */
export const isSupabaseConfigured = Boolean(projectUrl && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        // Persist sessions in localStorage and keep tokens refreshed across tabs.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'rugbunai-auth',
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the two VITE_SUPABASE values to .env.');
  }
  return supabase;
}
