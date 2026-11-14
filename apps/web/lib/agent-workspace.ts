import type { AgentTurn, SimulationResult } from "./contracts";
/** A late status response must not overwrite a saved demo or a newer research turn. */
export class RequestEpoch {
  private epoch = 0;
  next() { return ++this.epoch; }
  current(ticket: number) { return ticket === this.epoch; }
}
export function linkedTurnResult(turn: AgentTurn): SimulationResult | null {
  if (turn.status !== "completed" || !turn.result || !turn.interpretation) return null;
  if (turn.result.result_id !== turn.interpretation.result_id ||
      turn.result.configuration.experiment_id !== turn.interpretation.experiment_id ||
      turn.result.client_revision !== turn.interpretation.client_revision) throw new Error("Agent result linkage is invalid.");
  return turn.result;
}
export type StructureKind = "trastuzumab" | "imatinib" | "unavailable";
export function structureKind(drug: string, target: string): StructureKind {
  const name = drug.trim().toLowerCase(), site = target.trim().toLowerCase();
  if (["trastuzumab", "herceptin", "trastuzumab (intact igg1)"].includes(name) && ["her2", "erbb2", "her2/erbb2", "human her2 extracellular effective sites"].includes(site)) return "trastuzumab";
  if (["imatinib", "chembl941"].includes(name) && ["abl", "abl1", "abl kinase"].includes(site)) return "imatinib";
  return "unavailable";
}
