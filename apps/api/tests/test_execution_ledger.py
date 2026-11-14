"""Actual LangChain tool lifecycle, state projections and durable queue polling (offline)."""
import json
from collections import defaultdict
from datetime import datetime
from threading import Event
from time import monotonic,sleep
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from app.agent.generalized import GeneralizedAgentService
from app.research.agent_jobs import AgentQueue,AgentJob
from app.research.execution_ledger import ExecutionLedger,snapshot
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore,StalePreparation
from app.research.demo import load_demo
from app.schemas.execution import ExecutionEvent,ExecutionSummary
from app.schemas.generalized_agent import AgentEditRequest,AgentResearchRequest,AgentTurn
from app.main import create_app
from test_generalized_agent import DrivingModel,research_service,SETTINGS
from test_research_agent import ScriptedModel


def edit_service(tmp_path,model=None,text='Set affinity to 2 nM in the affinity alternative'):
    base=load_demo().result
    agent=GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path/'p.sqlite3')),
        SETTINGS,model or DrivingModel(mode='edit'))
    request=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash,client_revision=1,selected_scenario_id='affinity_x10',text=text)
    return agent,request,base


def wait(queue,key,terminal=True):
    deadline=monotonic()+5
    while monotonic()<deadline:
        job=queue.read(key)
        ready = job.status in {'completed','failed'} if terminal else any(
            e.tool_name=='simulate_current_comparison' and e.state=='started' for e in job.execution_events)
        if ready: return job
        sleep(.005)
    raise AssertionError('Expected job state not reached')


def assert_lifecycle(events):
    assert [e.sequence for e in events]==list(range(1,len(events)+1))
    assert len({e.event_id for e in events})==len(events)
    assert len({e.run_id for e in events})==1
    assert all(e.timestamp.tzinfo for e in events)
    grouped=defaultdict(list)
    for event in events:grouped[event.tool_call_id].append(event)
    for pair in grouped.values():
        assert len(pair)==2
        assert pair[0].state=='started' and pair[0].summary is None
        assert pair[1].state!='started' and pair[1].elapsed_ms>=0
        assert pair[0].timestamp<=pair[1].timestamp
        assert pair[0].tool_name==pair[1].tool_name


def test_edit_ledger_matches_solver_configuration_deltas_and_persisted_turn(tmp_path):
    agent,req,base=edit_service(tmp_path)
    observed=[]
    turn=agent.run(req,edit=True,on_execution=observed.append)
    assert observed==turn.execution_events==agent.turns.read(turn.turn_id).execution_events
    assert_lifecycle(observed)
    configured=next(e.summary.experiment for e in observed if e.summary and e.summary.experiment)
    assert configured.configuration_sha256==turn.result.configuration_hash
    assert configured.reference_configuration_sha256==base.configuration_hash
    kd=next(p for p in configured.parameters if p.parameter=='binding.affinity_nM' and p.scenario_id=='affinity_x10')
    assert kd.value==2 and kd.unit=='nM' and kd.reference_value==base.configuration.scenarios[2].binding.affinity_nM
    assert kd.delta==kd.value-kd.reference_value and kd.comparison=='previous_result'
    assert kd.provenance=='user_supplied' and kd.review_status=='candidate'
    koff=next(p for p in configured.parameters if p.parameter=='binding.dissociation_h_inv' and p.scenario_id=='affinity_x10')
    assert koff.provenance=='calculated' and koff.value==2*turn.result.configuration.scenarios[2].binding.association_nM_inv_h_inv
    assert all(p.change=='unchanged' for p in configured.parameters if p.scenario_id=='baseline')
    receipt=next(e.summary.result for e in observed if e.tool_name=='simulate_current_comparison' and e.summary)
    assert receipt.result_id==turn.result.result_id and receipt.configuration_sha256==configured.configuration_sha256
    assert [m.endpoint_occupancy for m in receipt.metrics]==[s.metrics.endpoint_occupancy for s in turn.result.scenarios]
    assert 'central_concentration_nM' not in json.dumps(receipt.model_dump(mode='json'))


@pytest.mark.parametrize('missing',[False,True])
def test_research_events_capture_sources_candidate_counts_and_missing_data(tmp_path,missing):
    agent,req=research_service(tmp_path,missing)
    turn=agent.run(AgentResearchRequest(request=req,structured_baseline=True))
    assert_lifecycle(turn.execution_events)
    extracted=next(e for e in turn.execution_events if e.tool_name=='extract_cited_parameters' and e.summary)
    assert extracted.summary.candidate_count>0 and extracted.summary.sources[0].document_id
    retrieved=next(e for e in turn.execution_events if e.tool_name=='retrieve_evidence_source' and e.summary)
    assert retrieved.summary.sources==extracted.summary.sources
    assert retrieved.summary.sources[0].content_kind in {'abstract','full_text'}
    assert turn.execution_events[-1].state==('needs_inputs' if missing else 'succeeded')
    if missing:
        assert not any(e.tool_name=='simulate_current_comparison' for e in turn.execution_events)
        assert not any(e.summary and e.summary.result for e in turn.execution_events)
    else:
        assert next(e.summary.experiment for e in turn.execution_events if e.summary and e.summary.experiment).configuration_sha256==turn.result.configuration_hash


def script(actions):
    return ScriptedModel(responses=[AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':f'call-{i}'}]) for i,(name,args) in enumerate(actions)])


def test_rejected_tool_then_recovery_has_distinct_execution_ids_without_raw_errors(tmp_path):
    model=script([('simulate_current_comparison',{}),('read_current_experiment',{}),('apply_requested_edit',{}),
        ('simulate_current_comparison',{}),('interpret_current_result',{}),('AgentDecision',{'status':'completed'})])
    agent,req,_=edit_service(tmp_path,model)
    turn=agent.run(req,edit=True)
    attempts=[e for e in turn.execution_events if e.tool_name=='simulate_current_comparison']
    assert [e.state for e in attempts]==['started','rejected','started','succeeded']
    assert attempts[0].tool_call_id!=attempts[2].tool_call_id
    assert attempts[1].summary.error_code=='validation'
    assert 'Configure this turn first' not in json.dumps([e.model_dump(mode='json') for e in attempts])
    assert_lifecycle(turn.execution_events)


def test_unsupported_edit_is_clarification_and_never_configuration_or_solver(tmp_path):
    model=script([('read_current_experiment',{}),('apply_requested_edit',{}),('AgentDecision',{'status':'needs_inputs'})])
    agent,req,_=edit_service(tmp_path,model,text='Make it better')
    turn=agent.run(req,edit=True)
    assert turn.result is None and turn.execution_events[-1].state=='needs_inputs'
    action=next(e for e in turn.execution_events if e.tool_name=='apply_requested_edit' and e.summary)
    assert action.state=='needs_inputs' and action.summary.experiment is None


def test_tool_exception_closes_active_action_and_redacts_provider_payload(tmp_path,monkeypatch):
    def fail(*args,**kwargs):raise RuntimeError('PRIVATE_SECRET private source prompt and provider payload')
    monkeypatch.setattr('app.simulation.service.run_simulation',fail)
    agent,req,_=edit_service(tmp_path)
    queue=AgentQueue(agent)
    try:
        job=wait(queue,queue.submit(req,edit=True).job_id)
        assert job.status=='failed' and job.turn is None
        assert_lifecycle(job.execution_events)
        sim=[e for e in job.execution_events if e.tool_name=='simulate_current_comparison']
        assert [e.state for e in sim]==['started','failed'] and sim[-1].summary.result is None
        assert job.execution_events[-1].state=='failed'
        assert 'PRIVATE_SECRET' not in job.model_dump_json()
        assert 'private source prompt' not in job.model_dump_json()
    finally:queue.close()


def test_polling_exposes_running_solver_then_receipt_and_survives_reload(tmp_path,monkeypatch):
    from app.simulation.service import run_simulation
    gate=Event()
    def slow(*args,**kwargs):
        assert gate.wait(5)
        return run_simulation(*args,**kwargs)
    monkeypatch.setattr('app.simulation.service.run_simulation',slow)
    agent,req,_=edit_service(tmp_path)
    queue=AgentQueue(agent)
    restarted=None
    try:
        submitted=queue.submit(req,edit=True)
        running=wait(queue,submitted.job_id,terminal=False)
        assert running.status=='running' and running.turn is None
        assert running.execution_events[-1].state=='started' and running.execution_events[-1].stage=='simulation'
        assert not any(e.summary and e.summary.result for e in running.execution_events)
        assert any(e.summary and e.summary.experiment for e in running.execution_events)
        # A concurrent reader/import does not interrupt the active owner.
        restarted=AgentQueue(agent)
        assert restarted.read(submitted.job_id).execution_events==running.execution_events
        gate.set();finished=wait(queue,submitted.job_id)
        assert finished.execution_run_id==finished.turn.execution_run_id==submitted.execution_run_id
        assert finished.execution_events==finished.turn.execution_events
        assert restarted.read(submitted.job_id)==finished
        assert_lifecycle(finished.execution_events)
    finally:
        gate.set();queue.close()
        if restarted:restarted.close()


def test_stale_base_records_failed_run_without_tools_or_provider_calls(tmp_path):
    agent,req,_=edit_service(tmp_path)
    req.base_configuration_sha256='0'*64
    queue=AgentQueue(agent)
    try:
        job=wait(queue,queue.submit(req,edit=True).job_id)
        assert job.error_code=='stale' and agent.model._step==0
        assert [e.kind for e in job.execution_events]==['run','run']
        assert job.execution_events[-1].summary.error_code=='stale'
    finally:queue.close()


def test_restart_marks_open_actions_interrupted_without_rewriting_success(tmp_path):
    agent,_,_=edit_service(tmp_path)
    q=AgentQueue(agent)
    execution=ExecutionLedger();execution.start()
    execution.start('read_current_experiment')
    done=next(k for k in execution.active if k)
    execution.finish(done,'succeeded',ExecutionSummary(outcome='completed'))
    execution.start('simulate_current_comparison')
    original=list(execution.events)
    job=AgentJob(job_id='interrupted',execution_run_id=execution.run_id,status='running',mode='edit',
        execution_events=original,owner_pid=99999999,updated_at=datetime.now().isoformat())
    q.save(job);q.close()
    recovered=AgentQueue(agent)
    try:
        read=recovered.read(job.job_id)
        assert read.error_code=='interrupted'
        assert read.execution_events[:len(original)]==original
        assert [e.state for e in read.execution_events[-2:]]==['interrupted','interrupted']
        assert_lifecycle(read.execution_events)
        again=AgentQueue(agent)
        try:assert again.read(job.job_id)==read
        finally:again.close()
    finally:recovered.close()


def test_legacy_jobs_and_turns_remain_readable():
    job=AgentJob(job_id='old',mode='edit',status='completed',updated_at='legacy',events=['Tool requested: prior'])
    turn=AgentTurn(turn_id='old',status='needs_inputs',original_text='old request')
    assert job.execution_events==turn.execution_events==[]
    assert job.execution_run_id is turn.execution_run_id is None


def test_snapshots_are_bounded_and_omit_free_text_and_source_passages():
    config=load_demo().experiment.model_copy(deep=True)
    config.title='PRIVATE_MARKER';config.drug='PRIVATE_MARKER'
    from pydantic import HttpUrl
    config.sources[0].url=HttpUrl('https://example.org/PRIVATE_MARKER')
    for e in config.evidence:e.rationale='PRIVATE_MARKER';e.locator='PRIVATE_MARKER';e.context={'secret':'PRIVATE_MARKER'}
    for s in config.scenarios:s.label='PRIVATE_MARKER'
    data=snapshot(config)
    encoded=data.model_dump_json()
    assert 'PRIVATE_MARKER' not in encoded and len(encoded)<50_000
    assert len(data.parameters)<=48 and len(data.schedules)<=3
    assert data.schedules[0].parameter_evidence[1].unit=='mg'
    with pytest.raises(ValueError):ExecutionSummary(outcome='failed',raw_arguments={'secret':'bad'})
    with pytest.raises(ValueError):ExecutionSummary(outcome='completed',sources=[{'source_id':'s'}]*21)


def test_mismatched_solver_receipt_cannot_be_reported_successful(tmp_path,monkeypatch):
    from app.simulation.service import run_simulation
    def forged(*args,**kwargs):
        result=run_simulation(*args,**kwargs)
        return result.model_copy(update={'configuration_hash':'0'*64})
    monkeypatch.setattr('app.simulation.service.run_simulation',forged)
    agent,req,_=edit_service(tmp_path)
    observed=[]
    with pytest.raises(ValueError,match='receipt'):
        agent.run(req,edit=True,on_execution=observed.append)
    sim=[e for e in observed if e.tool_name=='simulate_current_comparison']
    assert [e.state for e in sim]==['started','failed']
    assert not any(e.summary and e.summary.result for e in observed)


def test_provider_failure_after_solver_preserves_receipt_but_does_not_finish_run(tmp_path):
    # The model runs out of scripted responses immediately after the real solver returns.
    agent,req,_=edit_service(tmp_path,script([('read_current_experiment',{}),('apply_requested_edit',{}),('simulate_current_comparison',{})]))
    queue=AgentQueue(agent)
    try:
        job=wait(queue,queue.submit(req,edit=True).job_id)
        assert job.status=='failed' and job.turn is None
        assert any(e.summary and e.summary.result for e in job.execution_events)
        assert job.execution_events[-1].state=='failed'
    finally:queue.close()


def test_failed_turn_commit_never_publishes_run_success(tmp_path,monkeypatch):
    agent,req,_=edit_service(tmp_path)
    def reject(turn):raise StalePreparation('concurrent child')
    monkeypatch.setattr(agent.turns,'save',reject)
    observed=[]
    with pytest.raises(StalePreparation):agent.run(req,edit=True,on_execution=observed.append)
    assert_lifecycle(observed)
    assert observed[-1].kind=='run' and observed[-1].state=='failed'
    assert not any(e.kind=='run' and e.state=='succeeded' for e in observed)


def test_synchronous_api_exposes_additive_execution_contract(tmp_path):
    agent,req,_=edit_service(tmp_path)
    api=create_app(SETTINGS,preparation_service=agent.preparation)
    api.state.generalized_agent=agent
    with TestClient(api) as client:
        response=client.post('/api/agent/edits',json=req.model_dump(mode='json'))
        assert response.status_code==200
        turn=response.json()
        assert turn['execution_run_id'] and turn['execution_events'][-1]['state']=='succeeded'
        assert client.get('/api/agent/turns/'+turn['turn_id']).json()==turn
        schema=client.get('/openapi.json').json()['components']['schemas']
        assert {'execution_events','execution_run_id'}<=schema['AgentJob']['properties'].keys()
        assert 'ExecutionEvent' in schema


def test_background_api_returns_persisted_events_and_matching_turn(tmp_path,monkeypatch):
    monkeypatch.setattr(GeneralizedAgentService,'_model',lambda self:DrivingModel(mode='edit'))
    agent,req,_=edit_service(tmp_path)
    api=create_app(SETTINGS,preparation_service=agent.preparation)
    with TestClient(api) as client:
        submitted=client.post('/api/agent/jobs/edits',json=req.model_dump(mode='json'))
        assert submitted.status_code==202
        job=submitted.json()
        deadline=monotonic()+5
        while monotonic()<deadline:
            job=client.get('/api/agent/jobs/'+job['job_id']).json()
            if job['status'] in {'completed','failed'}:break
            sleep(.005)
        assert job['status']=='completed'
        assert job['execution_events']==job['turn']['execution_events']
        assert job['execution_run_id']==job['turn']['execution_run_id']
        assert client.get('/api/agent/turns/'+job['turn']['turn_id']).json()==job['turn']


def test_primary_configuration_snapshot_has_baseline_deltas_and_inherited_citations(tmp_path):
    primary=load_demo().experiment
    req=AgentResearchRequest(request={'drug_name':'trastuzumab','target':'HER2','route':'iv_infusion',
        'original_hypothesis':"Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"})
    model=script([('prepare_reviewed_comparison',{}),('simulate_current_comparison',{}),('interpret_current_result',{}),('AgentDecision',{'status':'completed'})])
    agent=GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path/'p.sqlite3')),SETTINGS,model)
    turn=agent.run(req)
    config=next(e.summary.experiment for e in turn.execution_events if e.summary and e.summary.experiment)
    half=next(p for p in config.parameters if p.parameter=='pk.elimination_half_life_h' and p.scenario_id=='half_life_x3')
    assert half.comparison=='baseline' and half.provenance=='calculated' and half.source_ids
    assert half.value==primary.scenarios[1].pk.elimination_half_life_h
    assert half.delta==half.value-primary.scenarios[0].pk.elimination_half_life_h
    assert config.schedules[1].changed is False
    assert_lifecycle(turn.execution_events)


def test_unavailable_source_is_a_failed_tool_with_no_private_payload(tmp_path):
    ledger=ExecutionLedger();ledger.start()
    call=ledger.start('retrieve_evidence_source')
    summary=ledger.tool_summary('retrieve_evidence_source',{'status':'unavailable','reasons':['PRIVATE_PAYLOAD']},{'record':None,'config':None,'result':None})
    ledger.finish(call,'failed',summary)
    assert summary.outcome=='unavailable' and summary.error_code=='unavailable'
    assert 'PRIVATE_PAYLOAD' not in json.dumps([e.model_dump(mode='json') for e in ledger.events])


def test_execution_schemas_enforce_payload_and_lifecycle_bounds():
    ledger=ExecutionLedger();ledger.start()
    for _ in range(63):
        call=ledger.start('read_current_experiment')
        ledger.finish(call,'succeeded',ExecutionSummary(outcome='completed'))
    ledger.finish(None,'succeeded',ExecutionSummary(outcome='completed'))
    assert len(ledger.events)==128
    with pytest.raises(RuntimeError,match='limit'):ledger.start('read_current_experiment')
    payload=ledger.events[1].model_dump(mode='json')
    payload['summary']={'outcome':'completed'}
    with pytest.raises(ValueError):ExecutionEvent.model_validate(payload)
    payload=ledger.events[-1].model_dump(mode='json')
    payload['timestamp']='2026-11-14T12:00:00'
    with pytest.raises(ValueError):ExecutionEvent.model_validate(payload)
