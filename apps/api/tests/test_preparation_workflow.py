"""Unregistered identities, persisted clarification and source-backed configuration gates."""
from datetime import datetime, timezone
from math import exp, log
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.research.preparation import PreparationService, evidence_digest
from app.research.preparation_store import PreparationStore, StalePreparation
from app.research.preparation_units import normalize_parameter
from app.research.source_documents import SourceDocumentService
from app.research.europe_pmc import LiteratureRecord
from app.schemas.contracts import ControlAdjustment, ExperimentConfig, SimulationRequest
from app.schemas.drug_support import DrugAssessmentResponse, DrugIdentity
from app.schemas.experiment_preparation import EvidenceContext, PreparationParameter, SourcePassage
from app.schemas.preparation_workflow import CreatePreparation, PreparationScope, PreparationDesign, PreparationUpdate, PreparationVersion
from app.simulation.controls import adjust_experiment
from app.simulation.service import run_simulation

NOW = datetime(2026,11,14,tzinfo=timezone.utc)


class IdentityFixture:
    """Only test injection: production still uses the arbitrary-name identity resolver."""
    def assess(self, request):
        identity=DrugIdentity(canonical_name=request.drug_name,identifiers={'chembl_id':'CHEMBL999999999'},aliases=[request.drug_name],
            molecular_form=request.drug_name,molecule_type='Small molecule',provenance='database_candidate',
            source_url='https://example.org/synthetic-identity',retrieved_at=NOW,form_scope='Synthetic fixture only')
        return DrugAssessmentResponse(request=request,identity_status='candidate_identity',retrieval_status='live',
            resolved_identity=identity,candidates=[identity],support={'status':'needs_parameters','reasons':['No preset profile'], 'missing_parameters':['parameters']})


@pytest.fixture
def service(tmp_path):
    return PreparationService(store=PreparationStore(tmp_path/'preparations.sqlite3'),
        documents=SourceDocumentService(cache_dir=tmp_path/'snapshots'),assessment=IdentityFixture())


def create(service):
    return service.create(CreatePreparation(request={'drug_name':'Compound X','target':'Target Y','route':'iv_infusion',
        'original_hypothesis':'Explore the target occupancy of this synthetic unregistered compound.'}))


def scope(**changes):
    return PreparationScope(**(dict(molecular_form='Compound X',species='human',target_compartment='extracellular',
        binding_regime='reversible_1_to_1',pk_regime='linear_effective',competition='absent_assumed',
        rationale='Explicit hypothetical linear PK, fixed nondepleting target sites and no competition; not a validated biological claim.')|changes))


def design(**changes):
    return PreparationDesign(**(dict(duration_h=24.,administration=[{'kind':'infusion','start_h':0.,'duration_h':1.,'amount_mg':0.}],
        initial_occupancy=.5,rationale='Synthetic mathematical design; zero administered drug tests analytical dissociation.')|changes))


def context(**changes):
    return EvidenceContext(**(dict(drug_identifier='CHEMBL999999999',target_identifier='Target Y',
        molecular_form='Compound X',species='human',experimental_system='purified protein',assay_conditions='cell-free',
        route='iv_infusion',exposure_compartment='extracellular',applicability_notes=['Synthetic test context only.'])|changes))


def assumed(field,value,unit,**changes):
    return PreparationParameter(**(dict(parameter_id='input-'+field.replace('.','-'),parameter=field,value=float(value),unit=unit,
        original_value=float(value),original_unit=unit,normalization='Explicit hypothetical input',provenance='researcher_assumed',
        rationale='Explicit researcher assumption for a synthetic test, not an experimental measurement.',entered_at=NOW,
        context=context())|changes))


def parameters():
    # Half-life and KD are intentionally absent: the server must calculate them from compatible inputs.
    return [assumed('pk.volume_L',2000.,'mL'),assumed('pk.clearance_L_h',100.,'mL/hour'),
        assumed('binding.association_nM_inv_h_inv',.01,'nM^-1 hour^-1'),
        assumed('binding.dissociation_h_inv',.1,'hour^-1'),assumed('molecular_weight_g_mol',1.,'kDa'),
        assumed('body_mass_kg',70.,'kg'),assumed('exposure_factor',.1,'1')]


def update(service,record,**changes):
    return service.revise(record.preparation.preparation_id,PreparationUpdate(base_revision=record.preparation.revision,
        base_evidence_sha256=record.preparation.evidence_sha256,**changes))


def ready(service,**changes):
    record=create(service)
    return update(service,record,**(dict(scope=scope(),design=design(),parameters=parameters())|changes))


def configure(service,record):
    return service.configure(record.preparation.preparation_id,PreparationVersion(base_revision=record.preparation.revision,
        base_evidence_sha256=record.preparation.evidence_sha256))


def test_unregistered_identity_needs_explicit_values_and_no_preset(service):
    record=create(service)
    assert record.preparation.state=='needs_inputs'
    assert not record.preparation.runnable
    assert record.preparation.profile_id is None
    assert record.preparation.parameters==[]
    with pytest.raises(ValueError,match='not ready'):
        configure(service,record)


def test_preparation_normalizes_derives_configures_and_runs_analytical_case(service):
    record=ready(service)
    assert record.preparation.state=='ready_for_configuration', record.preparation.reasons
    assert record.preparation.revision==2
    assert record.preparation.evidence_sha256==evidence_digest(record)
    assert service.store.read(record.preparation.preparation_id,1).preparation.state=='researching'
    configured=configure(service,record)
    assert configured.classification=='conditional_researcher_specified'
    scenario=configured.experiment.scenarios[0]
    assert scenario.pk.volume_L==2.
    assert scenario.pk.clearance_L_h==pytest.approx(.1)
    assert scenario.pk.elimination_half_life_h==pytest.approx(log(2)*20)
    assert scenario.binding.affinity_nM==pytest.approx(10.)
    assert configured.experiment.mode=='research_derived'
    assert all(item.review_status=='candidate' for item in configured.experiment.evidence)
    assert configure(service,record)==configured
    result=run_simulation(SimulationRequest(experiment=configured.experiment,client_revision=0,output_points=100),preparation_store=service.store)
    assert result.scenarios[0].occupancy[-1]==pytest.approx(.5*exp(-.1*24),rel=2e-5)
    assert max(result.scenarios[0].central_concentration_nM)==0


def test_missing_kinetic_rate_stops_and_typed_answer_resumes(service):
    record=ready(service,parameters=[p for p in parameters() if p.parameter!='binding.dissociation_h_inv'])
    assert record.preparation.state=='needs_inputs'
    assert any(i.parameter=='binding.dissociation_h_inv' for i in record.preparation.missing_inputs)
    with pytest.raises(ValueError): configure(service,record)
    record=update(service,record,parameters=[assumed('binding.dissociation_h_inv',.1,'hour^-1')])
    assert record.preparation.state=='ready_for_configuration'
    assert configure(service,record).experiment.scenarios[0].binding.affinity_nM==pytest.approx(10.)


def test_kd_alone_cannot_invent_rates(service):
    items=[p for p in parameters() if not p.parameter.startswith('binding.')]+[assumed('binding.affinity_nM',10.,'nM')]
    record=ready(service,parameters=items)
    assert record.preparation.state=='needs_inputs'
    assert {'binding.association_nM_inv_h_inv','binding.dissociation_h_inv'} <= {m.parameter for m in record.preparation.missing_inputs}


@pytest.mark.parametrize('field,value,unit', [('binding.affinity_nM',99.,'nM'),('pk.elimination_half_life_h',99.,'hour')])
def test_inconsistent_linked_parameters_block_configuration(service,field,value,unit):
    record=ready(service,parameters=parameters()+[assumed(field,value,unit)])
    assert record.preparation.state=='failed_validation'
    with pytest.raises(ValueError): configure(service,record)


@pytest.mark.parametrize('kwargs', [{'binding_regime':'irreversible'},{'binding_regime':'cooperative'},
    {'pk_regime':'other'},{'competition':'requires_explicit_model'}])
def test_unsupported_mechanisms_never_configure(service,kwargs):
    record=ready(service,scope=scope(**kwargs))
    assert record.preparation.state=='unsupported'
    with pytest.raises(ValueError): configure(service,record)


def test_intracellular_exposure_is_not_inferred_from_iv(service):
    items=[p for p in parameters() if p.parameter!='exposure_factor']
    record=ready(service,scope=scope(target_compartment='intracellular'),parameters=items)
    assert record.preparation.state=='needs_inputs'
    assert any(m.parameter=='exposure_factor' for m in record.preparation.missing_inputs)
    factor=assumed('exposure_factor',.01,'1',context=context(exposure_compartment='intracellular'))
    record=update(service,record,parameters=[factor])
    assert record.preparation.state=='ready_for_configuration'
    assert any('intracellular' in text for text in record.preparation.assumptions)


def test_stale_revision_and_hash_are_rejected_without_mutation(service):
    before=create(service)
    current=update(service,before,scope=scope())
    for revision,digest in [(before.preparation.revision,before.preparation.evidence_sha256),(current.preparation.revision,'f'*64)]:
        with pytest.raises(StalePreparation):
            service.revise(before.preparation.preparation_id,PreparationUpdate(base_revision=revision,base_evidence_sha256=digest,design=design()))
    assert service.store.read(before.preparation.preparation_id)==current
    with pytest.raises(StalePreparation): configure(service,before)


def test_persistence_survives_service_restart(service):
    record=ready(service)
    configured=configure(service,record)
    restarted=PreparationService(store=PreparationStore(service.store.path),documents=service.documents,assessment=IdentityFixture())
    assert restarted.store.read(record.preparation.preparation_id)==record
    assert configure(restarted,record)==configured


def test_forged_or_modified_research_config_cannot_reach_solver(service):
    record=ready(service)
    configured=configure(service,record)
    data=configured.experiment.model_dump(mode='json')
    data['title']='Caller changed this validated config'
    tampered=ExperimentConfig.model_validate(data)
    with pytest.raises(ValueError,match='receipt'):
        run_simulation(SimulationRequest(experiment=tampered,client_revision=0),preparation_store=service.store)


def test_direct_control_has_persisted_parent_and_no_llm(service):
    configured=configure(service,ready(service))
    edited=adjust_experiment(ControlAdjustment(experiment=configured.experiment,scenario_id=None,field='duration_h',value=12.,client_revision=1),preparation_store=service.store)
    assert edited.mode=='research_derived'
    result=run_simulation(SimulationRequest(experiment=edited,client_revision=1,output_points=100),preparation_store=service.store)
    assert result.time_h[-1]==12.
    with service.store.connect() as db:
        assert db.execute('SELECT count(*) FROM prepared_configuration_parents').fetchone()[0]==1
    assert configured.experiment.duration_h==24.


def test_immutable_input_and_selection_conflicts(service):
    record=ready(service)
    with pytest.raises(ValueError,match='immutable'):
        update(service,record,parameters=[assumed('pk.volume_L',3.,'L')])
    alternative=assumed('pk.volume_L',3.,'L',parameter_id='different-volume')
    record=update(service,record,parameters=[alternative])
    assert record.preparation.state=='needs_inputs'
    record=update(service,record,selected_parameters={'pk.volume_L':'different-volume'})
    assert record.preparation.state=='ready_for_configuration'


@pytest.mark.parametrize('unit,expected,factor', [('M^-1 s^-1',2.2428,3.6e-6),('M⁻¹ s⁻¹',2.2428,3.6e-6)])
def test_association_rate_unit_conversion(unit,expected,factor):
    value,actual=normalize_parameter(623000.,unit,'nM^-1 hour^-1')
    assert value==pytest.approx(expected)
    assert actual==factor


def test_unrecognized_or_weight_normalized_units_are_not_guessed(service):
    items=parameters()
    items[1]=assumed('pk.clearance_L_h',1.,'L/hour/kg')
    record=ready(service,parameters=items)
    assert record.preparation.state=='needs_inputs'
    assert any('conversion' in m.reason for m in record.preparation.missing_inputs)


def reported_package(service, *, incompatible=False):
    items=parameters()
    # Explicit source text and all IDs are synthetic, including the supposed measurements.
    phrases=[]
    for item in items:
        system='different assay' if incompatible and item.parameter=='binding.dissociation_h_inv' else 'purified protein'
        phrase=f'SYNTHETIC only. Compound X Target Y human {system} cell-free iv_infusion extracellular. {item.parameter} = {item.value} {item.unit}.'
        phrases.append(phrase)
    text=' '.join(phrases)
    record=LiteratureRecord(provider_source='MED',provider_id='12345678',pmid='12345678',title='SYNTHETIC only, not a scientific source',abstract=text,
        abstract_available=True,full_text_status='not_confirmed',record_url='https://example.org/synthetic-paper',retrieved_at=NOW)
    doc=service.documents.retrieve(service.documents.register(record)).document
    for item,phrase in zip(items,phrases):
        item.provenance='reported'
        item.entered_at=None
        item.rationale=None
        item.passages=[SourcePassage(source_id=doc.source.source_id,locator=doc.segments[0].locator,supporting_passage=phrase)]
        if incompatible and item.parameter=='binding.dissociation_h_inv': item.context.experimental_system='different assay'
    return doc,items


def test_source_backed_unregistered_package_preserves_citations_and_candidate_status(service):
    doc,items=reported_package(service)
    record=ready(service,parameters=items,document_ids=[doc.document_id])
    assert record.preparation.state=='ready_for_configuration', record.preparation.reasons
    assert record.preparation.path=='research_derived'
    configured=configure(service,record)
    source_evidence=[item for item in configured.experiment.evidence if item.provenance=='reported']
    assert source_evidence and all(item.review_status=='candidate' for item in source_evidence)
    assert all(item.source_ids==[doc.source.source_id] for item in source_evidence)
    result=run_simulation(SimulationRequest(experiment=configured.experiment,client_revision=0,output_points=100),preparation_store=service.store)
    assert result.scenarios[0].occupancy[-1]==pytest.approx(.5*exp(-.1*24),rel=2e-5)


def test_converted_binding_values_still_require_matched_assay_context(service):
    doc,items=reported_package(service,incompatible=True)
    record=ready(service,parameters=items,document_ids=[doc.document_id])
    assert record.preparation.state=='failed_validation'
    assert any('incompatible' in reason for reason in record.preparation.reasons)


def test_fabricated_passage_or_context_cannot_be_ingested(service):
    doc,items=reported_package(service)
    before=create(service)
    items[0].passages[0].supporting_passage='Invented 2000 mL measurement.'
    with pytest.raises(ValueError,match='exact passage'):
        update(service,before,parameters=items,document_ids=[doc.document_id])
    assert service.store.read(before.preparation.preparation_id)==before


def test_arbitrary_calculated_formulas_are_not_executed(service):
    item=assumed('pk.volume_L',2.,'L')
    item.provenance='calculated'
    item.parent_ids=['x']
    item.formula='__import__("os").system("false")'
    with pytest.raises(ValueError,match='server-side'):
        ready(service,parameters=[item])


def test_atomic_concurrent_updates_only_one_wins(service):
    before=create(service)
    def apply():
        try:
            update(service,before,scope=scope())
            return 'ok'
        except StalePreparation:
            return 'stale'
    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes=list(executor.map(lambda _:apply(),range(2)))
    assert sorted(outcomes)==['ok','stale']
    assert service.store.read(before.preparation.preparation_id).preparation.revision==2


def test_real_preparation_tool_calls_reach_numerical_solver(service):
    from app.agent.preparation_tools import build_preparation_tools
    start,read,revise,configure_tool,simulate=build_preparation_tools(service)
    record=start.invoke({'request':{'drug_name':'Compound X','target':'Target Y','route':'iv_infusion',
        'original_hypothesis':'Synthetic tool compatibility case only.'}})
    prep=record['preparation']
    record=revise.invoke({'preparation_id':prep['preparation_id'],'update':{'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256'],
        'scope':scope().model_dump(mode='json'),'design':design().model_dump(mode='json'),'parameters':[p.model_dump(mode='json') for p in parameters()]}})
    prep=record['preparation']
    assert read.invoke({'preparation_id':prep['preparation_id']})==record
    config=configure_tool.invoke({'preparation_id':prep['preparation_id'],'version':{'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256']}})
    result=simulate.invoke({'request':{'experiment':config['experiment'],'client_revision':0,'output_points':100}})
    assert result['configuration']['mode']=='research_derived'
    assert result['scenarios'][0]['occupancy'][-1]==pytest.approx(.5*exp(-.1*24),rel=2e-5)


def test_api_readiness_configuration_stale_and_simulation(service):
    from app.main import create_app
    from app.config import Settings
    with TestClient(create_app(Settings(_env_file=None),preparation_service=service)) as client:
        created=client.post('/api/preparations',json={'request':{'drug_name':'Compound X','target':'Target Y','route':'iv_infusion','original_hypothesis':'Synthetic API baseline.'}})
        assert created.status_code==201
        prep=created.json()['preparation']
        path='/api/preparations/'+prep['preparation_id']
        assert client.post(path+'/configure',json={'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256']}).status_code==422
        body={'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256'],'scope':scope().model_dump(mode='json'),
            'design':design().model_dump(mode='json'),'parameters':[p.model_dump(mode='json') for p in parameters()]}
        response=client.post(path+'/revise',json=body)
        assert response.status_code==200, response.text
        assert client.post(path+'/revise',json=body).status_code==409
        prep=response.json()['preparation']
        assert client.get(path).json()['preparation']==prep
        configured=client.post(path+'/configure',json={'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256']})
        assert configured.status_code==200,configured.text
        experiment=configured.json()['experiment']
        assert client.post('/api/simulations',json={'experiment':experiment,'client_revision':0,'output_points':100}).status_code==200
        experiment['title']='Unregistered alteration'
        assert client.post('/api/simulations',json={'experiment':experiment,'client_revision':0}).status_code==422
        assert client.post('/api/contracts/experiments/validate',json=experiment).status_code==422
        assert client.get('/api/preparations/unknown').status_code==404


@pytest.mark.parametrize('state',['not_found','unavailable','ambiguous'])
def test_unknown_identity_can_only_use_explicit_hypothetical_assumptions(service,state):
    class UnknownIdentity:
        def assess(self,request):
            return DrugAssessmentResponse(request=request,identity_status=state,retrieval_status='unavailable',
                support={'status':'needs_parameters','reasons':['Synthetic missing identity'],'missing_parameters':['identity']})
    service.assessment=UnknownIdentity()
    record=create(service)
    assert record.preparation.state in {'identity_clarification','source_unavailable'}
    record=update(service,record,scope=scope(),design=design(),declare_hypothetical_identity=True,
        identity_rationale='Explicit researcher-defined compound, no claim of a verified database identity.')
    identifier=record.preparation.resolved_drug_identifier
    assert identifier.startswith('user:')
    items=parameters()
    for item in items: item.context.drug_identifier=identifier
    record=update(service,record,parameters=items)
    assert record.preparation.state=='ready_for_configuration'
    result=configure(service,record)
    assert result.classification=='conditional_researcher_specified'
    assert any('Researcher-declared' in assumption.description for assumption in result.experiment.assumptions)


def test_source_binding_target_cannot_be_relabeled(service):
    doc,items=reported_package(service)
    before=service.create(CreatePreparation(request={'drug_name':'Compound X','target':'Different target',
        'route':'iv_infusion','original_hypothesis':'A different explicitly declared target.'}))
    for item in items:
        item.context.target_identifier='Different target'
    record=update(service,before,parameters=items,document_ids=[doc.document_id],scope=scope(),design=design())
    assert record.preparation.state=='needs_inputs'
    assert any('does not mention' in m.reason for m in record.preparation.missing_inputs)


def test_identical_context_strings_do_not_validate_unrelated_papers(service):
    first,items=reported_package(service)
    record=LiteratureRecord(provider_source='MED',provider_id='87654321',pmid='87654321',
        title='Second synthetic paper',abstract=first.segments[0].text,abstract_available=True,
        full_text_status='not_confirmed',record_url='https://example.org/second-synthetic',retrieved_at=NOW)
    second=service.documents.retrieve(service.documents.register(record)).document
    for item in items:
        if item.parameter=='binding.dissociation_h_inv':
            item.passages[0].source_id=second.source.source_id
            item.passages[0].locator=second.segments[0].locator
    prepared=ready(service,parameters=items,document_ids=[first.document_id,second.document_id])
    assert prepared.preparation.state=='failed_validation'


def test_ambiguous_iv_requires_clarification_not_invented_bolus(service):
    record=service.create(CreatePreparation(request={'drug_name':'Compound X','target':'Target Y','route':'IV','original_hypothesis':'Hypothetical bloodstream exposure.'}))
    assert record.preparation.state=='needs_inputs'
    assert 'route' in {question.input_id for question in record.preparation.missing_inputs}
    record=update(service,record,answers={'route':'hypothetical_iv_bolus'})
    assert record.preparation.request.route=='hypothetical_iv_bolus'
    assert record.preparation.state=='needs_inputs'


def test_ready_receipt_survives_restart_with_cached_source_pages(service):
    doc,items=reported_package(service)
    prepared=ready(service,parameters=items,document_ids=[doc.document_id])
    original=configure(service,prepared)
    restarted=PreparationService(store=PreparationStore(service.store.path),
        documents=SourceDocumentService(cache_dir=service.documents.cache_dir),assessment=IdentityFixture())
    assert configure(restarted,prepared)==original


def test_unselected_inconsistent_kd_can_be_explicitly_replaced_with_derived_kd(service):
    prepared=ready(service,parameters=parameters()+[assumed('binding.affinity_nM',99.,'nM')])
    assert prepared.preparation.state=='failed_validation'
    revised=update(service,prepared,selected_parameters={'binding.affinity_nM':None})
    assert revised.preparation.state=='ready_for_configuration'
    assert configure(service,revised).experiment.scenarios[0].binding.affinity_nM==pytest.approx(10.)
    assert any(item.value==99. for item in revised.input_parameters)


def test_server_owned_flags_and_numeric_text_are_not_accepted(service):
    record=create(service)
    with pytest.raises(ValidationError):
        PreparationUpdate(base_revision=0,base_evidence_sha256=record.preparation.evidence_sha256,
            scope=scope(),checks=[{'check':'identity','outcome':'pass'}])
    with pytest.raises(ValueError,match='typed'):
        update(service,record,answers={'parameter:pk.volume_L':'2 L'})


def test_hypothetical_bolus_uses_same_validated_pk_engine(service):
    record=service.create(CreatePreparation(request={'drug_name':'Compound X','target':'Target Y',
        'route':'hypothetical_iv_bolus','original_hypothesis':'Explicit hypothetical bolus.'}))
    experiment_design=design(administration=[{'kind':'hypothetical_bolus','start_h':0.,'amount_mg':.01}],initial_occupancy=0.)
    record=update(service,record,scope=scope(),design=experiment_design,parameters=parameters())
    configured=configure(service,record)
    result=run_simulation(SimulationRequest(experiment=configured.experiment,client_revision=0,output_points=100),preparation_store=service.store)
    assert result.scenarios[0].central_concentration_nM[0]==pytest.approx(5.)
    assert result.scenarios[0].central_concentration_nM[-1]==pytest.approx(5*exp(-.05*24),rel=1e-9)


def test_invalid_schedule_or_negative_parameter_stays_blocked(service):
    record=ready(service,design=design(administration=[{'kind':'infusion','start_h':2.,'duration_h':2.,'amount_mg':1.},
        {'kind':'infusion','start_h':1.,'duration_h':1.,'amount_mg':1.}]))
    assert record.preparation.state=='failed_validation'
    assert any(c.outcome=='fail' for c in record.preparation.checks)
    items=parameters()
    items[0]=assumed('pk.volume_L',-2.,'L')
    record=ready(service,parameters=items)
    assert record.preparation.state=='failed_validation'
    with pytest.raises(ValueError): configure(service,record)


def test_source_version_cannot_change_under_a_ready_preparation(service):
    from app.research.source_documents import snapshot_digest
    doc,items=reported_package(service)
    record=ready(service,parameters=items,document_ids=[doc.document_id])
    stored=service.documents.documents[doc.document_id]
    stored.source.title='A different source version with the same quoted numbers'
    stored.source.snapshot_sha256=snapshot_digest(stored)
    with pytest.raises(ValueError,match='version changed'):
        configure(service,record)


def test_route_and_administration_must_agree(service):
    record=ready(service,design=design(administration=[{'kind':'hypothetical_bolus','start_h':0.,'amount_mg':1.}]))
    assert record.preparation.state=='failed_validation'
    assert any('declared route' in reason for reason in record.preparation.reasons)


def test_original_hypothesis_and_identity_provenance_are_preserved(service):
    text='  Original hypothesis with whitespace.  '
    record=service.create(CreatePreparation(request={'drug_name':'Compound X','target':'Target Y','route':'iv_infusion','original_hypothesis':text}))
    record=update(service,record,scope=scope(),design=design(),parameters=parameters())
    assert record.identity_assessment.resolved_identity.source_url
    assert configure(service,record).original_hypothesis==text


def test_reported_value_can_cite_separate_same_paper_context_passages(service):
    doc,items=reported_package(service)
    # Context-only passages need not repeat the measured number/unit.
    phrase='Compound X Target Y human purified protein cell-free iv_infusion extracellular.'
    items[0].passages.append(SourcePassage(source_id=doc.source.source_id,locator=doc.segments[0].locator,supporting_passage=phrase))
    prepared=ready(service,parameters=items,document_ids=[doc.document_id])
    assert prepared.preparation.state=='ready_for_configuration'


def test_preparation_toolkit_shares_retrieved_documents(service):
    from app.agent.preparation_tools import build_preparation_research_toolkit
    from app.research.europe_pmc import EuropePMCClient
    def fetch(url):
        return json.dumps({'hitCount':1,'resultList':{'result':[{'source':'MED','id':'12345678','pmid':'12345678',
            'title':'Synthetic shared source','abstractText':'Compound X Target Y human Compound X affinity 5 nM.'}]}}).encode()
    service.documents.literature=EuropePMCClient(fetch=fetch)
    def extractor(messages):
        return {'parameters':[{'parameter':'binding.affinity_nM','value':5.,'unit':'nM','locator':'abstract:0',
            'supporting_passage':'Compound X Target Y human Compound X affinity 5 nM.','relation':'exact'}],'notes':[]}
    tools={item.name:item for item in build_preparation_research_toolkit(service,extractor=extractor)}
    creation={'drug_name':'Compound X','target':'Target Y','route':'iv_infusion','original_hypothesis':'Synthetic shared-tool fixture.'}
    record=tools['start_experiment_preparation'].invoke({'request':creation})
    search=tools['search_hypothesis_evidence'].invoke({'request':creation,'focus':'binding'})
    source=tools['retrieve_evidence_source'].invoke({'source_handle':next(iter(search['source_handles']))})
    extracted=tools['extract_cited_parameters'].invoke({'document_id':source['document']['document_id'],
        'request':creation,'drug_identifier':'CHEMBL999999999','target_identifier':'Target Y'})
    prep=record['preparation']
    revised=tools['update_experiment_preparation'].invoke({'preparation_id':prep['preparation_id'],
        'update':{'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256'],
        'document_ids':[source['document']['document_id']],'parameters':extracted['parameters']}})
    assert revised['input_parameters'][0]['value']==5.
    assert revised['preparation']['state']=='needs_inputs'


def test_named_salt_does_not_automatically_supply_parent_form_parameters(service):
    doc,items=reported_package(service)
    text=doc.segments[0].text.replace('Compound X','Compound X hydrochloride')
    record=LiteratureRecord(provider_source='MED',provider_id='12345678',pmid='12345678',title='Synthetic salt-form source',
        abstract=text,abstract_available=True,full_text_status='not_confirmed',record_url='https://example.org/salt-fixture',retrieved_at=NOW)
    salt_doc=service.documents.retrieve(service.documents.register(record)).document
    for item in items:
        item.passages[0]=SourcePassage(source_id=salt_doc.source.source_id,locator=salt_doc.segments[0].locator,
            supporting_passage=item.passages[0].supporting_passage.replace('Compound X','Compound X hydrochloride'))
    prepared=ready(service,parameters=items,document_ids=[salt_doc.document_id])
    assert prepared.preparation.state=='needs_inputs'
    assert any('salt/form' in m.reason for m in prepared.preparation.missing_inputs)


@pytest.mark.parametrize('change',['value','unit','quote'])
def test_assumptions_cannot_smuggle_a_conversion_or_fabricated_quote(service,change):
    doc,_=reported_package(service)
    item=parameters()[0]
    if change=='value': item.value=5.
    elif change=='unit': item.unit='L'
    else: item.passages=[SourcePassage(source_id=doc.source.source_id,locator=doc.segments[0].locator,supporting_passage='Fabricated supporting text')]
    before=create(service)
    with pytest.raises(ValueError):
        update(service,before,parameters=[item],document_ids=[doc.document_id])
    assert service.store.read(before.preparation.preparation_id)==before


def test_reported_assay_context_preserves_case_sensitive_unit_text(service):
    doc,items=reported_package(service)
    items[0].context.assay_conditions='CELL-FREE'
    before=create(service)
    with pytest.raises(ValueError,match='assay_conditions'):
        update(service,before,parameters=items,document_ids=[doc.document_id])


def test_isotope_pk_cannot_be_silently_used_for_parent_drug(service):
    doc,items=reported_package(service)
    text=doc.segments[0].text.replace('Compound X','Compound X-d8')
    record=LiteratureRecord(provider_source='MED',provider_id='12345678',pmid='12345678',title='Synthetic isotope source',
        abstract=text,abstract_available=True,full_text_status='not_confirmed',record_url='https://example.org/isotope-fixture',retrieved_at=NOW)
    isotope_doc=service.documents.retrieve(service.documents.register(record)).document
    for item in items:
        item.passages[0]=SourcePassage(source_id=isotope_doc.source.source_id,locator=isotope_doc.segments[0].locator,
            supporting_passage=item.passages[0].supporting_passage.replace('Compound X','Compound X-d8'))
    prepared=ready(service,parameters=items,document_ids=[isotope_doc.document_id])
    assert prepared.preparation.state=='needs_inputs'
    assert any('salt/form' in m.reason for m in prepared.preparation.missing_inputs)
