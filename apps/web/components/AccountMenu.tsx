"use client";
import { useAuth } from "../lib/auth";

/** Header account control: Google sign-in when accounts are enabled; nothing in local single-user mode. */
export function AccountMenu() {
  const { enabled, ready, user, signIn, signOut } = useAuth();
  if (!enabled) return null;
  if (!ready) return <span className="account-menu" aria-busy="true" />;
  if (!user) return <button type="button" className="account-signin" onClick={signIn}>Sign in with Google</button>;
  return <span className="account-menu">
    {user.avatarUrl ? <img src={user.avatarUrl} alt="" width={24} height={24} referrerPolicy="no-referrer" /> : <span className="account-initial" aria-hidden="true">{user.name.slice(0, 1)}</span>}
    <span className="account-name">{user.name}</span>
    <button type="button" className="quiet-button" onClick={signOut}>Sign out</button>
  </span>;
}

/** Inline prompt shown where an action needs an account. */
export function SignInPrompt({ action }: { action: string }) {
  const { enabled, user, signIn } = useAuth();
  if (!enabled || user) return null;
  return <p className="signin-prompt" role="note"><button type="button" className="account-signin" onClick={signIn}>Sign in with Google</button> to {action}.</p>;
}
