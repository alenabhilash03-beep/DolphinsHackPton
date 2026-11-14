"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AgentJob, AgentTurn, AgentResearchRequest, AgentEditRequest, DemoSnapshot, ExperimentConfig, PreparationRecord, PreparationUpdate, SimulationResult, Interpretation } from "../lib/contracts";
import { RequestEpoch, linkedTurnResult, structureKind } from "../lib/agent-workspace";
import { PlotPreview } from "./PlotPreview";
import { StructureViewer } from "./StructureViewer";
import { VisualizationBoundary } from "./VisualizationBoundary";
import { DrugSupportPanel } from "./DrugSupportPanel";
import { PreparationAnswers } from "./PreparationAnswers";
const PRIMARY="Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?";
const STORAGE="hypothesim-agent-job-v1";
const SCIENCE_REQUEST="hypothesim-scientific-request-v1";

export function HypothesisWorkspace({ fallbackExperiment }: { fallbackExperiment: ExperimentConfig }) {
  const [text,setText]=useState(PRIMARY),[drug,setDrug]=useState("trastuzumab"),[target,setTarget]=useState("HER2"),[route,setRoute]=useState("iv_infusion");
  const [baseline,setBaseline]=useState(false);
  const [researchOpen,setResearchOpen]=useState(false);
  useEffect(()=>{const reveal=()=>{if(window.location.hash==="#research")setResearchOpen(true);if(window.location.hash==="#revise"){const element=document.getElementById("revise") as HTMLDetailsElement|null;if(element)element.open=true;}};reveal();window.addEventListener("hashchange",reveal);return()=>window.removeEventListener("hashchange",reveal);},[]);
  const [job,setJob]=useState<AgentJob|null>(null),[jobId,setJobId]=useState<string|null>(null);
  const [turn,setTurn]=useState<AgentTurn|null>(null),[record,setRecord]=useState<PreparationRecord|null>(null);
  const [prepared,setPrepared]=useState<SimulationResult|null>(null),[shown,setShown]=useState<SimulationResult|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[controlBusy,setControlBusy]=useState(false);
  const [explanation,setExplanation]=useState<Interpretation|null>(null);
  const [message,setMessage]=useState<string|null>(null),[submitting,setSubmitting]=useState(false),[saved,setSaved]=useState(false);
  const [resumeId,setResumeId]=useState("");
  const [edit,setEdit]=useState("Run this comparison for 120 days");
  const epoch=useRef(new RequestEpoch()), activeTicket=useRef(0), activeJob=useRef<string|null>(null);
  const [structureIdentity,setStructureIdentity]=useState({drug:fallbackExperiment.drug,target:fallbackExperiment.target});
  const busy=submitting || job?.status==="queued" || job?.status==="running";
  const visible=shown?.configuration ?? prepared?.configuration ?? fallbackExperiment;
  const acceptTurn=useCallback((next:AgentTurn)=>{
    const result=linkedTurnResult(next);
    setTurn(next); setRecord(next.preparation ?? null);
    if (next.preparation) {
      const request=next.preparation.preparation.request;
      setStructureIdentity({drug:request.drug_name,target:request.target ?? ""});
      setDrug(request.drug_name);setTarget(request.target ?? "");setRoute(request.route ?? "");setText(request.original_hypothesis);
    }
    if(result) {
      setPrepared(result); setShown(result); setExplanation(next.interpretation ?? null); setSaved(false);
      setStructureIdentity({drug:result.configuration.drug,target:result.configuration.target});
    }
  },[]);
  useEffect(()=>{
    if(!record)return;
    const request=record.preparation.request;
    try{localStorage.setItem(SCIENCE_REQUEST,JSON.stringify(request));}catch{}
    setDrug(request.drug_name);setTarget(request.target ?? "");setRoute(request.route ?? "");setText(request.original_hypothesis);
    setStructureIdentity({drug:request.drug_name,target:request.target ?? ""});
  },[record]);
  useEffect(()=>{
    try {
      const original=JSON.parse(localStorage.getItem(SCIENCE_REQUEST) ?? "null");
      if(original && typeof original.drug_name==="string" && typeof original.original_hypothesis==="string") {
        setDrug(original.drug_name);setTarget(original.target ?? "");setRoute(original.route ?? "");setText(original.original_hypothesis);
      }
      const id=localStorage.getItem(STORAGE);
      if(id && /^[a-f0-9]{32}$/.test(id)) { activeTicket.current=epoch.current.next();activeJob.current=id;setJobId(id); }
    } catch { /* Local storage is optional. */ }
    return ()=>{epoch.current.next();};
  },[]);
  useEffect(()=>{
    if(!jobId) return;
    let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const abort=new AbortController(),ticket=activeTicket.current;
    async function poll() {
      try {
        const response=await fetch(`/api/agent/jobs/${jobId}`,{cache:"no-store",signal:abort.signal});
        if(response.status===404 && epoch.current.current(ticket)) {
          setJob({job_id:jobId!,status:"failed",mode:"research",updated_at:new Date().toISOString()});
          activeJob.current=null;setJobId(null);
          try{localStorage.removeItem(STORAGE);}catch{}
          setMessage("Saved research job is unavailable. Start a new research request.");return;
        }
        if(!response.ok) throw new Error("Research status temporarily unavailable; retrying.");
        const next=await response.json() as AgentJob;
        if(closed || !epoch.current.current(ticket) || activeJob.current!==jobId) return;
        setJob(next);setMessage(null);
        if(next.research_request) {
          const request=next.research_request.request;
          setDrug(request.drug_name);setTarget(request.target ?? "");setRoute(request.route ?? "");setText(request.original_hypothesis);
          setBaseline(next.research_request.structured_baseline ?? false);
          setStructureIdentity({drug:request.drug_name,target:request.target ?? ""});
        }
        if(next.edit_text) setEdit(next.edit_text);
        if(next.status==="completed" && next.turn) {acceptTurn(next.turn);return;}
        if(next.status==="failed") {
          setMessage(next.error_message ?? "Research failed; prior curves remain available.");
          if(next.preparation_id) {
            const read=await fetch(`/api/preparations/${next.preparation_id}`,{cache:"no-store",signal:abort.signal});
            if(read.ok && epoch.current.current(ticket)) setRecord(await read.json() as PreparationRecord);
          }
          return;
        }
      } catch(e) {
        if(closed || !epoch.current.current(ticket)) return;
        setMessage(e instanceof Error ? e.message : "Could not read research status.");
      }
      if(!closed) timer=setTimeout(()=>void poll(),1500);
    }
    void poll();
    return ()=>{closed=true;abort.abort();clearTimeout(timer);};
  },[jobId,acceptTurn]);
  async function submitJob(mode:"research"|"edits",body:AgentResearchRequest|AgentEditRequest) {
    if(busy) return;
    const ticket=epoch.current.next(); activeTicket.current=ticket;activeJob.current=null;setJobId(null);
    setSubmitting(true);setMessage(null);setJob(null);setSaved(false);
    try {
      const response=await fetch(`/api/agent/jobs/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(typeof data.detail==="string" ? data.detail : "Check the scientific request fields.");
      if(!epoch.current.current(ticket)) return;
      const next=data as AgentJob;activeJob.current=next.job_id;setJob(next);setJobId(next.job_id);
      try{localStorage.setItem(STORAGE,next.job_id);}catch{}
    } catch(e) {if(epoch.current.current(ticket))setMessage(e instanceof Error ? e.message : "Research unavailable; previous curves remain visible.");}
    finally{if(epoch.current.current(ticket))setSubmitting(false);}
  }
  function research(event:FormEvent) {
    event.preventDefault();
    setTurn(null);setRecord(null);
    try{localStorage.setItem(SCIENCE_REQUEST,JSON.stringify({drug_name:drug.trim(),target:target.trim() || null,route:route || null,original_hypothesis:text}));}catch{}
    setStructureIdentity({drug,target});
    void submitJob("research",{request:{drug_name:drug.trim(),target:target.trim() || null,route:route || null,molecular_form:null,endpoint:"target_occupancy",original_hypothesis:text},structured_baseline:baseline,client_revision:0});
  }
  function continueResearch(update:PreparationUpdate) {
    if(!record)return;
    void submitJob("research",{request:record.preparation.request,preparation_id:record.preparation.preparation_id,researcher_update:update,structured_baseline:true,client_revision:0});
  }
  async function loadPreparation() {
    if(!/^prep-[a-f0-9]{32}$/.test(resumeId.trim())) {setMessage("Enter a valid saved preparation ID.");return;}
    const ticket=epoch.current.next();activeTicket.current=ticket;activeJob.current=null;setJobId(null);setJob(null);
    try {
      const response=await fetch(`/api/preparations/${resumeId.trim()}`,{cache:"no-store"});
      if(!response.ok)throw new Error("Saved preparation unavailable. Check its ID.");
      const next=await response.json() as PreparationRecord;
      if(epoch.current.current(ticket)){setRecord(next);setMessage("Preparation restored. Review its current inputs and explicitly authorize continuation.");}
    } catch(e){setMessage(e instanceof Error?e.message:"Could not restore preparation.");}
  }
  async function reloadPreparation() {
    if(!record)return;
    const ticket=activeTicket.current;
    try{
      const response=await fetch(`/api/preparations/${record.preparation.preparation_id}`,{cache:"no-store"});
      if(!response.ok)throw new Error("Preparation could not be reloaded.");
      const next=await response.json() as PreparationRecord;
      if(epoch.current.current(ticket)){setRecord(next);setMessage("Latest preparation loaded. Review its current missing inputs before continuing.");}
    }catch(e){setMessage(e instanceof Error?e.message:"Could not reload preparation.");}
  }
  async function openDemo() {
    const ticket=epoch.current.next();activeTicket.current=ticket;activeJob.current=null;setJobId(null);setJob(null);setSubmitting(false);
    try{localStorage.removeItem(STORAGE);localStorage.removeItem(SCIENCE_REQUEST);}catch{}
    try{
      const response=await fetch("/demo/trastuzumab-demo.json",{cache:"no-store"});
      if(!response.ok)throw new Error("Saved demo is unavailable.");
      const demo=await response.json() as DemoSnapshot;
      if(demo.result.result_id!==demo.interpretation.result_id || demo.experiment.experiment_id!==demo.result.configuration.experiment_id)throw new Error("Saved demo linkage is invalid.");
      if(!epoch.current.current(ticket))return;
      setPrepared(demo.result);setShown(demo.result);setExplanation(demo.interpretation);setTurn(null);setRecord(null);setSaved(true);setMessage(null);setText(PRIMARY);setDrug("trastuzumab");setTarget("HER2");setRoute("iv_infusion");setBaseline(false);
      setStructureIdentity({drug:demo.experiment.drug,target:demo.experiment.target});
    }catch(e){if(epoch.current.current(ticket))setMessage(e instanceof Error?e.message:"Could not load saved demo.");}
  }
  const onResult=useCallback((result:SimulationResult|null,scenario:string|null,pending:boolean)=>{setShown(result);setSelected(scenario);setControlBusy(pending);},[]);
  function submitEdit(event:FormEvent) {
    event.preventDefault();if(!shown || controlBusy)return;
    void submitJob("edits",{base_result_id:shown.result_id,base_experiment_id:shown.configuration.experiment_id,base_configuration_sha256:shown.configuration_hash,
      client_revision:shown.client_revision+1,selected_scenario_id:selected,text:edit});
  }
  const currentInterpretation=explanation?.result_id===shown?.result_id ? explanation : null;
  const structure=structureKind(structureIdentity.drug,structureIdentity.target);
  return <div id="workspace" className="hypothesim-workspace editorial-workspace">
    <aside className="workspace-rail" aria-label="Research navigation"><a href="/" className="rail-monogram" aria-label="Hypothesim home">h.</a><span className="rail-caption">Workspace</span><nav><a href="#research"><span>01</span>Question</a><a href="#experiment"><span>02</span>Simulation</a><a href="#structure"><span>03</span>Structure</a></nav><a href="/#start" className="rail-home">Start page ↗</a></aside>
    <header className="workspace-header"><a className="workspace-brand" href="/">hypothesim<span>.</span></a><nav aria-label="Workspace sections"><a href="#research">Research</a><a href="#experiment">Results</a><a href="#paper-evidence">Evidence</a><a href="#structure">Molecule</a></nav><span className="workspace-badge">Research workspace</span></header>
    <div className="workspace-intro" data-journey-reveal><div><p className="eyebrow">Scientific exploration console</p><h1>Experiment workspace</h1><p>Evidence → exposure → target engagement</p></div><span className="workspace-badge">{busy?"Agent researching":saved?"Saved reviewed demo":"Interactive model"}</span></div>
    <details className="workspace-assessment"><summary>Drug and model assessment <span>Identity, route, and supported endpoints</span></summary><DrugSupportPanel /></details>
    <section id="research" className="research-panel" aria-label="Hypothesis research"><details className="question-disclosure" open={researchOpen} onToggle={e=>setResearchOpen(e.currentTarget.open)}><summary><span><span className="eyebrow">Research question · {drug || "Drug unspecified"}{target?` / ${target}`:""}</span><strong>{text || "Enter your scientific hypothesis"}</strong></span><span className="disclosure-action">{researchOpen?"Close editor":"Edit hypothesis"}</span></summary>
      <div className="research-layout"><form onSubmit={research}><fieldset disabled={busy} style={{border:0,padding:0}}>
        <label>Scientific hypothesis<textarea required maxLength={12000} value={text} onChange={e=>setText(e.target.value)} rows={4}/></label>
        <div className="form-grid"><label>Drug name<input required maxLength={200} value={drug} onChange={e=>setDrug(e.target.value)}/></label><label>Biological target (optional)<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
          <label>Administration route<select value={route} onChange={e=>setRoute(e.target.value)}><option value="">Unspecified — ask the agent</option><option value="iv_infusion">IV infusion</option><option value="hypothetical_iv_bolus">Hypothetical IV bolus</option><option value="oral">Oral (model assessment only)</option><option value="subcutaneous">Subcutaneous (model assessment only)</option></select></label></div>
        <label><input type="checkbox" checked={baseline} onChange={e=>setBaseline(e.target.checked)}/> Prepare a baseline experiment first, using compatible evidence and assumptions I explicitly supply.</label>
        <p className="scope-note">Other interventions may need clarification or a subsequent experiment edit. Unsupported models never receive fabricated curves.</p>
        <div className="form-actions"><button className="primary-button" disabled={busy}>{busy?"Research in progress…":"Research hypothesis →"}</button><button type="button" className="quiet-button" onClick={()=>{setDrug("imatinib");setTarget("ABL1");setRoute("hypothetical_iv_bolus");setBaseline(false);setText("How would hypothetical bloodstream imatinib input affect ABL1 occupancy? Research evidence and identify missing PK, binding and target-site exposure data.");}}>Try imatinib research</button>
        <button type="button" className="quiet-button" onClick={()=>{setText(PRIMARY);setDrug("trastuzumab");setTarget("HER2");setRoute("iv_infusion");setBaseline(false);}}>Use trastuzumab example</button></div>
      </fieldset></form>
      <section className="activity-panel" aria-label="Agent activity" aria-live="polite"><div className="activity-heading"><span className={`status-dot ${busy?"active":""}`}/><h3>Research record</h3><span>{job?.status==="completed" ? turn?.status ?? "Finished" : job?.status ?? "Ready"}</span></div>
        <p>{busy?"Nemotron is working through scientific tools. Curves change only after a validated numerical result returns.":saved?"Saved reviewed demo; no live research was run for this view.":turn?`Scientific status: ${turn.status}. Review the returned evidence and questions below.`:"Start research or open the saved demo."}</p>
        {job?.events?.length ? <ol>{job.events.map((event,i)=><li key={i}>{event}</li>)}</ol>:<p>Identity → papers → cited candidates → model assessment → numerical tool</p>}
        {turn && <details><summary>Agent record · {turn.status}</summary><p>Turn: {turn.turn_id}</p><p>Trace: {turn.trace_status} · {turn.trace_id ?? "not collected"}</p><p>Tools: {(turn.tool_calls ?? []).join(", ")}</p></details>}
      </section></div>
      </details><div className="demo-entry"><div><h3>Trastuzumab / HER2 demo</h3><p>Reviewed reference inputs · hypothetical alternatives · interactive results</p></div><button className="saved-demo-button" type="button" onClick={()=>void openDemo()}>Load saved demo</button><a href="#experiment">Go to simulation ↓</a></div>
      <details><summary>Resume a saved preparation</summary><label>Preparation ID<input value={resumeId} onChange={e=>setResumeId(e.target.value)} placeholder="prep-…"/></label><button type="button" disabled={!!busy} onClick={()=>void loadPreparation()}>Load preparation</button></details>
      {message && <p role="alert">{message}</p>}
      {turn?.questions?.length ? <section aria-label="Agent questions"><h3>What is needed next</h3><ul>{turn.questions.map(q=><li key={q}>{q}</li>)}</ul></section>:null}
      {record && <PreparationAnswers key={`${record.preparation.preparation_id}:${record.preparation.revision}`} record={record} busy={!!busy} onContinue={continueResearch} onReload={()=>void reloadPreparation()}/>}
      {explanation && !currentInterpretation && <p className="scope-note">The earlier explanation belongs to a different result. Current curves reflect your direct parameter changes.</p>}
    </section>
    <details id="revise" className="research-panel experiment-revision" onToggle={e=>{if(e.currentTarget.open)e.currentTarget.querySelector("input")?.focus();}}><summary>Change the experiment in words <span>Dose, affinity, schedule or duration</span></summary><p>Edits apply to the displayed result. The baseline stays protected; selected alternative: <strong>{visible.scenarios.find(s=>s.scenario_id===selected)?.label ?? "none"}</strong>.</p>
      <form onSubmit={submitEdit}><label>Experimental edit<input required disabled={!!busy} value={edit} onChange={e=>setEdit(e.target.value)} placeholder="Run this comparison for 120 days"/></label><button className="primary-button" disabled={!!busy || !shown || controlBusy}>Apply edit & simulate</button></form>
      <details><summary>Supported examples</summary><ul>{["Double the dose in the affinity alternative","Use a 21-day dosing interval in that alternative","Compare twofold and fivefold affinity improvement at fixed association rate","Run this comparison for 120 days"].map(s=><li key={s}><button type="button" disabled={!!busy} onClick={()=>setEdit(s)}>{s}</button></li>)}</ul><p>Unrecognized wording or extra instructions request clarification. Changes of drug, target or route require new research above.</p></details>
      {turn?.applied_changes?.length ? <ul>{turn.applied_changes.map(s=><li key={s}>{s}</li>)}</ul>:null}
    </details>
    <div className="saved-demo-banner" role="status"><span className="status-dot"/><strong>Displayed experiment</strong> {visible.drug} → {visible.target}{busy && <span> · Research pending; showing the last successful curves.</span>}</div>
    <PlotPreview key={prepared?.result_id ?? "fallback"} initialExperiment={prepared?.configuration ?? fallbackExperiment} initialResult={prepared} onResultChange={onResult} editingLocked={!!busy} interpretation={currentInterpretation}
      structure={structure!=="unavailable" ? <VisualizationBoundary key={structure} label="Experimental structure"><StructureViewer kind={structure}/></VisualizationBoundary> : <section id="structure" className="structure-panel"><h2>Experimental structure unavailable</h2><p>No verified cached drug–target complex is available for {structureIdentity.drug} → {structureIdentity.target || "unspecified target"}. Compatible numerical models can still run without a structure.</p></section>}/>
    <footer className="workspace-footer">Hypothesim · Conditional scientific exploration · Predictions are model outputs.</footer>
  </div>;
}
