import assert from 'node:assert/strict';
import test from 'node:test';
import { listPapers, readerKey } from '../lib/paper-list.ts';

test('agent papers and input sources merge by identifier, and only Europe PMC papers open in the reader', () => {
  const turn = { research_papers: [{ document_id: 'd1', use_in_simulation: 'reviewed_reference_separate',
    source: { title: 'Population PK', url: 'https://www.ebi.ac.uk/x/fullTextXML', content_kind: 'full_text', identifiers: { pmid: '30467591', pmcid: 'PMC6394489', doi: '10.1/a' } } }] };
  const experiment = { sources: [
    { source_id: 'S2', title: 'Quartino 2019', url: 'https://link.springer.com/a', source_kind: 'primary_study', identifiers: { pmid: '30467591', doi: '10.1/a' } },
    { source_id: 'S3', title: 'Fab study', source_kind: 'primary_study', identifiers: { pmid: '27043557' } },
    { source_id: 'S1', title: 'Label', url: 'https://example.com/label.pdf', source_kind: 'product_label', identifiers: {} }] };
  const papers = listPapers(turn, experiment);
  assert.deepEqual(papers.map(p => [p.title, p.key, p.origin]), [['Population PK', 'PMC6394489', 'agent'], ['Fab study', 'PMID27043557', 'input'], ['Label', null, 'input']]);
  assert.equal(papers[0].url, 'https://europepmc.org/article/PMC/6394489');
  assert.match(papers[0].usedFor, /audited model inputs/);
  assert.deepEqual(papers[0].identifiers, ['PMC6394489', 'PMID 30467591', 'doi:10.1/a']);
});

test('reader keys accept only well-formed PMCIDs and PMIDs', () => {
  assert.equal(readerKey({ pmcid: 'pmc123' }), 'PMC123');
  assert.equal(readerKey({ pmid: '12345678' }), 'PMID12345678');
  assert.equal(readerKey({ pmid: '12' }), null);
  assert.equal(readerKey({ pmcid: '../x' }), null);
  assert.equal(readerKey(null), null);
});
