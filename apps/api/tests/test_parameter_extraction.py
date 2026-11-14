import copy
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from app.agent.evidence_tools import build_evidence_tools
from app.research.europe_pmc import EuropePMCClient, LiteratureRecord, LiteratureSearch, RetrievalError
from app.research.parameter_extraction import ParameterResearchService, SYSTEM_PROMPT
from app.research.source_documents import MAX_XML_BYTES, SourceDocumentService, snapshot_digest
from app.schemas.evidence_extraction import ExtractionProposalBatch
from app.schemas.experiment_preparation import PreparationRequest

FIXTURE = Path(__file__).resolve().parents[3] / 'data/research/extraction-fixtures/measurement.xml'


def record(**changes):
    data = dict(provider_source='MED', provider_id='12345678', pmid='12345678', pmcid='PMC9000001',
        title='SYNTHETIC fixture only', abstract='The human assay had a dissociation constant of 5 nM.',
        abstract_available=True, full_text_status='not_confirmed', record_url='https://europepmc.org/article/MED/12345678',
        retrieved_at=datetime(2026, 11, 14, tzinfo=timezone.utc))
    return LiteratureRecord(**(data | changes))


@pytest.fixture
def request_data():
    return PreparationRequest(drug_name='compound X', target='target Y',
        original_hypothesis='Would a longer half-life maintain target occupancy?')


@pytest.fixture
def document_service(tmp_path):
    return SourceDocumentService(fetch=lambda url: FIXTURE.read_bytes(), cache_dir=tmp_path)


def retrieve(service, **changes):
    return service.retrieve(service.register(record(**changes)))


def proposal(**changes):
    return dict(parameter='binding.affinity_nM', value=5.0, unit='nM', locator='full_text:block-1:0',
        supporting_passage='In the human purified protein assay, compound X had a dissociation constant of 5 nM.',
        relation='exact', species='human', experimental_system='purified protein assay') | changes


def extraction(service, request_data, proposals=None, **kwargs):
    document = retrieve(service).document
    researcher = ParameterResearchService(service, extractor=lambda messages: ExtractionProposalBatch(
        parameters=proposals if proposals is not None else [proposal()], notes=[]))
    return researcher, researcher.extract(document.document_id, request_data, 'fixture:X', 'fixture:Y', **kwargs)


def test_full_text_identity_chunks_hash_and_snapshot(document_service):
    result = retrieve(document_service)
    assert result.status == 'retrieved'
    assert result.document.source.content_kind == 'full_text'
    assert len(result.document.segments) == 4
    assert result.document.source.snapshot_sha256 == snapshot_digest(result.document)
    assert list(document_service.cache_dir.glob('*.json'))
    modified = document_service.get(result.document.document_id)
    modified.segments[0].text = 'Changed caller copy'
    assert document_service.get(result.document.document_id).segments[0].text != modified.segments[0].text


@pytest.mark.parametrize('body', [b'<broken', b'<html>not a paper</html>', b'<!DOCTYPE article [<!ENTITY x "bad">]><article/>', b'x'*(MAX_XML_BYTES+1)])
def test_unusable_full_text_falls_back_to_labeled_abstract(tmp_path, body):
    service = SourceDocumentService(fetch=lambda url: body, cache_dir=tmp_path)
    result = retrieve(service)
    assert result.status == 'retrieved'
    assert result.document.source.content_kind == 'abstract'
    assert result.document.segments[0].locator.startswith('abstract')
    assert any('only' in warning for warning in result.document.warnings)


def test_full_text_timeout_and_no_abstract_is_unavailable():
    def timeout(url):
        raise TimeoutError()
    service = SourceDocumentService(fetch=timeout)
    assert retrieve(service, abstract=None, abstract_available=False).status == 'unavailable'


@pytest.mark.parametrize('old,new', [(b'9000001', b'9000002'), (b'12345678', b'87654321')])
def test_wrong_full_text_identity_cannot_fall_back_to_abstract(old, new):
    service = SourceDocumentService(fetch=lambda url: FIXTURE.read_bytes().replace(old, new))
    result = retrieve(service)
    assert result.status == 'rejected'
    assert result.document is None


def test_unknown_handles_never_fetch_arbitrary_urls(document_service):
    assert document_service.retrieve('https://evil.invalid').status == 'rejected'
    with pytest.raises(ValueError):
        document_service.get('not-a-document')
    with pytest.raises(ValueError):
        document_service.restore('../../.env')


def test_explicit_cache_replay_retains_original_time_and_rejects_corruption(document_service):
    document = retrieve(document_service).document
    cache = SourceDocumentService(cache_dir=document_service.cache_dir)
    restored = cache.restore(document.document_id)
    assert restored.source.retrieval_status == 'cached'
    assert restored.source.retrieved_at == document.source.retrieved_at
    assert restored.source.snapshot_sha256 == snapshot_digest(restored)
    path = document_service.cache_dir / f'{document.document_id}.json'
    data = json.loads(path.read_text())
    data['segments'][0]['text'] = 'fabricated measurement'
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        cache.restore(document.document_id)


def test_bounded_source_and_document_counts(document_service):
    large = FIXTURE.read_bytes().replace(b'</sec>', b'<p>' + b'A'*50_000 + b'</p></sec>')
    document_service.fetch = lambda url: large
    doc = retrieve(document_service).document
    assert sum(len(segment.text) for segment in doc.segments) <= 24_000
    assert any('Partial bounded' in warning for warning in doc.warnings)
    for _ in range(19):
        document_service.register(record())
    with pytest.raises(ValueError):
        document_service.register(record())


def test_exact_source_backed_extraction_stays_candidate(document_service, request_data):
    service, result = extraction(document_service, request_data)
    assert result.status == 'candidates'
    parameter = result.parameters[0]
    assert parameter.applicability == 'candidate'
    assert parameter.provenance == 'reported'
    assert parameter.value == parameter.original_value == 5
    assert parameter.unit == parameter.original_unit == 'nM'
    assert parameter.context.species == 'human'
    assert parameter.passages[0].source_id == next(iter(document_service.documents.values())).source.source_id
    assert result.runnable is False
    assert 'pk.volume_L' in result.missing_parameters


@pytest.mark.parametrize('change', [
    {'supporting_passage': 'Invented affinity is 5 nM.'},
    {'locator': 'unknown'}, {'value': 999.0}, {'unit': 'invented-unit'},
    {'species': 'mouse'}, {'relation': 'bound_or_range'}, {'relation': 'uncertain'},
    {'parameter': 'clinical_efficacy'},
])
def test_fabricated_or_unsupported_candidates_rejected(document_service, request_data, change):
    _, result = extraction(document_service, request_data, [proposal(**change)])
    assert result.status == 'rejected'
    assert not result.parameters
    assert result.rejected_candidates


def test_conflicting_assay_values_preserved_without_selection(document_service, request_data):
    second = proposal(value=12.0, locator='full_text:block-2:0',
        supporting_passage='In the mouse assay, compound X had a dissociation constant of 12 nM.',
        species='mouse', experimental_system='assay')
    _, result = extraction(document_service, request_data, [proposal(), second])
    assert len(result.parameters) == 2
    assert len(result.conflicts) == 1
    assert len(result.conflicts[0].parameter_ids) == 2
    assert all(item.applicability == 'candidate' for item in result.parameters)


def test_conflicts_across_sources_in_same_session(document_service, request_data):
    responses = [[proposal()], [proposal(value=12.0,locator='full_text:block-2:0',
        supporting_passage='In the mouse assay, compound X had a dissociation constant of 12 nM.',
        species='mouse',experimental_system='assay')]]
    service = ParameterResearchService(document_service, extractor=lambda messages: {'parameters':responses.pop(0),'notes':[]})
    for _ in range(2):
        doc = retrieve(document_service).document
        result = service.extract(doc.document_id, request_data, 'fixture:X', 'fixture:Y')
    assert result.conflicts


def test_injection_segment_excluded_before_model_and_cannot_promote(document_service, request_data):
    doc = retrieve(document_service).document
    seen = []
    def extractor(messages):
        seen.append(messages)
        return {'parameters':[proposal()],'notes':[]}
    service = ParameterResearchService(document_service, extractor=extractor)
    result = service.extract(doc.document_id, request_data, 'fixture:X')
    assert 'Ignore previous' not in seen[0][1]['content']
    assert seen[0][0]['content'] == SYSTEM_PROMPT
    assert result.rejected_candidates
    assert result.parameters[0].applicability == 'candidate'
    seen.clear()
    rejected = service.extract(doc.document_id, request_data, 'fixture:X', locators=['full_text:block-4:0'])
    assert rejected.status == 'rejected'
    assert not seen


def test_model_cannot_forge_applicability_or_citation_fields(document_service, request_data):
    forged = proposal(applicability='compatible', source_id='invented', provenance='reviewed')
    _, result = extraction(document_service, request_data, [forged])
    assert result.status == 'unavailable'
    assert not result.parameters


def test_absent_measurement_preserved_not_filled(document_service, request_data):
    _, result = extraction(document_service, request_data, [])
    assert result.status == 'no_values'
    assert len(result.missing_parameters) == 9


def test_extraction_failure_is_sanitized(document_service, request_data):
    document = retrieve(document_service).document
    def failing(messages):
        raise RuntimeError('secret-value-do-not-expose')
    service = ParameterResearchService(document_service, extractor=failing)
    result = service.extract(document.document_id, request_data, 'fixture:X')
    assert result.status == 'unavailable'
    assert 'secret-value' not in result.model_dump_json()


def test_locator_limits(document_service, request_data):
    with pytest.raises(ValueError):
        extraction(document_service, request_data, locators=['not-inspected'])
    with pytest.raises(ValueError):
        extraction(document_service, request_data, locators=['full_text:block-1:0']*13)


def test_search_focus_and_real_langchain_tools(request_data):
    seen=[]
    def fetch(url):
        seen.append(url)
        return json.dumps({'hitCount':1,'resultList':{'result':[{'source':'MED','id':'12345678',
            'pmid':'12345678','title':'Synthetic study','abstractText':'No quantitative binding measurement.'}]}}).encode()
    docs = SourceDocumentService(literature=EuropePMCClient(fetch=fetch))
    service = ParameterResearchService(docs, extractor=lambda messages: {'parameters':[],'notes':[]})
    search, retrieve_tool, extract = build_evidence_tools(service)
    searched = search.invoke({'request':request_data.model_dump(mode='json'),'focus':'pk'})
    assert searched['status'] == 'live' and len(searched['source_handles']) == 1
    assert 'pharmacokinetics' in seen[0]
    handle = next(iter(searched['source_handles']))
    document = retrieve_tool.invoke({'source_handle':handle})['document']
    result = extract.invoke({'document_id':document['document_id'], 'request':request_data.model_dump(mode='json'),'drug_identifier':'fixture:X'})
    assert result['status'] == 'no_values' and result['runnable'] is False
    assert [tool.name for tool in (search,retrieve_tool,extract)] == ['search_hypothesis_evidence','retrieve_evidence_source','extract_cited_parameters']
    with pytest.raises(ValueError):
        service.search(request_data, 'invented-focus')


def test_search_outage_is_not_absence(request_data):
    def fail(url):
        raise TimeoutError()
    service = ParameterResearchService(SourceDocumentService(literature=EuropePMCClient(fetch=fail)))
    result = service.search(request_data)
    assert result.status == 'unavailable'
    assert result.search is None


@pytest.mark.parametrize('passage,value,expected', [
    ('The rate was 2e-3 nM^-1 hour^-1.', 0.002, True),
    ('The rate was 2 × 10^-3 nM^-1 hour^-1.', 0.002, True),
    ('The rate was 2 × 10^-3 nM^-1 hour^-1.', 2.0, False),
    ('The rate was 2 × 10⁻³ nM^-1 hour^-1.', 0.002, True),
    ('The rate was 0.02 nM^-1 hour^-1.', 0.002, False),
])
def test_original_scientific_number_preserved(passage, value, expected):
    from app.research.parameter_extraction import _contains_number
    assert _contains_number(passage, value) is expected


@pytest.mark.parametrize('passage,unit,expected', [
    ('KD was 5 nM.', 'nM', True),
    ('compoundM was studied.', 'M', False),
    ('The dose was 10 mM.', 'MM', False),
])
def test_units_require_case_and_word_boundaries(passage, unit, expected):
    from app.research.parameter_extraction import _contains_unit
    assert _contains_unit(passage, unit) is expected


def test_claimed_exact_bounds_are_not_accepted(tmp_path, request_data):
    xml = FIXTURE.read_bytes().replace(b'constant of 5 nM', b'constant of &lt;5 nM')
    service = SourceDocumentService(fetch=lambda url: xml, cache_dir=tmp_path)
    p = proposal(supporting_passage='In the human purified protein assay, compound X had a dissociation constant of <5 nM.')
    _, result = extraction(service, request_data, [p])
    assert not result.parameters
    assert result.status == 'rejected'


def test_hypothesis_data_and_search_terms_do_not_become_instructions(request_data):
    query=[]
    def fetch(url):
        query.append(url)
        return b'{"hitCount":0,"resultList":{"result":[]}}'
    request_data.drug_name = 'X" OR *:* OR "Y'
    service = ParameterResearchService(SourceDocumentService(literature=EuropePMCClient(fetch=fetch)))
    service.search(request_data, 'binding')
    from urllib.parse import parse_qs, urlparse
    q = parse_qs(urlparse(query[0]).query)['query'][0]
    assert '"X OR OR Y"' in q
    assert '*:*' not in q
    for _ in range(3):
        service.search(request_data)
    with pytest.raises(ValueError):
        service.search(request_data)


def test_snapshot_modified_in_service_is_rejected(document_service, request_data):
    document = retrieve(document_service).document
    document_service.documents[document.document_id].segments[0].text = 'tampered'
    service = ParameterResearchService(document_service, extractor=lambda messages: {'parameters':[],'notes':[]})
    with pytest.raises(ValueError, match='corrupted'):
        service.extract(document.document_id, request_data, 'fixture:X')


def test_table_rows_keep_header_unit_context(document_service):
    table = b'<table-wrap><caption><p>Synthetic affinity table</p></caption><table><thead><tr><th>Drug</th><th>KD (nM)</th></tr></thead><tbody><tr><td>X</td><td>5</td></tr></tbody></table></table-wrap>'
    document_service.fetch = lambda url: FIXTURE.read_bytes().replace(b'</sec>',table+b'</sec>')
    document = retrieve(document_service).document
    assert any('KD (nM)' in segment.text and 'X 5' in segment.text for segment in document.segments)


def test_extraction_call_budget(document_service, request_data):
    service = ParameterResearchService(document_service, extractor=lambda messages: {'parameters':[],'notes':[]})
    document = retrieve(document_service).document
    for _ in range(6):
        service.extract(document.document_id, request_data, 'fixture:X')
    with pytest.raises(ValueError, match='limit'):
        service.extract(document.document_id, request_data, 'fixture:X')


def test_standard_external_jats_doctype_is_inert_and_supported(document_service):
    calls=[]
    def fetch(url):
        calls.append(url)
        return b'<!DOCTYPE article PUBLIC "-//NLM//DTD JATS//EN" "https://never-fetch.invalid/jats.dtd">' + FIXTURE.read_bytes()
    document_service.fetch=fetch
    result = retrieve(document_service)
    assert result.document.source.content_kind == 'full_text'
    assert len(calls) == 1 and 'never-fetch' not in calls[0]


def test_extraction_schemas_published_without_execution_routes():
    from app.main import create_app
    schema = create_app().openapi()
    for name in ['EvidenceSearchResult','SourceRetrievalResult','ParameterExtractionResult','EvidenceSnapshot']:
        assert name in schema['components']['schemas']
    assert not any('/extract' in route or '/preparations' in route for route in schema['paths'])


def test_agent_can_read_later_bounded_source_pages(document_service):
    paragraphs = b''.join(f'<p>Source block {i}.</p>'.encode() for i in range(40))
    document_service.fetch = lambda url: FIXTURE.read_bytes().replace(b'</sec>',paragraphs+b'</sec>')
    handle = document_service.register(record())
    first = document_service.retrieve(handle)
    assert first.next_start_block == 12
    later = document_service.retrieve(handle, first.next_start_block)
    assert later.status == 'retrieved'
    assert later.next_start_block == 24
    assert first.document.segments[0].locator != later.document.segments[0].locator
    assert first.document.source.source_id != later.document.source.source_id
    assert document_service.retrieve(handle, 1000).status == 'rejected'
    with pytest.raises(ValueError):
        document_service.retrieve(handle, -1)


def test_later_page_does_not_silently_become_abstract_on_outage(document_service):
    document_service.fetch = lambda url: (_ for _ in ()).throw(TimeoutError())
    handle = document_service.register(record())
    result = document_service.retrieve(handle, 12)
    assert result.status == 'unavailable'
    assert result.document is None


def test_experimental_context_cannot_be_invented(document_service, request_data):
    _, result = extraction(document_service, request_data, [proposal(route='intravenous', formulation='tablet')])
    assert result.status == 'rejected'
    assert not result.parameters


def test_unknown_context_stays_unknown(document_service, request_data):
    _, result = extraction(document_service, request_data)
    context = result.parameters[0].context
    assert context.route is None and context.formulation is None and context.exposure_compartment is None


def test_tables_in_jats_float_group_are_available(document_service):
    table = b'<floats-group><table-wrap><caption><p>Synthetic floating table</p></caption><table><thead><tr><th>KD nM</th></tr></thead><tbody><tr><td>5</td></tr></tbody></table></table-wrap></floats-group>'
    document_service.fetch = lambda url: FIXTURE.read_bytes().replace(b'</article>',table+b'</article>')
    document = retrieve(document_service).document
    assert 'KD nM' in document.segments[0].text
    assert any('KD nM 5' in segment.text for segment in document.segments)
