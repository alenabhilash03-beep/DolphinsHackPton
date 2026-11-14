"""Whole-workflow acceptance. All injected identities/sources/extraction are SYNTHETIC."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from math import exp
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.agent.preparation_tools import build_preparation_research_toolkit
from app.config import Settings
from app.main import create_app
from app.research.europe_pmc import EuropePMCClient
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore, canonical_hash
from app.research.source_documents import SourceDocumentService
from app.schemas.drug_support import DrugAssessmentResponse, DrugIdentity
from app.schemas.evidence_extraction import ExtractionProposalBatch
from app.schemas.preparation_workflow import PreparationDesign, PreparationScope

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = json.loads((ROOT / 'data/examples/preparation-acceptance.json').read_text())
CASES = FIXTURES['cases']
NOW = datetime(2026, 11, 14, tzinfo=timezone.utc)


def version(record):
    prep = record['preparation']
    return {'base_revision': prep['revision'], 'base_evidence_sha256': prep['evidence_sha256']}


def rig(tmp_path, case, monkeypatch, *, extractor_unavailable=False):
    """Inject only external dependencies; exercise real tools, parsers, APIs and SciPy."""
    trace = []
    name, target = case['request']['drug_name'], case['request']['target']
    identifier = 'fixture:' + case['case_id']  # deliberately not a real ChEMBL identity
    fields = [item for item in case['inputs'] if item['parameter'] != case['initially_missing']]
    phrases = {item['parameter']: (
        f'SYNTHETIC SOFTWARE FIXTURE ONLY. {name} {target} human purified protein cell-free '
        f'iv_infusion extracellular. {item["parameter"]} = {item["value"]} {item["unit"]}.'
    ) for item in fields}

    class IdentityFixture:
        def assess(self, request):
            trace.append('identity')
            identity = DrugIdentity(canonical_name=request.drug_name, identifiers={'chembl_id': identifier},
                aliases=[request.drug_name], molecular_form=request.drug_name, molecule_type='Synthetic fixture',
                provenance='database_candidate', source_url='https://example.org/synthetic-identity',
                retrieved_at=NOW, form_scope='Test injection only; no database identity is claimed.')
            return DrugAssessmentResponse(request=request, identity_status='candidate_identity', retrieval_status='live',
                resolved_identity=identity, candidates=[identity],
                support={'status': 'needs_parameters', 'reasons': ['Synthetic identity, no preset'], 'missing_parameters': ['parameters']})

    def fetch(_url):
        trace.append('search')
        return json.dumps({'hitCount': 1, 'resultList': {'result': [{'source': 'MED', 'id': '99999999',
            'pmid': '99999999', 'title': 'SYNTHETIC SOFTWARE FIXTURE ONLY',
            'abstractText': ' '.join(phrases.values())}]}}).encode()

    def extract(messages):
        trace.append('structured_extractor_stub')
        if extractor_unavailable:
            raise RuntimeError('Synthetic provider outage')
        payload = json.loads(messages[-1]['content'])
        segments = payload['untrusted_source_segments']
        proposals = []
        for item in fields:
            passage = phrases[item['parameter']]
            locator = next(segment['locator'] for segment in segments if passage in segment['text'])
            proposals.append(dict(item, locator=locator, supporting_passage=passage, relation='exact',
                molecular_form=name, drug_name_in_source=name, target_in_source=target, species='human',
                experimental_system='purified protein', assay_conditions='cell-free', route='iv_infusion',
                exposure_compartment='extracellular'))
        return ExtractionProposalBatch(parameters=proposals, notes=['SYNTHETIC deterministic extractor stub; no live LLM call.'])

    def no_full_text(_url):
        raise AssertionError('Abstract fixture must not access a network endpoint')

    service = PreparationService(store=PreparationStore(tmp_path / 'preparations.sqlite3'),
        documents=SourceDocumentService(literature=EuropePMCClient(fetch=fetch), fetch=no_full_text,
            cache_dir=tmp_path / 'snapshots'), assessment=IdentityFixture())
    tools = {tool.name: tool for tool in build_preparation_research_toolkit(service, extractor=extract)}
    import app.simulation.service as numerical
    real_compare = numerical.compare_experiment

    def observe_solver(*args, **kwargs):
        trace.append('numerical_solver')
        return real_compare(*args, **kwargs)

    monkeypatch.setattr(numerical, 'compare_experiment', observe_solver)
    return service, tools, trace


def research(tools, case):
    search = tools['search_hypothesis_evidence'].invoke({'request': case['request']})
    assert search['status'] == 'live'  # simulated transport; not a live verification claim
    page = tools['retrieve_evidence_source'].invoke({'source_handle': next(iter(search['source_handles']))})
    assert page['status'] == 'retrieved'
    document = page['document']
    extracted = tools['extract_cited_parameters'].invoke({'document_id': document['document_id'],
        'request': case['request'], 'drug_identifier': 'fixture:' + case['case_id'],
        'target_identifier': case['request']['target']})
    assert extracted['status'] == 'candidates'
    assert extracted['runnable'] is False
    return document, extracted['parameters']


def assumed_answer(case):
    item = next(item for item in case['inputs'] if item['parameter'] == case['initially_missing'])
    return dict(item, parameter_id='explicit-missing-rate-answer', original_value=item['value'], original_unit=item['unit'],
        normalization='Explicit synthetic researcher assumption, not a source measurement', provenance='researcher_assumed',
        rationale='SYNTHETIC researcher-supplied assumption solely for software acceptance.', entered_at=NOW.isoformat(),
        context={'drug_identifier': 'fixture:' + case['case_id'], 'target_identifier': case['request']['target'],
            'molecular_form': case['request']['drug_name'], 'species': 'human', 'exposure_compartment': 'extracellular',
            'applicability_notes': ['Explicit synthetic assumption for the missing rate; no measured value claimed.']})


def exercise_pipeline(tmp_path, monkeypatch, case):
    service, tools, trace = rig(tmp_path, case, monkeypatch)
    with TestClient(create_app(Settings(_env_file=None), preparation_service=service)) as client:
        response = client.post('/api/preparations', json={'request': case['request']})
        assert response.status_code == 201
        original = response.json()
        assert original['preparation']['profile_id'] is None
        path = '/api/preparations/' + original['preparation']['preparation_id']
        document, parameters = research(tools, case)
        update = dict(version(original), document_ids=[document['document_id']], parameters=parameters,
            scope=case['scope'], design=case['design'])
        response = client.post(path + '/revise', json=update)
        assert response.status_code == 200, response.text
        prepared = response.json()
        assert prepared['preparation']['state'] == case['expected_initial_state'], prepared['preparation']['reasons']
        assert prepared['preparation']['runnable'] is False
        if case['initially_missing']:
            assert case['initially_missing'] in {item['parameter'] for item in prepared['preparation']['missing_inputs']}
            assert client.post(path + '/configure', json=version(prepared)).status_code == 422
            assert 'numerical_solver' not in trace
            before_answer = prepared
            answer = dict(version(prepared), parameters=[assumed_answer(case)])
            response = client.post(path + '/revise', json=answer)
            assert response.status_code == 200, response.text
            prepared = response.json()
            assert prepared['preparation']['state'] == case['expected_resumed_state']
            assert prepared['preparation']['evidence_sha256'] != before_answer['preparation']['evidence_sha256']
            assert client.get(path, params={'revision': before_answer['preparation']['revision']}).json() == before_answer
            assert client.post(path + '/revise', json=answer).status_code == 409
        response = client.post(path + '/configure', json=version(prepared))
        assert response.status_code == 200, response.text
        config = response.json()
        assert config['hypothesis_parsed'] is False
        assert config['original_hypothesis'] == case['request']['original_hypothesis']
        assert config['evidence_sha256'] == prepared['preparation']['evidence_sha256']
        experiment = config['experiment']
        assert experiment['drug'] == case['request']['drug_name']
        evidence = {item['evidence_id']: item for item in experiment['evidence']}
        for item in evidence.values():
            assert item['review_status'] == 'candidate'
            if item['provenance'] == 'reported':
                assert item['source_ids'] == [document['source']['source_id']]
                assert item['context']['evidence_sha256'] == config['evidence_sha256']
                assert json.loads(item['context']['source_snapshots'])[item['source_ids'][0]]['sha256'] == document['source']['snapshot_sha256']
            if item['provenance'] == 'calculated':
                assert item['parent_ids'] and all(key in evidence for key in item['parent_ids'])
        if case['initially_missing']:
            answer_evidence = evidence['explicit-missing-rate-answer']
            assert answer_evidence['provenance'] == 'user_supplied'
            assert answer_evidence['entered_at'] is not None and answer_evidence['rationale']
            assert experiment['scenarios'][0]['binding']['dissociation_h_inv'] == answer_evidence['value']
        assert 'numerical_solver' not in trace
        request = {'experiment': experiment, 'client_revision': 7, 'output_points': 100}
        response = client.post('/api/simulations', json=request)
        assert response.status_code == 200, response.text
        result = response.json()
        assert trace == ['identity', 'search', 'structured_extractor_stub', 'numerical_solver']
        assert result['client_revision'] == 7
        assert result['configuration'] == experiment
        assert result['configuration_hash'] == config['configuration_sha256'] == canonical_hash(experiment)
        scenario = experiment['scenarios'][0]
        event = scenario['administration'][0]
        # Independent exact one-compartment infusion/decay reference at every plot sample.
        volume, clearance = scenario['pk']['volume_L'], scenario['pk']['clearance_L_h']
        k = clearance / volume
        input_rate = event['amount_mg'] * 1e6 / scenario['molecular_weight_g_mol'] / event['duration_h']
        plateau = input_rate / clearance
        expected = [plateau * (1 - exp(-k * min(t, event['duration_h']))) * exp(-k * max(0, t - event['duration_h'])) for t in result['time_h']]
        series = result['scenarios'][0]
        assert series['central_concentration_nM'] == pytest.approx(expected, rel=1e-10, abs=1e-10)
        assert series['target_site_concentration_nM'] == pytest.approx([c * .1 for c in expected])
        assert max(series['occupancy']) > .1
        assert all(0 <= occupancy <= 1 for occupancy in series['occupancy'])
        assert all(len(values) == len(result['time_h']) for values in (series['central_concentration_nM'], series['target_site_concentration_nM'], series['occupancy']))
        # Durable source-backed registration and reproduction after server/service restart.
        restarted = PreparationService(store=PreparationStore(service.store.path),
            documents=SourceDocumentService(cache_dir=service.documents.cache_dir), assessment=service.assessment)
        with TestClient(create_app(Settings(_env_file=None), preparation_service=restarted)) as replay:
            assert replay.get(path).json() == prepared
            assert replay.post(path + '/configure', json=version(prepared)).json() == config
            repeated = replay.post('/api/simulations', json=request).json()
            assert repeated['result_id'] == result['result_id']
            assert repeated['scenarios'] == result['scenarios']


@pytest.mark.parametrize('case', CASES, ids=lambda case: case['case_id'])
def test_evidence_tools_to_http_simulation_and_clarification(tmp_path, monkeypatch, case):
    exercise_pipeline(tmp_path, monkeypatch, case)


@pytest.mark.parametrize('change', [
    {'binding_regime': 'irreversible'}, {'pk_regime': 'other'}, {'competition': 'requires_explicit_model'},
], ids=['irreversible-binding', 'unsupported-pk', 'explicit-competition'])
def test_complete_numbers_do_not_enable_unsupported_models(tmp_path, monkeypatch, change):
    case = deepcopy(CASES[0])
    service, tools, trace = rig(tmp_path, case, monkeypatch)
    document, parameters = research(tools, case)
    with TestClient(create_app(Settings(_env_file=None), preparation_service=service)) as client:
        created = client.post('/api/preparations', json={'request': case['request']}).json()
        path = '/api/preparations/' + created['preparation']['preparation_id']
        response = client.post(path + '/revise', json=dict(version(created), parameters=parameters,
            document_ids=[document['document_id']], scope=case['scope'] | change, design=case['design']))
        assert response.status_code == 200
        blocked = response.json()
        assert blocked['preparation']['state'] == 'unsupported'
        assert client.post(path + '/configure', json=version(blocked)).status_code == 422
        assert 'numerical_solver' not in trace
        with service.store.connect() as db:
            assert db.execute('SELECT count(*) FROM prepared_configurations').fetchone()[0] == 0


def test_fresh_unregistered_name_uses_same_pipeline_without_a_profile(tmp_path, monkeypatch):
    case = deepcopy(CASES[0])
    case['request']['drug_name'] = 'Synthetic-' + uuid4().hex[:12]
    case['scope']['molecular_form'] = case['request']['drug_name']
    exercise_pipeline(tmp_path, monkeypatch, case)


def test_extraction_outage_leaves_missing_inputs_without_fabricated_defaults(tmp_path, monkeypatch):
    case = CASES[0]
    service, tools, trace = rig(tmp_path, case, monkeypatch, extractor_unavailable=True)
    search = tools['search_hypothesis_evidence'].invoke({'request': case['request']})
    page = tools['retrieve_evidence_source'].invoke({'source_handle': next(iter(search['source_handles']))})
    document = page['document']
    extraction = tools['extract_cited_parameters'].invoke({'document_id': document['document_id'],
        'request': case['request'], 'drug_identifier': 'fixture:' + case['case_id'],
        'target_identifier': case['request']['target']})
    assert extraction['status'] == 'unavailable' and extraction['parameters'] == []
    with TestClient(create_app(Settings(_env_file=None), preparation_service=service)) as client:
        created = client.post('/api/preparations', json={'request': case['request']}).json()
        path = '/api/preparations/' + created['preparation']['preparation_id']
        response = client.post(path + '/revise', json=dict(version(created), document_ids=[document['document_id']],
            scope=case['scope'], design=case['design']))
        assert response.status_code == 200
        prepared = response.json()
        assert prepared['preparation']['state'] == 'needs_inputs'
        assert prepared['input_parameters'] == []
        assert client.post(path + '/configure', json=version(prepared)).status_code == 422
        assert 'numerical_solver' not in trace


def test_frontend_fixture_recipes_have_explicit_design_and_are_not_claimed_evidence():
    assert FIXTURES['origin'] == 'synthetic_software_fixture_not_scientific_evidence'
    for case in CASES:
        PreparationScope.model_validate(case['scope'])
        PreparationDesign.model_validate(case['design'])
        assert 'SYNTHETIC' in case['request']['original_hypothesis']
