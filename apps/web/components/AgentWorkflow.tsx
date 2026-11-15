"use client";
/**
 * Live agent-workflow graph (5C.3). A node canvas: the question flows into the AI agent, the agent calls its
 * research tools (dashed links) and its results branch out to model inputs, simulation, structure and the
 * grounded answer. Every node state, edge animation and inspector value is drawn from the job's recorded
 * execution events; packets move only along links whose tools are actually running or returning results.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AgentJob } from "../lib/contracts";
import { replayJob, replaySchedule, workflowModel, WORKFLOW_STAGES } from "../lib/agent-workflow";
import { EDGES, NODES, VIEW, graphState, type EdgeMode, type NodeId, type NodeState } from "../lib/workflow-graph";
import { scenarioColor } from "../lib/plot-spec";
import { AgentIcon, BracesIcon, CheckIcon, CrossIcon, DocIcon, FitIcon, StageIcon, ZoomIcon } from "./WorkflowIcons";

const STATUS: Record<string, string> = { replaying: "Replaying this run", starting: "Starting agent", queued: "Waiting for an agent slot", running: "Agent working",
  completed: "Investigation complete", needs_inputs: "Needs researcher input", unsupported: "Outside supported models", failed: "Run stopped", invalid: "Record could not be verified" };
const NODE_OF_STAGE: Record<string, NodeId> = { question: "prep", search: "search", reading: "reading", extraction: "extraction", model: "model", simulation: "simulation", structure: "structure", answer: "answer" };

export function AgentWorkflow({ job, submitting, question, replay, onClose, onViewResults }: {
  job: AgentJob | null; submitting: boolean; question: string; replay: boolean; onClose: () => void; onViewResults: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState(Number.MAX_SAFE_INTEGER);
  const [replayKey, setReplayKey] = useState(0);
  const [picked, setPicked] = useState<NodeId | null>(null);
  const [zoom, setZoom] = useState(1);
  const total = job?.execution_events?.length ?? 0;
  // Presentation pacing: events arrive in polling bursts, so reveal them one by one with a minimum dwell,
  // letting every tool call visibly run before its outcome appears. Only the timing of display changes.
  const [paced, setPaced] = useState(0);
  const events = job?.execution_events ?? [];
  useEffect(() => { setPaced(0); }, [job?.execution_run_id]);
  useEffect(() => {
    if (replay || paced >= events.length) return;
    const next = events[paced];
    const dwell = next?.state === "started" ? 160 : next?.kind === "run" ? 220 : 650;
    const timer = setTimeout(() => setPaced(count => Math.min(events.length, count + 1)), dwell);
    return () => clearTimeout(timer);
  }, [replay, paced, events.length]);
  useEffect(() => {
    if (!replay || !job?.execution_events?.length) { setShown(Number.MAX_SAFE_INTEGER); return; }
    const schedule = replaySchedule(job.execution_events);
    setShown(0); setPicked(null);
    const timers = schedule.map((ms, i) => setTimeout(() => setShown(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [replay, job?.execution_run_id, replayKey]);
  const visibleJob = useMemo(() => !job ? job : replay ? (shown < total ? replayJob(job, shown) : job)
    : paced < total ? replayJob(job, paced) : job, [job, replay, shown, total, paced]);
  const model = useMemo(() => workflowModel(visibleJob, now), [visibleJob, now]);
  const live = !replay && (submitting || job?.status === "queued" || job?.status === "running");
  const replaying = replay && shown < total;
  const catchingUp = !replay && paced < total;
  const running = live || replaying || catchingUp;
  useEffect(() => { if (!live) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [live]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { const log = logRef.current; if (log) log.scrollTop = log.scrollHeight; }, [model.log.length]);

  const status = submitting && !job ? "starting" : replaying ? "replaying" : model.status;
  const finished = !running;
  const { nodeState, edgeMode } = graphState(model.stages, running, model.active?.stage ?? null, ["failed", "invalid"].includes(status));
  // The inspector follows the agent unless the viewer picked a node.
  const lastDone = [...model.stages].reverse().find(s => s.state === "done" || s.state === "warning");
  // While the agent composes between tool calls, show its latest finished work rather than an empty panel.
  const followed: NodeId = model.active ? NODE_OF_STAGE[model.active.stage] : finished && model.synthesis ? "answer" : lastDone ? NODE_OF_STAGE[lastDone.id] : "agent";
  const selected = picked ?? followed;
  const activeStage = model.active ? WORKFLOW_STAGES.find(s => s.id === model.active!.stage) : null;
  const metricOf = (id: NodeId) => id === "question" ? "submitted" : id === "agent" ? `${model.toolCalls} tool calls` : model.stages.find(s => s.id === NODES.find(n => n.id === id)!.stage)?.metric ?? "";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="workflow-overlay" role="dialog" aria-modal="true" aria-label="Agent workflow">
    <div className="wf-shell">
      <header className="wf-header">
        <div className="wf-title">
          <div className="wf-tabs" role="presentation"><span data-on={!replay}>Live</span><span data-on={replay}>Replay</span></div>
          <div><p className="wf-eyebrow">Agentic workflow · NVIDIA Nemotron + scientific tools</p><h2>{question || "Scientific investigation"}</h2></div>
        </div>
        <div className="wf-stats">
          <span className="wf-status" data-status={status}>{running && <span className="wf-pulse"/>}{STATUS[status] ?? status}</span>
          <span className="wf-stat"><strong>{Math.floor(model.elapsed)}</strong>s</span>
          <span className="wf-stat"><strong>{model.toolCalls}</strong>tool calls</span>
          <button type="button" className="wf-icon-button" onClick={onClose} aria-label="Close workflow view">✕</button>
        </div>
      </header>

      <div className="wf-main">
        <div className="wf-canvas">
          <div className="wf-now">{activeStage ? <><span className="wf-pulse"/><b>{model.active!.label}</b><span>{activeStage.doing}</span></>
            : running ? <><span className="wf-pulse thinking"/><b>Agent reasoning</b><span>choosing the next tool from what it has observed</span></>
            : <><CheckIcon size={12}/><b>{status === "completed" ? "Run complete" : "Run ended"}</b><span>every node reflects a tool outcome from this run</span></>}</div>
          <div className="wf-scroll">
            <svg className="wf-graph" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} style={{ "--zoom": zoom } as CSSProperties} role="img" aria-label="Agent workflow graph">
              <defs>
                <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <linearGradient id="wf-agent-fill" x1="0" x2="1"><stop offset="0" stopColor="#0f2230"/><stop offset="1" stopColor="#11263a"/></linearGradient>
              </defs>
              {EDGES.map(edge => <Edge key={edge.id} d={edge.d} dashed={edge.dashed} mode={edgeMode.get(edge.id) ?? "idle"}/>)}
              {NODES.map(n => <Node key={n.id} id={n.id} label={n.label} x={n.x} y={n.y} shape={n.shape} color={n.color} state={nodeState.get(n.id) ?? "waiting"}
                metric={metricOf(n.id)} selected={selected === n.id} sub={n.id === "agent" ? (model.active?.label ?? (running ? "Reasoning…" : status === "completed" ? "Finished" : "Stopped")) : null}
                count={n.id === "agent" ? model.toolCalls : n.id === "reading" ? model.papers.length : n.id === "extraction" ? model.values.length : null}
                onSelect={() => setPicked(p => p === n.id ? null : n.id)}/>)}
            </svg>
          </div>
          <div className="wf-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom(z => Math.min(1.8, +(z + 0.2).toFixed(1)))} aria-label="Zoom in"><ZoomIcon dir="in"/></button>
            <button type="button" onClick={() => setZoom(z => Math.max(0.8, +(z - 0.2).toFixed(1)))} aria-label="Zoom out"><ZoomIcon dir="out"/></button>
            <button type="button" onClick={() => setZoom(1)} aria-label="Fit graph"><FitIcon/></button>
          </div>
          <ul className="wf-legend" aria-label="Legend"><li><i className="done"/>completed</li><li><i className="active"/>running</li><li><i className="warn"/>rejected / retried</li><li><i className="dash"/>tool call</li></ul>
        </div>

        <aside className="wf-inspector" aria-label="Node details">
          <div className="wf-inspector-head"><span className="wf-dot" style={{ background: NODES.find(n => n.id === selected)!.color }}/>
            <strong>{NODES.find(n => n.id === selected)!.label}</strong><em data-state={nodeState.get(selected)}>{stateWord(nodeState.get(selected))}</em>
            {picked && <button type="button" onClick={() => setPicked(null)}>follow agent</button>}</div>
          <Inspector node={selected} model={model} question={question} running={running}/>
          <RunSoFar node={selected} model={model}/>
        </aside>
      </div>

      <section className="wf-log" aria-label="Tool log">
        <h3>Execution log <small>{model.runId ? `run ${model.runId.slice(4, 12)}` : ""}</small></h3>
        <ol ref={logRef}>{model.log.map(row => <li key={row.id} data-state={row.state}>
          <StageIcon id={row.stage} size={13}/><span className="log-label">{row.label}</span><span className="log-detail">{row.detail ?? ""}</span>
          <span className="log-state">{row.state === "started" ? "running" : row.state.replaceAll("_", " ")}</span><span className="log-time">{row.seconds != null ? `${row.seconds.toFixed(1)}s` : "…"}</span>
        </li>)}{!model.log.length && <li className="log-empty">{submitting ? "Sending the question to the agent…" : "No tool calls yet."}</li>}</ol>
      </section>

      <footer className="wf-footer">
        <p>Every node, link and value comes from a tool call in this run, not a scripted animation. Paper values are candidates checked against their source passage; model inputs show their provenance.</p>
        <div>
          {replay && <button type="button" className="wf-button ghost" onClick={() => setReplayKey(k => k + 1)}>Replay again</button>}
          <button type="button" className="wf-button ghost" onClick={onClose}>{live ? "Continue in background" : "Close"}</button>
          {finished && <button type="button" className="wf-button" onClick={onViewResults}>View results →</button>}
        </div>
      </footer>
    </div>
  </div>, document.body);
}

const stateWord = (s: NodeState | undefined) => ({ waiting: "waiting", active: "running", thinking: "reasoning", done: "completed", warning: "completed with rejections", failed: "failed", skipped: "not run" }[s ?? "waiting"]);

function Edge({ d, dashed, mode }: { d: string; dashed: boolean; mode: EdgeMode }) {
  const moving = mode === "flow" || mode === "call" || mode === "return";
  const reverse = mode === "call";     // dashed paths run tool → agent; a call travels agent → tool
  return <g className="wf-edge" data-mode={mode} data-dashed={dashed}>
    <path className="wf-edge-track" d={d}/>
    <path className="wf-edge-line" d={d}/>
    {moving && [0, 1].map(i => <circle key={i} className="wf-packet" r={2.6}>
      <animateMotion dur={dashed ? "1.6s" : "2.2s"} begin={`${i * (dashed ? 0.8 : 1.1)}s`} repeatCount="indefinite" path={d}
        {...(reverse ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})}/>
    </circle>)}
  </g>;
}

function NodeIcon({ id, size }: { id: NodeId; size: number }) {
  if (id === "agent") return <AgentIcon size={size}/>;
  if (id === "prep") return <BracesIcon size={size}/>;
  if (id === "question") return <StageIcon id="question" size={size}/>;
  return <StageIcon id={id as Exclude<NodeId, "agent" | "prep" | "question">} size={size}/>;
}

function Node({ id, label, x, y, shape, color, state, metric, selected, sub, count, onSelect }: {
  id: NodeId; label: string; x: number; y: number; shape: "square" | "agent" | "circle"; color: string; state: NodeState; metric: string;
  selected: boolean; sub: string | null; count: number | null; onSelect: () => void;
}) {
  const badge = state === "done" ? "ok" : state === "warning" ? "warn" : state === "failed" ? "bad" : null;
  const [w, h] = shape === "agent" ? [240, 92] : shape === "circle" ? [80, 80] : [88, 88];
  return <g className="wf-node" data-state={state} data-shape={shape} data-selected={selected} transform={`translate(${x} ${y})`} onClick={onSelect}
    style={{ ["--node" as string]: color }} tabIndex={0} role="button" aria-label={`${label}: ${stateWord(state)}`}
    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
    {(state === "active" || state === "thinking") && (shape === "circle"
      ? <circle className="wf-halo" r={w / 2 + 10}/> : <rect className="wf-halo" x={-w / 2 - 10} y={-h / 2 - 10} width={w + 20} height={h + 20} rx={shape === "agent" ? 30 : 26}/>)}
    {shape === "circle" ? <circle className="wf-body" r={w / 2}/> : <rect className="wf-body" x={-w / 2} y={-h / 2} width={w} height={h} rx={shape === "agent" ? 22 : 20}/>}
    {state === "thinking" && <rect className="wf-orbit" x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={26} pathLength={100}/>}
    {state === "active" && shape !== "agent" && (shape === "circle" ? <circle className="wf-spin" r={w / 2 + 5} pathLength={100}/>
      : <rect className="wf-spin" x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={24} pathLength={100}/>)}
    {shape === "agent" ? <>
      <g className="wf-icon" transform="translate(-96 -17)"><NodeIcon id={id} size={34}/></g>
      <text className="wf-agent-title" x={-50} y={-4}>AI Agent</text>
      <text className="wf-agent-sub" x={-50} y={16}>{(sub ?? "").length > 26 ? (sub ?? "").slice(0, 25) + "…" : sub}</text>
    </> : <g className="wf-icon" transform={`translate(${shape === "circle" ? -15 : -17} ${shape === "circle" ? -15 : -17})`}>
      <NodeIcon id={id} size={shape === "circle" ? 30 : 34}/></g>}
    {badge && <g className={`wf-badge ${badge}`} transform={`translate(${shape === "circle" ? 28 : w / 2 - 4} ${shape === "circle" ? -28 : -h / 2 + 4})`}>
      <circle r={10}/>{badge === "ok" ? <path d="m-4 0 3 3 5-6" /> : badge === "bad" ? <path d="m-3.5-3.5 7 7m0-7-7 7"/> : <path d="M0-4.5v5m0 3v.5"/>}</g>}
    {count != null && count > 0 && <g className="wf-count" transform={`translate(${shape === "agent" ? w / 2 - 6 : shape === "circle" ? -30 : -w / 2 + 4} ${-h / 2 + (shape === "circle" ? 12 : 4)})`}>
      <rect x={-13} y={-10} width={26} height={20} rx={10}/><text y={4}>{count}</text></g>}
    {shape !== "agent" && <>
      <text className="wf-label" y={h / 2 + 22}>{label}</text>
      <text className="wf-metric" y={h / 2 + 38}>{metric}</text>
    </>}
  </g>;
}

type Model = ReturnType<typeof workflowModel>;
function Inspector({ node, model, question, running }: { node: NodeId; model: Model; question: string; running: boolean }) {
  const papers = <ul className="wf-papers">{model.papers.map(p => <li key={p.key} data-extraction={p.extraction}>
    <span className="wf-doc"><DocIcon size={16}/>{p.extraction === "reading" && <span className="wf-scan"/>}</span>
    <span><b>{p.title}</b><small>{p.access}{p.retrieval ? ` · ${p.retrieval}` : ""} · {{ pending: "awaiting extraction", reading: "under extraction…", not_extracted: "not extracted in this run", values: `${p.values} cited value${p.values === 1 ? "" : "s"}`, no_values: "no usable values", rejected: "proposal rejected by checks", unavailable: "extraction unavailable" }[p.extraction]}</small></span>
  </li>)}</ul>;
  switch (node) {
    case "question": return <div className="wf-pane"><p className="wf-quote">“{question}”</p><p className="wf-muted">The researcher's hypothesis, sent to the agent as written.</p></div>;
    case "prep": return <div className="wf-pane"><p>Resolves the drug and target identity, the route, and which model inputs the question needs.</p>
      <p className="wf-stat-line"><b>{model.stages[0].metric ?? (running ? "working…" : "—")}</b></p></div>;
    case "agent": return <div className="wf-pane"><p>An LLM agent that plans the investigation and calls deterministic scientific tools. It never writes numbers itself; tools and the solver do.</p>
      <dl className="wf-facts"><dt>Model</dt><dd>NVIDIA Nemotron (LangChain)</dd><dt>Tool calls</dt><dd>{model.toolCalls}</dd><dt>Elapsed</dt><dd>{Math.floor(model.elapsed)} s</dd>
        <dt>Now</dt><dd>{model.active?.label ?? (running ? "reasoning" : "finished")}</dd></dl></div>;
    case "search": return <div className="wf-pane"><p>Searches Europe PMC for papers about the drug, its pharmacokinetics and target binding.</p>
      <p className="wf-stat-line"><b>{model.stages[1].metric ?? (running ? "searching…" : "not run")}</b></p>{model.papers.length ? <><p className="wf-sub">Selected for reading</p>{papers}</> : null}</div>;
    case "reading": return <div className="wf-pane">{model.papers.length ? papers : <Empty text={model.edit ? "Experiment changes reuse the stored evidence." : "Papers appear as the agent retrieves them."}/>}</div>;
    case "extraction": return <div className="wf-pane">{model.values.length ? <><p className="wf-sub">Extracted from paper text and verified against the quoted passage</p>
      <ul className="wf-values">{model.values.map(v => <li key={v.parameter + v.display} data-matches={v.matches}><span>{v.label}</span><b>{v.display}</b>{v.matches && <em><CheckIcon size={10}/> matches model input</em>}</li>)}</ul></>
      : <Empty text={model.stages[3].calls ? "No values accepted yet; rejected proposals are retried or reported." : "Values appear as the agent extracts them."}/>}</div>;
    case "model": return <div className="wf-pane">{model.shownInputs.length ? <><p className="wf-sub">{model.audited ? "Audited reference inputs (extractions are compared, not substituted)" : "Inputs the solver uses"}</p>
      <ul className="wf-inputs">{model.shownInputs.map(i => <li key={i.key} data-confirmed={i.confirmed}><span>{i.label}{i.changed && <em>{i.scenario ?? "alternative"}</em>}{i.confirmed && <em className="ok"><CheckIcon size={9}/> extracted</em>}</span>
        <b>{i.display}</b><small>{i.reviewed ? "reviewed" : i.provenance}{i.sources.length ? ` · ${i.sources.join(", ")}` : ""}</small></li>)}</ul>
      {model.hiddenInputs > 0 && <p className="wf-muted">+{model.hiddenInputs} more inputs in the investigation panel</p>}</> : <Empty text="The configured experiment appears here."/>}</div>;
    case "simulation": return <div className="wf-pane">{model.metrics.length ? <ul className="wf-bars">{model.metrics.map(m => <li key={m.scenarioId}>
      <span>{m.label}</span><span className="wf-track"><span className="wf-fill" style={{ width: `${Math.max(2, m.occupancy * 100)}%`, background: scenarioColor(m.scenarioId, m.index) }}/>
        {model.threshold != null && <span className="wf-threshold" style={{ left: `${model.threshold * 100}%` }}/>}</span><b>{(m.occupancy * 100).toFixed(1)}%</b></li>)}
      <li className="wf-muted">Endpoint target occupancy · line = {model.threshold != null ? Math.round(model.threshold * 100) : "–"}% threshold</li></ul> : <Empty text="Solver results appear when the simulation runs."/>}</div>;
    case "structure": return <div className="wf-pane">{model.structure ? (model.structure.available ? <dl className="wf-facts"><dt>PDB entry</dt><dd>{model.structure.pdb_id}</dd>
      <dt>Interface contacts</dt><dd>{model.structure.interface_residue_pair_count ?? "–"} residue pairs ≤ 4 Å</dd><dt>Measurements</dt><dd>{model.structure.measurement_ids?.length ?? 0} from deposited coordinates</dd></dl>
      : <p>No verified experimental structure for this drug and target; the simulation is unaffected.</p>) : <Empty text="The agent inspects the experimental drug–target structure."/>}</div>;
    case "answer": return <div className="wf-pane">{model.synthesis ? <p>{model.synthesis.status === "grounded" ? "Grounded answer written: every claim links to a paper quote, a solver value or a structure measurement." : `Written answer ${model.synthesis.status}; the tool results still stand.`}</p>
      : <Empty text="Written last, from the results above."/>}</div>;
  }
}

/** The evidence gathered so far, so the panel is never empty while the agent works; skips the selected node's own view. */
function RunSoFar({ node, model }: { node: NodeId; model: Model }) {
  const papers = node !== "reading" && node !== "search" && model.papers.length > 0;
  const values = node !== "extraction" && model.values.length > 0;
  const results = node !== "simulation" && model.metrics.length > 0;
  const structure = node !== "structure" && model.structure?.available;
  if (!papers && !values && !results && !structure) return null;
  return <section className="wf-sofar" aria-label="Run so far">
    <h4>Run so far</h4>
    {papers && <div><span className="wf-sofar-label"><StageIcon id="reading" size={13}/> {model.papers.length} paper{model.papers.length === 1 ? "" : "s"} read</span>
      <ul className="wf-sofar-papers">{model.papers.map(p => <li key={p.key} data-extraction={p.extraction}>{p.title}</li>)}</ul></div>}
    {values && <div><span className="wf-sofar-label"><StageIcon id="extraction" size={13}/> {model.values.length} cited value{model.values.length === 1 ? "" : "s"}</span>
      <ul className="wf-values compact">{model.values.map(v => <li key={v.parameter + v.display} data-matches={v.matches}><span>{v.label}</span><b>{v.display}</b>{v.matches && <em><CheckIcon size={9}/> matches input</em>}</li>)}</ul></div>}
    {results && <div><span className="wf-sofar-label"><StageIcon id="simulation" size={13}/> Endpoint occupancy</span>
      <ul className="wf-sofar-results">{model.metrics.map(m => <li key={m.scenarioId}><i style={{ background: scenarioColor(m.scenarioId, m.index) }}/>{m.label}<b>{(m.occupancy * 100).toFixed(1)}%</b></li>)}</ul></div>}
    {structure && <div><span className="wf-sofar-label"><StageIcon id="structure" size={13}/> PDB {model.structure!.pdb_id} · {model.structure!.interface_residue_pair_count ?? "–"} contacts</span></div>}
  </section>;
}

function Empty({ text }: { text: string }) {
  return <div className="wf-empty"><span/><span/><span/><p>{text}</p></div>;
}

export { CrossIcon };
