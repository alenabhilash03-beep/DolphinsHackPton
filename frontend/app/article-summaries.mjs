/* Which article summaries to show beside the graphs. Pure: values come from the agent turn and interpretation. */
import {findingLinks} from './science/lib/synthesis-view.js';
import {locatorLabel, readableText} from './science/lib/readable.js';

const STANCE = {supports: 'Supports the hypothesis', contradicts: 'Contradicts the hypothesis', context: 'Context'};
const unique = items => [...new Set(items)];

/** AI-written findings from the grounded answer first; otherwise the source summaries behind the plotted inputs. */
export function articleSummaries({turn = null, interpretation = null, experiment = null} = {}) {
  const synthesis = turn?.synthesis;
  const findings = synthesis?.status === 'grounded' ? synthesis.evidence_findings ?? [] : [];
  if (findings.length) {
    const papers = new Map((turn.research_papers ?? []).map(paper => [paper.document_id, paper]));
    const access = new Map((synthesis.source_access ?? []).map(item => [item.document_id, item]));
    return {kind: 'ai', cards: findings.map(finding => {
      const citation = finding.citations[0];
      const paper = papers.get(citation.document_id), source = access.get(citation.document_id);
      const links = findingLinks(turn, finding);
      return {key: finding.finding_id, kind: 'ai', title: paper?.source.title ?? source?.title ?? citation.source_id,
        url: paper?.source.url ?? null, access: finding.abstract_only ? 'Abstract only' : 'Full text', stance: STANCE[finding.stance],
        summary: readableText(finding.statement), quote: citation.quote, locator: locatorLabel(citation.locator),
        plots: unique(links.flatMap(link => [...link.records, ...link.candidates].flatMap(item => item.plots))),
        note: links[0]?.simulationUse ?? null};
    })};
  }
  const summaries = interpretation?.paper_summaries ?? [];
  if (summaries.length) {
    const sources = new Map((experiment?.sources ?? []).map(source => [source.source_id, source]));
    return {kind: 'source', cards: summaries.map(summary => {
      const source = sources.get(summary.source_id);
      return {key: summary.source_id, kind: 'source', title: source?.title ?? summary.source_id, url: source?.url ?? null,
        access: null, stance: null, summary: readableText(summary.finding), quote: null, locator: locatorLabel(summary.locator),
        plots: unique(summary.plot_ids ?? []), note: summary.use_in_model, limitation: summary.limitation};
    })};
  }
  return {kind: 'none', cards: []};
}

export const plotLabel = id => id === 'concentration' ? 'Concentration graph' : 'Occupancy graph';
