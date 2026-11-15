"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AgentJob, AgentTurn, AgentResearchRequest, AgentEditRequest, DemoSnapshot, ExperimentProposal, InvestigationHistory, StoredResult, ExperimentConfig, PreparationRecord, PreparationUpdate, SimulationResult, Interpretation } from "../lib/contracts";
import { RequestEpoch, linkedTurnResult, structureKind, researchRouteNotice } from "../lib/agent-workspace";
import { PlotPreview } from "./PlotPreview";
import { StructureViewer, type ViewerFocus } from "./StructureViewer";
import { VisualizationBoundary } from "./VisualizationBoundary";
import { DrugSupportPanel } from "./DrugSupportPanel";
import { PreparationAnswers } from "./PreparationAnswers";
import { InvestigationPanel } from "./InvestigationPanel";
import { ResearchPaperReview } from "./ResearchPaperReview";
import { investigationView } from "../lib/investigation";
import { ScientificAnswer } from "./ScientificAnswer";
import { answerState, type MeasurementCard } from "../lib/synthesis-view";
import { NextExperimentProposals } from "./NextExperimentProposals";
import { proposalRequest } from "../lib/proposal-view";
import { InvestigationHistoryPanel } from "./InvestigationHistoryPanel";
import { branchRequired, historyFor } from "../lib/history-view";
const PRIMARY="Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?";
const STORAGE="hypothesim-agent-job-v1";
const SCIENCE_REQUEST="hypothesim-scientific-request-v1";
const DISPLAYED="hypothesim-displayed-result-v1";

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
  const [structureFocus,setStructureFocus]=useState<ViewerFocus|null>(null);
  const [history,setHistory]=useState<InvestigationHistory|null>(null);
  const reopenTicket=useRef(0), restoreResult=useRef<string|null>(null);
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
      const displayed=localStorage.getItem(DISPLAYED);
      if(displayed && /^[A-Za-z0-9-]{1,120}$/.test(displayed)) restoreResult.current=displayed;
      const id=localStorage.getItem(STORAGE);
      // No saved job: restore the last displayed result directly (for example after direct control edits).
      if(!(id && /^[a-f0-9]{32}$/.test(id)) && restoreResult.current){const saved=restoreResult.current;restoreResult.current=null;void reopen(saved,true);}
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
        if(next.status==="completed" && next.turn) {
          const execution=investigationView(next);
          if(execution.invalid || (!execution.legacy && next.turn.status==="completed" && !execution.accepted)){setMessage("Agent execution/result linkage could not be verified. Earlier curves are preserved.");return;}
          acceptTurn(next.turn);
          // After a reload, return to the result that was on screen if it was a later step than this job's.
          const saved=restoreResult.current;restoreResult.current=null;
          if(saved && saved!==next.turn.result?.result_id)void reopen(saved,true);
          return;
        }
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
  // Reopen a stored result exactly as computed, with the answer of the turn that produced it. Nothing is rerun.
  async function reopen(resultId:string,quiet=false) {
    const ticket=++reopenTicket.current;
    try {
      const response=await fetch(`/api/agent/results/${encodeURIComponent(resultId)}`,{cache:"no-store"});
      if(!response.ok)throw new Error("That stored result is no longer available.");
      const stored=await response.json() as StoredResult;
      let producing:AgentTurn|null=null;
      if(stored.turn_id){const read=await fetch(`/api/agent/turns/${stored.turn_id}`,{cache:"no-store"});if(read.ok)producing=await read.json() as AgentTurn;}
      if(ticket!==reopenTicket.current)return;   // a newer reopen request wins
      setPrepared(stored.result);setShown(stored.result);setTurn(producing);setExplanation(producing?.interpretation ?? null);setRecord(null);setSaved(false);
      setStructureIdentity({drug:stored.result.configuration.drug,target:stored.result.configuration.target});
      if(!quiet){setMessage(null);requestAnimationFrame(()=>document.getElementById(producing?.synthesis?"answer":"experiment")?.scrollIntoView({block:"start",behavior:"auto"}));}
    } catch(e){if(ticket===reopenTicket.current&&!quiet)setMessage(e instanceof Error?e.message:"Could not reopen that result.");}
  }
  const shownId=shown?.result_id ?? null;
  useEffect(()=>{if(shownId)try{localStorage.setItem(DISPLAYED,shownId);}catch{}},[shownId]);
  // The history of whatever is displayed; refreshed when the displayed result changes.
  useEffect(()=>{
    if(!shownId){setHistory(null);return;}
    const abort=new AbortController();
    fetch(`/api/agent/investigations/${encodeURIComponent(shownId)}`,{cache:"no-store",signal:abort.signal})
      .then(async response=>response.ok?await response.json() as InvestigationHistory:null)
      .then(value=>{if(!abort.signal.aborted)setHistory(value);}).catch(()=>{if(!abort.signal.aborted)setHistory(null);});
    return ()=>abort.abort();
  },[shownId]);
  const currentHistory=historyFor(history,shownId), branch=branchRequired(currentHistory,shownId);
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
      requestAnimationFrame(()=>document.getElementById("investigation")?.scrollIntoView({block:"start",behavior:"auto"}));
      try{localStorage.setItem(STORAGE,next.job_id);}catch{}
    } catch(e) {if(epoch.current.current(ticket))setMessage(e instanceof Error ? e.message : "Research unavailable; previous curves remain visible.");}
    finally{if(epoch.current.current(ticket))setSubmitting(false);}
  }
  function research(event:FormEvent) {
    event.preventDefault();
    setResearchOpen(false);setTurn(null);setRecord(null);
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
      client_revision:shown.client_revision+1,selected_scenario_id:selected,text:edit,branch});
  }
  // "Run this experiment": the proposal must belong to the displayed result; only its ID is sent to the server.
  function runProposal(proposal:ExperimentProposal) {
    if(controlBusy)return;
    try{const body=proposalRequest(proposal,shown,branch);setEdit(proposal.edit_text);void submitJob("edits",body);}
    catch(e){setMessage(e instanceof Error?e.message:"This proposal cannot be run against the displayed curves.");}
  }
  const currentInterpretation=explanation?.result_id===shown?.result_id ? explanation : null;
  // The answer panel reports staleness itself; this note remains for results that have no written answer.
  const answer=answerState(turn,shown), staleExplanation=!!explanation && !currentInterpretation && answer==="none";
  const structure=structureKind(structureIdentity.drug,structureIdentity.target);
  // Open the molecular view on the measured residue pair. A fresh nonce makes repeated requests for the same pair work.
  const focusMeasurement=useCallback((card:MeasurementCard)=>{
    setStructureFocus({...card.focus,label:card.id,nonce:Date.now()+Math.random()});
    window.history.replaceState(null,"","#structure");window.dispatchEvent(new HashChangeEvent("hashchange"));
  },[]);
  return <div className="hypothesim-workspace editorial-workspace">
    <aside className="workspace-rail" aria-label="Research navigation"><a href="/" className="rail-monogram" aria-label="Hypothesim home">h.</a><span className="rail-caption">Workspace</span><nav><a href="#research"><span>01</span>Question</a><a href="#experiment"><span>02</span>Simulation</a><a href="#structure"><span>03</span>Structure</a></nav><a href="/" className="rail-home">Workspace home ↗</a></aside>
    <header className="workspace-header"><a className="workspace-brand" href="/">hypothesim<span>.</span></a><nav aria-label="Workspace sections"><a href="#research">Research</a><a href="#answer">Answer</a><a href="#history">History</a><a href="#experiment">Results</a><a href="#paper-evidence">Evidence</a><a href="#structure">Molecule</a></nav><span className="workspace-badge">Research workspace</span></header>
    <div className="workspace-intro"><div><p className="eyebrow">Scientific exploration console</p><h1>Experiment workspace</h1><p>Evidence → exposure → target engagement</p></div><span className="workspace-badge">{busy?"Agent researching":saved?"Saved reviewed demo":"Interactive model"}</span></div>
    <details className="workspace-assessment"><summary>Drug and model assessment <span>Identity, route, and supported endpoints</span></summary><DrugSupportPanel /></details>
    <section id="research" className="research-panel" aria-label="Hypothesis research"><details className="question-disclosure" open={researchOpen} onToggle={e=>setResearchOpen(e.currentTarget.open)}><summary><span><span className="eyebrow">Research question · {drug || "Drug unspecified"}{target?` / ${target}`:""}</span><strong>{text || "Enter your scientific hypothesis"}</strong></span><span className="disclosure-action">{researchOpen?"Close editor":"Edit hypothesis"}</span></summary>
      <div className="research-layout"><form onSubmit={research}><fieldset disabled={busy} style={{border:0,padding:0}}>
        <label>Scientific hypothesis<textarea required maxLength={12000} value={text} onChange={e=>setText(e.target.value)} rows={4}/></label>
        <div className="form-grid"><label>Drug name<input required maxLength={200} value={drug} onChange={e=>setDrug(e.target.value)}/></label><label>Biological target (optional)<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
          <label>Administration route<select value={route} onChange={e=>setRoute(e.target.value)}><option value="">Unspecified — ask the agent</option><option value="iv_infusion">IV infusion</option><option value="hypothetical_iv_bolus">Hypothetical IV bolus</option><option value="oral">Oral (model assessment only)</option><option value="subcutaneous">Subcutaneous (model assessment only)</option></select></label></div>
        {researchRouteNotice(drug,route) && <p className="scope-note" role="note">{researchRouteNotice(drug,route)}</p>}
        <label><input type="checkbox" checked={baseline} onChange={e=>setBaseline(e.target.checked)}/> Prepare a baseline experiment first, using compatible evidence and assumptions I explicitly supply.</label>
        <p className="scope-note">Other interventions may need clarification or a subsequent experiment edit. Unsupported models never receive fabricated curves.</p>
        <div className="form-actions"><button className="primary-button" disabled={busy}>{busy?"Research in progress…":"Research hypothesis →"}</button><button type="button" className="quiet-button" onClick={()=>{setDrug("imatinib");setTarget("ABL1");setRoute("hypothetical_iv_bolus");setBaseline(false);setText("How would hypothetical bloodstream imatinib input affect ABL1 occupancy? Research evidence and identify missing PK, binding and target-site exposure data.");}}>Try imatinib research</button>
        <button type="button" className="quiet-button" onClick={()=>{setText(PRIMARY);setDrug("trastuzumab");setTarget("HER2");setRoute("iv_infusion");setBaseline(false);}}>Use trastuzumab example</button></div>
      </fieldset></form>
      <aside className="activity-panel"><h3>Evidence first</h3><p>The agent searches sources and extracts cited values before configuring a supported model. Missing inputs remain explicit.</p><p>Follow tool outcomes and numerical execution in the <a href="#investigation">investigation panel ↓</a>.</p></aside></div>
      </details><div className="demo-entry"><div><h3>Trastuzumab / HER2 demo</h3><p>Reviewed reference inputs · hypothetical alternatives · interactive results</p></div><button className="saved-demo-button" type="button" onClick={()=>void openDemo()}>Load saved demo</button><a href="#experiment">Go to simulation ↓</a></div>
      <details><summary>Resume a saved preparation</summary><label>Preparation ID<input value={resumeId} onChange={e=>setResumeId(e.target.value)} placeholder="prep-…"/></label><button type="button" disabled={!!busy} onClick={()=>void loadPreparation()}>Load preparation</button></details>
      {message && !job && <p role="alert">{message}</p>}
    </section>
    <InvestigationPanel job={job} submitting={submitting} saved={saved} displayedResult={shown} config={visible} message={message} viewer={structure} onFocusMeasurement={focusMeasurement}/>
    <ScientificAnswer turn={turn} shown={shown} viewer={structure} onFocusMeasurement={focusMeasurement}/>
    <NextExperimentProposals shown={shown} busy={!!busy || controlBusy} onRun={runProposal}/>
    <InvestigationHistoryPanel history={currentHistory} shownId={shownId} busy={!!busy || controlBusy} branch={branch} onReopen={id=>void reopen(id)}/>
    <ResearchPaperReview papers={turn?.research_papers ?? []}/>
    {(record || turn?.questions?.length || staleExplanation) ? <section className="research-panel" aria-label="Research continuation">
      {turn?.questions?.length ? <section aria-label="Agent questions"><h3>What is needed next</h3><ul>{turn.questions.map(q=><li key={q}>{q}</li>)}</ul></section>:null}
      {record && <PreparationAnswers key={`${record.preparation.preparation_id}:${record.preparation.revision}`} record={record} busy={!!busy} onContinue={continueResearch} onReload={()=>void reloadPreparation()}/>}
      {staleExplanation && <p className="scope-note">The earlier explanation belongs to a different result. Current curves reflect your direct parameter changes.</p>}
    </section> : null}
    <details id="revise" className="research-panel experiment-revision" onToggle={e=>{if(e.currentTarget.open)e.currentTarget.querySelector("input")?.focus();}}><summary>Change the experiment in words <span>Dose, affinity, schedule or duration</span></summary><p>Edits apply to the displayed result. The baseline stays protected; selected alternative: <strong>{visible.scenarios.find(s=>s.scenario_id===selected)?.label ?? "none"}</strong>.</p>
      <form onSubmit={submitEdit}><label>Experimental edit<input required disabled={!!busy} value={edit} onChange={e=>setEdit(e.target.value)} placeholder="Run this comparison for 120 days"/></label><button className="primary-button" disabled={!!busy || !shown || controlBusy}>Apply edit & simulate</button></form>
      <details><summary>Supported examples</summary><ul>{["Double the dose in the affinity alternative","Use a 21-day dosing interval in that alternative","Compare twofold and fivefold affinity improvement at fixed association rate","Run this comparison for 120 days"].map(s=><li key={s}><button type="button" disabled={!!busy} onClick={()=>setEdit(s)}>{s}</button></li>)}</ul><p>Unrecognized wording or extra instructions request clarification. Changes of drug, target or route require new research above.</p></details>
      {turn?.applied_changes?.length ? <ul>{turn.applied_changes.map(s=><li key={s}>{s}</li>)}</ul>:null}
    </details>
    <div className="saved-demo-banner" role="status"><span className="status-dot"/><strong>Displayed experiment</strong> {visible.drug} → {visible.target}{busy && <span> · Research pending; showing the last successful curves.</span>}</div>
    <PlotPreview key={prepared?.result_id ?? "fallback"} initialExperiment={prepared?.configuration ?? fallbackExperiment} initialResult={prepared} onResultChange={onResult} editingLocked={!!busy} interpretation={currentInterpretation} answerShown={answer==="current" && turn?.synthesis?.status==="grounded"}
      structure={structure!=="unavailable" ? <VisualizationBoundary key={structure} label="Experimental structure"><StructureViewer kind={structure} focusRequest={structureFocus}/></VisualizationBoundary> : <section id="structure" className="structure-panel"><h2>Experimental structure unavailable</h2><p>No verified cached drug–target complex is available for {structureIdentity.drug} → {structureIdentity.target || "unspecified target"}. Compatible numerical models can still run without a structure.</p></section>}/>
    <footer className="workspace-footer">Hypothesim · Conditional scientific exploration · Predictions are model outputs.</footer>
  </div>;
}
