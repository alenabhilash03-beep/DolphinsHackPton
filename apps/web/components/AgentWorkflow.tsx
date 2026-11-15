"use client";
/**
 * Live agent-workflow screen (5C.3). Every node, paper, value, bar and log row is drawn from the job's recorded
 * execution events; motion only marks what is currently running. A replay re-reveals a finished run's
 * recorded events at compressed speed and is labeled as a replay.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentJob } from "../lib/contracts";
import { replayJob, replaySchedule, workflowModel, WORKFLOW_STAGES, type StageId } from "../lib/agent-workflow";
import { scenarioColor } from "../lib/plot-spec";
import { AgentIcon, ArrowIcon, CheckIcon, CrossIcon, DocIcon, StageIcon } from "./WorkflowIcons";

const STATUS: Record<string, string> = { replaying: "Replaying recorded run", starting: "Starting agent", queued: "Waiting for an agent slot", running: "Agent working",
  completed: "Investigation complete", needs_inputs: "Needs researcher input", unsupported: "Outside supported models", failed: "Run stopped", invalid: "Record could not be verified" };

export function AgentWorkflow({ job, submitting, question, replay, onClose, onViewResults }: {
  job: AgentJob | null; submitting: boolean; question: string; replay: boolean; onClose: () => void; onViewResults: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState(Number.MAX_SAFE_INTEGER);
  const [replayKey, setReplayKey] = useState(0);
  const total = job?.execution_events?.length ?? 0;
  // Replay: reveal recorded events on their compressed real schedule.
  useEffect(() => {
    if (!replay || !job?.execution_events?.length) { setShown(Number.MAX_SAFE_INTEGER); return; }
    const schedule = replaySchedule(job.execution_events);
    setShown(0);
    const timers = schedule.map((ms, i) => setTimeout(() => setShown(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [replay, job?.execution_run_id, replayKey]);
  const visibleJob = useMemo(() => job && replay && shown < total ? replayJob(job, shown) : job, [job, replay, shown, total]);
  const model = useMemo(() => workflowModel(visibleJob, now), [visibleJob, now]);
  const live = !replay && (submitting || job?.status === "queued" || job?.status === "running");
  useEffect(() => { if (!live) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [live]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  const logRef = useRef<HTMLOListElement>(null);
  // Keep the newest tool call in view by scrolling the log itself, never the dialog.
  useEffect(() => { const log = logRef.current; if (log) log.scrollTop = log.scrollHeight; }, [model.log.length]);

  const replaying = replay && shown < total;
  const status = submitting && !job ? "starting" : replaying ? "replaying" : model.status;
  const finished = !live && !(replay && shown < total);
  const activeStage = model.active ? WORKFLOW_STAGES.find(s => s.id === model.active!.stage) : null;
  const hasResult = model.metrics.length > 0;

  return <div className="workflow-overlay" role="dialog" aria-modal="true" aria-label="Agent workflow">
    <div className="workflow-screen">
      <header className="workflow-header">
        <div className="workflow-title">
          <p className="workflow-eyebrow">{replay ? "Replay of a recorded run" : "Live agent workflow"} · Nemotron + scientific tools</p>
          <h2>{question || "Scientific investigation"}</h2>
        </div>
        <div className="workflow-stats">
          <span className="workflow-status" data-status={status}>{!finished && <span className="workflow-pulse" />}{STATUS[status] ?? status}</span>
          <span><strong>{Math.floor(model.elapsed)}</strong> s</span>
          <span><strong>{model.toolCalls}</strong> tool calls</span>
          <button type="button" className="workflow-close" onClick={onClose} aria-label="Close workflow view">✕</button>
        </div>
      </header>

      <div className="workflow-loop" aria-live="polite">
        <span className="loop-node agent"><AgentIcon size={18}/> AI agent</span>
        <span className={`loop-link ${model.active ? "is-calling" : ""}`}><span>calls</span></span>
        <span className="loop-node tool">{model.active ? <><StageIcon id={model.active.stage} size={16}/> {model.active.label}</> : finished ? <>Run {status === "completed" ? "complete" : "ended"} · {model.toolCalls} recorded tool calls</> : <>Reasoning about the next step…</>}</span>
        <span className={`loop-link back ${model.active ? "is-calling" : ""}`}><span>observes result</span></span>
      </div>

      <ol className="workflow-pipeline" aria-label="Workflow stages">
        {model.stages.map((stage, i) => <li key={stage.id} data-state={stage.state} style={{ ["--i" as string]: i }}>
          <span className="pipe-node"><StageIcon id={stage.id}/>{stage.state === "done" && <span className="pipe-badge ok"><CheckIcon size={10}/></span>}
            {stage.state === "warning" && <span className="pipe-badge warn">!</span>}{stage.state === "failed" && <span className="pipe-badge bad"><CrossIcon size={10}/></span>}</span>
          <strong>{stage.label}</strong>
          <small>{stage.metric ?? (stage.state === "skipped" ? (model.edit && ["search", "reading", "extraction"].includes(stage.id) ? "not needed" : "not run") : stage.state === "active" ? "working…" : " ")}</small>
        </li>)}
      </ol>
      <p className="workflow-now">{activeStage ? <><span className="workflow-pulse"/>{activeStage.doing}</> : finished ? "Every stage above reflects a recorded tool outcome." : "Waiting for the agent's next tool call…"}</p>

      <div className="workflow-board">
        <section className="board-card" aria-label="Sources">
          <h3><StageIcon id="reading" size={16}/> Papers read</h3>
          {model.papers.length ? <ul className="paper-list">{model.papers.map(p => <li key={p.key} data-extraction={p.extraction}>
            <span className="paper-doc"><DocIcon/>{p.extraction === "reading" && <span className="paper-scan"/>}</span>
            <span className="paper-body"><span className="paper-title">{p.title}</span>
              <span className="paper-meta"><span className="chip">{p.access}</span>{p.retrieval && <span className="chip">{p.retrieval}</span>}
                <span className="paper-outcome">{{ pending: "awaiting extraction", reading: "under extraction…", not_extracted: "not extracted in this run", values: `${p.values} cited value${p.values === 1 ? "" : "s"}`, no_values: "no usable values", rejected: "proposal rejected by checks", unavailable: "extraction unavailable" }[p.extraction]}</span></span></span>
          </li>)}</ul> : <Placeholder text={model.edit ? "Experiment changes reuse the stored evidence." : "Papers appear as the agent retrieves them."}/>}
        </section>

        <section className="board-card" aria-label="Values and model inputs">
          <h3><StageIcon id="extraction" size={16}/> Values → model</h3>
          {model.values.length ? <>
            <p className="board-sub">Extracted from paper text (verified against the quoted passage)</p>
            <ul className="value-chips">{model.values.map(v => <li key={v.parameter + v.display} data-matches={v.matches}><span>{v.label}</span><strong>{v.display}</strong>
              {v.matches && <em><CheckIcon size={10}/> matches model input</em>}</li>)}</ul>
          </> : null}
          {model.inputs.length ? <>
            <p className="board-sub flow"><ArrowIcon size={14}/> {model.audited ? "Inputs the solver uses: audited reference values (extractions are compared, not substituted)" : "Inputs the solver uses"}</p>
            <ul className="input-list">{model.shownInputs.map(input => <li key={input.key} data-changed={input.changed} data-confirmed={input.confirmed}>
              <span>{input.label}{input.changed && <em>{input.scenario ?? "alternative"}</em>}{input.confirmed && <em className="confirmed"><CheckIcon size={9}/> extracted</em>}</span><strong>{input.display}</strong>
              <span className="prov" data-prov={input.reviewed ? "reviewed" : input.provenance}>{input.reviewed ? "reviewed" : input.provenance}{input.sources.length ? ` · ${input.sources.join(", ")}` : ""}</span>
            </li>)}</ul>
            {model.hiddenInputs > 0 && <p className="board-sub more">+{model.hiddenInputs} more inputs in the investigation panel</p>}
          </> : !model.values.length ? <Placeholder text="Cited values and the configured inputs appear here."/> : <Placeholder text="Waiting for the experiment to be configured…" small/>}
        </section>

        <section className="board-card" aria-label="Results">
          <h3><StageIcon id="simulation" size={16}/> Simulation</h3>
          {hasResult ? <ul className="occupancy-bars">{model.metrics.map(m => <li key={m.scenarioId}>
            <span className="bar-label">{m.label}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, m.occupancy * 100)}%`, background: scenarioColor(m.scenarioId, m.index) }}/>
              {model.threshold != null && <span className="bar-threshold" style={{ left: `${model.threshold * 100}%` }} title={`${Math.round(model.threshold * 100)}% threshold`}/>}</span>
            <strong>{(m.occupancy * 100).toFixed(1)}%</strong>
          </li>)}<li className="bar-caption">Endpoint target occupancy · dashed line = {model.threshold != null ? Math.round(model.threshold * 100) : "–"}% threshold</li></ul>
            : <Placeholder text="Solver results appear when the simulation runs." small/>}
          <h3 className="board-gap"><StageIcon id="structure" size={16}/> 3D structure</h3>
          {model.structure ? <p className="structure-line">{model.structure.available ? <><strong>PDB {model.structure.pdb_id}</strong> · {model.structure.interface_residue_pair_count ?? "–"} interface contacts · {model.structure.measurement_ids?.length ?? 0} measurements from deposited coordinates</> : "No verified structure for this drug and target; simulation is unaffected."}</p>
            : <Placeholder text="The agent inspects the experimental structure." small/>}
          <h3 className="board-gap"><StageIcon id="answer" size={16}/> Answer</h3>
          {model.synthesis ? <p className="structure-line">{model.synthesis.status === "grounded" ? "Grounded answer written; every claim links to a paper quote, solver value or measurement." : `Written answer ${model.synthesis.status}; the recorded results above still stand.`}</p>
            : <Placeholder text="Written last, from the recorded results." small/>}
        </section>
      </div>

      <section className="workflow-log" aria-label="Tool log">
        <h3>Tool log <small>{model.runId ? `run ${model.runId.slice(4, 12)}` : ""}</small></h3>
        <ol ref={logRef}>{model.log.map(row => <li key={row.id} data-state={row.state}>
          <StageIcon id={row.stage} size={14}/><span className="log-label">{row.label}</span><span className="log-detail">{row.detail ?? ""}</span>
          <span className="log-state">{row.state === "started" ? "running" : row.state.replaceAll("_", " ")}</span><span className="log-time">{row.seconds != null ? `${row.seconds.toFixed(1)} s` : ""}</span>
        </li>)}{!model.log.length && <li className="log-empty">{submitting ? "Sending the question to the agent…" : "No tool calls yet."}</li>}</ol>
      </section>

      <footer className="workflow-footer">
        <p>Every stage, value and row above is a recorded tool call from this run, not a scripted animation. Paper values are candidates checked against their source passage; model inputs show their provenance.</p>
        <div>
          {replay && <button type="button" className="quiet-button" onClick={() => setReplayKey(k => k + 1)}>Replay again</button>}
          <button type="button" className="quiet-button" onClick={onClose}>{live ? "Continue in background" : "Close"}</button>
          {finished && <button type="button" className="primary-button" onClick={onViewResults}>View results →</button>}
        </div>
      </footer>
    </div>
  </div>;
}

function Placeholder({ text, small }: { text: string; small?: boolean }) {
  return <div className={`board-placeholder ${small ? "small" : ""}`}><span/><span/>{!small && <span/>}<p>{text}</p></div>;
}

export type { StageId };
