"""Run one demo candidate question through the live generalized agent (5C.1).

Uses the configured NVIDIA endpoint and live literature retrieval; never a scripted model.
Writes a compact, secret-free receipt to work/5C.1/<name>.json and prints a summary.

Example:
  uv run python scripts/run_demo_candidate.py --name primary --drug trastuzumab --target HER2 \
      --route iv_infusion --question "Would tripling trastuzumab's half-life ..."
"""
import argparse
import json
from pathlib import Path
import sys
from time import monotonic

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.agent.generalized import GeneralizedAgentService  # noqa: E402
from app.schemas.generalized_agent import AgentEditRequest, AgentResearchRequest  # noqa: E402


def summarize(turn, elapsed):
    events = turn.execution_events or []
    calls = [e for e in events if e.kind == 'tool' and e.state != 'started'] if events and hasattr(events[0], 'kind') else []
    prep = turn.preparation.preparation if turn.preparation else None
    return {
        'status': turn.status, 'elapsed_s': round(elapsed, 1), 'tool_calls': turn.tool_calls,
        'tool_outcomes': [{'tool': e.tool_name, 'state': e.state, 'elapsed_ms': e.elapsed_ms,
                           'error_code': e.summary.error_code if e.summary else None} for e in calls],
        'questions': turn.questions,
        'missing_inputs': [m.model_dump(mode='json') for m in (prep.missing_inputs or [])] if prep and getattr(prep, 'missing_inputs', None) else [],
        'papers': [{'title': p.source.title, 'content_kind': p.source.content_kind, 'retrieval_status': p.source.retrieval_status,
                    'extraction_status': p.extraction.status, 'use_in_simulation': p.use_in_simulation,
                    'candidates': [f'{v.parameter} = {v.original_value} {v.original_unit}' for v in p.extraction.parameters],
                    'rejected': p.extraction.rejected_candidates[:8], 'notes': p.extraction.notes[:8]}
                   for p in turn.research_papers],
        'result_id': turn.result.result_id if turn.result else None,
        'configuration_mode': turn.result.configuration.mode if turn.result else None,
        'endpoint_occupancy': {s.scenario_id: round(s.metrics.endpoint_occupancy, 4) for s in turn.result.scenarios} if turn.result else None,
        'structure': {'status': turn.structure.status, 'pdb': turn.structure.metadata.provenance.pdb_id if turn.structure.metadata else None, 'measurements': len(turn.structure.measurements)} if turn.structure else None,
        'synthesis_status': turn.synthesis.status if turn.synthesis else None,
        'verdict': turn.synthesis.answer.verdict if turn.synthesis and turn.synthesis.answer else None,
        'headline': turn.synthesis.answer.model_dump(mode='json') if turn.synthesis and turn.synthesis.answer else None,
        'synthesis_notes': turn.synthesis.notes[:8] if turn.synthesis else [],
        'trace_status': turn.trace_status,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--drug', default='trastuzumab')
    parser.add_argument('--target')
    parser.add_argument('--route')
    parser.add_argument('--question', default='')
    parser.add_argument('--edit', help='Apply this edit to the reviewed primary result instead of researching')
    parser.add_argument('--baseline', action='store_true', help='Authorize a structured baseline from compatible evidence')
    args = parser.parse_args()
    agent = GeneralizedAgentService()
    if args.edit:
        # Seed the reviewed primary result (identical to a completed live primary run) into a private store.
        from uuid import uuid4
        from app.research.demo import load_demo
        from app.research.preparation import PreparationService
        from app.research.preparation_store import PreparationStore
        agent = GeneralizedAgentService(PreparationService(store=PreparationStore(ROOT / 'work' / f'5C1-edit-{uuid4().hex}.sqlite3')))
        base = load_demo().result
        agent.turns.seed(base)
        request = AgentEditRequest(base_result_id=base.result_id, base_experiment_id=base.configuration.experiment_id,
                                   base_configuration_sha256=base.configuration_hash, client_revision=1, text=args.edit)
        args.question = args.edit
    else:
        request = AgentResearchRequest(request={'drug_name': args.drug, 'target': args.target, 'route': args.route,
                                                'original_hypothesis': args.question}, structured_baseline=args.baseline)
    started = monotonic()
    try:
        def show(event):
            print(f"  [{event.sequence:>2}] {event.tool_name or 'run'} {event.state}"
                  + (f" ({event.summary.error_code})" if event.summary and event.summary.error_code else ''), flush=True)
        turn = agent.run(request, edit=bool(args.edit), on_execution=show)
    except Exception as exc:  # noqa: BLE001 - report the category, never secrets
        report = {'name': args.name, 'question': args.question, 'drug': args.drug, 'target': args.target, 'route': args.route,
                  'status': 'failed', 'category': type(exc).__name__, 'reason': str(exc)[:400],
                  'elapsed_s': round(monotonic() - started, 1)}
    else:
        report = {'name': args.name, 'question': args.question, 'drug': args.drug, 'target': args.target,
                  'route': args.route, 'baseline': args.baseline, **summarize(turn, monotonic() - started)}
    out = ROOT / 'work' / '5C.1'
    out.mkdir(parents=True, exist_ok=True)
    (out / f'{args.name}.json').write_text(json.dumps(report, indent=2, default=str) + '\n')
    print(json.dumps(report, indent=2, default=str))
    return 0 if report['status'] != 'failed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
