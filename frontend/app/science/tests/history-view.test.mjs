import assert from 'node:assert/strict';
import test from 'node:test';
import { branchRequired, historyFor, historyRows } from '../lib/history-view.js';
import { proposalRequest } from '../lib/proposal-view.js';
import { agentProxy } from '../lib/agent-proxy.js';

const outcome=(label,value,status)=>({scenario_id:label,label,endpoint_occupancy:value,threshold_status:status,total_time_above_h:1});
const entry=(id,parent,origin,depth,extra={})=>({result_id:id,parent_result_id:parent,origin,depth,title:id,changes:[],duration_h:4320,occupancy_threshold:0.9,
  outcomes:[outcome('Baseline',0.629,'crossed_within_window')],paper_count:0,papers:[],child_count:0,has_follow_up_experiment:false,...extra});
const history={root_result_id:'r1',requested_result_id:'r3',question:'Does it last longer?',truncated:false,entries:[
  entry('r1',null,'research',0,{title:'Does it last longer?',paper_count:2,structure_pdb_id:'1N8Z',verdict:'mixed',finding:'Both stay above.',child_count:2,has_follow_up_experiment:true}),
  entry('r2',null,'direct_control',1,{parent_result_id:'r1',title:'dose_mg = 600 in affinity_x10',duration_h:2880}),
  entry('r3','r1','proposal',1,{title:'Raise the occupancy threshold to 95%',changes:['comparison: occupancy_threshold = 0.95'],occupancy_threshold:0.95,
    outcomes:[outcome('Baseline',0.629,'crossed_within_window'),outcome('Half-life ×3',0.9982,'still_above_at_horizon')]})]};

test('history rows number the steps, keep branch depth and state design, evidence, outcomes and findings',()=>{
  const rows=historyRows(history,'r3');
  assert.deepEqual(rows.map(r=>[r.step,r.depth,r.kind,r.displayed]),[[1,0,'Research',false],[2,1,'Direct control',false],[3,1,'Follow-up experiment',true]]);
  assert.equal(rows[0].design,'180 days · 90% threshold');assert.equal(rows[1].design,'120 days · 90% threshold');assert.equal(rows[2].design,'180 days · 95% threshold');
  assert.equal(rows[0].evidence,'2 papers read · structure 1N8Z inspected');assert.equal(rows[1].evidence,null);
  assert.deepEqual([rows[0].verdict,rows[0].finding,rows[0].branches,rows[0].continued],['Mixed','Both stay above.',2,true]);
  assert.deepEqual(rows[2].changes,['comparison: occupancy_threshold = 0.95']);
  assert.deepEqual(rows[2].outcomes,['Baseline: 62.90% at end · falls below threshold in window','Half-life ×3: 99.82% at end · above threshold at end of window']);
  assert.deepEqual(historyRows(null,'r1'),[]);
});
test('a follow-up from an earlier version with a newer experiment must be an explicit branch',()=>{
  assert.equal(branchRequired(history,'r1'),true);
  assert.equal(branchRequired(history,'r3'),false);assert.equal(branchRequired(history,'unknown'),false);assert.equal(branchRequired(null,'r1'),false);
  const shown={result_id:'r1',client_revision:0,configuration_hash:'a'.repeat(64),configuration:{experiment_id:'exp'}};
  const proposal={proposal_id:'prop-0123456789abcdef',edit_text:'Run this comparison for 360 days',base_result_id:'r1',base_experiment_id:'exp',base_configuration_sha256:'a'.repeat(64),base_client_revision:0};
  assert.equal(proposalRequest(proposal,shown,branchRequired(history,'r1')).branch,true);
  assert.equal(proposalRequest(proposal,shown).branch,false);
});
test('a history response for other curves is never applied to the displayed result',()=>{
  assert.equal(historyFor(history,'r2'),history);
  assert.equal(historyFor(history,'sim-after-slider'),null);assert.equal(historyFor(history,null),null);assert.equal(historyFor(null,'r1'),null);
});
test('reopen and history routes are proxied only for well-formed identifiers',async()=>{
  const old=globalThis.fetch;const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return new Response('{}',{status:200});};
  try {
    for(const parts of [['results','sim-262bc1bc1e17aefb3d6995d5'],['investigations','sim-262bc1bc1e17aefb3d6995d5']])
      assert.equal((await agentProxy(new Request('http://local/api'),parts)).status,200);
    assert.deepEqual(calls.map(c=>c.split('/api/agent/')[1]),['results/sim-262bc1bc1e17aefb3d6995d5','investigations/sim-262bc1bc1e17aefb3d6995d5']);
    for(const parts of [['results','..'],['investigations','a/b'],['investigations','sim-one','extra'],['results']])
      assert.equal((await agentProxy(new Request('http://local/api'),parts)).status,404);
    assert.equal((await agentProxy(new Request('http://local/api',{method:'POST',body:'{}'}),['investigations','sim-one'])).status,404);
    assert.equal(calls.length,2);
  } finally {globalThis.fetch=old;}
});

test('restoring old curves after no-result research preserves its question, answer and inputs',async()=>{
  const {restorationAfterJob}=await import('../lib/history-view.js');
  assert.deepEqual(restorationAfterJob('prior-drug-result',{result:null}),{resultId:'prior-drug-result',preserveResearchContext:true});
  assert.deepEqual(restorationAfterJob('slider-result',{result:{result_id:'research-result'}}),{resultId:'slider-result',preserveResearchContext:false});
  assert.equal(restorationAfterJob('research-result',{result:{result_id:'research-result'}}),null);
  assert.equal(restorationAfterJob(null,{result:null}),null);
});
