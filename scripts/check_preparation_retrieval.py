"""Bounded live evidence-tool smoke check; no LLM, parameter extraction or solver."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.agent.evidence_tools import build_evidence_tools
from app.research.parameter_extraction import ParameterResearchService
from app.research.source_documents import SourceDocumentService, snapshot_digest
from app.schemas.experiment_preparation import PreparationRequest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--drug', default='imatinib')
    parser.add_argument('--target', default='ABL1')
    parser.add_argument('--focus', choices=['binding', 'pk', 'exposure'], default='pk')
    args = parser.parse_args()
    request = PreparationRequest(drug_name=args.drug, target=args.target,
        original_hypothesis='Source availability check only; no scientific model or parameter claim.')
    service = ParameterResearchService(documents=SourceDocumentService(cache_dir=ROOT / 'work/live-preparation-snapshots'))
    tools = {tool.name: tool for tool in build_evidence_tools(service)}
    search = tools['search_hypothesis_evidence'].invoke({'request': request.model_dump(mode='json'), 'focus': args.focus})
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'origin': 'live_tool_retrieval_smoke_not_scientific_validation',
        'drug': args.drug, 'target': args.target, 'focus': args.focus, 'status': 'unavailable',
        'search_status': search['status'], 'query': search['search']['query'] if search['search'] else None,
        'source_attempts': [], 'llm_called': False, 'parameters_extracted': False, 'solver_called': False}
    # One search (at most five metadata records), then at most two bounded source pages.
    for handle in list(search['source_handles'])[:2]:
        page = tools['retrieve_evidence_source'].invoke({'source_handle': handle})
        attempt = {'status': page['status'], 'reasons': page['reasons']}
        if page['status'] == 'retrieved':
            doc = service.documents.get(page['document']['document_id'])
            if snapshot_digest(doc) != doc.source.snapshot_sha256:
                raise ValueError('Retrieved source checksum verification failed')
            attempt.update(title=doc.source.title, url=str(doc.source.url), identifiers=doc.source.identifiers,
                retrieved_at=doc.source.retrieved_at.isoformat(), content_kind=doc.source.content_kind,
                snapshot_sha256=doc.source.snapshot_sha256, segment_count=len(doc.segments),
                character_count=sum(len(segment.text) for segment in doc.segments), warnings=doc.warnings,
                next_start_block=page['next_start_block'])
            report['status'] = 'passed'
        report['source_attempts'].append(attempt)
        if report['status'] == 'passed':
            break
    if search['status'] == 'live' and not search['source_handles']:
        report['status'] = 'no_results'
    output = ROOT / 'work/preparation-retrieval-check.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    print(f'Report: {output}')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
