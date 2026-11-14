"""Live pinned free Nemotron generalized research/edit check; never uses OpenAI."""
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'apps/api'))
from app.agent.generalized import GeneralizedAgentService
from app.schemas.generalized_agent import AgentResearchRequest, AgentEditRequest
from app.research.demo import load_demo


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode',choices=['research','edit'],default='research')
    parser.add_argument('--require-tracing',action='store_true')
    args=parser.parse_args()
    agent=GeneralizedAgentService()
    if args.mode=='research':
        request=AgentResearchRequest(request={'drug_name':'imatinib','target':'ABL1','route':'hypothetical_iv_bolus',
            'original_hypothesis':'How would hypothetical bloodstream imatinib input change ABL1 occupancy? Research the evidence and identify missing PK, binding and target-site exposure data. Do not assume missing values.'})
    else:
        base=load_demo().result
        # Use a private verification store, so this repeatable check never consumes a user's edit head.
        from app.research.preparation import PreparationService
        from app.research.preparation_store import PreparationStore
        from uuid import uuid4
        agent=GeneralizedAgentService(PreparationService(store=PreparationStore(ROOT/'work'/f'agent-edit-check-{uuid4().hex}.sqlite3')))
        agent.turns.seed(base)
        request=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,
            base_configuration_sha256=base.configuration_hash,client_revision=1,text='Run this comparison for 120 days')
    try:
        turn=agent.run(request,edit=args.mode=='edit',require_remote_trace=args.require_tracing)
    except Exception as exc:
        message=str(exc)
        for key in (agent.settings.nvidia_api_key,agent.settings.langsmith_api_key):
            if key: message=message.replace(key.get_secret_value(),'[REDACTED]')
        print(json.dumps({'status':'failed','category':type(exc).__name__,'mode':args.mode,'reason':message[:500]}))
        return 1
    if args.mode=='edit' and (turn.status!='completed' or not turn.result or turn.result.configuration.duration_h!=2880 or not turn.parent_result_id):
        print(json.dumps({'status':'failed','reason':'Expected edited numerical result was not produced'})); return 1
    if args.mode=='research' and (turn.status!='needs_inputs' or turn.result is not None):
        print(json.dumps({'status':'failed','reason':'Expected honest missing-input outcome'})); return 1
    events=turn.execution_events
    if not events or events[0].state!='started' or events[-1].state not in {'succeeded','needs_inputs','unsupported'}:
        print(json.dumps({'status':'failed','reason':'Missing completed execution ledger'})); return 1
    if [e.sequence for e in events]!=list(range(1,len(events)+1)) or any(e.run_id!=turn.execution_run_id for e in events):
        print(json.dumps({'status':'failed','reason':'Inconsistent execution sequence'})); return 1
    receipts=[e.summary.result for e in events if e.summary and e.summary.result]
    if turn.result and (not receipts or any(r.result_id!=turn.result.result_id or r.configuration_sha256!=turn.result.configuration_hash for r in receipts)):
        print(json.dumps({'status':'failed','reason':'Execution receipt/result mismatch'})); return 1
    report={'status':turn.status,'mode':args.mode,'turn_id':turn.turn_id,'tool_calls':turn.tool_calls,
        'trace_id':turn.trace_id,'trace_status':turn.trace_status,'result_id':turn.result.result_id if turn.result else None,
        'preparation_id':turn.preparation.preparation.preparation_id if turn.preparation else None,
        'questions':turn.questions,'applied_changes':turn.applied_changes,
        'execution_run_id':turn.execution_run_id,'execution_event_count':len(events),
        'execution_events':[{'sequence':e.sequence,'kind':e.kind,'tool_name':e.tool_name,'state':e.state,
            'elapsed_ms':e.elapsed_ms} for e in events],
        'configured_experiments':[e.summary.experiment.model_dump(mode='json') for e in events if e.summary and e.summary.experiment],
        'solver_receipts':[r.model_dump(mode='json') for r in receipts]}
    path=ROOT/'work'/f'generalized-agent-{args.mode}.json'
    path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0

if __name__=='__main__': raise SystemExit(main())
