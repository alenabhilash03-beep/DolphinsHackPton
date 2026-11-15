"use client";
/**
 * Google sign-in through Supabase Auth (5C.2). Without NEXT_PUBLIC_SUPABASE_URL the app runs in local
 * single-user mode and nothing here is active. When configured, the user's access token is attached to
 * same-origin /api/ requests, which the Next routes forward to FastAPI; no other credential reaches the browser.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AccountUser { name: string; avatarUrl: string | null }
interface AuthState { enabled: boolean; ready: boolean; user: AccountUser | null; signIn: () => void; signOut: () => void }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

const AuthContext = createContext<AuthState>({ enabled: false, ready: true, user: null, signIn: () => {}, signOut: () => {} });
let token: string | null = null;
let installed = false;

/** Same-origin API calls carry the signed-in user's token; requests elsewhere are untouched. */
function installFetchAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const target = new URL(url, window.location.href);
    if (token && target.origin === window.location.origin && target.pathname.startsWith("/api/")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      return original(input, { ...init, headers });
    }
    return original(input, init);
  };
}

function account(session: { access_token: string; user: { user_metadata?: Record<string, unknown> } } | null): AccountUser | null {
  if (!session) return null;
  const meta = session.user.user_metadata ?? {};
  const name = String(meta.full_name ?? meta.name ?? "Researcher");
  const avatar = meta.avatar_url ?? meta.picture;
  return { name, avatarUrl: typeof avatar === "string" ? avatar : null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [ready, setReady] = useState(!authEnabled);
  useEffect(() => {
    if (!authEnabled) return;
    let unsubscribe = () => {};
    let cancelled = false;
    void import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
      installFetchAuth();
      setClient(supabase);
      supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; setUser(account(data.session)); setReady(true); });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => { token = session?.access_token ?? null; setUser(account(session)); setReady(true); });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  const signIn = useCallback(() => {
    if (!client) return;
    void client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
  }, [client]);
  const signOut = useCallback(() => {
    if (!client) return;
    void client.auth.signOut().then(() => { token = null; setUser(null); });
  }, [client]);
  const value = useMemo(() => ({ enabled: authEnabled, ready, user, signIn, signOut }), [ready, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
