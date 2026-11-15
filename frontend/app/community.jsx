'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Trash2} from 'lucide-react';
import {useAuth} from './science/lib/auth.jsx';
import {SignInPrompt} from './science/components/AccountMenu.jsx';
import {ScientificPlot} from './science/components/ScientificPlot.jsx';
import {VisualizationBoundary} from './science/components/VisualizationBoundary.jsx';
import {scenarioColor} from './science/lib/plot-spec.js';
import {sharedIdForPath} from './navigation.mjs';
/* Community feed and read-only shared experiments (hosted 5C.2), in the workspace's glass theme. */
const VERDICT={supported:'Supported',not_supported:'Not supported',mixed:'Mixed',undetermined:'Not determined'};
const ORIGIN={research:'Agent research',agent_edit:'Change in words',proposal:'Follow-up experiment',direct_control:'Direct parameter edit',direct_simulation:'Direct simulation',saved_demo:'Saved demo'};
const STATUS={never_reached:'never reaches threshold',crossed_within_window:'falls below threshold in window',still_above_at_horizon:'above threshold at end of window',ambiguous_without_more_resolution:'crossing unresolved'};
const date=v=>new Date(v).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
const pct=v=>(v*100).toFixed(2)+'%';
const plural=(n,word)=>n+' '+word+(n===1?'':'s');
async function read(url,fallback){const response=await fetch(url,{cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:fallback);return data}
const Owner=({owner,self,prefix=''})=><span className="community-owner">{owner.avatar_url?<img src={owner.avatar_url} alt="" width={20} height={20} referrerPolicy="no-referrer"/>:<i aria-hidden="true">{owner.name.slice(0,1)}</i>}{self?(prefix?prefix+' you':'You'):(prefix?prefix+' ':'')+owner.name}</span>;
const Steps=({ids})=><span className="step-chips">{ids.map(id=><a key={id} href={'#step-'+id} onClick={event=>{event.preventDefault();document.getElementById('step-'+id)?.scrollIntoView({behavior:'smooth',block:'center'})}}>{id}</a>)}</span>;
export default function Community({active}){
 const {ready,user,enabled}=useAuth();
 const [shareId,setShareId]=useState(()=>typeof window==='undefined'?null:sharedIdForPath(window.location.pathname));
 useEffect(()=>{const sync=()=>setShareId(sharedIdForPath(window.location.pathname));window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync)},[]);
 useEffect(()=>{if(active&&!shareId&&/^\/shared\//.test(window.location.pathname))window.history.replaceState(null,'','/community')},[active,shareId]);
 const open=id=>{window.history.pushState({hypothesimScene:'Community'},'',id?'/shared/'+id:'/community');setShareId(id);window.scrollTo(0,0)};
 const allowed=ready&&(!enabled||user);
 return <div className="community-view">{!allowed&&ready?<section className="community-panel"><h2>Sign in to see shared experiments</h2><SignInPrompt action="browse shared experiments"/></section>:shareId?<SharedExperiment id={shareId} onBack={()=>open(null)} allowed={allowed}/>:<Feed onOpen={open} allowed={allowed}/>}</div>;
}
function Feed({onOpen,allowed}){
 const [items,setItems]=useState(null),[error,setError]=useState('');
 useEffect(()=>{if(!allowed)return;let alive=true;read('/api/shares','The community feed is unavailable.').then(d=>alive&&setItems(d.items)).catch(e=>alive&&setError(e.message));return()=>{alive=false}},[allowed]);
 return <><header className="page-heading community-heading"><div><p className="eyebrow">Community</p><h1>Shared experiments</h1><p>Investigations other researchers have published: what they asked, what the agent found, and how each follow-up changed the answer. Every AI summary cites the steps it comes from.</p></div></header>
  {error&&<p className="community-error" role="alert">{error}</p>}
  {!items&&!error&&<p className="community-loading" role="status">Loading shared experiments…</p>}
  {items&&!items.length&&<section className="community-panel"><h2>No shared experiments yet</h2><p>Run an investigation in Experiments, then use <strong>Share your experiment</strong> below its results to publish it here.</p></section>}
  {items&&items.length>0&&<ul className="community-feed">{items.map(item=><li key={item.share_id}><button type="button" className="community-card" onClick={()=>onOpen(item.share_id)}>
   <span className="eyebrow">{item.drug} → {item.target}</span><strong>{item.title}</strong>
   {item.headline?<p>{item.headline}</p>:<p className="community-question">{item.question}</p>}
   <span className="community-meta"><Owner owner={item.owner} self={item.is_owner}/><span>{date(item.created_at)}</span><span>{plural(item.step_count,'step')}</span>{item.verdict&&<span className="community-verdict" data-verdict={item.verdict}>{VERDICT[item.verdict]}</span>}</span>
   <ArrowUpRight className="community-open" size={16} aria-hidden="true"/></button></li>)}</ul>}</>;
}
function SharedExperiment({id,onBack,allowed}){
 const [share,setShare]=useState(null),[error,setError]=useState(''),[removed,setRemoved]=useState(false);
 useEffect(()=>{if(!allowed)return;let alive=true;setShare(null);setError('');read('/api/shares/'+encodeURIComponent(id),'This shared experiment is unavailable.').then(d=>alive&&setShare(d)).catch(e=>alive&&setError(e.message));return()=>{alive=false}},[id,allowed]);
 async function remove(){if(!share||!window.confirm('Remove this experiment from the community feed? The link will stop working.'))return;const response=await fetch('/api/shares/'+share.share_id,{method:'DELETE'});if(response.ok)setRemoved(true);else setError('Could not remove this shared experiment.')}
 const back=<button type="button" className="text-link community-back" onClick={onBack}><ArrowLeft size={14}/>All shared experiments</button>;
 if(removed)return <>{back}<section className="community-panel"><h2>Removed from the community</h2><p>The link no longer works.</p></section></>;
 if(error)return <>{back}<p className="community-error" role="alert">{error}</p></>;
 if(!share)return <>{back}<p className="community-loading" role="status">Opening the shared experiment…</p></>;
 const shared=share.steps.find(step=>step.step_id===share.shared_step_id)||share.steps[share.steps.length-1],ai=share.ai_summary;
 return <>{back}
  <header className="page-heading community-heading"><div><p className="eyebrow">Shared experiment · {share.drug} → {share.target}</p><h1>{share.title}</h1><p className="community-meta"><Owner owner={share.owner} self={share.is_owner} prefix="Shared by"/><span>{date(share.created_at)}</span><span>{plural(share.steps.length,'step')}</span><span>Read-only</span></p></div>{share.is_owner&&<button type="button" className="btn secondary" onClick={()=>void remove()}>Remove from community<Trash2 size={14}/></button>}</header>
  <section className="community-panel"><p className="eyebrow">Research question</p><p className="community-question-text">{share.question}</p>{share.note&&<p className="community-note">“{share.note}” · {share.owner.name}</p>}</section>
  <div className="community-split">
   <section className="community-panel community-results" aria-label="Shared result"><p className="eyebrow">Result at step {shared.step_id} · {ORIGIN[shared.origin]||shared.origin}</p><h2>{shared.title}</h2>
    <div className="community-outcomes">{shared.outcomes.map((o,i)=><article key={o.scenario_id} style={{'--scenario':scenarioColor(o.scenario_id,i)}}><span>{o.label}</span><strong>{pct(o.endpoint_occupancy)}</strong><small>Endpoint target occupancy · {STATUS[o.threshold_status]||o.threshold_status} ({(shared.occupancy_threshold*100).toFixed(0)}% threshold)</small></article>)}</div>
    {share.result&&<div className="community-plots">{['occupancy','concentration'].map(kind=><figure key={kind}><figcaption>{kind==='occupancy'?'Target occupancy':'Drug concentration'}</figcaption><VisualizationBoundary label={kind+' plot'}><ScientificPlot result={share.result} kind={kind} cursorTimeHours={-1}/></VisualizationBoundary></figure>)}</div>}
   </section>
   <aside className="community-panel community-summary" aria-label="AI summary"><p className="eyebrow">{ai?.status==='grounded'?'AI summary · every statement cites the log':'Summary of the log'}</p><h2>{ai?.status==='grounded'&&ai.headline?ai.headline:'What happened in this investigation'}</h2>
    {ai?.status==='grounded'?<>{ai.headline&&<p className="summary-cites">Headline rests on <Steps ids={ai.headline_step_ids??[]}/></p>}<ul>{(ai.points??[]).map((point,i)=><li key={i}>{point.text} <Steps ids={point.step_ids}/></li>)}</ul></>:<ul>{share.log_summary.slice(0,6).map((line,i)=><li key={i}>{line}</li>)}</ul>}
    {ai?.notes?.map((note,i)=><p key={i} className="scope-note">{note}</p>)}
    {share.answer&&<div className="community-answer"><p className="eyebrow">Cited answer at step {share.answer.step_id}</p><p><span className="community-verdict" data-verdict={share.answer.verdict}>{VERDICT[share.answer.verdict]}</span> {share.answer.statement}</p></div>}
   </aside>
  </div>
  <section className="community-panel" aria-label="Investigation log"><p className="eyebrow">Investigation log</p><h2>Every step, in order</h2>
   <ol className="community-steps">{share.steps.map(step=><li key={step.step_id} id={'step-'+step.step_id} data-shared={step.is_shared_result}>
    <div><span className="community-step-kind">{step.step_id} · {ORIGIN[step.origin]||step.origin}{step.parent_step_id?' · follows '+step.parent_step_id:''}</span><strong>{step.title}</strong>{step.is_shared_result&&<span className="community-step-current">Shared result</span>}</div>
    {!!step.changes?.length&&<p>Changed: {step.changes.join('; ')}</p>}
    <ul>{step.outcomes.map(o=><li key={o.scenario_id}>{o.label}: {pct(o.endpoint_occupancy)} endpoint occupancy, {STATUS[o.threshold_status]||o.threshold_status}</li>)}</ul>
    {step.finding&&<p className="community-finding">{step.verdict&&<span className="community-verdict" data-verdict={step.verdict}>{VERDICT[step.verdict]}</span>} {step.finding}</p>}
    {(step.paper_count>0||step.structure_pdb_id)&&<p className="community-design">{[step.paper_count>0?plural(step.paper_count,'paper')+' inspected':'',step.structure_pdb_id?'Structure '+step.structure_pdb_id:''].filter(Boolean).join(' · ')}</p>}
   </li>)}</ol>
   <details><summary>Full log summary</summary><ul>{share.log_summary.map((line,i)=><li key={i}>{line}</li>)}</ul></details>
  </section>
  <p className="scope-note community-disclaimer">{share.disclaimer}</p></>;
}
