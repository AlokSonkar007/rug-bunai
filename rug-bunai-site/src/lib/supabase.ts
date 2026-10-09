import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Self-heal a very common misconfiguration: pasting the REST endpoint
 * (https://<ref>.supabase.co/rest/v1/) instead of the project root URL.
 * Auth calls against /rest/v1/ fail with cryptic errors, so we normalise
 * to the project origin before creating the client.
 */
function normaliseProjectUrl(value: string): string {
  if (!value) return value;
  try {
    const url = new URL(value);
    const cleaned = url.pathname.replace(/\/+$/, '');
    if (cleaned === '' || cleaned === '/rest' || cleaned.startsWith('/rest/')) {
      return `${url.origin}`;
    }
    return value.replace(/\/+$/, '');
  } catch {
    return value; // leave as-is; isSupabaseConfigured will treat it carefully
  }
}

const projectUrl = normaliseProjectUrl(rawUrl);

/**
 * The anon/publishable key is designed for browser use. Database policies in
 * supabase/schema.sql—not secrecy of this key—protect customer data.
 */
export const isSupabaseConfigured = Boolean(
  projectUrl && publishableKey && !/PASTE_YOUR_/i.test(publishableKey) && !/PASTE_YOUR_/i.test(projectUrl),
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(projectUrl!, publishableKey!)
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the two VITE_SUPABASE values to .env.');
  }
  return supabase;
}
