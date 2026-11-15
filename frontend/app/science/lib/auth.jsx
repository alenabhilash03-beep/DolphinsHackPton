"use client";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Google sign-in through Supabase Auth (5C.2). The project URL and publishable key are read at runtime from
 * /api/auth/config; without them the app runs in local single-user mode and nothing here is active. When configured, the user's access token is attached to
 * same-origin /api/ requests, which the Next routes forward to FastAPI; no other credential reaches the browser.
 */ import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
const AuthContext = /*#__PURE__*/ createContext({
    enabled: false,
    ready: true,
    user: null,
    signIn: ()=>{},
    signOut: ()=>{}
});
let token = null;
let installed = false;
/** Same-origin API calls carry the signed-in user's token; requests elsewhere are untouched. */ function installFetchAuth() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    const original = window.fetch.bind(window);
    window.fetch = (input, init)=>{
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const target = new URL(url, window.location.href);
        if (token && target.origin === window.location.origin && target.pathname.startsWith("/api/")) {
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
            return original(input, {
                ...init,
                headers
            });
        }
        return original(input, init);
    };
}
function account(session) {
    if (!session) return null;
    const meta = session.user.user_metadata ?? {};
    const name = String(meta.full_name ?? meta.name ?? "Researcher");
    const avatar = meta.avatar_url ?? meta.picture;
    return {
        name,
        avatarUrl: typeof avatar === "string" ? avatar : null
    };
}
export function AuthProvider({ children }) {
    const [client, setClient] = useState(null);
    const [user, setUser] = useState(null);
    const [enabled, setEnabled] = useState(false);
    const [ready, setReady] = useState(false);
    useEffect(()=>{
        let unsubscribe = ()=>{};
        let cancelled = false;
        void fetch("/api/auth/config", {
            cache: "no-store"
        }).then((r)=>r.json()).catch(()=>({})).then(async (config)=>{
            if (cancelled) return;
            if (!config.url || !config.key) {
                setReady(true);
                return;
            } // local single-user mode
            const { createClient } = await import("@supabase/supabase-js");
            if (cancelled) return;
            setEnabled(true);
            const supabase = createClient(config.url, config.key, {
                auth: {
                    persistSession: true,
                    detectSessionInUrl: true,
                    flowType: "pkce"
                }
            });
            installFetchAuth();
            setClient(supabase);
            supabase.auth.getSession().then(({ data })=>{
                token = data.session?.access_token ?? null;
                setUser(account(data.session));
                setReady(true);
            });
            const { data } = supabase.auth.onAuthStateChange((_event, session)=>{
                token = session?.access_token ?? null;
                setUser(account(session));
                setReady(true);
            });
            unsubscribe = ()=>data.subscription.unsubscribe();
        });
        return ()=>{
            cancelled = true;
            unsubscribe();
        };
    }, []);
    const signIn = useCallback(()=>{
        if (!client) return;
        void client.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
    }, [
        client
    ]);
    const signOut = useCallback(()=>{
        if (!client) return;
        void client.auth.signOut().then(()=>{
            token = null;
            setUser(null);
        });
    }, [
        client
    ]);
    const value = useMemo(()=>({
            enabled,
            ready,
            user,
            signIn,
            signOut
        }), [
        enabled,
        ready,
        user,
        signIn,
        signOut
    ]);
    // Render once sign-in state is known, so the workspace's first API calls already carry the user's token.
    return /*#__PURE__*/ _jsx(AuthContext.Provider, {
        value: value,
        children: ready ? children : /*#__PURE__*/ _jsx("div", {
            "aria-busy": "true",
            style: {
                minHeight: "100vh"
            }
        })
    });
}
export const useAuth = ()=>useContext(AuthContext);
