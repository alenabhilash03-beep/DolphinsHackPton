import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestEpoch, linkedTurnResult, structureKind } from '../lib/agent-workspace.ts';
import { agentProxy } from '../lib/agent-proxy.ts';

test('new research or saved demo invalidates earlier responses',()=>{
  const epoch=new RequestEpoch();
  const first=epoch.next();assert(epoch.current(first));
  const newer=epoch.next();assert(!epoch.current(first));assert(epoch.current(newer));
});
test('missing/blocked turns cannot replace curves and inconsistent interpretation fails',()=>{
  assert.equal(linkedTurnResult({status:'needs_inputs',result:null}),null);
  assert.equal(linkedTurnResult({status:'unsupported',result:null}),null);
  const result={result_id:'sim-one',client_revision:3,configuration:{experiment_id:'exp-one'}};
  const interpretation={result_id:'sim-one',client_revision:3,experiment_id:'exp-one'};
  assert.equal(linkedTurnResult({status:'completed',result,interpretation}),result);
  assert.throws(()=>linkedTurnResult({status:'completed',result,interpretation:{...interpretation,result_id:'old'}}),/linkage/);
});
test('structure selection requires a matching cached drug and target',()=>{
  assert.equal(structureKind('Herceptin','HER2'),'trastuzumab');
  assert.equal(structureKind('Trastuzumab (intact IgG1)','Human HER2 extracellular effective sites'),'trastuzumab');
  assert.equal(structureKind('imatinib','ABL1'),'imatinib');
  assert.equal(structureKind('imatinib','HER2'),'unavailable');
  assert.equal(structureKind('arbitrary drug','HER2'),'unavailable');
});
test('agent proxy rejects arbitrary paths without upstream calls',async()=>{
  const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('not expected');};
  try {
    assert.equal((await agentProxy(new Request('http://local/api',{method:'POST',body:'{}'}),['https:','evil'])).status,404);
    assert.equal((await agentProxy(new Request('http://local/api'),['jobs','..'])).status,404);
    assert.equal(calls,0);
  }finally{globalThis.fetch=old;}
});
test('background submission preserves status and never waits for the agent turn',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert(String(url).endsWith('/api/agent/jobs/research'));
    assert.equal(options.method,'POST');assert.equal(options.body,'{"request":{}}');
    return Response.json({job_id:'a'.repeat(32),status:'queued'},{status:202});
  };
  try {
    const response=await agentProxy(new Request('http://local/api',{method:'POST',body:'{"request":{}}'}),['jobs','research']);
    assert.equal(response.status,202);assert.equal((await response.json()).status,'queued');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{globalThis.fetch=old;}
});

test('generic plot recommendations use the current target and drug class neutral wording',async()=>{
  const { comparisonSummary }=await import('../lib/comparison-summary.ts');
  const result={configuration:{target:'Fixture receptor B',duration_h:24,scenarios:[]},scenarios:[{scenario_id:'baseline',metrics:{endpoint_occupancy:.2,threshold:{status:'never_reached'}}}]};
  const summary=comparisonSummary(result);
  assert(summary.followUps.some(text=>text.includes('Fixture receptor B')));
  assert(!summary.followUps.some(text=>/HER2|intact-antibody/.test(text)));
});
