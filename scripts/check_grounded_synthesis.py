"""Live pinned free Nemotron synthesis check through the agent's synthesis tool.

The agent loop is driven by the offline scripted harness and the source is the SYNTHETIC software-test
abstract, so this verifies only that the live model's qualitative answer survives grounding validation.
It is not evidence about any real drug and makes no literature request.
"""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'apps/api'),str(ROOT/'apps/api/tests')]
from test_generalized_agent import research_service
from app.config import Settings
from app.schemas.generalized_agent import AgentResearchRequest


def main():
    report={'source':'synthetic software-test abstract','agent_driver':'offline scripted harness','synthesizer':'live '+Settings().hypothesim_llm_model,'cases':{}}
    failed=False
    for case,missing in (('research_and_simulation',False),('research_only',True)):
        with TemporaryDirectory(prefix='hypothesim-8b1-') as directory:
            agent,request=research_service(Path(directory),missing)
            agent.settings=Settings(langsmith_tracing=False)
            agent.synthesizer=None  # use the configured live synthesizer
            turn=agent.run(AgentResearchRequest(request=request,structured_baseline=True))
        synthesis=turn.synthesis
        event=next(e for e in turn.execution_events if e.tool_name=='synthesize_grounded_answer' and e.state!='started')
        ok=bool(synthesis and synthesis.status=='grounded' and synthesis.basis==case and synthesis.evidence_findings
            and (synthesis.result_id==turn.result.result_id if turn.result else synthesis.result_id is None and not synthesis.simulation_implications))
        failed=failed or not ok
        report['cases'][case]={'passed':ok,'turn_status':turn.status,'tool_state':event.state,'tool_elapsed_ms':round(event.elapsed_ms),
            'synthesis':synthesis.model_dump(mode='json') if synthesis else None}
    report['status']='failed' if failed else 'passed'
    (ROOT/'work').mkdir(exist_ok=True)
    (ROOT/'work'/'grounded-synthesis-check.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'cases':{name:{key:item[key] for key in ('passed','turn_status','tool_state','tool_elapsed_ms')}|
        {'synthesis_status':item['synthesis']['status'] if item['synthesis'] else None,'notes':item['synthesis']['notes'] if item['synthesis'] else None}
        for name,item in report['cases'].items()}},indent=2))
    return 1 if failed else 0

if __name__=='__main__': raise SystemExit(main())
