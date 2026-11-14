"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ExperimentConfig, ResearchEvent, ResearchJob, SimulationResult } from "../lib/contracts";
import { PlotPreview } from "./PlotPreview";
import { StructureViewer } from "./StructureViewer";

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

  const readJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/research/jobs/${id}`, { cache: "no-store" });
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
      setJob(created);
      setJobId(created.job_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research request failed; direct simulation remains available.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleExperiment = prepared?.experiment ?? fallbackExperiment;
  const interpretation = job?.status === "completed" && job.interpretation &&
    shownResultId === job.interpretation.result_id ? job.interpretation : null;

  return <div>
    <section aria-label="Hypothesis research" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 0" }}>
      <h1>Research a hypothesis</h1>
      <p>The research agent currently supports the reviewed trastuzumab–HER2 half-life ×3 versus affinity ×10 comparison. Other requests return an explicit scope assessment.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label style={{ display: "block" }}>Hypothesis <textarea required minLength={1} maxLength={12000} value={text}
          onChange={(event) => setText(event.target.value)} rows={3} style={{ display: "block", width: "100%" }} /></label>
        <label>Drug <input value={drug} onChange={(event) => setDrug(event.target.value)} /></label>{" "}
        <label>Target <input value={target} onChange={(event) => setTarget(event.target.value)} /></label>{" "}
        <label>Route <select value={route} onChange={(event) => setRoute(event.target.value)}>
          <option value="">From reviewed preset</option><option value="iv_infusion">IV infusion</option>
          <option value="hypothetical_iv_bolus">Hypothetical IV bolus</option><option value="oral">Oral</option>
          <option value="subcutaneous">Subcutaneous</option><option value="other">Other</option>
        </select></label>{" "}
        <label>Dose (mg/kg) <input type="number" min="0.001" step="any" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Preset" /></label>{" "}
        <label>Duration (h) <input type="number" min="0.001" step="any" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Preset" /></label>{" "}
        <button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Research and simulate"}</button>
      </form>
      {message && <p role="alert">{message}</p>}
      <section aria-label="Agent activity" aria-live="polite">
        <h2>Agent activity</h2>
        <p>{job ? `Job ${job.job_id} · ${job.status}` : "No research job submitted yet. The example simulation below is ready."}</p>
        <ol>{events.map((item) => <li key={item.event_id}>{item.message}</li>)}</ol>
        {job?.status === "completed" && <p>Literature: {job.retrieval_status} · Trace: {job.trace_status} · Tools: {(job.tool_calls ?? []).join(", ")}</p>}
      </section>
      {interpretation && <section aria-label="Scientific interpretation">
        <h2>Interpretation of research result {interpretation.result_id}</h2>
        <ul>{interpretation.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul>
        <h3>Follow-up experiments</h3><ul>{interpretation.follow_up_experiments.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>Limitations</h3><ul>{interpretation.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>}
      {job?.interpretation && !interpretation && <p>The agent explanation applies to the original research result. Adjusted curves need a new interpretation.</p>}
    </section>
    <StructureViewer />
    <PlotPreview key={prepared?.result.result_id ?? "fallback"} initialExperiment={visibleExperiment}
      initialResult={prepared?.result} onResultIdChange={setShownResultId} />
  </div>;
}
