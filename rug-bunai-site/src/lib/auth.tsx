import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

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
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Profile;
    // The signup trigger may not have run yet (or was never installed).
    // Self-heal by inserting the profile row directly — RLS allows a user to
    // insert their own profile (see supabase/schema.sql).
    const fallback: Profile = { id: user.id, email: user.email ?? '', role: 'customer', display_name: null };
    const inserted = await supabase.from('profiles').insert(fallback);
    if (inserted.error) {
      // Table missing / policies not applied — surface a helpful message.
      throw new Error(
        `Your account exists but the profiles table is unavailable (${inserted.error.message}). ` +
        'Run supabase/schema.sql in the Supabase SQL Editor, then sign out and sign in again.',
      );
    }
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
    let cancelled = false;
    // Ensure loading resolves even if getSession never settles.
    const timeout = window.setTimeout(() => { if (!cancelled) setLoading(false); }, 8000);
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      window.clearTimeout(timeout);
      void hydrate(data.session);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, [hydrate]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    profile,
    loading,
    configured: isSupabaseConfigured,
    async signIn(email, password) {
      if (!supabase) throw missingSetup();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        // Translate common Supabase errors into customer-friendly copy.
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          throw new Error('Incorrect email or password. Please try again.');
        }
        if (error.message.toLowerCase().includes('not confirmed')) {
          throw new Error('Please confirm your email address before signing in.');
        }
        throw error;
      }
      if (!data.user) throw new Error('No user was returned after signing in.');
      if (!data.session) {
        throw new Error('Email confirmation is still required. Check your inbox, then sign in.');
      }
      const nextProfile = await loadProfile(data.user);
      setProfile(nextProfile);
      return nextProfile;
    },
    async signUp(email, password) {
      if (!supabase) throw missingSetup();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      if (!data.user) throw new Error('We could not create the account. Please try again.');
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
