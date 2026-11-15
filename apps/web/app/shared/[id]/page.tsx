"use client";
import { use, useEffect, useState } from "react";
import type { SharedExperiment } from "../../../lib/contracts";
import { useAuth } from "../../../lib/auth";
import { CommunityShell, ORIGIN_LABEL, STATUS_LABEL, VERDICT_LABEL, formatDate } from "../../../components/CommunityShell";
import { SignInPrompt } from "../../../components/AccountMenu";
import { ScientificPlot } from "../../../components/ScientificPlot";
import { VisualizationBoundary } from "../../../components/VisualizationBoundary";
import { scenarioColor } from "../../../lib/plot-spec";

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const StepChips = ({ ids }: { ids: string[] }) => <span className="step-chips">{ids.map(id => <a key={id} href={`#step-${id}`}>{id}</a>)}</span>;

export default function SharedExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, user, enabled } = useAuth();
  const [share, setShare] = useState<SharedExperiment | null>(null), [error, setError] = useState<string | null>(null), [removed, setRemoved] = useState(false);
  useEffect(() => {
    if (!ready || (enabled && !user)) return;
    fetch(`/api/shares/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "This shared experiment is unavailable.");
      setShare(data as SharedExperiment);
    }).catch(e => setError(e instanceof Error ? e.message : "This shared experiment is unavailable."));
  }, [id, ready, user, enabled]);
  async function remove() {
    if (!share || !window.confirm("Remove this experiment from the community feed? The link will stop working.")) return;
    const response = await fetch(`/api/shares/${share.share_id}`, { method: "DELETE" });
    if (response.ok) setRemoved(true); else setError("Could not remove this shared experiment.");
  }
  if (removed) return <CommunityShell><section className="research-panel"><h2>Removed from the community</h2><p><a href="/community">Back to the feed</a></p></section></CommunityShell>;
  const shared = share?.steps.find(step => step.step_id === share.shared_step_id);
  const ai = share?.ai_summary;
  return <CommunityShell>
    <SignInPrompt action="open shared experiments"/>
    {error && <p role="alert">{error}</p>}
    {share && shared && <>
      <div className="workspace-intro"><div><p className="eyebrow">Shared experiment · {share.drug} → {share.target}</p><h1>{share.title}</h1>
        <p className="community-meta">{share.owner.avatar_url && <img src={share.owner.avatar_url} alt="" width={20} height={20} referrerPolicy="no-referrer"/>}
          {share.is_owner ? "Shared by you" : `Shared by ${share.owner.name}`} · {formatDate(share.created_at)} · {share.steps.length} step{share.steps.length === 1 ? "" : "s"} · read-only</p></div>
        {share.is_owner && <button type="button" className="quiet-button" onClick={() => void remove()}>Remove from community</button>}</div>
      <section className="research-panel shared-question"><p className="eyebrow">Research question</p><strong>{share.question}</strong>
        {share.note && <p className="shared-note">“{share.note}” — {share.owner.name}</p>}</section>

      <section className="research-panel shared-summary" aria-label="AI summary">
        <div className="share-heading"><div><p className="eyebrow">AI summary</p><h2>{ai?.status === "grounded" && ai.headline ? ai.headline : "Summary of the investigation"}</h2></div>
          <span className="workspace-badge">{ai?.status === "grounded" ? "Every statement cites the log" : "Log summary only"}</span></div>
        {ai?.status === "grounded" ? <>
          {ai.headline && <p className="summary-cites">Headline rests on <StepChips ids={ai.headline_step_ids ?? []}/></p>}
          <ul className="summary-points">{(ai.points ?? []).map((point, i) => <li key={i}>{point.text} <StepChips ids={point.step_ids}/></li>)}</ul>
        </> : <ul className="summary-points">{share.log_summary.slice(0, 6).map((line, i) => <li key={i}>{line}</li>)}</ul>}
        {ai?.notes?.map((note, i) => <p key={i} className="scope-note">{note}</p>)}
      </section>

      {share.answer && <section className="research-panel"><p className="eyebrow">Cited answer at step {share.answer.step_id}</p>
        <p><span className="community-verdict" data-verdict={share.answer.verdict}>{VERDICT_LABEL[share.answer.verdict]}</span> {share.answer.statement}</p></section>}

      <section className="experiment-panel shared-results" aria-label="Shared result">
        <p className="eyebrow">Result at step {shared.step_id} · {ORIGIN_LABEL[shared.origin]}</p><h2>{shared.title}</h2>
        <div className="outcome-grid">{shared.outcomes.map((o, i) => <article key={o.scenario_id} className="outcome-card" style={{ borderTopColor: scenarioColor(o.scenario_id, i) }}>
          <span className="outcome-name">{o.label}</span><strong>{pct(o.endpoint_occupancy)}</strong>
          <span>Endpoint target occupancy</span><small className="outcome-threshold">{STATUS_LABEL[o.threshold_status]} ({(shared.occupancy_threshold * 100).toFixed(0)}% threshold)</small></article>)}</div>
        <div className="plots-grid">{(["concentration", "occupancy"] as const).map(kind => <section key={kind} className="chart-card">
          <div className="chart-heading"><h3>{kind === "concentration" ? "Drug concentration" : "Target occupancy"}</h3></div>
          <VisualizationBoundary label={`${kind} plot`}><ScientificPlot result={share.result} kind={kind} cursorTimeHours={-1}/></VisualizationBoundary></section>)}</div>
      </section>

      <section className="research-panel" aria-label="Investigation log"><p className="eyebrow">Investigation log</p><h2>Every step, in order</h2>
        <ol className="shared-steps">{share.steps.map(step => <li key={step.step_id} id={`step-${step.step_id}`} data-shared={step.is_shared_result}>
          <div className="history-head"><span className="history-kind">{step.step_id} · {ORIGIN_LABEL[step.origin]}{step.parent_step_id ? ` · follows ${step.parent_step_id}` : ""}</span>
            <strong>{step.title}</strong>{step.is_shared_result && <span className="history-current">Shared result</span>}</div>
          {!!step.changes?.length && <p className="history-changes">Changed: {step.changes.join("; ")}</p>}
          <ul>{step.outcomes.map(o => <li key={o.scenario_id}>{o.label}: {pct(o.endpoint_occupancy)} endpoint occupancy, {STATUS_LABEL[o.threshold_status]}</li>)}</ul>
          {step.finding && <p className="history-finding">{step.verdict && <span>{VERDICT_LABEL[step.verdict]}</span>} {step.finding}</p>}
          {(step.paper_count > 0 || step.structure_pdb_id) && <p className="history-design">{step.paper_count > 0 ? `${step.paper_count} paper${step.paper_count === 1 ? "" : "s"} inspected` : ""}{step.paper_count > 0 && step.structure_pdb_id ? " · " : ""}{step.structure_pdb_id ? `Structure ${step.structure_pdb_id}` : ""}</p>}
        </li>)}</ol>
        <details><summary>Full log summary</summary><ul>{share.log_summary.map((line, i) => <li key={i}>{line}</li>)}</ul></details>
      </section>
      <p className="scope-note shared-disclaimer">{share.disclaimer}</p>
    </>}
  </CommunityShell>;
}
