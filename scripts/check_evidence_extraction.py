"""Bounded public-source/tool check; NVIDIA extraction is explicit and never calls the solver."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))

from app.agent.evidence_tools import build_evidence_tools
from app.research.parameter_extraction import ParameterResearchService
from app.research.source_documents import SourceDocumentService
from app.schemas.experiment_preparation import PreparationRequest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='Contact Europe PMC; no LLM unless explicitly selected.')
    parser.add_argument('--start-block', type=int, default=0, help='Read a bounded later full-text page using a returned block offset.')
    parser.add_argument('--pmid', help='Optional exact PubMed source check after the live search; source identity is verified.')
    parser.add_argument('--live-llm', action='store_true', help='Also invoke the configured NVIDIA structured extractor; no paid fallback.')
    args = parser.parse_args()
    if not args.live:
        parser.error('Use --live to authorize the bounded public-source check.')
    request = PreparationRequest(drug_name='trastuzumab', target='HER2', route='iv_infusion',
        original_hypothesis='How does trastuzumab half-life affect HER2 target occupancy?')
    service = ParameterResearchService(SourceDocumentService(cache_dir=ROOT/'work/evidence-snapshots'))
    search, retrieve, extract = build_evidence_tools(service)
    report = {'status':'failed','tools':[], 'live_llm_requested':args.live_llm,'solver_called':False}
    try:
        found = search.invoke({'request':request.model_dump(mode='json'), 'focus':'pk'})
        report['tools'].append(search.name)
        report['search_status'] = found['status']
        if found['status'] != 'live' or not found['source_handles']:
            print(json.dumps(report)); return 1
        handles = sorted(found['source_handles'], key=lambda h: not bool(service.documents.records[h].pmcid))
        if args.pmid:
            exact_record = service.documents.literature.lookup_pmid(args.pmid)
            handles = [service.documents.register(exact_record)]
        response = None
        for handle in handles[:2]:
            response = retrieve.invoke({'source_handle':handle,'start_block':args.start_block})
            report['tools'].append(retrieve.name)
            if response['status'] == 'retrieved':
                break
        if not response or response['status'] != 'retrieved':
            print(json.dumps(report)); return 1
        doc = response['document']
        report.update(source_url=doc['source']['url'], content_kind=doc['source']['content_kind'],
            source_status=doc['source']['retrieval_status'], snapshot_sha256=doc['source']['snapshot_sha256'],
            next_start_block=response['next_start_block'],
            segment_count=len(doc['segments']), warnings=doc['warnings'])
        if args.live_llm:
            ranked = sorted(doc['segments'], key=lambda s: not any(word in s['text'].lower() for word in ('half-life','half life','clearance','volume','kd','dissociation')))
            result = extract.invoke({'document_id':doc['document_id'], 'request':request.model_dump(mode='json'),
                'drug_identifier':'CHEMBL1201585','target_identifier':'HER2', 'locators':[s['locator'] for s in ranked[:6]]})
            report['tools'].append(extract.name)
            report.update(extraction_status=result['status'], candidate_count=len(result['parameters']),
                rejected_count=len(result['rejected_candidates']), missing_parameters=result['missing_parameters'])
            if result['status'] not in {'candidates','no_values'}:
                print(json.dumps(report)); return 1
        report['status'] = 'passed'
        print(json.dumps(report))
        return 0
    except Exception:
        report['error'] = 'Live evidence check unavailable or failed validation; details deliberately sanitized.'
        print(json.dumps(report)); return 1


if __name__ == '__main__':
    raise SystemExit(main())
