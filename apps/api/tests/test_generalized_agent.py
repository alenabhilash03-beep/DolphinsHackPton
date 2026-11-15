"""Actual LangChain loop with scripted provider; no paid/live network calls."""
import json
from math import isclose
from datetime import datetime, timezone
import pytest
from pydantic import PrivateAttr
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatResult, ChatGeneration
from app.agent.generalized import GeneralizedAgentService
from app.research.experimental_edits import apply_edit
from app.research.preparation_store import StalePreparation
from app.research.demo import load_demo
from app.schemas.generalized_agent import AgentResearchRequest, AgentEditRequest
from app.schemas.contracts import ControlAdjustment
from app.simulation.controls import adjust_experiment
from test_preparation_workflow import IdentityFixture, scope, design, parameters, reported_package
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore
from app.research.source_documents import SourceDocumentService
from app.research.europe_pmc import EuropePMCClient, LiteratureSearch
from app.config import Settings

SETTINGS = Settings(_env_file=None, langsmith_tracing=False, nvidia_api_key=None, langsmith_api_key=None)

class DrivingModel(BaseChatModel):
    mode: str = 'research'
    request: dict = {}
    resume_id: str | None = None
    baseline_scope: dict | None = None
    baseline_design: dict | None = None
    _step: int = PrivateAttr(default=0)
    @property
    def _llm_type(self): return 'offline-generalized-agent-harness'
    def bind_tools(self, tools, **kwargs): return self
    def _generate(self, messages, **kwargs):
        outputs = {}
        for msg in messages:
            if isinstance(msg, ToolMessage): outputs[msg.name] = json.loads(msg.content)
        record = outputs.get('update_experiment_preparation') or outputs.get('start_experiment_preparation') or outputs.get('read_experiment_preparation')
        if self.mode == 'resume':
            prep = record['preparation'] if record else {}
            order = [('read_experiment_preparation',{'preparation_id':self.resume_id}),
                ('configure_prepared_experiment',{'preparation_id':self.resume_id,'version':{'base_revision':prep.get('revision',0),'base_evidence_sha256':prep.get('evidence_sha256','0'*64)}}),
                ('simulate_current_comparison',{}),
                ('interpret_current_result',{})]
        elif self.mode == 'edit':
            order = [('read_current_experiment',{}),('apply_requested_edit',{}),('simulate_current_comparison',{}),('interpret_current_result',{})]
        else:
            record_id = record['preparation']['preparation_id'] if record else None
            search = outputs.get('search_hypothesis_evidence',{})
            source = outputs.get('retrieve_evidence_source',{}).get('document',{})
            candidates = outputs.get('extract_cited_parameters',{}).get('parameters',[])
            order = [('start_experiment_preparation',{'request':self.request}),
                ('search_hypothesis_evidence',{'request':self.request}),
                ('retrieve_evidence_source',{'source_handle':next(iter(search.get('source_handles',{})),'pending')}),
                ('extract_cited_parameters',{'document_id':source.get('document_id','pending'),'request':self.request,
                    'drug_identifier':'CHEMBL999999999','target_identifier':'Target Y'}),
                ('update_experiment_preparation',{'preparation_id':record_id,'update':{
                    'base_revision':record['preparation']['revision'] if record else 0,
                    'base_evidence_sha256':record['preparation']['evidence_sha256'] if record else '0'*64,
                    'parameters':candidates,'document_ids':[source.get('document_id','pending')],
                    'scope':self.baseline_scope or scope().model_dump(mode='json'),'design':self.baseline_design or design().model_dump(mode='json')}})]
            if self._step >= 5 and record['preparation']['state']=='ready_for_configuration':
                prep = record['preparation']
                order += [('configure_prepared_experiment',{'preparation_id':record_id,'version':{'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256']}}),
                    ('simulate_current_comparison',{}),
                    ('interpret_current_result',{})]
        if self._step < len(order): name,args = order[self._step]
        else:
            result = outputs.get('simulate_current_comparison') or outputs.get('simulate_prepared_experiment')
            name,args = 'AgentDecision',{'status':'completed' if result else 'needs_inputs'}
            if 'synthesize_grounded_answer' not in outputs and (result or 'extract_cited_parameters' in outputs):
                # Research turns inspect the verified structure (if any) before the grounded answer.
                name,args = ('synthesize_grounded_answer',{}) if self.mode == 'edit' or 'inspect_verified_structure' in outputs else ('inspect_verified_structure',{})
        self._step += 1
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':f'call-{self._step}'}]))])


PRIMARY_REQUEST={'drug_name':'trastuzumab','target':'HER2','route':'iv_infusion',
    'original_hypothesis':"Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"}

class ReviewedResearchModel(DrivingModel):
    attempt_skip: bool = False
    def _generate(self,messages,**kwargs):
        outputs={m.name:json.loads(m.content) for m in messages if isinstance(m,ToolMessage)}
        source=outputs.get('retrieve_evidence_source',{}).get('document',{})
        order=([('prepare_reviewed_comparison',{})] if self.attempt_skip else [])+[
            ('read_experiment_preparation',{'preparation_id':self.resume_id}) if self.resume_id else ('start_experiment_preparation',{}),
            ('search_hypothesis_evidence',{'focus':'binding'}),
            ('retrieve_evidence_source',{'source_handle':next(iter(outputs.get('search_hypothesis_evidence',{}).get('source_handles',{})),'pending')}),
            ('extract_cited_parameters',{'document_id':source.get('document_id','pending')}),
            ('prepare_reviewed_comparison',{}),('simulate_current_comparison',{}),('interpret_current_result',{}),
            ('inspect_verified_structure',{}),('synthesize_grounded_answer',{}),('AgentDecision',{'status':'completed'})]
        name,args=order[self._step];self._step+=1
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':f'primary-{self._step}'}]))])


def research_service(tmp_path, missing=False):
    prep = PreparationService(store=PreparationStore(tmp_path/'prep.sqlite3'), documents=SourceDocumentService(cache_dir=tmp_path/'sources'),assessment=IdentityFixture())
    doc, items = reported_package(prep)
    def fetch(url):
        return json.dumps({'hitCount':1,'resultList':{'result':[{'source':'MED','id':'12345678','pmid':'12345678','title':'Synthetic full agent evidence','abstractText':doc.segments[0].text}]}}).encode()
    prep.documents.literature = EuropePMCClient(fetch=fetch)
    def extractor(messages):
        payload=json.loads(messages[-1]['content'])
        return {'notes':['Synthetic extractor stub'], 'parameters':[{'parameter':p.parameter,'value':p.value,'unit':p.unit,
            'locator':payload['untrusted_source_segments'][0]['locator'],'supporting_passage':p.passages[0].supporting_passage,
            'relation':'exact',**{k:v for k,v in p.context.model_dump().items() if k in {'molecular_form','species','route','experimental_system','assay_conditions','exposure_compartment'}}}
            for p in items if not (missing and p.parameter=='binding.dissociation_h_inv')]}
    req={'drug_name':'Compound X','target':'Target Y','route':'iv_infusion','original_hypothesis':'SYNTHETIC structured baseline occupancy experiment.'}
    return GeneralizedAgentService(prep,SETTINGS,DrivingModel(request=req),extractor), req

@pytest.mark.parametrize('missing',[False,True])
def test_actual_generalized_loop_researches_and_runs_or_clarifies(tmp_path,missing):
    agent,req=research_service(tmp_path,missing)
    turn=agent.run(AgentResearchRequest(request=req,structured_baseline=True))
    assert {'search_hypothesis_evidence','retrieve_evidence_source','extract_cited_parameters','update_experiment_preparation'} <= set(turn.tool_calls)
    assert turn.preparation.preparation.profile_id is None
    assert agent.turns.read(turn.turn_id)==turn
    if missing:
        assert turn.status=='needs_inputs' and turn.result is None and turn.questions
    else:
        assert turn.status=='completed' and turn.interpretation.result_id==turn.result.result_id
        assert turn.trace_status=='local_collected'
        assert turn.interpretation.paper_summaries
        assert all(summary.evidence_ids and summary.plot_ids for summary in turn.interpretation.paper_summaries)
        assert all(item.review_status=='candidate' for item in turn.result.configuration.evidence)

@pytest.mark.parametrize('text,field,value,scenario',[
    ('Double the dose in the affinity alternative','dose_mg',1056.,'affinity_x10'),
    ('Use a 21-day dosing interval in that alternative','dosing_interval_h',504.,'affinity_x10'),
    ('Run this comparison for 120 days','duration_h',2880.,None),
    ('Set affinity to 2 nM in the affinity alternative','binding.affinity_nM',2.,'affinity_x10'),
])
def test_edit_matches_direct_controls_and_preserves_baseline(tmp_path,text,field,value,scenario):
    base=load_demo().result
    prep=PreparationService(store=PreparationStore(tmp_path/'prep.sqlite3'))
    agent=GeneralizedAgentService(prep,SETTINGS,DrivingModel(mode='edit'))
    agent.turns.seed(base)
    req=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash,client_revision=1,selected_scenario_id='affinity_x10',text=text)
    turn=agent.run(req,edit=True)
    direct=adjust_experiment(ControlAdjustment(experiment=base.configuration,scenario_id=scenario,field=field,value=value,client_revision=1))
    for actual,expected in zip(turn.result.configuration.scenarios,direct.scenarios):
        assert actual.pk==expected.pk and actual.binding==expected.binding and actual.administration==expected.administration
    assert turn.result.configuration.duration_h==direct.duration_h
    assert turn.parent_result_id==base.result_id and turn.applied_changes
    with pytest.raises(StalePreparation): agent.run(req,edit=True)


def test_affinity_pair_keeps_kon_and_baseline(tmp_path):
    base=load_demo().result
    store=PreparationStore(tmp_path/'p.sqlite3')
    req=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,base_configuration_sha256=base.configuration_hash,
        client_revision=1,text='Compare twofold and fivefold affinity improvement at fixed association rate')
    exp,_=apply_edit(base,req,store)
    assert exp.scenarios[0]==base.configuration.scenarios[0]
    for s,f in zip(exp.scenarios[1:],[2,5]):
        assert s.binding.association_nM_inv_h_inv==base.configuration.scenarios[0].binding.association_nM_inv_h_inv
        assert isclose(s.binding.affinity_nM,base.configuration.scenarios[0].binding.affinity_nM/f)

@pytest.mark.parametrize('text',['Double dose and change to imatinib','Double the dose in that alternative','Make it better','Run this comparison for 120 days and cure cancer'])
def test_ambiguous_or_extra_instructions_apply_nothing(tmp_path,text):
    base=load_demo().result
    request=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,base_configuration_sha256=base.configuration_hash,
        client_revision=1,text=text)
    with pytest.raises(ValueError): apply_edit(base,request,PreparationStore(tmp_path/'p.sqlite3'))


def test_missing_rate_continuation_uses_typed_researcher_answer(tmp_path):
    agent,req=research_service(tmp_path,True)
    pending=agent.run(AgentResearchRequest(request=req,structured_baseline=True))
    record=pending.preparation
    from app.schemas.preparation_workflow import PreparationUpdate
    answer=next(p for p in parameters() if p.parameter=='binding.dissociation_h_inv')
    update=PreparationUpdate(base_revision=record.preparation.revision,base_evidence_sha256=record.preparation.evidence_sha256,parameters=[answer])
    agent.model=DrivingModel(mode='resume',request=req,resume_id=record.preparation.preparation_id)
    resumed=agent.run(AgentResearchRequest(request=req,preparation_id=record.preparation.preparation_id,researcher_update=update,structured_baseline=True))
    assert resumed.result is not None and resumed.status=='completed'
    assert 'search_hypothesis_evidence' not in resumed.tool_calls
    assert any(e.provenance=='user_supplied' and e.evidence_id==answer.parameter_id for e in resumed.result.configuration.evidence)


def test_forged_result_decision_never_creates_a_result(tmp_path):
    from test_research_agent import ScriptedModel
    agent,_=research_service(tmp_path)
    agent.model=ScriptedModel(responses=[AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'completed'},'id':'bad'}])])
    with pytest.raises(ValueError,match='solver result|resolve/create'):
        agent.run(AgentResearchRequest(request={'drug_name':'anything','original_hypothesis':'No fabricated results'}))


def test_agent_cannot_invent_researcher_assumptions(tmp_path):
    from test_research_agent import ScriptedModel
    from app.schemas.preparation_workflow import CreatePreparation
    agent,req=research_service(tmp_path)
    record=agent.preparation.create(CreatePreparation(request=req))
    prep=record.preparation
    update={'preparation_id':prep.preparation_id,'update':{'base_revision':prep.revision,'base_evidence_sha256':prep.evidence_sha256,
        'parameters':[p.model_dump(mode='json') for p in parameters()]}}
    responses=[]
    for index,(name,args) in enumerate([
        ('search_hypothesis_evidence',{'request':req}),
        ('update_experiment_preparation',update),
        ('AgentDecision',{'status':'needs_inputs'})]):
        responses.append(AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':str(index)}]))
    class EmptySearch:
        def search(self,query,page_size):
            return LiteratureSearch(query=query,hit_count=0,records=[],retrieved_at=datetime.now(timezone.utc))
    agent.preparation.documents.literature=EmptySearch()
    agent.model=ScriptedModel(responses=responses)
    turn=agent.run(AgentResearchRequest(request=req,preparation_id=prep.preparation_id))
    assert turn.result is None and turn.preparation.input_parameters==[]
    with agent.preparation.store.connect() as db:
        assert db.execute('SELECT count(*) FROM prepared_configurations').fetchone()[0]==0


def test_api_stale_edit_is_rejected_before_model_call(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app
    agent,_=research_service(tmp_path)
    base=load_demo().result
    app=create_app(SETTINGS,preparation_service=agent.preparation)
    app.state.generalized_agent=agent
    with TestClient(app) as client:
        response=client.post('/api/agent/edits',json={'base_result_id':base.result_id,'base_experiment_id':base.configuration.experiment_id,
            'base_configuration_sha256':'0'*64,'client_revision':1,'text':'Run this comparison for 120 days'})
        assert response.status_code==409
        assert agent.model._step==0
        assert client.get('/api/agent/turns/does-not-exist').status_code==404


def test_explicit_unsupported_scope_can_finish_without_research_or_solver(tmp_path):
    from test_research_agent import ScriptedModel
    from app.schemas.preparation_workflow import CreatePreparation,PreparationUpdate
    agent,req=research_service(tmp_path)
    record=agent.preparation.create(CreatePreparation(request=req))
    update=PreparationUpdate(base_revision=record.preparation.revision,base_evidence_sha256=record.preparation.evidence_sha256,
        scope=scope(binding_regime='irreversible'))
    agent.model=ScriptedModel(responses=[AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'unsupported'},'id':'unsupported'}])])
    turn=agent.run(AgentResearchRequest(request=req,preparation_id=record.preparation.preparation_id,researcher_update=update))
    assert turn.status=='unsupported' and turn.result is None
    assert turn.preparation.preparation.state=='unsupported'


def test_unknown_identity_can_request_clarification_before_searching_papers(tmp_path):
    from test_research_agent import ScriptedModel
    from app.schemas.drug_support import DrugAssessmentResponse
    class MissingIdentity:
        def assess(self,request):
            return DrugAssessmentResponse(request=request,identity_status='not_found',retrieval_status='live',support={'status':'needs_parameters','reasons':['Synthetic missing identity'],'missing_parameters':['identity']})
    agent,req=research_service(tmp_path)
    agent.preparation.assessment=MissingIdentity()
    agent.model=ScriptedModel(responses=[
        AIMessage(content='',tool_calls=[{'name':'start_experiment_preparation','args':{'request':req},'id':'start'}]),
        AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'needs_inputs'},'id':'finish'}])])
    turn=agent.run(AgentResearchRequest(request=req))
    assert turn.status=='needs_inputs' and turn.result is None
    assert turn.preparation.preparation.state=='identity_clarification'
    assert turn.questions and turn.tool_calls==['start_experiment_preparation']


def test_configuration_handoff_is_compact_and_full_evidence_stays_server_owned(tmp_path):
    from test_research_agent import ScriptedModel
    from langchain_core.messages import ToolMessage
    from app.agent.generalized import configuration_receipt
    from app.research.registry import load_curated_profile
    captured={}
    class InspectingModel(ReviewedResearchModel):
        def _generate(self,messages,**kwargs):
            for message in messages:
                if isinstance(message,ToolMessage):captured[message.name]=json.loads(message.content)
            return super()._generate(messages,**kwargs)
    agent,_=research_service(tmp_path)
    agent.model=InspectingModel()
    turn=agent.run(AgentResearchRequest(request={'drug_name':'trastuzumab','target':'HER2','route':'iv_infusion',
        'original_hypothesis':"Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"}))
    payload=captured['prepare_reviewed_comparison']
    assert len(json.dumps(payload))<3000
    assert payload['next_tool']=='simulate_current_comparison' and 'evidence' not in payload
    assert payload['configuration_sha256']==turn.result.configuration_hash
    assert turn.result.configuration==load_curated_profile().experiment
    assert turn.interpretation.paper_summaries and 'paper_summaries' not in captured['interpret_current_result']
    assert len(json.dumps(configuration_receipt(turn.result.configuration)))<len(turn.result.configuration.model_dump_json())/3


def test_session_bound_tools_use_original_request_instead_of_llm_copied_fields(tmp_path):
    from test_research_agent import ScriptedModel
    from app.research.europe_pmc import LiteratureSearch
    agent,req=research_service(tmp_path)
    queries=[]
    class EmptySearch:
        def search(self,query,page_size):
            queries.append(query)
            return LiteratureSearch(query=query,hit_count=0,records=[],retrieved_at=datetime.now(timezone.utc))
    agent.preparation.documents.literature=EmptySearch()
    bad={**req,'drug_name':'WRONG COPIED NAME','original_hypothesis':'rewritten and untrusted'}
    seen_schemas={}
    class Model(ScriptedModel):
        def bind_tools(self,tools,**kwargs):
            for tool in tools:
                if hasattr(getattr(tool,'args_schema',None),'model_fields'):seen_schemas[tool.name]=tool.args_schema.model_fields
            return self
    agent.model=Model(responses=[AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':str(i)}]) for i,(name,args) in enumerate([
        ('start_experiment_preparation',{'request':bad}),('search_hypothesis_evidence',{'request':bad}),('AgentDecision',{'status':'needs_inputs'})])])
    turn=agent.run(AgentResearchRequest(request=req))
    assert turn.preparation.preparation.request.original_hypothesis==req['original_hypothesis']
    assert all('WRONG' not in q and 'Compound X' in q for q in queries)
    assert 'request' not in seen_schemas['search_hypothesis_evidence']
    assert 'request' not in seen_schemas['start_experiment_preparation']
    assert not {'request','drug_identifier','target_identifier'} & seen_schemas['extract_cited_parameters'].keys()
    assert not any(e.state=='rejected' for e in turn.execution_events)


def test_provider_timeout_retry_does_not_repeat_prepared_edits_or_solver(tmp_path):
    from requests.exceptions import ReadTimeout
    raised=[]
    class Flaky(DrivingModel):
        def _generate(self,messages,**kwargs):
            if self._step==2 and not raised:
                raised.append(True);raise ReadTimeout('temporary provider outage')
            return super()._generate(messages,**kwargs)
    base=load_demo().result
    agent=GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path/'p.sqlite3')),SETTINGS,Flaky(mode='edit'))
    req=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash,client_revision=1,text='Run this comparison for 120 days')
    progress=[];turn=agent.run(req,edit=True,on_progress=progress.append)
    assert turn.status=='completed' and turn.tool_calls.count('apply_requested_edit')==turn.tool_calls.count('simulate_current_comparison')==1
    assert sum('retrying the model once' in item for item in progress)==1
    assert turn.result.configuration.duration_h==2880


@pytest.mark.parametrize('budget,expected_calls',[(180,2),(20,1)])
def test_model_timeout_retry_is_bounded_and_respects_remaining_time(tmp_path,budget,expected_calls):
    from requests.exceptions import ReadTimeout
    calls=[]
    class Offline(DrivingModel):
        def _generate(self,messages,**kwargs):calls.append(True);raise ReadTimeout('provider timeout')
    settings=SETTINGS.model_copy(update={'research_timeout_s':budget})
    agent=GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path/'p.sqlite3')),settings,Offline(mode='edit'))
    base=load_demo().result
    req=AgentEditRequest(base_result_id=base.result_id,base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash,client_revision=1,text='Run this comparison for 120 days')
    observed=[]
    with pytest.raises(ReadTimeout):agent.run(req,edit=True,on_execution=observed.append)
    assert len(calls)==expected_calls
    assert [e.state for e in observed]==['started','failed']
    assert observed[-1].summary.error_code=='timeout'


def test_reviewed_profile_resume_preserves_but_does_not_present_unrelated_draft_inputs(tmp_path):
    from test_research_agent import ScriptedModel
    from app.schemas.preparation_workflow import CreatePreparation
    request=AgentResearchRequest(request={'drug_name':'trastuzumab','target':'HER2','route':'iv_infusion',
        'original_hypothesis':"Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"})
    agent,_=research_service(tmp_path)
    prep=agent.preparation
    draft=prep.create(CreatePreparation(request=request.request))
    request.preparation_id=draft.preparation.preparation_id
    agent.model=ReviewedResearchModel(resume_id=request.preparation_id)
    turn=agent.run(request)
    assert turn.status=='completed' and turn.preparation is None and not turn.questions
    assert prep.store.read(request.preparation_id)==draft


def test_reviewed_comparison_cannot_bypass_real_research_and_extraction(tmp_path):
    agent,_=research_service(tmp_path)
    agent.model=ReviewedResearchModel(attempt_skip=True)
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    attempted=[e for e in turn.execution_events if e.tool_name=='prepare_reviewed_comparison' and e.state!='started']
    assert [e.state for e in attempted]==['rejected','succeeded']
    assert turn.status=='completed' and turn.research_papers
    order=turn.tool_calls[1:]
    assert order.index('search_hypothesis_evidence')<order.index('retrieve_evidence_source')<order.index('extract_cited_parameters')<order.index('prepare_reviewed_comparison')<order.index('simulate_current_comparison')
    paper=turn.research_papers[0]
    assert paper.extraction.status=='candidates' and paper.extraction.parameters
    assert paper.source.snapshot_sha256==paper.extraction.snapshot_sha256
    assert paper.use_in_simulation=='reviewed_reference_separate'
    assert agent.turns.read(turn.turn_id).research_papers==turn.research_papers
    assert turn.result.configuration==load_demo().experiment


def test_no_values_is_recorded_honestly_without_inventing_extraction(tmp_path):
    agent,_=research_service(tmp_path)
    agent.model=ReviewedResearchModel()
    agent.extractor=lambda messages:{'parameters':[],'notes':['Synthetic no-values extraction.']}
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status=='completed'
    assert turn.research_papers[0].extraction.status=='no_values'
    assert not turn.research_papers[0].extraction.parameters
    event=next(e for e in turn.execution_events if e.tool_name=='extract_cited_parameters' and e.state!='started')
    assert event.summary.outcome=='no_values' and event.summary.candidate_count==0


def test_failed_retry_does_not_erase_a_validated_extraction_of_the_same_paper(tmp_path):
    # Live 5C.1 finding: a validated extraction followed by a rejected re-extraction of the same paper
    # closed the research gate, so the reviewed question ended at needs_inputs despite valid cited values.
    class ExtractTwice(ReviewedResearchModel):
        def _generate(self,messages,**kwargs):
            extractions=[m for m in messages if isinstance(m,ToolMessage) and m.name=='extract_cited_parameters']
            if len(extractions)==1 and self._step==4:
                document=json.loads(extractions[0].content)['document_id']
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'extract_cited_parameters','args':{'document_id':document},'id':'again'}]))])
            return super()._generate(messages,**kwargs)
    agent,_=research_service(tmp_path)
    agent.model=ExtractTwice()
    valid=agent.extractor
    attempts=[]
    def extractor(messages):
        attempts.append(1)
        return valid(messages) if len(attempts)==1 else {'parameters':[{'parameter':'pk.volume_L','value':12345.,'unit':'L','locator':'invented','supporting_passage':'Invented 12345 L','relation':'exact'}],'notes':[]}
    agent.extractor=extractor
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    states=[e.state for e in turn.execution_events if e.tool_name=='extract_cited_parameters' and e.state!='started']
    assert states==['succeeded','rejected']
    assert turn.research_papers[0].extraction.status=='candidates' and turn.research_papers[0].extraction.parameters
    assert turn.status=='completed' and turn.result is not None
    assert 'simulate_current_comparison' in turn.tool_calls


@pytest.mark.parametrize('invalid',[False,True])
def test_unavailable_or_rejected_extraction_cannot_silently_run_preset(tmp_path,invalid):
    class StopOnRejection(ReviewedResearchModel):
        def _generate(self,messages,**kwargs):
            outputs={m.name:json.loads(m.content) for m in messages if isinstance(m,ToolMessage)}
            if outputs.get('prepare_reviewed_comparison',{}).get('status')=='rejected':
                name,args=('AgentDecision',{'status':'needs_inputs'}) if 'synthesize_grounded_answer' in outputs else ('synthesize_grounded_answer',{}) if 'inspect_verified_structure' in outputs else ('inspect_verified_structure',{})
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':'stop-'+name}]))])
            return super()._generate(messages,**kwargs)
    agent,_=research_service(tmp_path)
    agent.model=StopOnRejection()
    if invalid:
        agent.extractor=lambda messages:{'parameters':[{'parameter':'pk.volume_L','value':12345.,'unit':'L','locator':'invented','supporting_passage':'Invented 12345 L','relation':'exact'}],'notes':[]}
    else:
        def broken(messages):raise TimeoutError('Synthetic extraction provider timeout')
        agent.extractor=broken
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status=='needs_inputs' and turn.result is None
    assert 'simulate_current_comparison' not in turn.tool_calls
    assert turn.research_papers[0].extraction.status==('rejected' if invalid else 'unavailable')
    assert turn.research_papers[0].use_in_simulation=='not_selected'
    assert any(e.tool_name=='prepare_reviewed_comparison' and e.state=='rejected' for e in turn.execution_events)


def test_reviewed_reference_pmid_search_is_live_drug_constrained_and_validated(tmp_path):
    from app.research.parameter_extraction import ParameterResearchService
    from app.schemas.experiment_preparation import PreparationRequest
    queries=[]
    class Search:
        def search(self,query,page_size):
            queries.append(query)
            return LiteratureSearch(query=query,records=[],hit_count=0,retrieved_at=datetime.now(timezone.utc))
    service=ParameterResearchService(SourceDocumentService(literature=Search()))
    request=PreparationRequest.model_validate(PRIMARY_REQUEST)
    service.search(request,pmid='30467591')
    assert queries==['"trastuzumab" AND EXT_ID:30467591 AND SRC:MED']
    with pytest.raises(ValueError,match='PMID'):service.search(request,pmid='30467591 OR cancer')
    assert len(queries)==1


def test_primary_agent_tool_selection_requires_research_then_exposes_only_execution_steps(tmp_path):
    bindings=[]
    class Inspect(ReviewedResearchModel):
        def bind_tools(self,tools,**kwargs):
            bindings.append({t.name for t in tools if hasattr(t,'name')})
            return self
    agent,_=research_service(tmp_path)
    agent.model=Inspect()
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status=='completed'
    assert 'prepare_reviewed_comparison' not in bindings[0]
    assert all(not {'update_experiment_preparation','configure_prepared_experiment'} & b for b in bindings)
    assert {'prepare_reviewed_comparison'} in bindings
    assert {'simulate_current_comparison'} in bindings
    assert {'interpret_current_result'} in bindings
    assert 'AgentDecision' not in bindings[0]
    assert 'AgentDecision' in bindings[-1]


def test_partial_research_is_explicit_when_a_separate_paper_extraction_fails(tmp_path):
    captured={}
    class Partial(ReviewedResearchModel):
        def _generate(self,messages,**kwargs):
            outputs=[m for m in messages if isinstance(m,ToolMessage)]
            search=next((json.loads(m.content) for m in outputs if m.name=='search_hypothesis_evidence'),{})
            docs=[json.loads(m.content)['document']['document_id'] for m in outputs if m.name=='retrieve_evidence_source']
            for m in outputs:
                if m.name=='prepare_reviewed_comparison':captured.update(json.loads(m.content))
            order=[('start_experiment_preparation',{}),('search_hypothesis_evidence',{}),
                ('retrieve_evidence_source',{'source_handle':next(iter(search.get('source_handles',{})),'pending')}),
                ('retrieve_evidence_source',{'source_handle':next(iter(search.get('source_handles',{})),'pending')}),
                ('extract_cited_parameters',{'document_id':docs[0] if docs else 'pending'}),
                ('extract_cited_parameters',{'document_id':docs[1] if len(docs)>1 else 'pending'}),
                ('extract_cited_parameters',{'document_id':docs[1] if len(docs)>1 else 'pending'}),
                ('prepare_reviewed_comparison',{}),('simulate_current_comparison',{}),('interpret_current_result',{}),
                ('inspect_verified_structure',{}),('synthesize_grounded_answer',{}),('AgentDecision',{'status':'completed'})]
            name,args=order[self._step];self._step+=1
            return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':args,'id':f'partial-{self._step}'}]))])
    agent,_=research_service(tmp_path)
    agent.model=Partial()
    original=agent.extractor
    attempted=[]
    def extractor(messages):
        attempted.append(True)
        if len(attempted)>=2:raise TimeoutError('Synthetic provider failure on separate paper')
        return original(messages)
    agent.extractor=extractor
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status=='completed' and captured['research_status']=='partial'
    assert {p.extraction.status for p in turn.research_papers}=={'candidates','unavailable'}
    assert all(p.use_in_simulation=='reviewed_reference_separate' for p in turn.research_papers)
    assert turn.result.configuration==load_demo().experiment


def test_successful_research_after_retries_cannot_finish_before_simulation(tmp_path):
    bindings=[]
    class RetryThenRun(ReviewedResearchModel):
        def bind_tools(self,tools,**kwargs):
            bindings.append({t.name for t in tools if hasattr(t,'name')});return self
        def _generate(self,messages,**kwargs):
            extractions=[m for m in messages if isinstance(m,ToolMessage) and m.name=='extract_cited_parameters']
            if self._step==4 and len(extractions)<4:
                doc=next(json.loads(m.content)['document']['document_id'] for m in messages if isinstance(m,ToolMessage) and m.name=='retrieve_evidence_source')
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'extract_cited_parameters','args':{'document_id':doc},'id':f'retry-{len(extractions)}'}]))])
            return super()._generate(messages,**kwargs)
    agent,_=research_service(tmp_path);agent.model=RetryThenRun()
    turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status=='completed' and turn.tool_calls.count('extract_cited_parameters')==4
    assert {'prepare_reviewed_comparison'} in bindings
    assert {'prepare_reviewed_comparison','AgentDecision'} not in bindings


def test_repeated_or_none_pmid_searches_reuse_results_and_stay_compact(tmp_path,monkeypatch):
    # Live 5C.1b finding: the model sent pmid "None" (rejected) and repeated identical searches, spending the
    # four-search budget and growing provider requests until NVIDIA returned 502.
    seen=[]
    class RepeatSearch(DrivingModel):
        _repeats:int=PrivateAttr(default=0)
        def _generate(self,messages,**kwargs):
            searches=[m for m in messages if isinstance(m,ToolMessage) and m.name=='search_hypothesis_evidence']
            seen[:]=[json.loads(m.content) for m in searches]
            if searches and self._repeats<2:
                self._repeats+=1
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'search_hypothesis_evidence',
                    'args':{'request':self.request,'focus':'binding','pmid':'None'},'id':f'repeat-{self._repeats}'}]))])
            return super()._generate(messages,**kwargs)
    calls=[]
    original=EuropePMCClient.search
    monkeypatch.setattr(EuropePMCClient,'search',lambda self,*a,**k:calls.append(1) or original(self,*a,**k))
    agent,req=research_service(tmp_path)
    agent.model=RepeatSearch(request=req)
    turn=agent.run(AgentResearchRequest(request=req,structured_baseline=True))
    assert turn.status=='completed' and turn.result is not None
    assert len(calls)==1
    states=[e.state for e in turn.execution_events if e.tool_name=='search_hypothesis_evidence' and e.state!='started']
    assert states==['succeeded']*3
    assert len(seen)==3 and all('search' not in s and s['results'] for s in seen)
    assert all(len(r['abstract_excerpt'])<=360 for s in seen for r in s['results'])
    assert 'Identical search' in seen[1]['note']


def test_step_limit_ends_with_recorded_needs_inputs_not_a_graph_error(tmp_path):
    class Looping(DrivingModel):
        def _generate(self,messages,**kwargs):
            done={m.name for m in messages if isinstance(m,ToolMessage)}
            if 'extract_cited_parameters' in done:
                record=next(json.loads(m.content) for m in reversed(messages) if isinstance(m,ToolMessage) and m.name in {'start_experiment_preparation','read_experiment_preparation'} and 'preparation' in json.loads(m.content))
                self._step+=1
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'read_experiment_preparation',
                    'args':{'preparation_id':record['preparation']['preparation_id']},'id':f'loop-{self._step}'}]))])
            return super()._generate(messages,**kwargs)
    agent,req=research_service(tmp_path)
    agent.model=Looping(request=req)
    turn=agent.run(AgentResearchRequest(request=req))
    assert turn.status=='needs_inputs' and turn.result is None and turn.questions
    assert turn.execution_events[-1].state=='needs_inputs'
    assert sum(e.tool_name=='read_experiment_preparation' and e.state!='started' for e in turn.execution_events)>=5
    # The fallback still records the verified-structure check and the cited-answer attempt before concluding.
    assert turn.structure is not None and turn.synthesis is not None


def test_compact_history_shrinks_old_bulky_results_but_keeps_identifiers_and_extractions():
    from langchain_core.messages import HumanMessage
    from app.agent.generalized import compact_history
    page={'status':'retrieved','next_start_block':12,'document':{'document_id':'a'*32,'source':{'title':'Paper'},
        'segments':[{'locator':f'full_text:block-{i}:0','text':'x'*1900} for i in range(10)]}}
    prep={'preparation':{'preparation_id':'prep-'+'b'*32,'revision':3,'evidence_sha256':'c'*64,'state':'needs_inputs',
        'missing_inputs':[{'input_id':'parameter:pk.volume_L','question':'q'*500}],'request':{'original_hypothesis':'h'*9000}}}
    extraction={'status':'candidates','parameters':[{'parameter':'pk.volume_L','supporting_passage':'p'*3000}]}
    messages=[HumanMessage(content='start'),
        ToolMessage(content=json.dumps(prep),name='start_experiment_preparation',tool_call_id='1'),
        ToolMessage(content=json.dumps(page),name='retrieve_evidence_source',tool_call_id='2'),
        ToolMessage(content=json.dumps(extraction),name='extract_cited_parameters',tool_call_id='3'),
        ToolMessage(content=json.dumps(page),name='retrieve_evidence_source',tool_call_id='4'),
        ToolMessage(content=json.dumps(page),name='retrieve_evidence_source',tool_call_id='5')]
    assert compact_history(messages,budget_chars=10**7)==messages
    out=compact_history(messages,budget_chars=45000)
    assert sum(len(m.content) for m in out)<=45000
    shrunk_prep=json.loads(out[1].content)['preparation']
    assert shrunk_prep=={'preparation_id':'prep-'+'b'*32,'revision':3,'evidence_sha256':'c'*64,'state':'needs_inputs','missing_inputs':['parameter:pk.volume_L']}
    shrunk_page=json.loads(out[2].content)['document']
    assert shrunk_page['document_id']=='a'*32 and len(shrunk_page['locators'])==10 and 'segments' not in shrunk_page
    assert out[3].content==messages[3].content  # cited extractions are never shortened
    assert out[4].content==messages[4].content and out[5].content==messages[5].content  # most recent results kept whole


def test_wrap_up_window_offers_only_closing_tools_near_the_budget(tmp_path):
    offered=[]
    class Recording(DrivingModel):
        _names:list=PrivateAttr(default_factory=list)
        def bind_tools(self,tools,**kwargs):
            self._names=[getattr(t,'name',None) or t.get('name') for t in tools]; return self
        def _generate(self,messages,**kwargs):
            offered.append(sorted(n for n in self._names if n))
            done={m.name for m in messages if isinstance(m,ToolMessage)}
            if 'extract_cited_parameters' in done:
                if 'synthesize_grounded_answer' in done:
                    return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'needs_inputs'},'id':'final'}]))])
                name='inspect_verified_structure' if 'inspect_verified_structure' in self._names else 'synthesize_grounded_answer' if 'synthesize_grounded_answer' in self._names else 'search_hypothesis_evidence'
                self._step+=1
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':{},'id':f'w-{self._step}'}]))])
            return super()._generate(messages,**kwargs)
    import app.agent.generalized as generalized
    agent,req=research_service(tmp_path)
    agent.model=Recording(request=req)
    original=generalized.WRAP_UP_CALLS
    generalized.WRAP_UP_CALLS=4
    try: turn=agent.run(AgentResearchRequest(request=req))
    finally: generalized.WRAP_UP_CALLS=original
    assert ['inspect_verified_structure'] in offered and ['synthesize_grounded_answer'] in offered
    assert turn.status=='needs_inputs' and turn.structure is not None and turn.synthesis is not None


def test_wrap_up_first_requires_extraction_of_retrieved_sources(tmp_path):
    # Live finding: forcing a decision before a retrieved paper was extracted failed the run's honesty check.
    offered=[]
    class Recording(DrivingModel):
        _names:list=PrivateAttr(default_factory=list)
        def bind_tools(self,tools,**kwargs):
            self._names=[getattr(t,'name',None) or t.get('name') for t in tools]; return self
        def _generate(self,messages,**kwargs):
            offered.append(sorted(n for n in self._names if n))
            done={m.name for m in messages if isinstance(m,ToolMessage)}
            if 'extract_cited_parameters' in done and 'synthesize_grounded_answer' not in done:
                name='inspect_verified_structure' if 'inspect_verified_structure' not in done else 'synthesize_grounded_answer'
                self._step+=1
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':name,'args':{},'id':f'w-{self._step}'}]))])
            if 'synthesize_grounded_answer' in done:
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'needs_inputs'},'id':'final'}]))])
            return super()._generate(messages,**kwargs)
    import app.agent.generalized as generalized
    agent,req=research_service(tmp_path)
    agent.model=Recording(request=req)
    original=generalized.WRAP_UP_CALLS
    generalized.WRAP_UP_CALLS=3   # reached right after start, search and retrieve
    try: turn=agent.run(AgentResearchRequest(request=req))
    finally: generalized.WRAP_UP_CALLS=original
    assert offered[3]==['extract_cited_parameters']
    assert turn.status=='needs_inputs' and turn.research_papers and turn.synthesis is not None


def test_plain_text_ending_concludes_from_recorded_state(tmp_path):
    # Live finding: a model that answered in prose instead of the decision schema failed the whole run.
    class Prose(DrivingModel):
        def _generate(self,messages,**kwargs):
            done={m.name for m in messages if isinstance(m,ToolMessage)}
            if 'extract_cited_parameters' in done:
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='I think more data is needed.'))])
            return super()._generate(messages,**kwargs)
    agent,req=research_service(tmp_path)
    agent.model=Prose(request=req)
    turn=agent.run(AgentResearchRequest(request=req))
    assert turn.status=='needs_inputs' and turn.result is None
    assert turn.structure is not None and turn.synthesis is not None


def test_transient_provider_errors_are_recognized_for_retry():
    from app.agent.generalized import transient_provider_error
    class ChunkedEncodingError(Exception): pass
    assert transient_provider_error(ChunkedEncodingError('Response ended prematurely'))
    assert transient_provider_error(Exception("[502] Bad Gateway {'_content': b'upstream request failed'}"))
    assert not transient_provider_error(ValueError('Agent parameter must be an unchanged cited extraction'))


def test_model_claiming_unsupported_for_a_supported_request_reports_recorded_state(tmp_path):
    class ClaimsUnsupported(DrivingModel):
        def _generate(self,messages,**kwargs):
            done={m.name for m in messages if isinstance(m,ToolMessage)}
            if 'extract_cited_parameters' in done:
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[{'name':'AgentDecision','args':{'status':'unsupported'},'id':'final'}]))])
            return super()._generate(messages,**kwargs)
    agent,req=research_service(tmp_path)
    agent.model=ClaimsUnsupported(request=req)
    turn=agent.run(AgentResearchRequest(request=req))
    assert turn.status=='needs_inputs' and turn.result is None and turn.structure is not None


def test_wrap_up_still_runs_the_reviewed_comparison_when_research_finishes_late(tmp_path):
    # Live finding (2026-11-15): slow model turns finished research inside the wrap-up window, which then offered
    # only the closing tools, so the primary question ended as "needs inputs" without its audited comparison.
    offered=[]
    class Recording(ReviewedResearchModel):
        _names:list=PrivateAttr(default_factory=list)
        def bind_tools(self,tools,**kwargs):
            self._names=[getattr(t,'name',None) or t.get('name') for t in tools]; return self
        def _generate(self,messages,**kwargs):
            offered.append(sorted(n for n in self._names if n))
            return super()._generate(messages,**kwargs)
    import app.agent.generalized as generalized
    agent,_=research_service(tmp_path)
    agent.model=Recording()
    original=generalized.WRAP_UP_CALLS
    generalized.WRAP_UP_CALLS=4   # reached as soon as the first paper is extracted
    try: turn=agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    finally: generalized.WRAP_UP_CALLS=original
    assert offered[4]==['prepare_reviewed_comparison'] and offered[5]==['simulate_current_comparison']
    assert turn.status=='completed' and turn.result.configuration==load_demo().experiment
    assert turn.structure is not None and turn.synthesis is not None
