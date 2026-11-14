"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { DemoSnapshot, ExperimentConfig, ResearchEvent, ResearchJob, SimulationResult } from "../lib/contracts";
import { PlotPreview } from "./PlotPreview";
import { StructureViewer } from "./StructureViewer";
import { PaperSummaries } from "./PaperSummaries";
import { VisualizationBoundary } from "./VisualizationBoundary";
import { DrugSupportPanel } from "./DrugSupportPanel";

const PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?";
const TERMINAL = new Set(["completed", "unsupported", "failed"]);

/** Functional research handoff; presentation styling can be replaced independently. */
export function HypothesisWorkspace({ fallbackExperiment }: { fallbackExperiment: ExperimentConfig }) {
  const [text, setText] = useState(PRIMARY);
  const [drug, setDrug] = useState("trastuzumab");
  const [target, setTarget] = useState("HER2");
  const [route, setRoute] = useState("");
  const [dose, setDose] = useState("");
  const [duration, setDuration] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prepared, setPrepared] = useState<{ experiment: ExperimentConfig; result: SimulationResult } | null>(null);
  const [shownResultId, setShownResultId] = useState<string | null>(null);
  const currentJob = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [savedDemo, setSavedDemo] = useState<DemoSnapshot | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    try {
      const previous = localStorage.getItem("hypothesim-last-job");
      if (previous && /^[a-f0-9]{32}$/.test(previous)) { currentJob.current = previous; setJobId(previous); }
    } catch { /* Storage is optional; direct simulation still works. */ }
  }, []);

  const readJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/research/jobs/${id}`, { cache: "no-store" });
    if (response.status === 404 && currentJob.current === id) {
      currentJob.current = null; setJobId(null);
      try { localStorage.removeItem("hypothesim-last-job"); } catch {}
      setMessage("The previous research job is no longer available. Submit again or open the saved demo.");
      return null;
    }
    if (!response.ok) throw new Error("Could not read research status.");
    const next = await response.json() as ResearchJob;
    if (currentJob.current !== id) return null;
    setJob(next);
    if (next.status === "completed" && next.experiment && next.result && next.interpretation &&
        next.interpretation.result_id === next.result.result_id &&
        next.result.configuration.experiment_id === next.experiment.experiment_id) {
      setPrepared((current) => current?.result.result_id === next.result!.result_id ? current :
        { experiment: next.experiment!, result: next.result! });
      setShownResultId(next.result.result_id);
      setMessage(null);
    } else if (next.status === "unsupported") {
      setMessage(next.support?.reasons.join(" ") || "This hypothesis is outside the reviewed model scope.");
    } else if (next.status === "failed") {
      setMessage(next.error_message || "Research failed; direct simulation remains available.");
    }
    return next;
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let closed = false;
    const source = new EventSource(`/api/research/jobs/${jobId}/events`);
    const stop = () => { closed = true; source.close(); clearInterval(poll); };
    source.addEventListener("progress", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as ResearchEvent;
      if (currentJob.current !== jobId) return;
      setEvents((existing) => existing.some((old) => old.event_id === item.event_id) ? existing : [...existing, item]);
      if (TERMINAL.has(item.kind)) void readJob(jobId).then((next) => { if (next && TERMINAL.has(next.status)) stop(); })
        .catch(() => setMessage("Research finished, but its result could not be loaded. Retry status shortly."));
    });
    source.onerror = () => {
      if (!closed) setMessage("Progress connection interrupted; checking saved job status.");
    };
    const poll = setInterval(() => {
      void readJob(jobId).then((next) => { if (next && TERMINAL.has(next.status)) stop(); }).catch(() => {
        if (!closed) setMessage("Research status is temporarily unavailable; the simulator remains usable.");
      });
    }, 2500);
    void readJob(jobId).then((next) => { if (next && TERMINAL.has(next.status)) stop(); })
      .catch(() => setMessage("Research status is temporarily unavailable; the simulator remains usable."));
    return stop;
  }, [jobId, readJob]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setSavedDemo(null);
    setJob(null);
    setEvents([]);
    setJobId(null);
    currentJob.current = null;
    try {
      const response = await fetch("/api/research/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ text, drug: drug.trim() || null, target: target.trim() || null,
          route: route || null, dose_mg_kg: dose ? Number(dose) : null,
          duration_h: duration ? Number(duration) : null,
          previous_experiment_id: prepared?.experiment.experiment_id ?? null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(typeof body.detail === "string" ? body.detail : "Research request could not be submitted.");
      }
      const created = await response.json() as ResearchJob;
      currentJob.current = created.job_id;
      try { localStorage.setItem("hypothesim-last-job", created.job_id); } catch {}
      setJob(created);
      setJobId(created.job_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research request failed; direct simulation remains available.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openSavedDemo() {
    setLoadingDemo(true);
    try {
      const response = await fetch("/demo/trastuzumab-demo.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Saved demo asset unavailable. The live simulator remains accessible when the API is running.");
      const demo = await response.json() as DemoSnapshot;
      if (demo.origin !== "saved_reviewed_demo" || demo.result.result_id !== demo.interpretation.result_id ||
          demo.experiment.experiment_id !== demo.result.configuration.experiment_id) throw new Error("Saved demo linkage is invalid.");
      currentJob.current = null; setJobId(null); setJob(null); setEvents([]);
      try { localStorage.removeItem("hypothesim-last-job"); } catch {}
      setSavedDemo(demo); setPrepared({ experiment: demo.experiment, result: demo.result });
      setShownResultId(demo.result.result_id); setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saved demo could not load."); }
    finally { setLoadingDemo(false); }
  }

  const visibleExperiment = prepared?.experiment ?? fallbackExperiment;
  const explanation = savedDemo?.interpretation ?? (job?.status === "completed" ? job.interpretation : null);
  const explanationExperiment = savedDemo?.experiment ?? job?.experiment;
  const interpretation = explanation && shownResultId === explanation.result_id ? explanation : null;

  const researchBusy = submitting || job?.status === "queued" || job?.status === "running";
  return <div className="hypothesim-workspace">
    <header className="workspace-header">
      <a className="workspace-brand" href="/">hypothesim<span>.</span></a>
      <nav aria-label="Workspace sections"><a href="#drug-support">Drug support</a><a href="#research">Research</a><a href="#structure">Structure</a><a href="#experiment">Experiment</a></nav>
      <span className="workspace-badge">LOCAL SCIENCE WORKSPACE</span>
    </header>
    <div className="workspace-intro"><p className="eyebrow">FROM HYPOTHESIS TO EXPLORATION</p>
      <h1>Ask a question.<br /><span>Explore the evidence.</span></h1>
      <p>Prepare an experiment, inspect the molecular structure, and compare how your assumptions change predicted occupancy.</p>
      <div className="workspace-steps"><span>01 · Research a hypothesis</span><span>02 · Inspect the structure</span><span>03 · Adjust and compare</span></div>
    </div>
    <DrugSupportPanel />
    <section id="research" className="research-panel" aria-label="Hypothesis research">
      <div className="section-heading"><div><p className="eyebrow">01 / RESEARCH</p><h2>Start with your question</h2></div><span className="scope-badge">Trastuzumab × HER2</span></div>
      <p className="scope-note">Available now: half-life ×3 versus affinity ×10. Other drugs or interventions receive a scope assessment. You can explore more values with the simulation controls below.</p>
      <div className="research-layout">
      <form ref={form} onSubmit={(event) => void submit(event)}>
        <label className="hypothesis-label">Scientific hypothesis<textarea required minLength={1} maxLength={12000} value={text}
          onChange={(event) => setText(event.target.value)} rows={4} /></label>
        <div className="form-grid"><label>Drug<input value={drug} onChange={(event) => setDrug(event.target.value)} /></label>
        <label>Biological target<input value={target} onChange={(event) => setTarget(event.target.value)} /></label></div>
        <details className="optional-inputs"><summary>Optional experiment details</summary>
          <p>The reviewed preset uses one 8 mg/kg IV infusion over a 4,320-hour window. Other values may need custom controls.</p>
          <div className="form-grid"><label>Administration route<select value={route} onChange={(event) => setRoute(event.target.value)}>
          <option value="">From reviewed preset</option><option value="iv_infusion">IV infusion</option>
          <option value="hypothetical_iv_bolus">Hypothetical IV bolus</option><option value="oral">Oral</option>
          <option value="subcutaneous">Subcutaneous</option><option value="other">Other</option>
        </select></label><label>Dose (mg/kg)<input type="number" min="0.001" step="any" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="8 · preset" /></label>
        <label>Duration (hours)<input type="number" min="0.001" step="any" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="4,320 · preset" /></label></div></details>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={researchBusy}>{researchBusy ? "Research in progress…" : "Research & simulate →"}</button>
        <button type="button" className="quiet-button" disabled={researchBusy} onClick={() => {setText(PRIMARY);setDrug("trastuzumab");setTarget("HER2");setRoute("");setDose("");setDuration("");}}>Use example question</button></div>
        <button type="button" className="saved-demo-button" disabled={loadingDemo} onClick={() => void openSavedDemo()}>{loadingDemo ? "Opening saved demo…" : "Open saved demo · no live research"}</button>
      </form>
      <section className="activity-panel" aria-label="Agent activity" aria-live="polite">
        <div className="activity-heading"><span className={`status-dot ${researchBusy ? "active" : ""}`} /><h3>Research activity</h3><span className="status-label">{job?.status ?? "Ready"}</span></div>
        <p>{savedDemo ? "Showing the saved reviewed demo. No live agent or literature search was run for this view." : job ? "Evidence and computation for your question." : "Your example is ready. Run the research agent, or start exploring the simulation below."}</p>
        {events.length > 0 ? <ol>{events.map((item) => <li key={item.event_id}>{item.message}</li>)}</ol> : <div className="activity-placeholder">Reviewed evidence → supported model → numerical comparison</div>}
        {job?.status === "completed" && <p className="activity-success">Experiment prepared · literature {job.retrieval_status === "live" ? "verified live" : "from labeled cache"}</p>}
        {job?.literature_search && <details><summary>Related-paper search · {job.literature_search.records.length} candidates</summary>
          <p>Query: {job.literature_search.query}. These are discovery results; they do not supply reviewed model inputs.</p>
          {job.literature_search.records.map((paper) => <article key={`${paper.provider_source}-${paper.provider_id}`}>
            <a href={paper.record_url} target="_blank" rel="noreferrer">{paper.title}</a>
            <p>{paper.abstract ? `Abstract excerpt: ${paper.abstract.slice(0, 500)}${paper.abstract.length > 500 ? "…" : ""}` : "No abstract returned; no content summary inferred."}</p>
          </article>)}
        </details>}
        {job?.related_search_status === "unavailable" && <p>Related-paper search unavailable. Reviewed evidence is labeled separately.</p>}
        {job && <details><summary>Research record</summary><p>Job {job.job_id}</p><p>Trace: {job.trace_status} · Tools: {(job.tool_calls ?? []).join(", ")}</p></details>}
      </section></div>
      {message && <p role="alert">{message}</p>}
      {job?.status === "failed" && <button type="button" onClick={() => form.current?.requestSubmit()}>Retry research</button>}
      {savedDemo && <p className="saved-demo-banner" role="status">Saved reviewed demo · generated {savedDemo.generated_at.slice(0, 10)} · cached evidence · no live AI research. Charts and structure remain interactive; parameter recalculation needs the local API.</p>}
      {interpretation && <section className="interpretation-panel" aria-label="Scientific interpretation">
        <p className="eyebrow">RESEARCH FINDINGS</p><h2>What this experiment predicts</h2>
        <ul>{interpretation.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul>
        {interpretation.paper_summaries && explanationExperiment && <PaperSummaries summaries={interpretation.paper_summaries} experiment={explanationExperiment} />}
        <details><summary>Follow-up experiments and limitations</summary><h3>Follow-up experiments</h3><ul>{interpretation.follow_up_experiments.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>Limitations</h3><ul>{interpretation.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
      </section>}
      {explanation && !interpretation && <p className="scope-note">The explanation applies to the original result. Adjusted curves need a new interpretation.</p>}
    </section>
    <VisualizationBoundary label="Experimental structure"><StructureViewer /></VisualizationBoundary>
    <PlotPreview key={prepared?.result.result_id ?? "fallback"} initialExperiment={visibleExperiment}
      initialResult={prepared?.result} onResultIdChange={setShownResultId} />
    <footer className="workspace-footer">Hypothesim · Conditional scientific exploration · Predictions are model outputs.</footer>
  </div>;
}
