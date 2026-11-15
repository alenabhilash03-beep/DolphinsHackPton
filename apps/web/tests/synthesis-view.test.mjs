import assert from 'node:assert/strict';
import test from 'node:test';
import { accessSummary, answerState, basisLabel, findingLinks, keyQuantities, synthesisLinked, verdictLabel } from '../lib/synthesis-view.ts';

const HASH='c'.repeat(64);
function result(id='sim-one',revision=0){
  return {result_id:id,client_revision:revision,configuration_hash:HASH,configuration:{experiment_id:'exp',
    scenarios:[{scenario_id:'baseline',label:'Baseline'},{scenario_id:'half_life_x3',label:'Half-life ×3'}],
    evidence:[{evidence_id:'clearance',parameter:'pk.clearance_L_h',original_value:0.127,original_unit:'L/day',review_status:'candidate',source_ids:['epmc-doc']}]},
    scenarios:[{scenario_id:'baseline',metrics:{endpoint_occupancy:0.629,occupancy_auc_h:4090,concentration_auc_nM_h:674076,threshold:{status:'crossed_within_window',total_time_above_h:3492.6}}},
      {scenario_id:'half_life_x3',metrics:{endpoint_occupancy:0.9982,occupancy_auc_h:4317,concentration_auc_nM_h:1912145,threshold:{status:'still_above_at_horizon',total_time_above_h:4319.95}}}]};
}
const q=(scenario,metric,value,display,extra={})=>({result_id:'sim-one',scenario_id:scenario,metric,value,status:null,unit:'h',display,...extra});
function turn({withResult=true,status='grounded'}={}){
  const finding={finding_id:'F1',stance:'context',abstract_only:true,statement:'The abstract reports clearance.',
    citations:[{document_id:'doc',source_id:'epmc-doc',locator:'abstract:0',quote:'clearance was 0.127 L/day',content_kind:'abstract'}]};
  const quantities=[q('half_life_x3','total_time_above_h',4319.95,'4320 h (180 days)'),q('baseline','endpoint_occupancy',0.629,'0.629 (62.9%)',{unit:'fraction'})];
  const grounded=status==='grounded';
  return {result:withResult?result():null,
    research_papers:[{document_id:'doc',use_in_simulation:withResult?'see_parameter_lineage':'not_selected',source:{title:'A paper',url:'https://europepmc.org/article/MED/1'},
      extraction:{status:'candidates',parameters:[{parameter:'pk.clearance_L_h',original_value:0.127,original_unit:'L/day'},{parameter:'binding.affinity_nM',original_value:5,original_unit:'nM'}]}}],
    synthesis:{status,basis:withResult?'research_and_simulation':'research_only',original_text:'Question?',
      result_id:withResult?'sim-one':null,experiment_id:withResult?'exp':null,configuration_sha256:withResult?HASH:null,client_revision:withResult?0:null,
      answer:grounded?{verdict:withResult?'mixed':'undetermined',basis:withResult?'conditional_simulation':'none',statement:'Answer.',finding_ids:[],
        quantities:withResult?[quantities[0]]:[]}:null,
      evidence_findings:grounded?[finding]:[],
      simulation_implications:grounded&&withResult?[{statement:'Implication.',quantities}]:[],
      source_access:[{document_id:'doc',source_id:'epmc-doc',title:'A paper',content_kind:'abstract',extraction_status:'candidates',limitation:'Only the abstract was accessible.'}],
      notes:grounded?[]:['The synthesis model was unavailable.']}};
}

test('answer is current only for the exact displayed result; a direct control edit makes it stale',()=>{
  const t=turn();
  assert.equal(answerState(t,result()),'current');
  assert.equal(answerState(t,result('sim-after-slider',1)),'stale');
  assert.equal(answerState(t,{...result(),configuration_hash:'d'.repeat(64)}),'stale');
  assert.equal(answerState(t,null),'stale');
  assert.equal(answerState(null,result()),'none');
  assert.equal(answerState({result:result(),synthesis:null},result()),'none');
});
test('no-result research gives an evidence-only answer that earlier curves cannot make stale',()=>{
  const t=turn({withResult:false});
  assert.equal(answerState(t,null),'evidence_only');
  assert.equal(answerState(t,result('sim-earlier')),'evidence_only');
  assert.deepEqual(keyQuantities(t),[]);
  assert.equal(verdictLabel(t.synthesis),'Not determined');
  assert.match(basisLabel(t.synthesis),/no simulation was run/);
  assert.equal(findingLinks(t,t.synthesis.evidence_findings[0])[0].simulationUse,'No simulation was run from this source.');
});
test('an answer whose numbers or linkage do not match its own result is never shown',()=>{
  const wrongValue=turn();wrongValue.synthesis.simulation_implications[0].quantities[1].value=0.7;
  assert.equal(synthesisLinked(wrongValue),false);assert.equal(answerState(wrongValue,result()),'invalid');
  const foreign=turn();foreign.synthesis.result_id='sim-other';
  assert.equal(answerState(foreign,result()),'invalid');
  const missingResult=turn();missingResult.result=null;
  assert.equal(answerState(missingResult,result()),'invalid');
  const predictionWithoutResult=turn({withResult:false});predictionWithoutResult.synthesis.answer.quantities=[q('baseline','endpoint_occupancy',0.6,'0.6')];
  assert.equal(answerState(predictionWithoutResult,null),'invalid');
  const status=turn();status.synthesis.answer.quantities=[q('half_life_x3','threshold_status',null,'still above at horizon',{status:'crossed_within_window'})];
  assert.equal(synthesisLinked(status),false);
});
test('key solver findings are deduplicated, labelled, plot-linked and flag censored durations',()=>{
  const chips=keyQuantities(turn());
  assert.deepEqual(chips.map(c=>c.key),['half_life_x3:total_time_above_h','baseline:endpoint_occupancy']);
  assert.deepEqual(chips[0],{key:'half_life_x3:total_time_above_h',scenarioId:'half_life_x3',scenario:'Half-life ×3',metric:'Time above threshold',display:'4320 h (180 days)',plot:'occupancy',censored:true});
  assert.equal(chips[1].censored,false);
  const pk=turn();pk.synthesis.answer.quantities=[q('baseline','concentration_auc_nM_h',674076,'674100 nM*h',{unit:'nM*h'})];
  assert.equal(keyQuantities(pk)[0].plot,'concentration');
});
test('a cited passage links to its paper, extracted candidates, plots and simulation parameter records',()=>{
  const t=turn();
  const [link]=findingLinks(t,t.synthesis.evidence_findings[0]);
  assert.equal(link.title,'A paper');assert.equal(link.anchor,'paper-doc');assert.equal(link.access,'Abstract only');
  assert.deepEqual(link.records,[{evidenceId:'clearance',text:'pk.clearance_L_h = 0.127 L/day · candidate',plots:['concentration','occupancy']}]);
  assert.equal(link.simulationUse,'This source supplies simulation inputs listed below.');
  // The clearance candidate became a simulation input, so only the unused affinity candidate is listed separately.
  assert.deepEqual(link.candidates.map(c=>[c.parameter,c.plots]),[['binding.affinity_nM',['occupancy']]]);
  const unused=turn();unused.result.configuration.evidence=[];
  assert.deepEqual(findingLinks(unused,unused.synthesis.evidence_findings[0])[0].candidates.map(c=>c.plots),[['concentration','occupancy'],['occupancy']]);
  const reviewed=turn();reviewed.result.configuration.evidence=[];reviewed.research_papers[0].use_in_simulation='reviewed_reference_separate';
  assert.match(findingLinks(reviewed,reviewed.synthesis.evidence_findings[0])[0].simulationUse,/separately audited reference values/);
});
test('labels state the verdict basis, and access limits stay visible',()=>{
  const t=turn();
  assert.equal(verdictLabel(t.synthesis),'Mixed by the conditional simulation');
  assert.equal(accessSummary(t.synthesis),'1 source inspected · 1 abstract-only');
  assert.equal(accessSummary({source_access:[]}),null);
  const unavailable=turn({status:'unavailable'});
  assert.equal(answerState(unavailable,result()),'current');
  assert.equal(verdictLabel(unavailable.synthesis),'Written answer unavailable');
  assert.equal(verdictLabel({...unavailable.synthesis,status:'rejected'}),'Written answer not accepted');
  assert.deepEqual(keyQuantities(unavailable),[]);
});
