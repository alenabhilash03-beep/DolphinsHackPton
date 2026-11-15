"""Turn a completed live agent job into a demo replay file (data/demo/replay/<name>.json).

Record the job first through the running app (POST /api/agent/jobs/research or /api/agent/jobs/edits, then poll
GET /api/agent/jobs/<id> until it completes) and save the final job JSON. Then:

  uv run python scripts/record_demo_replay.py --job q1-job.json --name q1-trastuzumab
  uv run python scripts/record_demo_replay.py --job q2-job.json --name q2-120-days --edit-text "Run this comparison for 120 days"

Only completed jobs with a simulation result and a grounded answer are accepted.
"""
import argparse
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def seconds(ts: str) -> float:
    return datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--edit-text', help='Follow-up text this replay answers (edit replays only)')
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text())
    turn = job['turn']
    if job['status'] != 'completed' or not turn or turn['status'] != 'completed' or not turn.get('result'):
        raise SystemExit('Only a completed job with a simulation result can become a demo replay')
    if (turn.get('synthesis') or {}).get('status') != 'grounded':
        raise SystemExit('The recorded run must include a grounded written answer')
    events = job['execution_events']
    t0 = seconds(events[0]['timestamp'])
    starts, steps = {}, []
    for e in events:
        if e['kind'] != 'tool': continue
        if e['state'] == 'started': starts[e['tool_call_id']] = e
        else:
            s = starts.pop(e['tool_call_id'])
            steps.append({'tool': e['tool_name'], 'state': e['state'], 'summary': e.get('summary'),
                'start_s': round(seconds(s['timestamp']) - t0, 3), 'end_s': round(seconds(e['timestamp']) - t0, 3)})
    duration = round(seconds(events[-1]['timestamp']) - t0, 3)
    if job['mode'] == 'edit':
        if not args.edit_text: raise SystemExit('--edit-text is required for a follow-up replay')
        kind, match = 'edit', {'text': args.edit_text, 'base_result_id': turn['parent_result_id']}
    else:
        r = job['research_request']['request']
        kind, match = 'research', {k: r[k] for k in ('original_hypothesis', 'drug_name', 'target')} | {'route': r['route'] or 'iv_infusion'}
    out = {'name': args.name, 'kind': kind, 'match': match, 'recorded_run_id': job['execution_run_id'],
           'recorded_at': events[0]['timestamp'], 'duration_s': duration, 'steps': steps, 'turn': turn}
    path = ROOT / 'data/demo/replay' / f'{args.name}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'{path.relative_to(ROOT)}: {kind}, {len(steps)} tool steps, {duration:.0f} s, result {turn["result"]["result_id"]}')


if __name__ == '__main__':
    main()
