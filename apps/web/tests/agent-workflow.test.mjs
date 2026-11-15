import assert from 'node:assert/strict';
import test from 'node:test';
import { replayJob, replaySchedule, workflowModel } from '../lib/agent-workflow.ts';

const rid = 'run-' + 'c'.repeat(32);
// A research run recorded the way the API records it: started/outcome pairs per tool call.
function researchJob({ running = false } = {}) {
  const events = [];
  let t = Date.parse('2026-11-15T10:00:00Z');
  const event = (kind, state, tool_name = null, stage = 'run', summary = null, tool_call_id = null) => {
    t += 2000;
    events.push({ event_id: `evt-${events.length}`, run_id: rid, sequence: events.length + 1, kind, state, tool_name, stage, summary, tool_call_id,
      timestamp: new Date(t).toISOString(), elapsed_ms: state === 'started' ? null : 1500 });
  };
  const call = (name, stage, id, outcome, state = 'succeeded') => { event('tool', 'started', name, stage, null, id); if (outcome !== undefined) event('tool', state, name, stage, outcome, id); };
  event('run', 'started');
  call('start_experiment_preparation', 'preparation', 'exec-1', { outcome: 'completed', missing_input_count: 3 });
  call('search_hypothesis_evidence', 'literature', 'exec-2', { outcome: 'completed', source_count: 2, sources: [{ source_handle: 'h1' }, { source_handle: 'h2' }] });
  call('retrieve_evidence_source', 'literature', 'exec-3', { outcome: 'completed', source_count: 1, sources: [{ source_id: 'epmc-1', document_id: 'doc1', content_kind: 'full_text', retrieval_status: 'live', title: 'Population pharmacokinetics of trastuzumab' }] });
  call('extract_cited_parameters', 'extraction', 'exec-4', { outcome: 'rejected', error_code: 'validation' }, 'rejected');
  if (running) { call('extract_cited_parameters', 'extraction', 'exec-5'); return { job_id: 'job', execution_run_id: rid, status: 'running', mode: 'research', execution_events: events }; }
  call('extract_cited_parameters', 'extraction', 'exec-5', { outcome: 'completed', candidate_count: 2, sources: [{ document_id: 'doc1', source_id: 'epmc-1' }],
    candidates: [{ parameter: 'pk.clearance_L_h', value: 0.127, unit: 'L/day' }, { parameter: 'pk.volume_L', value: 2.62, unit: 'L' }] });
  const snapshot = { experiment_id: 'exp', configuration_sha256: 'b'.repeat(64), duration_h: 4320, occupancy_threshold: 0.9,
    parameters: [{ scenario_id: 'baseline', parameter: 'pk.volume_L', value: 2.62, unit: 'L', provenance: 'reported', review_status: 'reviewed', source_ids: ['S2'], comparison: 'none', change: 'not_compared' },
      { scenario_id: 'half_life_x3', parameter: 'pk.elimination_half_life_h', value: 1029.6, unit: 'h', provenance: 'calculated', review_status: 'reviewed', source_ids: ['S2'], comparison: 'baseline', reference_value: 343.2, delta: 686.4, change: 'changed' }],
    schedules: [{ scenario_id: 'baseline', intervention: 'baseline', administration: [], comparison: 'none' }, { scenario_id: 'half_life_x3', intervention: 'half_life_x3', administration: [], comparison: 'baseline' }] };
  call('prepare_reviewed_comparison', 'configuration', 'exec-6', { outcome: 'completed', experiment: snapshot });
  const receipt = { result_id: 'sim-1', experiment_id: 'exp', configuration_sha256: 'b'.repeat(64), client_revision: 0, model_version: 'm', solver_version: 's', output_point_count: 634,
    metrics: [{ scenario_id: 'baseline', endpoint_occupancy: 0.629, occupancy_auc_h: 1, concentration_auc_nM_h: 1, threshold_status: 'crossed_within_window', total_time_above_h: 3492 },
      { scenario_id: 'half_life_x3', endpoint_occupancy: 0.998, occupancy_auc_h: 1, concentration_auc_nM_h: 1, threshold_status: 'still_above_at_horizon', total_time_above_h: 4320 }] };
  call('simulate_current_comparison', 'simulation', 'exec-7', { outcome: 'completed', result: receipt });
  call('inspect_verified_structure', 'structure', 'exec-8', { outcome: 'completed', structure: { available: true, pdb_id: '1N8Z', interface_residue_pair_count: 32, measurement_ids: ['M1', 'M2'] } });
  call('synthesize_grounded_answer', 'interpretation', 'exec-9', { outcome: 'completed', source_count: 2, result: receipt });
  event('run', 'succeeded', null, 'run', { outcome: 'completed' });
  return { job_id: 'job', execution_run_id: rid, status: 'completed', mode: 'research', execution_events: events,
    turn: { status: 'completed', synthesis: { status: 'grounded' }, result: { configuration: { scenarios: [{ scenario_id: 'baseline', label: 'Baseline' }, { scenario_id: 'half_life_x3', label: 'Threefold longer half-life' }] } } } };
}

test('a completed research run fills every stage from its recorded events', () => {
  const model = workflowModel(researchJob());
  assert.equal(model.status, 'completed');
  assert.deepEqual(model.stages.map(s => s.state), ['done', 'done', 'done', 'warning', 'done', 'done', 'done', 'done']);
  assert.equal(model.stages.find(s => s.id === 'search').metric, '2 sources found');
  assert.deepEqual(model.papers.map(p => [p.title, p.access, p.extraction, p.values]), [['Population pharmacokinetics of trastuzumab', 'Full text', 'values', 2]]);
  assert.deepEqual(model.values.map(v => `${v.label} ${v.display}`), ['Clearance 0.127 L/day', 'Distribution volume 2.62 L']);
  assert.deepEqual(model.inputs.map(i => [i.label, i.display, i.reviewed, i.changed, i.confirmed]), [['Distribution volume', '2.62 L', true, false, true], ['Effective half-life', '1,029.6 h', true, true, false]]);
  // The extracted 2.62 L independently matches the audited input; clearance (not an input here) does not.
  assert.deepEqual(model.values.map(v => v.matches), [false, true]);
  assert.equal(model.audited, true);
  assert.deepEqual(model.metrics.map(m => [m.label, m.occupancy]), [['Baseline', 0.629], ['Threefold longer half-life', 0.998]]);
  assert.equal(model.structure.pdb_id, '1N8Z');
  assert.equal(model.toolCalls, 9);
  assert.equal(model.log.find(r => r.state === 'rejected').detail, 'rejected by server validation');
  assert.equal(model.active, null);
});

test('a running run shows the active tool and a paper being read; later stages wait', () => {
  const model = workflowModel(researchJob({ running: true }));
  assert.equal(model.status, 'running');
  assert.equal(model.active.stage, 'extraction');
  assert.equal(model.stages.find(s => s.id === 'extraction').state, 'active');
  assert.equal(model.stages.find(s => s.id === 'simulation').state, 'waiting');
  assert.equal(model.papers[0].extraction, 'reading');
  assert.deepEqual(model.metrics, []);
});

test('edits mark literature stages as not needed instead of pending', () => {
  const job = researchJob();
  job.mode = 'edit';
  job.execution_events = job.execution_events.filter(e => !['search_hypothesis_evidence', 'retrieve_evidence_source', 'extract_cited_parameters', 'start_experiment_preparation'].includes(e.tool_name));
  job.execution_events.forEach((e, i) => { e.sequence = i + 1; });
  const model = workflowModel(job);
  assert.deepEqual(model.stages.filter(s => ['search', 'reading', 'extraction'].includes(s.id)).map(s => s.state), ['skipped', 'skipped', 'skipped']);
});

test('a tampered ledger is not drawn as a workflow', () => {
  const job = researchJob();
  job.execution_events[3].run_id = 'run-' + 'f'.repeat(32);
  const model = workflowModel(job);
  assert.equal(model.status, 'invalid');
  assert.equal(model.toolCalls, 0);
});

test('replay reveals recorded events in order on a compressed schedule', () => {
  const job = researchJob();
  const schedule = replaySchedule(job.execution_events, 5000);
  assert.equal(schedule.length, job.execution_events.length);
  assert.ok(schedule.every((ms, i) => i === 0 || ms > schedule[i - 1]) && schedule.at(-1) <= 5000 + 180 * schedule.length);
  const partial = replayJob(job, 7);   // through the first retrieval's outcome
  assert.equal(partial.status, 'running');
  assert.equal(partial.turn, undefined);
  assert.equal(workflowModel(partial).papers.length, 1);
  assert.equal(replayJob(job, 999), job);
});


test('extracted values are compared with model inputs in canonical units', async () => {
  const { canonicalValue } = await import('../lib/agent-workflow.ts');
  assert.ok(Math.abs(canonicalValue(0.127, 'L/day') - 0.0052917) < 1e-6);
  assert.equal(canonicalValue(148, 'kDa'), 148000);
  assert.ok(Math.abs(canonicalValue(6.23e5, 'M^-1 s^-1') - 2.2428) < 1e-4);
  assert.ok(Math.abs(canonicalValue(8.16e-5, 's^-1') - 0.29376) < 1e-6);
  assert.equal(canonicalValue(5, 'furlongs'), null);
});

test('interpreting the result does not mark the answer done before the agent writes it', () => {
  const events = [];
  const add = (kind, state, tool_name, tool_call_id) => events.push({ event_id: `e${events.length}`, run_id: rid, sequence: events.length + 1, kind, state, tool_name, stage: 'run',
    summary: state === 'started' ? null : { outcome: 'completed' }, tool_call_id, timestamp: '2026-11-15T10:00:00Z', elapsed_ms: state === 'started' ? null : 10 });
  add('run', 'started', null, null);
  add('tool', 'started', 'interpret_current_result', 'x1'); add('tool', 'succeeded', 'interpret_current_result', 'x1');
  const running = workflowModel({ job_id: 'j', execution_run_id: rid, status: 'running', mode: 'edit', execution_events: events });
  assert.equal(running.stages.find(s => s.id === 'answer').state, 'waiting');
  add('tool', 'started', 'synthesize_grounded_answer', 'x2');
  const writing = workflowModel({ job_id: 'j', execution_run_id: rid, status: 'running', mode: 'edit', execution_events: events });
  assert.equal(writing.stages.find(s => s.id === 'answer').state, 'active');
});
