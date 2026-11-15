import assert from 'node:assert/strict';
import test from 'node:test';
import { changeText, proposalMatches, proposalRequest } from '../lib/proposal-view.ts';
import { agentProxy } from '../lib/agent-proxy.ts';

const HASH='a'.repeat(64);
const shown=(id='sim-one',revision=3)=>({result_id:id,client_revision:revision,configuration_hash:HASH,configuration:{experiment_id:'exp'}});
const proposal=(changes={})=>({proposal_id:'prop-0123456789abcdef',title:'Extend the observation window to 360 days',edit_text:'Run this comparison for 360 days',
  base_result_id:'sim-one',base_experiment_id:'exp',base_configuration_sha256:HASH,base_client_revision:3,
  changes:[{field:'duration_h',parameter:'Observation window',scenario_id:null,scenario_label:null,unit:'h',from_value:4320,to_value:8640,from_display:'4320 h (180 days)',to_display:'8640 h (360 days)'}],...changes});

test('running a proposal sends only its ID against the displayed result and advances the revision',()=>{
  assert.deepEqual(proposalRequest(proposal(),shown()),{base_result_id:'sim-one',base_experiment_id:'exp',base_configuration_sha256:HASH,
    client_revision:4,selected_scenario_id:null,text:'Run this comparison for 360 days',proposal_id:'prop-0123456789abcdef'});
  assert(!('changes' in proposalRequest(proposal(),shown())));
});
test('a proposal for another result, configuration or revision cannot be run',()=>{
  assert.equal(proposalMatches(proposal(),shown()),true);
  for(const other of [shown('sim-after-slider'),shown('sim-one',4),{...shown(),configuration_hash:'b'.repeat(64)},{...shown(),configuration:{experiment_id:'other'}},null]) {
    assert.equal(proposalMatches(proposal(),other),false);
    assert.throws(()=>proposalRequest(proposal(),other),/different result/);
  }
});
test('the exact change is stated with units, old and new values and its scope',()=>{
  assert.equal(changeText(proposal().changes[0]),'Observation window · whole comparison: 4320 h (180 days) → 8640 h (360 days)');
  assert.equal(changeText({parameter:'Dose per infusion',scenario_label:'Threefold longer half-life',from_display:'528 mg',to_display:'264 mg'}),
    'Dose per infusion · Threefold longer half-life: 528 mg → 264 mg');
});
test('the proposals route is proxied only for a well-formed result identifier',async()=>{
  const old=globalThis.fetch;const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return new Response('{}',{status:200});};
  try {
    assert.equal((await agentProxy(new Request('http://local/api'),['results','sim-262bc1bc1e17aefb3d6995d5','proposals'])).status,200);
    assert(calls[0].endsWith('/api/agent/results/sim-262bc1bc1e17aefb3d6995d5/proposals'));
    assert.equal((await agentProxy(new Request('http://local/api'),['results','..','proposals'])).status,404);
    assert.equal((await agentProxy(new Request('http://local/api'),['results','sim-one','other'])).status,404);
    assert.equal((await agentProxy(new Request('http://local/api',{method:'POST',body:'{}'}),['results','sim-one','proposals'])).status,404);
    assert.equal(calls.length,1);
  } finally {globalThis.fetch=old;}
});
