import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Supabase-js persists the auth session in localStorage under `sb-<ref>-auth-token`.
 * Stale entries left over from a previous project URL or a malformed env value
 * (e.g. a `/rest/v1/` endpoint pasted into VITE_SUPABASE_URL) make every sign-in
 * attempt fail. On startup we drop any stored session whose ref does not match
 * the currently configured project so authentication always starts clean.
 */
function pruneStaleAuthStorage() {
  try {
    const activeRef = (() => {
      if (!isSupabaseConfigured) return null;
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      try {
        return new URL(url).hostname.split('.')[0]; // e.g. "vuizbcyjresemsoiatfr"
      } catch {
        return null;
      }
    })();
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-')) continue;
      if (key === 'sb-callback-query-params' || key === 'sb-customer-code-verifier') {
        doomed.push(key); // transient OAuth artifacts
        continue;
      }
      const isClientKey = key === 'sb__client__' || key.startsWith('sb__client__');
      if (isClientKey) { doomed.push(key); continue; }
      if (activeRef) {
        const matches = key.startsWith(`sb-${activeRef}-`) || key === `sb-${activeRef}`;
        if (!matches) doomed.push(key); // session from a different/older project
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* localStorage unavailable (private mode etc.) — nothing to clean */
  }
}
pruneStaleAuthStorage();

export type UserRole = 'customer' | 'admin';
export type Profile = { id: string; email: string; role: UserRole; display_name: string | null };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function missingSetup() {
  return new Error('Authentication is not configured yet. Add the Supabase values to .env and run supabase/schema.sql.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User): Promise<Profile> => {
    if (!supabase) throw missingSetup();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, display_name')
      .eq('id', user.id)
      .single();
    if (!error && data) return data as Profile;

    // The auth user exists but the trigger-created profile row is missing or
    // RLS blocked the read. Try to insert it so sign-in never dead-ends…
    const fallback: Profile = {
      id: user.id,
      email: user.email ?? '',
      role: 'customer',
      display_name: (user.user_metadata?.display_name as string | undefined) ?? null,
    };
    const { error: insertError } = await supabase.from('profiles').insert({
      id: fallback.id, email: fallback.email, display_name: fallback.display_name, role: fallback.role,
    });
    if (!insertError) return fallback;
    // …and if even that is blocked (RLS without the self-insert policy), fall
    // back to a customer profile derived straight from the JWT so the session
    // stays usable instead of throwing "Invalid Login Credentials".
    console.warn('profile recovery failed — using session-derived profile:', insertError.message);
    return fallback;
  }, []);

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      setProfile(await loadProfile(nextSession.user));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [hydrate]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    profile,
    loading,
    configured: isSupabaseConfigured,
    async signIn(email, password) {
      if (!supabase) throw missingSetup();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('No user was returned after signing in.');
      const nextProfile = await loadProfile(data.user);
      setProfile(nextProfile);
      return nextProfile;
    },
    async signUp(email, password) {
      if (!supabase) throw missingSetup();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    },
    async signOut() {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setProfile(null);
    },
  }), [loadProfile, loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
