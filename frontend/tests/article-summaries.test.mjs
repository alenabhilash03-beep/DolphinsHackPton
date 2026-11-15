import assert from 'node:assert/strict';
import test from 'node:test';
import {articleSummaries, plotLabel} from '../app/article-summaries.mjs';

const result = {result_id: 'sim-1', configuration: {evidence: [{evidence_id: 'cl', parameter: 'pk.clearance_L_h', original_value: 0.127, original_unit: 'L/day', review_status: 'candidate', source_ids: ['epmc-a']}]}};
const finding = (id, doc, stance = 'context', abstract = true) => ({finding_id: id, statement: `Finding ${id}.`, stance, abstract_only: abstract,
  citations: [{document_id: doc, source_id: 'epmc-' + doc, locator: 'abstract:0', quote: `Quote ${id}`, content_kind: abstract ? 'abstract' : 'full_text'}]});
const turn = (status = 'grounded') => ({result, research_papers: [
    {document_id: 'a', use_in_simulation: 'see_parameter_lineage', source: {title: 'Paper A', url: 'https://europepmc.org/a'}, extraction: {parameters: []}},
    {document_id: 'b', use_in_simulation: 'see_parameter_lineage', source: {title: 'Paper B', url: 'https://europepmc.org/b'}, extraction: {parameters: [{parameter: 'binding.affinity_nM', original_value: 5, original_unit: 'nM'}]}}],
  synthesis: {status, evidence_findings: [finding('F1', 'a', 'supports'), finding('F2', 'b', 'contradicts', false)],
    source_access: [{document_id: 'a', title: 'Paper A'}, {document_id: 'b', title: 'Paper B'}]}});
const interpretation = {paper_summaries: [{source_id: 'S2', finding: 'Reviewed PK summary.', locator: 'Table 1', use_in_model: 'Supplies clearance.', plot_ids: ['concentration', 'occupancy'], limitation: 'Clinical population model.'}]};
const experiment = {sources: [{source_id: 'S2', title: 'Quartino et al.', url: 'https://link.springer.com/x'}]};

test('AI findings come first, with paper, access, stance, quote and the graphs they inform', () => {
  const {kind, cards} = articleSummaries({turn: turn(), interpretation, experiment});
  assert.equal(kind, 'ai');
  assert.deepEqual(cards.map(c => [c.key, c.title, c.url, c.access, c.stance, c.summary, c.quote]), [
    ['F1', 'Paper A', 'https://europepmc.org/a', 'Abstract only', 'Supports the hypothesis', 'Finding F1.', 'Quote F1'],
    ['F2', 'Paper B', 'https://europepmc.org/b', 'Full text', 'Contradicts the hypothesis', 'Finding F2.', 'Quote F2']]);
  // Paper A supplied clearance (both graphs); paper B only an unused affinity candidate (occupancy).
  assert.deepEqual(cards.map(c => c.plots), [['concentration', 'occupancy'], ['occupancy']]);
  assert.equal(cards[0].note, 'This source supplies simulation inputs listed below.');
});
test('without accepted AI findings the reviewed source summaries are shown', () => {
  for (const t of [null, turn('rejected'), turn('unavailable'), {...turn(), synthesis: {status: 'grounded', evidence_findings: []}}]) {
    const {kind, cards} = articleSummaries({turn: t, interpretation, experiment});
    assert.equal(kind, 'source');
    assert.deepEqual(cards.map(c => [c.title, c.url, c.summary, c.plots, c.note, c.limitation, c.access, c.stance]),
      [['Quartino et al.', 'https://link.springer.com/x', 'Reviewed PK summary.', ['concentration', 'occupancy'], 'Supplies clearance.', 'Clinical population model.', null, null]]);
  }
});
test('nothing to show is an explicit empty state, and graph labels are readable', () => {
  assert.deepEqual(articleSummaries({}), {kind: 'none', cards: []});
  assert.deepEqual(articleSummaries({turn: turn('rejected'), interpretation: {paper_summaries: []}}), {kind: 'none', cards: []});
  assert.equal(plotLabel('concentration'), 'Concentration graph');
  assert.equal(plotLabel('occupancy'), 'Occupancy graph');
});
