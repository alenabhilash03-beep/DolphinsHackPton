"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ExperimentConfig, SimulationResult, Interpretation } from "../lib/contracts";
import { useExperimentWorkspace } from "../hooks/useExperimentWorkspace";
import { useSimulationTimeline } from "../hooks/useSimulationTimeline";
import { ScientificPlot } from "./ScientificPlot";
import { TimelineControls } from "./TimelineControls";
import { PreviewControls } from "./PreviewControls";
import { EvidencePanel } from "./EvidencePanel";
import { ScenarioComparison } from "./ScenarioComparison";
import { BindingCanvas } from "./BindingCanvas";
import { VisualizationBoundary } from "./VisualizationBoundary";
import { ResultOverview } from "./ResultOverview";
import { PaperSummaries } from "./PaperSummaries";

type View = "simulation" | "evidence" | "structure" | "details";
const VIEWS: {id:View; label:string; hint:string}[] = [
  {id:"simulation",label:"Simulation",hint:"Exposure, occupancy & playback"},
  {id:"evidence",label:"Evidence",hint:"Papers, citations & model inputs"},
  {id:"structure",label:"Molecular structure",hint:"Experimental geometry & contacts"},
  {id:"details",label:"Model details",hint:"Full metrics & assumptions"},
];

export function PlotPreview({ initialExperiment, initialResult = null, onResultIdChange, onResultChange, editingLocked = false, structure, interpretation }: {
  initialExperiment: ExperimentConfig; initialResult?: SimulationResult | null;
  onResultIdChange?: (resultId: string | null) => void;
  onResultChange?: (result: SimulationResult | null, scenarioId: string | null, busy: boolean) => void;
  editingLocked?: boolean; structure?:ReactNode; interpretation?:Interpretation|null;
}) {
  const [focusPlot,setFocusPlot]=useState(false),[view,setView]=useState<View>("simulation");
  const [structureVisited,setStructureVisited]=useState(false);
  const workspace = useExperimentWorkspace(initialExperiment, 600, initialResult);
  useEffect(() => onResultIdChange?.(workspace.result?.result_id ?? null), [workspace.result?.result_id, onResultIdChange]);
  useEffect(() => onResultChange?.(workspace.result, workspace.selectedScenarioId, workspace.busy), [workspace.result, workspace.selectedScenarioId, workspace.busy, onResultChange]);
  const timeline = useSimulationTimeline(workspace.result);
  useEffect(()=>{
    const sync=()=>{
      const hash=window.location.hash;
      if(hash==="#structure"){setView("structure");setStructureVisited(true);}
      else if(hash==="#paper-evidence")setView("evidence");
      else if(hash==="#model-details")setView("details");
      else if(hash==="#experiment"||hash.startsWith("#plot-"))setView("simulation");
      else return;
      // Reveal the target before native anchor scrolling completes.
      requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({block:"start"}));
    };
    sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);
  },[]);
  function selectView(next:View){setView(next);if(next==="structure")setStructureVisited(true);window.history.replaceState(null,"",next==="structure"?"#structure":next==="evidence"?"#paper-evidence":next==="details"?"#model-details":"#experiment");}
  useEffect(()=>{if(view!=="simulation")timeline.pause();},[view,timeline.pause]);
  const currentInterpretation=interpretation?.result_id===workspace.result?.result_id ? interpretation : null;
  return <main id="experiment" className="experiment-panel">
    {workspace.result && <ResultOverview result={workspace.result} busy={workspace.busy}/>}
    <div className="workspace-viewbar" role="tablist" aria-label="Experiment views">{VIEWS.map(item=><button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={view===item.id} aria-controls={`view-${item.id}`} tabIndex={view===item.id?0:-1}
      onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const index=VIEWS.findIndex(v=>v.id===view);const next=event.key==="Home"?0:event.key==="End"?VIEWS.length-1:(index+(event.key==="ArrowRight"?1:-1)+VIEWS.length)%VIEWS.length;selectView(VIEWS[next].id);document.getElementById(`tab-${VIEWS[next].id}`)?.focus();}}}
      onClick={()=>selectView(item.id)}>{item.label}<span>{item.hint}</span></button>)}</div>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    <div id="view-simulation" role="tabpanel" aria-labelledby="tab-simulation" hidden={view!=="simulation"}>
      <div className="simulation-heading"><div><h2>Exposure & target engagement</h2><p>Compare scenarios using the shared timeline.</p></div><div className="simulation-actions"><a href="#revise">Edit in words ↑</a><button type="button" aria-controls="experiment-conditions" aria-expanded={!focusPlot} onClick={()=>setFocusPlot(v=>!v)}>{focusPlot?"Show parameters":"Hide parameters"}</button></div></div>
      <div className={`experiment-layout ${focusPlot?"plot-focused":""}`}><aside id="experiment-conditions" className="controls-panel" hidden={focusPlot}><fieldset disabled={editingLocked} style={{border:0,padding:0,margin:0}}><PreviewControls workspace={workspace}/></fieldset></aside><div className="experiment-results">
        {workspace.result ? <>
          <TimelineControls timeline={timeline}/>
          <div className="plots-grid">{(["concentration","occupancy"] as const).map(kind=><section id={`plot-${kind}`} className="chart-card" key={kind} aria-label={`${kind} comparison`}>
            <div className="chart-heading"><h3>{kind==="concentration"?"Drug concentration":"Target occupancy"}</h3><a href="#paper-evidence">Evidence ↗</a></div>
            <p>{kind==="concentration"?"Central exposure · nM":"Prescribed site exposure + binding kinetics · %"}</p>
            <VisualizationBoundary label={`${kind} plot`}><ScientificPlot result={workspace.result!} kind={kind} cursorTimeHours={timeline.timeHours} revealProgress={timeline.revealCurves} onSeekTime={timeline.seekTime}/></VisualizationBoundary>
          </section>)}</div>
          <details className="binding-disclosure"><summary>Binding population & values at {timeline.timeDays.toFixed(2)} days <span>Model-driven schematic</span></summary>
            <BindingCanvas result={workspace.result} index={timeline.index} scenarioId={workspace.selectedScenarioId}/>
            <ul>{timeline.readout?.scenarios.map(s=><li key={s.scenarioId}>{s.label}: {s.centralConcentrationNM.toFixed(3)} nM central; {(s.occupancyFraction*100).toFixed(2)}% occupied</li>)}</ul>
          </details>
        </>:<p role="status">Calculating simulation…</p>}
      </div></div>
    </div>
    <div id="view-evidence" role="tabpanel" aria-labelledby="tab-evidence" hidden={view!=="evidence"}>
      {currentInterpretation && <section className="agent-findings"><h2>Research interpretation</h2><ul>{currentInterpretation.claims.map(c=><li key={c}>{c}</li>)}</ul>
        {!!currentInterpretation.paper_summaries?.length && <PaperSummaries summaries={currentInterpretation.paper_summaries} experiment={workspace.experiment}/>}
        <details><summary>Agent assumptions, limitations & next experiments</summary><ul>{[...currentInterpretation.assumptions,...currentInterpretation.limitations,...currentInterpretation.follow_up_experiments].map((c,i)=><li key={i}>{c}</li>)}</ul></details>
      </section>}
      <EvidencePanel experiment={workspace.experiment} scenarioId={workspace.selectedScenarioId} resultPresent={!!workspace.result} showSummaries={!currentInterpretation?.paper_summaries?.length}/>
    </div>
    <div id="view-structure" role="tabpanel" aria-labelledby="tab-structure" hidden={view!=="structure"}>{structureVisited && (structure ?? <p>No experimental structure is configured.</p>)}</div>
    <div id="view-details" role="tabpanel" aria-labelledby="tab-details" hidden={view!=="details"}>{workspace.result && <ScenarioComparison result={workspace.result} busy={workspace.busy}/>}</div>
    <details className="result-record"><summary>Result provenance & identifiers</summary><p>{workspace.result?.result_id ?? "Pending"} · {workspace.experiment.drug} → {workspace.experiment.target}</p><p>Conditional mathematical model. All endpoint values are deterministic predictions; the occupancy threshold is analytical.</p></details>
  </main>;
}
