import assert from 'node:assert/strict';
import test from 'node:test';
import { EDGES, NODES, graphState } from '../lib/workflow-graph.ts';

const stages = states => ['question', 'search', 'reading', 'extraction', 'model', 'simulation', 'structure', 'answer'].map((id, i) => ({ id, state: states[i] ?? 'waiting' }));

test('every edge connects two existing nodes', () => {
  const ids = new Set(NODES.map(n => n.id));
  for (const e of EDGES) { assert.ok(ids.has(e.from) && ids.has(e.to), e.id); assert.match(e.d, /^M[\d.]+ [\d.]+ C/); }
});

test('a running tool receives packets from the agent; finished tools send results back while the run continues', () => {
  const { nodeState, edgeMode } = graphState(stages(['done', 'done', 'active']), true, 'reading', false);
  assert.equal(nodeState.get('agent'), 'active');
  assert.equal(edgeMode.get('reading-agent'), 'call');
  assert.equal(edgeMode.get('search-agent'), 'return');
  assert.equal(edgeMode.get('extraction-agent'), 'idle');
  assert.equal(edgeMode.get('agent-model'), 'idle');
  assert.equal(edgeMode.get('prep-agent'), 'flow');
});

test('between tool calls the agent is reasoning; outputs flow only into the running stage', () => {
  const { nodeState, edgeMode } = graphState(stages(['done', 'done', 'done', 'warning', 'done', 'active']), true, 'simulation', false);
  assert.equal(edgeMode.get('model-simulation'), 'flow');
  assert.equal(edgeMode.get('agent-model'), 'done');
  assert.equal(edgeMode.get('extraction-agent'), 'return');
  assert.equal(graphState(stages(['done']), true, null, false).nodeState.get('agent'), 'thinking');
});

test('after the run nothing moves: completed links glow, missing stages stay idle, failures are marked', () => {
  const { nodeState, edgeMode } = graphState(stages(['done', 'done', 'done', 'done', 'done', 'skipped', 'failed', 'failed']), false, null, true);
  assert.equal(nodeState.get('agent'), 'failed');
  assert.ok([...edgeMode.values()].every(m => !['flow', 'call', 'return'].includes(m)));
  assert.equal(edgeMode.get('search-agent'), 'done');
  assert.equal(edgeMode.get('agent-structure'), 'done');
  assert.equal(edgeMode.get('model-simulation'), 'skipped');
});
