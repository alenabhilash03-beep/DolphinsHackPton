"""Aggregate 5C.1 live demo-candidate receipts into a committed, secret-free verification record.

Reads work/5C.1/*.json written by run_demo_candidate.py, profile_workspace.mjs and
check_demo_browser.mjs; writes data/research/verification/5C.1-demo-examples.json.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work' / '5C.1'


def compact(run):
    return {key: run.get(key) for key in ('name', 'question', 'drug', 'target', 'route', 'baseline', 'status', 'elapsed_s',
            'category', 'result_id', 'configuration_mode', 'endpoint_occupancy', 'structure', 'synthesis_status',
            'verdict', 'questions', 'trace_status') if run.get(key) is not None} | {
        'code': 'after extraction-retention fix' if ('fixed' in run['name'] or not run['name'].startswith('q1-primary')) else 'before fix',
        'tool_sequence': [f"{t['tool']}:{t['state']}" for t in run.get('tool_outcomes', [])],
        'papers': [{k: p[k] for k in ('title', 'content_kind', 'extraction_status', 'candidates')} for p in run.get('papers', [])]}


def main():
    runs = [json.loads(path.read_text()) for path in sorted(WORK.glob('q*.json'))]
    groups = {}
    for run in runs:
        key = run.get('question') or run['name']
        groups.setdefault(key, []).append(run)
    def outcome(run):
        if run['status'] == 'completed' and run.get('result_id') and run.get('synthesis_status') == 'grounded': return 'full'
        if run['status'] == 'completed' and run.get('result_id'): return 'result_without_answer'
        return run['status']
    record = {
        'subphase': '5C.1', 'provider': 'NVIDIA Nemotron (live)', 'literature': 'Europe PMC (live)',
        'note': 'Each run is one live agent execution; outcomes vary between runs because retrieval and model output vary.',
        'unrecorded_runs': [{'question': "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?",
            'code': 'before fix', 'status': 'needs_inputs', 'elapsed_s': 77.3,
            'detail': 'All five extraction attempts rejected (abstract-only PK range; EC50 is not KD); reviewed comparison correctly '
                      'unavailable; 1N8Z inspected; grounded research-only answer. Receipt overwritten by a rerun; summary kept from the run log.'}],
        'questions': [{'question': question, 'runs': len(items),
                       'outcomes': [outcome(r) for r in items],
                       'receipts': [compact(r) for r in items]} for question, items in groups.items()],
    }
    for extra in ('performance', 'browser-check'):
        path = WORK / f'{extra}.json'
        if path.exists(): record[extra.replace('-', '_')] = json.loads(path.read_text())
    out = ROOT / 'data/research/verification/5C.1-demo-examples.json'
    out.write_text(json.dumps(record, indent=2) + '\n')
    for item in record['questions']:
        print(item['runs'], item['outcomes'], item['question'][:90])


if __name__ == '__main__':
    main()
