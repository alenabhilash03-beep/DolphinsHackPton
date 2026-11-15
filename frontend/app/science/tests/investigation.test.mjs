import assert from 'node:assert/strict';
import test from 'node:test';
import { investigationView,changedParameters,scientificNumber } from '../lib/investigation.js';

const rid='run-'+'a'.repeat(32);
function fixture({status='completed',scientific='completed',solver=true,failAfterSolver=false}={}){
  const result={result_id:'sim-result',client_revision:1,configuration_hash:'b'.repeat(64),configuration:{experiment_id:'exp',scenarios:[]}};
  const receipt={result_id:result.result_id,experiment_id:'exp',configuration_sha256:result.configuration_hash,client_revision:1,metrics:[]};
  const snapshot={experiment_id:'exp',configuration_sha256:result.configuration_hash,parameters:[],schedules:[]};
  const events=[];
  function event(kind,state,tool_name=null,stage='run',summary=null,tool_call_id=null){
    events.push({event_id:`evt-${events.length}`,run_id:rid,sequence:events.length+1,kind,state,tool_name,stage,summary,tool_call_id,timestamp:'2026-11-14T12:00:00Z',elapsed_ms:state==='started'?null:100});
  }
  event('run','started');
  event('tool','started','apply_requested_edit','editing',null,'exec-config');
  event('tool','succeeded','apply_requested_edit','editing',{outcome:'completed',experiment:snapshot},'exec-config');
  if(solver){event('tool','started','simulate_current_comparison','simulation',null,'exec-solver');event('tool','succeeded','simulate_current_comparison','simulation',{outcome:'completed',result:receipt},'exec-solver');}
  if(solver&&!failAfterSolver){event('tool','started','interpret_current_result','interpretation',null,'exec-interpret');event('tool','succeeded','interpret_current_result','interpretation',{outcome:'completed',result:structuredClone(receipt)},'exec-interpret');}
  event('run',failAfterSolver?'failed':scientific==='completed'?'succeeded':scientific,null,'run',{outcome:failAfterSolver?'failed':scientific});
  const turn={status:scientific,result:solver?result:null,interpretation:solver?{result_id:result.result_id,experiment_id:'exp',client_revision:1}:null,execution_run_id:rid,execution_events:structuredClone(events)};
  return {job_id:'job',execution_run_id:rid,status,mode:'edit',turn,execution_events:events};
}

test('accepted completion requires a matching run, configuration, receipt and turn',()=>{
  const job=fixture();const view=investigationView(job);
  assert.equal(view.accepted,true);assert.equal(view.snapshot.configuration_sha256,view.receipt.configuration_sha256);
  assert.equal(view.attempts.length,3);assert.equal(view.active,null);
  assert.equal(view.stages.find(s=>s.id==='literature').state,'not_run');
  for(const mutate of [
    j=>j.execution_events[4].summary.result.result_id='wrong',
    j=>j.execution_events[4].summary.result.configuration_sha256='wrong',
    j=>j.execution_events[4].summary.result.client_revision=5,
    j=>j.execution_events[4].summary.result.experiment_id='other',
    j=>j.execution_events[2].summary.experiment.configuration_sha256='wrong',
    j=>j.turn.execution_run_id='other',
    j=>j.turn.execution_events[0].event_id='other',
  ]){const changed=structuredClone(job);mutate(changed);assert.equal(investigationView(changed).accepted,false);}
});

test('running simulation is observed immediately without a receipt or accepted result',()=>{
  const job=fixture();job.status='running';job.turn=null;job.execution_events=job.execution_events.slice(0,4);
  const view=investigationView(job);
  assert.equal(view.active.start.tool_name,'simulate_current_comparison');assert.equal(view.receipt,null);assert.equal(view.accepted,false);
  assert.equal(view.stages.find(s=>s.id==='simulation').state,'started');
});

test('a solver can return while the overall run fails; it must never replace curves',()=>{
  const view=investigationView(fixture({status:'failed',failAfterSolver:true}));
  assert(view.receipt);assert.equal(view.accepted,false);assert.equal(view.stages.find(s=>s.id==='simulation').state,'succeeded');
  assert.equal(view.runEnd.state,'failed');
});

test('missing input and unsupported cases do not infer a simulation',()=>{
  for(const scientific of ['needs_inputs','unsupported']){
    const view=investigationView(fixture({scientific,solver:false}));
    assert.equal(view.accepted,false);assert.equal(view.receipt,null);assert.equal(view.stages.find(s=>s.id==='simulation').state,'not_run');
  }
});

test('invalid sequence, foreign run, unpaired terminal and unfinished committed run are rejected',()=>{
  const original=fixture();
  for(const mutate of [
    j=>j.execution_events[2].sequence=99,
    j=>j.execution_events[2].run_id='other',
    j=>j.execution_events[2].event_id=j.execution_events[1].event_id,
    j=>j.execution_events[4].tool_call_id='unseen',
    j=>j.execution_events[4].tool_name='interpret_current_result',
    j=>j.execution_events.splice(4,1),
  ]){const job=structuredClone(original);mutate(job);const view=investigationView(job);assert.equal(view.invalid,true);assert.equal(view.accepted,false);assert.equal(view.receipt,null);assert.equal(view.snapshot,null);}
});

test('rejected attempts remain visible after a distinct successful retry',()=>{
  const job=fixture();job.status='running';job.turn=null;job.execution_events=job.execution_events.slice(0,1);
  for(const [id,state] of [['first','rejected'],['retry','succeeded']]){
    for(const terminal of [false,true])job.execution_events.push({event_id:`event-${id}-${terminal}`,run_id:rid,sequence:job.execution_events.length+1,kind:'tool',tool_call_id:id,tool_name:'retrieve_evidence_source',stage:'literature',state:terminal?state:'started',summary:terminal?{outcome:state,sources:state==='succeeded'?[{source_id:'S1'}]:[]}:null});
  }
  const view=investigationView(job);assert.equal(view.invalid,false);assert.equal(view.attempts.length,2);assert.equal(view.attempts[0].outcome.state,'rejected');assert.equal(view.sourceCount,1);
});

test('source count deduplicates retrieved citation IDs rather than adding search hits',()=>{
  const job=fixture();job.status='running';job.turn=null;job.execution_events=job.execution_events.slice(0,1);
  for(let i=0;i<2;i++)for(const terminal of [false,true])job.execution_events.push({event_id:`e-${i}-${terminal}`,run_id:rid,sequence:job.execution_events.length+1,kind:'tool',tool_call_id:`call-${i}`,tool_name:'retrieve_evidence_source',stage:'literature',state:terminal?'succeeded':'started',summary:terminal?{sources:[{source_id:'same-source',document_id:`page-${i}`}]}:null});
  assert.equal(investigationView(job).sourceCount,1);
});

test('saved/idle and older records never invent tool outcomes',()=>{
  assert.equal(investigationView(null).attempts.length,0);
  const view=investigationView({status:'completed',events:['Tool requested: simulate_current_comparison']});
  assert.equal(view.legacy,true);assert.equal(view.receipt,null);assert.equal(view.accepted,false);
});

test('changed values include schedule edits and preserve canonical numbers',()=>{
  const main={parameter:'binding.affinity_nM',change:'changed',value:.001};
  const dose={parameter:'administration.0.amount_mg',change:'added',value:100};
  assert.deepEqual(changedParameters({parameters:[main,{change:'unchanged'}],schedules:[{parameter_evidence:[dose]}]}),[main,dose]);
  assert.equal(scientificNumber(null),'None');assert.equal(scientificNumber(0),'0');assert.equal(scientificNumber(.00001),'1.000e-5');
});


test('mixed stage outcomes show successful and failed attempts instead of only the last result',async()=>{
  const {stageSummary}=await import('../lib/investigation.js');
  const attempts=[{outcome:{state:'succeeded'}},{outcome:{state:'failed'}},{outcome:{state:'rejected'}}];
  assert.equal(stageSummary(attempts,false),'1 completed · 1 failed · 1 rejected');
  assert.equal(stageSummary([],true),'Not run yet');
  assert.equal(stageSummary([...attempts,{outcome:null}],true),'Running');
});
