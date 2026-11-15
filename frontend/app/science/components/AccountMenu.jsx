"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from "../lib/auth.jsx";
/** Header account control: Google sign-in when accounts are enabled; nothing in local single-user mode. */ export function AccountMenu() {
    const { enabled, ready, user, signIn, signOut } = useAuth();
    if (!enabled) return null;
    if (!ready) return /*#__PURE__*/ _jsx("span", {
        className: "account-menu",
        "aria-busy": "true"
    });
    if (!user) return /*#__PURE__*/ _jsx("button", {
        type: "button",
        className: "account-signin",
        onClick: signIn,
        children: "Sign in with Google"
    });
    return /*#__PURE__*/ _jsxs("span", {
        className: "account-menu",
        children: [
            user.avatarUrl ? /*#__PURE__*/ _jsx("img", {
                src: user.avatarUrl,
                alt: "",
                width: 24,
                height: 24,
                referrerPolicy: "no-referrer"
            }) : /*#__PURE__*/ _jsx("span", {
                className: "account-initial",
                "aria-hidden": "true",
                children: user.name.slice(0, 1)
            }),
            /*#__PURE__*/ _jsx("span", {
                className: "account-name",
                children: user.name
            }),
            /*#__PURE__*/ _jsx("button", {
                type: "button",
                className: "quiet-button",
                onClick: signOut,
                children: "Sign out"
            })
        ]
    });
}
/** Inline prompt shown where an action needs an account. */ export function SignInPrompt({ action }) {
    const { enabled, user, signIn } = useAuth();
    if (!enabled || user) return null;
    return /*#__PURE__*/ _jsxs("p", {
        className: "signin-prompt",
        role: "note",
        children: [
            /*#__PURE__*/ _jsx("button", {
                type: "button",
                className: "account-signin",
                onClick: signIn,
                children: "Sign in with Google"
            }),
            " to ",
            action,
            "."
        ]
    });
}
