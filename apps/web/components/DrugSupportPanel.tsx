"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DrugAssessmentRequest, DrugAssessmentResponse } from "../lib/contracts";

const EMPTY = { drug_name: "Herceptin", target: "", molecular_form: "", route: "", endpoint: "" };
const EXAMPLES = [
  { label: "Herceptin", request: { drug_name: "Herceptin" } },
  { label: "Imatinib", request: { drug_name: "imatinib", target: "Abl" } },
  { label: "Gleevec", request: { drug_name: "Gleevec" } },
  { label: "Unsupported route", request: { drug_name: "trastuzumab", route: "oral" } },
  { label: "Unknown name", request: { drug_name: "hypothesim-unknown-compound-7a" } },
] satisfies { label: string; request: DrugAssessmentRequest }[];

function heading(result: DrugAssessmentResponse) {
  if (result.model_eligible) return "Reviewed model available · conditional";
  if (result.support.status === "unsupported") return "Outside the reviewed model scope";
  if (result.identity_status === "ambiguous") return "Clarification needed";
  if (result.identity_status === "candidate_identity") return "Drug identified · model not reviewed";
  if (result.identity_status === "not_found") return "No exact identity match";
  if (result.identity_status === "unavailable") return "Identity source unavailable";
  return "More details needed";
}

/** Diagnostic view of 7A; never substitutes an identity assessment for an experiment. */
export function DrugSupportPanel() {
  const [draft, setDraft] = useState(EMPTY);
  const [result, setResult] = useState<DrugAssessmentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => active.current?.abort(), []);

  function edit(field: keyof typeof EMPTY, value: string) {
    generation.current++; active.current?.abort(); setBusy(false); setResult(null); setError(null);
    setDraft((current) => ({ ...current, [field]: value }));
  }
  async function assess(request: DrugAssessmentRequest) {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const token = ++generation.current;
    setBusy(true); setResult(null); setError(null);
    try {
      const response = await fetch("/api/research/assess", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
        cache: "no-store", signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Support check failed. Check the inputs and retry.");
      if (token === generation.current && !controller.signal.aborted) setResult(data as DrugAssessmentResponse);
    } catch (problem) {
      if (token === generation.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Support check unavailable. The existing experiment remains usable.");
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void assess({ drug_name: draft.drug_name, target: draft.target.trim() || null,
      molecular_form: draft.molecular_form.trim() || null, route: draft.route || null, endpoint: draft.endpoint || null });
  }
  function example(request: DrugAssessmentRequest) {
    setDraft({ ...EMPTY, drug_name: request.drug_name, target: request.target ?? "", route: request.route ?? "",
      molecular_form: request.molecular_form ?? "", endpoint: request.endpoint ?? "" });
    void assess(request);
  }

  return <section id="drug-support" className="drug-support-panel" aria-label="Drug support assessment">
    <div className="section-heading"><div><p className="eyebrow">DRUG & MODEL READINESS · 7A</p><h2>Check what we can model</h2></div><span className="scope-badge">Identity + eligibility</span></div>
    <p>Check a drug name, molecular form, target, and route before preparing an experiment. This panel assesses support; it does not run or replace the simulation below.</p>
    <div className="support-examples"><span>Try a test case:</span>{EXAMPLES.map((item) => <button key={item.label} type="button" onClick={() => example(item.request)}>{item.label}</button>)}</div>
    <form onSubmit={submit}>
      <div className="form-grid support-fields"><label>Drug to assess<input required maxLength={200} value={draft.drug_name} onChange={(event) => edit("drug_name", event.target.value)} /></label>
        <label>Target to assess <input maxLength={200} placeholder="Reviewed default, if available" value={draft.target} onChange={(event) => edit("target", event.target.value)} /></label>
        <label>Molecular form <input maxLength={200} placeholder="Optional · e.g. imatinib mesylate or Fab" value={draft.molecular_form} onChange={(event) => edit("molecular_form", event.target.value)} /></label>
        <label>Route to assess<select value={draft.route} onChange={(event) => edit("route", event.target.value)}>
          <option value="">Reviewed default, if available</option><option value="iv_infusion">IV infusion</option><option value="IV">IV · method unspecified</option>
          <option value="hypothetical_iv_bolus">Hypothetical IV bolus</option><option value="oral">Oral</option><option value="subcutaneous">Subcutaneous</option>
        </select></label>
        <label>Endpoint to assess<select value={draft.endpoint} onChange={(event) => edit("endpoint", event.target.value)}>
          <option value="">Reviewed default, if available</option><option value="target_occupancy">Target occupancy</option><option value="clinical efficacy">Clinical efficacy</option><option value="toxicity">Toxicity</option>
        </select></label>
      </div>
      <button type="submit" className="primary-button" disabled={busy}>{busy ? "Checking identities and model scope…" : "Check drug support →"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {busy && <p role="status">Checking the reviewed catalog and, when needed, ChEMBL. No AI or simulation is being run.</p>}
      {result && <div className={`support-outcome ${result.model_eligible ? "eligible" : "limited"}`}>
        <h3>{heading(result)}</h3>
        <p><strong>Assessed:</strong> {result.request.drug_name}{result.request.target ? ` · ${result.request.target}` : ""}{result.request.route ? ` · ${result.request.route}` : ""}</p>
        <p><strong>Identity source:</strong> {result.retrieval_status === "reviewed_registry" ? "Reviewed local catalog" : result.retrieval_status === "live" ? "Live ChEMBL lookup" : result.retrieval_status === "cached_degraded" ? "Cached ChEMBL identity · provider unavailable" : "Unavailable"}</p>
        <ul>{result.support.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {(result.ambiguities?.length ?? 0) > 0 && <ul>{result.ambiguities?.map((item) => <li key={item}>{item}</li>)}</ul>}
        {(result.support.missing_parameters?.length ?? 0) > 0 && <><h3>What is needed next</h3><ul>{result.support.missing_parameters?.map((item) => <li key={item}>{item}</li>)}</ul></>}
        <div className="identity-cards">{result.candidates?.map((candidate) => <article className="identity-card" key={candidate.identifiers.chembl_id ?? candidate.canonical_name}>
          <h3>{candidate.canonical_name}</h3><p>{candidate.molecular_form} · {candidate.molecule_type}</p>
          <a href={candidate.source_url} target="_blank" rel="noreferrer">{candidate.identifiers.chembl_id} · source record ↗</a>
          <p>{candidate.provenance === "reviewed_registry" ? "Registered identity linked to a reviewed profile" : "Database identity candidate; no scientific model approval"}</p>
          {candidate.retrieved_at && <p>Retrieved {candidate.retrieved_at}</p>}
          {result.identity_status === "ambiguous" && <button type="button" onClick={() => example({ ...result.request, drug_name: candidate.identifiers.chembl_id ?? candidate.canonical_name, molecular_form: candidate.molecular_form })}>Assess exact identity {candidate.identifiers.chembl_id}</button>}
        </article>)}</div>
        {result.profile_id && <p>Reviewed profile: {result.profile_id} · version {result.profile_version}. Target: {result.resolved_target}.</p>}
        {Object.keys(result.defaults_applied ?? {}).length > 0 && <details><summary>Defaults used for this assessment</summary><ul>{Object.entries(result.defaults_applied ?? {}).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul></details>}
        {result.capabilities?.map((capability) => <details key={capability.model_id}><summary>Reviewed model capabilities and limits</summary>
          <p>Routes: {capability.supported_routes.join(", ")} · endpoints: {capability.supported_endpoints.join(", ")} · maximum duration: {capability.maximum_duration_h} hours</p>
          <p>Adjustable fields: {capability.adjustable_fields.join(", ")}</p><ul>{capability.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>)}
        <p className="scope-note">{result.model_eligible ? "The reviewed model matches these structured fields. A validated experiment still needs to be configured; use the existing antibody research example below." : "No new simulation has been approved or generated. Your current experiment is unchanged."}</p>
        <details><summary>Assessment record</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
      </div>}
    </div>
  </section>;
}
