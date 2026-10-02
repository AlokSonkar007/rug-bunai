// ─────────────────────────────────────────────────────────────────────────────
// AUTH — Supabase Auth with server-enforced roles (public.profiles.role).
//
//  • Customer session persists across reloads (supabase-js storage + refresh).
//  • Admin identity comes from the DATABASE, not the client: profiles RLS only
//    lets an admin row be created by another admin or a SQL bootstrap script.
//  • When Supabase isn't configured we expose a clearly-labelled local demo
//    account so the flows can be exercised during setup; role is stored in
//    sessionStorage and every mutation path still re-checks `isAdmin`.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase } from './supabase';
import type { UserRole } from './database.types';

export interface AuthState {
  /** null while restoring a persisted session on first paint. */
  ready: boolean;
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  isAdmin: boolean;
  email: string | null;
  displayName: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateFullName: (name: string) => Promise<{ error: string | null }>;
  resetPasswordRequest: (email: string) => Promise<{ error: string | null }>;
}

const Ctx = createContext<AuthState | null>(null);

// Demo-mode credentials (only active when Supabase env vars are absent).
const DEMO_KEY = 'rugbunai-demo-auth';
const DEMO_ACCOUNTS: Record<string, { password: string; role: UserRole; name: string }> = {
  'demo@rugbunai.in': { password: 'customer1234', role: 'customer', name: 'Demo Customer' },
  'admin@rugbunai.in': { password: 'admin12345', role: 'admin', name: 'Atelier Admin' },
};

interface DemoSession { email: string; role: UserRole; name: string }

function readDemo(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoSession | null>(() => (isSupabaseConfigured ? null : readDemo()));

  // Real Supabase: restore session, subscribe to changes, resolve server-side role.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = requireSupabase();
    let cancelled = false;

    async function loadRole(userId: string) {
      const { data } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      setRole(data?.role ?? null); // unknown role ⇒ treated as nobody-privileged
      setProfileName(data?.full_name ?? null);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
      if (data.session?.user) void loadRole(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRole(null);
        setProfileName(null);
      } else {
        void loadRole(newSession.user.id);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    if (isSupabaseConfigured) {
      const user = session?.user ?? null;
      return {
        ready,
        session,
        user,
        role,
        isAdmin: role === 'admin',
        email: user?.email ?? null,
        displayName: profileName || user?.email || null,
        signIn: async (email, password) => {
          const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
          return { error: error ? translateAuthError(error.message) : null };
        },
        signUp: async (email, password, fullName) => {
          const { data, error } = await requireSupabase().auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });
          if (error) return { error: translateAuthError(error.message), needsConfirmation: false };
          return { error: null, needsConfirmation: Boolean(data.user && !data.session) };
        },
        signOut: async () => {
          await requireSupabase().auth.signOut();
          setRole(null);
        },
        updateFullName: async (name) => {
          const uid = user?.id;
          if (!uid) return { error: 'Not signed in.' };
          const { error } = await requireSupabase()
            .from('profiles')
            .update({ full_name: name })
            .eq('id', uid);
          if (error) return { error: 'Could not save your details.' };
          setProfileName(name);
          return { error: null };
        },
        resetPasswordRequest: async (email) => {
          const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/account/reset`,
          });
          return { error: error ? translateAuthError(error.message) : null };
        },
      };
    }

    // ── Local demo mode (no Supabase env configured) ─────────────────────────
    return {
      ready: true,
      session: null,
      user: null,
      role: demo?.role ?? null,
      isAdmin: demo?.role === 'admin',
      email: demo?.email ?? null,
      displayName: demo?.name ?? null,
      signIn: async (email, password) => {
        await delay(350);
        const acct = DEMO_ACCOUNTS[email.trim().toLowerCase()];
        if (!acct || acct.password !== password) {
          return { error: 'Invalid email or password. Try demo@rugbunai.in / customer1234.' };
        }
        const s: DemoSession = { email: email.trim().toLowerCase(), role: acct.role, name: acct.name };
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(s));
        setDemo(s);
        return { error: null };
      },
      signUp: async (email, password, fullName) => {
        await delay(350);
        if (password.length < 8) return { error: 'Password must be at least 8 characters.', needsConfirmation: false };
        const s: DemoSession = { email: email.trim().toLowerCase(), role: 'customer', name: fullName || email };
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(s));
        setDemo(s);
        return { error: null, needsConfirmation: false };
      },
      signOut: async () => {
        sessionStorage.removeItem(DEMO_KEY);
        setDemo(null);
      },
      updateFullName: async (name) => {
        if (!demo) return { error: 'Not signed in.' };
        const s = { ...demo, name };
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(s));
        setDemo(s);
        return { error: null };
      },
      resetPasswordRequest: async () => ({ error: null }),
    };
  }, [ready, session, role, profileName, demo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('confirm')) return 'Please confirm your email address before signing in.';
  if (m.includes('rate')) return 'Too many attempts — wait a minute and try again.';
  if (m.includes('already registered')) return 'An account with this email already exists.';
  if (m.includes('email')) return 'That email address could not be accepted.';
  return message;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
