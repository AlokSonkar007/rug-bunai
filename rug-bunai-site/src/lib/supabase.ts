import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * The anon/publishable key is designed for browser use. Database policies in
 * supabase/schema.sql—not secrecy of this key—protect customer data.
 */
export const isSupabaseConfigured = Boolean(projectUrl && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(projectUrl!, publishableKey!)
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the two VITE_SUPABASE values to .env.');
  }
  return supabase;
}
