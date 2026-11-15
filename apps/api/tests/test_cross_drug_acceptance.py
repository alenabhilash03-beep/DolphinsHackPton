"""8E.2 complete agent/API acceptance. External scientific data and providers are SYNTHETIC.

Only the reviewed primary configuration/coordinates and read-only audits are real references.
No fixture identity, paper or extracted measurement is a real scientific claim.
"""
from copy import deepcopy
import json
from time import monotonic,sleep
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from app.main import create_app
from app.agent.generalized import GeneralizedAgentService
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore
from app.schemas.drug_support import DrugAssessmentResponse
from app.schemas.generalized_agent import AgentTurn
from test_preparation_acceptance import CASES,rig,assumed_answer,version
from test_generalized_agent import DrivingModel,ReviewedResearchModel,PRIMARY_REQUEST,SETTINGS,research_service
from test_grounded_synthesis import scripted_synthesizer
from test_structure_handoff import with_structure
from test_preparation_workflow import scope,design,parameters
from test_research_agent import ScriptedModel


def wait_job(client,path,payload):
    sent=client.post(path,json=payload)
    assert sent.status_code==202,sent.text
    deadline=monotonic()+8
    while monotonic()<deadline:
        response=client.get('/api/agent/jobs/'+sent.json()['job_id'])
        assert response.status_code==200
        job=response.json()
        if job['status'] in {'failed','completed'}:break
        sleep(.005)
    assert job['status']=='completed',job
    turn=AgentTurn.model_validate(job['turn'])
    assert job['execution_events']==[e.model_dump(mode='json') for e in turn.execution_events]
    assert turn.execution_events[-1].state==turn.status.replace('completed','succeeded')
    assert client.get('/api/agent/turns/'+turn.turn_id).json()==turn.model_dump(mode='json')
    return turn


def assert_linked(turn):
    result=turn.result
    assert turn.status=='completed' and result and turn.interpretation.result_id==result.result_id
    assert turn.synthesis.status=='grounded' and turn.synthesis.result_id==result.result_id
    assert turn.synthesis.configuration_sha256==result.configuration_hash
    for q in turn.synthesis.quantities():assert q.result_id==result.result_id
    assert all(len(s.occupancy)==len(result.time_h) for s in result.scenarios)
    receipts=[e.summary.result for e in turn.execution_events if e.summary and e.summary.result]
    assert receipts and all(r.result_id==result.result_id and r.configuration_sha256==result.configuration_hash for r in receipts)


def fixture_extractor(case):
    fields=[p for p in case['inputs'] if p['parameter']!=case['initially_missing']]
    def extract(messages):
        segments=json.loads(messages[-1]['content'])['untrusted_source_segments']
        proposals=[]
        for item in fields:
            phrase=(f'SYNTHETIC SOFTWARE FIXTURE ONLY. {case["request"]["drug_name"]} {case["request"]["target"]} human purified protein cell-free '
                f'iv_infusion extracellular. {item["parameter"]} = {item["value"]} {item["unit"]}.')
            locator=next(s['locator'] for s in segments if phrase in s['text'])
            proposals.append({**item,'locator':locator,'supporting_passage':phrase,'relation':'exact',
                'molecular_form':case['request']['drug_name'],'drug_name_in_source':case['request']['drug_name'],
                'target_in_source':case['request']['target'],'species':'human','experimental_system':'purified protein',
                'assay_conditions':'cell-free','route':'iv_infusion','exposure_compartment':'extracellular'})
        return {'parameters':proposals,'notes':['SYNTHETIC software fixture; no measured drug data.']}
    return extract


def test_primary_full_queue_answer_structure_proposal_history_and_reload(tmp_path):
    source,_=research_service(tmp_path)
    api=create_app(SETTINGS,preparation_service=source.preparation)
    agent=api.state.generalized_agent;agent.extractor=source.extractor;agent.synthesizer=with_structure([])
    agent._model=lambda:ReviewedResearchModel()
    with TestClient(api) as client:
        turn=wait_job(client,'/api/agent/jobs/research',{'request':PRIMARY_REQUEST})
        assert_linked(turn)
        assert turn.result.configuration.mode=='reviewed_preset'
        assert turn.structure.metadata.provenance.pdb_id=='1N8Z' and turn.synthesis.structural_context
        assert all(p.use_in_simulation=='reviewed_reference_separate' for p in turn.research_papers)
        assert all('Synthetic' in p.source.title for p in turn.research_papers)
        order=turn.tool_calls
        assert order.index('extract_cited_parameters')<order.index('simulate_current_comparison')<order.index('synthesize_grounded_answer')
        base=turn.result
        proposals=client.get(f'/api/agent/results/{base.result_id}/proposals').json()
        proposal=proposals['proposals'][0]
        agent._model=lambda:DrivingModel(mode='edit')
        follow=wait_job(client,'/api/agent/jobs/edits',{'base_result_id':base.result_id,'base_experiment_id':base.configuration.experiment_id,
            'base_configuration_sha256':base.configuration_hash,'client_revision':1,'proposal_id':proposal['proposal_id'],'text':proposal['edit_text']})
        assert_linked(follow)
        assert follow.applied_proposal.proposal_id==proposal['proposal_id'] and follow.parent_result_id==base.result_id
        assert follow.synthesis.original_text==PRIMARY_REQUEST['original_hypothesis']
        assert follow.structure is None
        history=client.get(f'/api/agent/investigations/{follow.result.result_id}').json()
        assert [r['origin'] for r in history['entries']]==['research','proposal']
        assert client.get(f'/api/agent/results/{base.result_id}').json()['result']==base.model_dump(mode='json')
    restarted=create_app(SETTINGS,preparation_service=source.preparation)
    with TestClient(restarted) as client:
        assert client.get(f'/api/agent/investigations/{base.result_id}').json()['entries']==history['entries']
        assert client.get('/api/agent/turns/'+turn.turn_id).json()['synthesis']==turn.synthesis.model_dump(mode='json')


@pytest.mark.parametrize('case_index',[0,1,2],ids=['aster','boreal-missing-rate','unseen-generated'])
def test_multiple_unregistered_names_research_continue_simulate_and_edit_without_reference_leakage(tmp_path,monkeypatch,case_index):
    case=deepcopy(CASES[min(case_index,1)])
    if case_index==2:
        case=deepcopy(CASES[0]);name='Fixture Never-Seen-'+uuid4().hex[:8]
        case['request']['drug_name']=name;case['request']['target']='Fixture novel receptor';case['scope']['molecular_form']=name
        case['case_id']='generated-'+uuid4().hex[:8]
    service,_,trace=rig(tmp_path,case,monkeypatch)
    api=create_app(SETTINGS,preparation_service=service)
    agent=api.state.generalized_agent;agent.extractor=fixture_extractor(case);agent.synthesizer=scripted_synthesizer([])
    agent._model=lambda:DrivingModel(request=case['request'],baseline_scope=case['scope'],baseline_design=case['design'])
    with TestClient(api) as client:
        turn=wait_job(client,'/api/agent/jobs/research',{'request':case['request'],'structured_baseline':True})
        assert turn.preparation.preparation.profile_id is None
        if case['initially_missing']:
            assert turn.status=='needs_inputs' and turn.result is None and 'numerical_solver' not in trace
            assert turn.synthesis.basis=='research_only' and not turn.synthesis.simulation_implications
            record=turn.preparation
            agent._model=lambda:DrivingModel(mode='resume',resume_id=record.preparation.preparation_id)
            turn=wait_job(client,'/api/agent/jobs/research',{'request':case['request'],'structured_baseline':True,
                'preparation_id':record.preparation.preparation_id,'researcher_update':{**version(record.model_dump(mode='json')),'parameters':[assumed_answer(case)]}})
            assert any(e.provenance=='user_supplied' for e in turn.result.configuration.evidence)
        assert_linked(turn)
        assert turn.result.configuration.drug==case['request']['drug_name'] and turn.result.configuration.target==case['request']['target']
        assert turn.result.configuration.mode=='research_derived' and turn.structure.status=='unavailable'
        assert not turn.structure.measurements and not turn.synthesis.structural_context
        assert 'Trastuzumab' not in turn.model_dump_json() and 'HER2' not in turn.model_dump_json() and '1N8Z' not in turn.model_dump_json()
        base=turn.result
        agent._model=lambda:DrivingModel(mode='edit')
        follow=wait_job(client,'/api/agent/jobs/edits',{'base_result_id':base.result_id,'base_experiment_id':base.configuration.experiment_id,
            'base_configuration_sha256':base.configuration_hash,'client_revision':1,'text':'Compare twofold and fivefold affinity improvement at fixed association rate'})
        assert_linked(follow)
        assert len(follow.result.scenarios)==3 and follow.result.configuration.scenarios[0]==base.configuration.scenarios[0]
        assert follow.synthesis.original_text==case['request']['original_hypothesis']
        assert follow.structure is None and not follow.synthesis.structural_context
        assert client.get(f'/api/agent/results/{base.result_id}').json()['result']==base.model_dump(mode='json')
        tree=client.get(f'/api/agent/investigations/{follow.result.result_id}').json()
        assert {e['drug'] for e in tree['entries']}=={case['request']['drug_name']}


def test_declared_hypothetical_identity_and_inputs_are_explicit_and_not_paper_evidence(tmp_path):
    class Unknown:
        def assess(self,request):return DrugAssessmentResponse(request=request,identity_status='not_found',retrieval_status='live',support={'status':'needs_parameters','reasons':['SYNTHETIC unknown identity'],'missing_parameters':['identity']})
    prep=PreparationService(store=PreparationStore(tmp_path/'custom.sqlite3'),assessment=Unknown())
    api=create_app(SETTINGS,preparation_service=prep);agent=api.state.generalized_agent
    agent.synthesizer=scripted_synthesizer([])
    req={'drug_name':'SYNTHETIC Hypothetical-'+uuid4().hex[:8],'target':'Fixture target','route':'hypothetical_iv_bolus','original_hypothesis':'SYNTHETIC hypothetical baseline with researcher-specified assumptions only.'}
    with TestClient(api) as client:
        record=client.post('/api/preparations',json={'request':req}).json();path='/api/preparations/'+record['preparation']['preparation_id']
        assert record['preparation']['state']=='identity_clarification'
        declared=client.post(path+'/revise',json={**version(record),'declare_hypothetical_identity':True,'identity_rationale':'SYNTHETIC explicit identity for software acceptance only.',
            'scope':scope(molecular_form=req['drug_name']).model_dump(mode='json')}).json()
        assert declared['identity_status']=='researcher_declared'
        items=parameters()
        for item in items:
            item.context.drug_identifier=declared['preparation']['resolved_drug_identifier'];item.context.target_identifier=req['target'];item.context.molecular_form=req['drug_name']
        agent._model=lambda:DrivingModel(mode='resume',resume_id=record['preparation']['preparation_id'])
        turn=wait_job(client,'/api/agent/jobs/research',{'request':req,'preparation_id':record['preparation']['preparation_id'],'structured_baseline':True,
            'researcher_update':{**version(declared),'parameters':[p.model_dump(mode='json') for p in items],
            'design':design(administration=[{'kind':'hypothetical_bolus','start_h':0.,'amount_mg':.01}],initial_occupancy=0.).model_dump(mode='json')}})
        assert_linked(turn)
        assert not turn.research_papers and turn.synthesis.basis=='simulation_only' and not turn.synthesis.evidence_findings
        assert all(e.provenance in {'user_supplied','calculated','assumed'} for e in turn.result.configuration.evidence)
        assert not turn.structure.measurements and turn.result.configuration.drug==req['drug_name']


@pytest.mark.parametrize('route,mechanism',[('oral',None),('iv_infusion','irreversible')])
def test_unsupported_model_cannot_borrow_an_existing_result(tmp_path,monkeypatch,route,mechanism):
    source,req=research_service(tmp_path);req['route']=route
    api=create_app(SETTINGS,preparation_service=source.preparation);agent=api.state.generalized_agent
    calls=[]
    import app.simulation.service as numeric
    monkeypatch.setattr(numeric,'run_simulation',lambda *a,**k:calls.append(True))
    with TestClient(api) as client:
        record=client.post('/api/preparations',json={'request':req}).json()
        update={'scope':scope(binding_regime=mechanism).model_dump(mode='json')} if mechanism else None
        agent._model=lambda:ScriptedModel(responses=[AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'unsupported'},'id':'blocked'}])])
        body={'request':req,'preparation_id':record['preparation']['preparation_id']}
        if update:body['researcher_update']={**version(record),**update}
        turn=wait_job(client,'/api/agent/jobs/research',body)
        assert turn.status=='unsupported' and turn.result is None and not calls
        assert turn.synthesis is None and turn.structure is None
        assert not any(e.summary and e.summary.result for e in turn.execution_events)


def test_blocked_real_drug_audits_and_mismatched_structures_do_not_enable_profiles(tmp_path):
    api=create_app(SETTINGS,preparation_service=PreparationService(store=PreparationStore(tmp_path/'audit.sqlite3')))
    with TestClient(api) as client:
        for drug,target in [('cetuximab','EGFR'),('imatinib','HER2'),('unknown-'+uuid4().hex[:8],'ABL1')]:
            structure=client.get('/api/structures',params={'drug':drug,'target':target}).json()
            assert structure['status']=='unavailable' and structure['reason']=='unknown_structure'
        for drug in ['cetuximab','imatinib']:
            audit=client.get('/api/research/audits/'+drug).json()
            assert audit['status']=='evidence_block' and audit['scientific_profile_enabled'] is False
            assert client.post('/api/simulations',json=audit).status_code==422
        assert client.get('/api/structures',params={'drug':'imatinib','target':'ABL1'}).json()['status']=='available'


def test_extraction_outage_keeps_research_only_answer_and_never_borrows_a_solver_result(tmp_path,monkeypatch):
    case=deepcopy(CASES[0]);service,_,trace=rig(tmp_path,case,monkeypatch)
    api=create_app(SETTINGS,preparation_service=service);agent=api.state.generalized_agent
    def outage(messages):raise TimeoutError('SYNTHETIC extraction outage')
    agent.extractor=outage;agent.synthesizer=scripted_synthesizer([])
    agent._model=lambda:DrivingModel(request=case['request'],baseline_scope=case['scope'],baseline_design=case['design'])
    with TestClient(api) as client:
        turn=wait_job(client,'/api/agent/jobs/research',{'request':case['request'],'structured_baseline':True})
        assert turn.status=='needs_inputs' and turn.result is None and 'numerical_solver' not in trace
        assert turn.research_papers[0].extraction.status=='unavailable'
        assert not turn.preparation.input_parameters and turn.preparation.preparation.profile_id is None
        assert turn.synthesis.status=='grounded' and turn.synthesis.basis=='research_only'
        assert not turn.synthesis.quantities() and not turn.synthesis.simulation_implications
        assert turn.structure.status=='unavailable' and not turn.synthesis.structural_context
        assert not any(e.summary and e.summary.result for e in turn.execution_events)
