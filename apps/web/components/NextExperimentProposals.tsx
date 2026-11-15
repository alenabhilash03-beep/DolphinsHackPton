"use client";

import { useEffect, useState } from "react";
import type { ExperimentProposal, ProposalSet, SimulationResult } from "../lib/contracts";
import { changeText, proposalMatches } from "../lib/proposal-view";

/** Runnable follow-ups for the displayed result. The server derives them from solver facts; nothing is computed here. */
export function NextExperimentProposals({ shown, busy, onRun }: { shown: SimulationResult | null; busy: boolean; onRun: (proposal: ExperimentProposal) => void }) {
  const [set, setSet] = useState<ProposalSet | null>(null), [failed, setFailed] = useState(false);
  const resultId = shown?.result_id ?? null;
  useEffect(() => {
    setSet(null); setFailed(false);
    if (!resultId) return;
    const abort = new AbortController();
    fetch(`/api/agent/results/${encodeURIComponent(resultId)}/proposals`, { cache: "no-store", signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error("unavailable"); return response.json() as Promise<ProposalSet>; })
      .then(value => { if (!abort.signal.aborted && value.base_result_id === resultId) setSet(value); })
      .catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, [resultId]);
  if (!shown) return null;
  const proposals = (set?.proposals ?? []).filter(proposal => proposalMatches(proposal, shown));
  return <section id="next-experiments" className="proposal-panel" aria-label="Follow-up experiments">
    <div className="answer-section-heading"><div><p className="eyebrow">Next experiments</p><h2>Run a follow-up experiment</h2></div>
      <span>Derived from this result's solver values · exact changes shown before anything runs</span></div>
    {failed ? <p className="answer-access-note">Follow-up proposals are unavailable for these curves right now. You can still change the experiment in words or with the controls.</p>
      : !set ? <p className="answer-access-note" role="status">Checking this result for follow-up experiments…</p>
      : !proposals.length ? <p className="answer-access-note">No follow-up experiment is suggested for this result. You can still change the experiment in words or with the controls.</p>
      : <>{set.status === "superseded" && <p className="history-branch" role="status">{set.note}</p>}<ul className="proposal-cards">{proposals.map(proposal => <li key={proposal.proposal_id}>
        <h3>{proposal.title}</h3>
        <p className="proposal-question"><strong>Tests:</strong> {proposal.question_tested}</p>
        <p><strong>Because:</strong> {proposal.observation} {proposal.rationale}</p>
        <ul className="proposal-changes" aria-label="Exact changes">{proposal.changes.map((change, index) => <li key={index}>{changeText(change)}</li>)}</ul>
        <p className="proposal-scope">{proposal.scope_note} Base result {proposal.base_result_id}.</p>
        <button type="button" className="primary-button" disabled={busy} onClick={() => onRun(proposal)}>Run this experiment →</button>
        <small>Same as typing: “{proposal.edit_text}”</small>
      </li>)}</ul></>}
  </section>;
}
