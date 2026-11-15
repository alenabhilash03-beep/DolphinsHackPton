/** "Run this experiment": build the edit request for a server-derived proposal. Pure; no values are computed here. */
import type { AgentEditRequest, ExperimentProposal, SimulationResult } from "./contracts";

/** A proposal can only be run against the exact result it was derived from, which must be the one displayed. */
export function proposalMatches(proposal: ExperimentProposal, shown: SimulationResult | null): boolean {
  return !!shown && proposal.base_result_id === shown.result_id && proposal.base_experiment_id === shown.configuration.experiment_id
    && proposal.base_configuration_sha256 === shown.configuration_hash && proposal.base_client_revision === shown.client_revision;
}

/** Only the proposal ID is sent; the server re-derives and applies the changes. The text is a readable label. */
export function proposalRequest(proposal: ExperimentProposal, shown: SimulationResult | null): AgentEditRequest {
  if (!shown || !proposalMatches(proposal, shown)) throw new Error("This proposal belongs to a different result. Reload the proposals for the displayed curves.");
  return { base_result_id: shown.result_id, base_experiment_id: shown.configuration.experiment_id, base_configuration_sha256: shown.configuration_hash,
    client_revision: shown.client_revision + 1, selected_scenario_id: null, text: proposal.edit_text, proposal_id: proposal.proposal_id };
}

export const changeText = (change: ExperimentProposal["changes"][number]): string =>
  `${change.parameter}${change.scenario_label ? ` · ${change.scenario_label}` : " · whole comparison"}: ${change.from_display} → ${change.to_display}`;
