/** Presentation of the investigation history. Pure: values are the server's; nothing is recomputed. */
import type { AgentTurn, HistoryEntry, InvestigationHistory } from "./contracts";

/** Restore older curves without replacing a new question's no-result answer or missing-input form. */
export function restorationAfterJob(savedId:string|null, turn:Pick<AgentTurn,"result">):{resultId:string;preserveResearchContext:boolean}|null {
  return savedId && savedId!==turn.result?.result_id ? {resultId:savedId,preserveResearchContext:!turn.result} : null;
}

const ORIGIN: Record<HistoryEntry["origin"], string> = { research: "Research", agent_edit: "Change in words", proposal: "Follow-up experiment",
  direct_control: "Direct control", direct_simulation: "Simulation", saved_demo: "Saved demo" };
const STATUS = { never_reached: "never reaches threshold", crossed_within_window: "falls below threshold in window",
  still_above_at_horizon: "above threshold at end of window", ambiguous_without_more_resolution: "threshold crossing unresolved" } as const;
const VERDICT = { supported: "Supported", not_supported: "Not supported", mixed: "Mixed", undetermined: "Not determined" } as const;

export type HistoryRow = { resultId: string; step: number; depth: number; kind: string; title: string; changes: string[]; design: string;
  outcomes: string[]; verdict: string | null; finding: string | null; evidence: string | null; displayed: boolean; branches: number; continued: boolean };

export function historyRows(history: InvestigationHistory | null, shownId: string | null): HistoryRow[] {
  return (history?.entries ?? []).map((entry, index) => ({ resultId: entry.result_id, step: index + 1, depth: entry.depth, kind: ORIGIN[entry.origin],
    title: entry.title, changes: entry.changes ?? [],
    design: `${+(entry.duration_h / 24).toFixed(2)} days · ${+(entry.occupancy_threshold * 100).toFixed(2)}% threshold`,
    outcomes: entry.outcomes.map(o => `${o.label}: ${(o.endpoint_occupancy * 100).toFixed(2)}% at end · ${STATUS[o.threshold_status]}`),
    verdict: entry.verdict ? VERDICT[entry.verdict] : null, finding: entry.finding ?? null,
    evidence: [entry.paper_count ? `${entry.paper_count} paper${entry.paper_count === 1 ? "" : "s"} read` : null,
      entry.structure_pdb_id ? `structure ${entry.structure_pdb_id} inspected` : null].filter(Boolean).join(" · ") || null,
    displayed: entry.result_id === shownId, branches: entry.child_count ?? 0, continued: !!entry.has_follow_up_experiment }));
}

/** Another agent experiment from the displayed result must be an explicit branch if one was already run from it. */
export function branchRequired(history: InvestigationHistory | null, shownId: string | null): boolean {
  return !!history?.entries.find(entry => entry.result_id === shownId)?.has_follow_up_experiment;
}

/** History is usable only if it is the tree of the displayed result; a late response for other curves is ignored. */
export function historyFor(history: InvestigationHistory | null, shownId: string | null): InvestigationHistory | null {
  return history && shownId && history.entries.some(entry => entry.result_id === shownId) ? history : null;
}
