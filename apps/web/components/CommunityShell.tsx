"use client";
import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";

/** Shared chrome for community pages, matching the workspace header. */
export function CommunityShell({ children }: { children: ReactNode }) {
  return <div className="hypothesim-workspace editorial-workspace community-page">
    <header className="workspace-header"><a className="workspace-brand" href="/">hypothesim<span>.</span></a>
      <nav aria-label="Site sections"><a href="/">Workspace</a><a href="/community">Community</a></nav><AccountMenu/></header>
    {children}
    <footer className="workspace-footer">Hypothesim · Conditional scientific exploration · Predictions are model outputs, not clinical evidence.</footer>
  </div>;
}

export const VERDICT_LABEL: Record<string, string> = { supported: "Supported", not_supported: "Not supported", mixed: "Mixed", undetermined: "Not determined" };
export const ORIGIN_LABEL: Record<string, string> = { research: "Agent research", agent_edit: "Change in words", proposal: "Follow-up experiment",
  direct_control: "Direct parameter edit", direct_simulation: "Direct simulation", saved_demo: "Saved demo" };
export const STATUS_LABEL: Record<string, string> = { never_reached: "never reaches threshold", crossed_within_window: "falls below threshold in window",
  still_above_at_horizon: "above threshold at end of window", ambiguous_without_more_resolution: "crossing unresolved" };
export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
