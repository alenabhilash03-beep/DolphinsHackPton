"""Delve deeper: open-access article text, a rendered PDF, and a chat grounded only in that article."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthError, Authenticator
from app.config import Settings
from app.main import create_app
from app.research.europe_pmc import SourceMismatchError
from app.research.paper_reader import PaperReader, article_context, normalize_key, parse_jats, render_pdf

JATS = b'''<?xml version="1.0"?><!DOCTYPE article PUBLIC "-//NLM//DTD JATS" "JATS-archivearticle1.dtd">
<article><front><journal-meta><journal-title-group><journal-title>Test Pharmacology</journal-title></journal-title-group></journal-meta>
<article-meta><article-id pub-id-type="pmcid">PMC123456</article-id><article-id pub-id-type="pmid">12345678</article-id>
<article-id pub-id-type="doi">10.1/test</article-id><title-group><article-title>Clearance of an antibody <italic>in vivo</italic></article-title></title-group>
<contrib-group><contrib contrib-type="author"><name><surname>Ng</surname><given-names>Alice</given-names></name></contrib></contrib-group>
<pub-date><year>2020</year></pub-date><abstract><sec><title>Purpose</title><p>To estimate clearance.</p></sec></abstract></article-meta></front>
<body><sec><title>Results</title><p>Clearance was 0.127 L/day [ 1 , 2 ].</p>
<table-wrap><label>Table 1</label><caption><p>Parameters</p></caption><table><tr><td>CL</td><td>0.127</td></tr></table></table-wrap>
<sec><title>Covariates</title><p>Body weight mattered.</p></sec></sec></body></article>'''


def test_jats_becomes_ordered_sections_with_tables_and_tight_citations():
    article = parse_jats(JATS, 'PMC123456')
    assert (article.title, article.authors, article.journal, article.year) == ('Clearance of an antibody in vivo', ['Alice Ng'], 'Test Pharmacology', '2020')
    assert (article.pmid, article.doi, article.content_kind) == ('12345678', '10.1/test', 'full_text')
    assert [(s.heading, s.level) for s in article.sections] == [('Abstract', 1), ('Results', 1), ('Covariates', 2)]
    assert article.sections[0].paragraphs == ['Purpose: To estimate clearance.']
    assert article.sections[1].paragraphs == ['Clearance was 0.127 L/day [1, 2].', 'Table 1 Parameters', 'CL | 0.127']
    assert 'Clearance was 0.127 L/day' in article_context(article)[0]


def test_identity_mismatch_and_entities_are_rejected():
    with pytest.raises(SourceMismatchError):
        parse_jats(JATS, 'PMC999')
    with pytest.raises(Exception):
        parse_jats(b'<!DOCTYPE article [<!ENTITY x "y">]><article/>', 'PMC123456')


def test_keys_are_only_pmcids_or_pmids():
    assert normalize_key('pmc123456') == 'PMC123456' and normalize_key('PMID12345678') == 'PMID12345678'
    for bad in ['https://example.com/a.pdf', '../etc/passwd', 'PMC', 'PMID12']:
        with pytest.raises(ValueError):
            normalize_key(bad)


def test_reader_fetches_once_caches_and_finds_a_pmid_in_cached_full_text(tmp_path):
    calls = []
    def fetch(url):
        calls.append(url)
        return JATS
    reader = PaperReader(tmp_path / 'cache', fetch=fetch, seed_dir=tmp_path / 'seed')
    assert reader.article('PMC123456').title.startswith('Clearance')
    assert PaperReader(tmp_path / 'cache', fetch=fetch, seed_dir=tmp_path / 'seed').article('PMID12345678').key == 'PMC123456'
    assert calls == ['https://www.ebi.ac.uk/europepmc/webservices/rest/PMC123456/fullTextXML']
    assert render_pdf(reader.article('PMC123456')).startswith(b'%PDF-')


def test_seeded_demo_papers_render_without_network():
    reader = PaperReader(Path('/nonexistent'), fetch=lambda url: pytest.fail(url))
    article = reader.article('PMID30467591')
    assert article.pmcid == 'PMC6394489' and any('0.127' in p for s in article.sections for p in s.paragraphs)


def test_api_serves_text_pdf_and_chat_signed_out_with_a_shared_cap(tmp_path):
    settings = Settings(_env_file=None, auth_mode='supabase', supabase_url='https://example.supabase.co', supabase_anon_key='anon',
                        workspaces_dir=tmp_path / 'ws', preparation_db_path=tmp_path / 'p.sqlite3')
    api = create_app(settings)
    token = 'token-alice-0123456789abcdef'
    api.state.authenticator = Authenticator('supabase', lambda value: {'id': 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'} if value == token else (_ for _ in ()).throw(AuthError('no')))
    api.state.paper_reader = PaperReader(tmp_path / 'cache', fetch=lambda url: JATS, seed_dir=tmp_path / 'seed')
    seen = []
    api.state.paper_chat = lambda article, messages: seen.append((article.key, [m.content for m in messages])) or 'Results: "0.127 L/day".'
    client = TestClient(api)
    assert client.get('/api/papers/PMC123456').json()['sections'][1]['heading'] == 'Results'
    pdf = client.get('/api/papers/PMC123456/pdf')
    assert pdf.status_code == 200 and pdf.headers['content-type'] == 'application/pdf' and pdf.content.startswith(b'%PDF-')
    assert client.get('/api/papers/not-a-paper').status_code == 422
    question = {'messages': [{'role': 'user', 'content': 'What was the clearance?'}]}
    signed_out = client.post('/api/papers/PMC123456/chat', json=question)
    assert signed_out.status_code == 200 and signed_out.json()['answer'] == 'Results: "0.127 L/day".'
    answer = client.post('/api/papers/PMC123456/chat', json=question, headers={'Authorization': 'Bearer ' + token})
    assert answer.status_code == 200 and answer.json() == {'answer': 'Results: "0.127 L/day".', 'content_kind': 'full_text', 'context_truncated': False}
    assert seen == [('PMC123456', ['What was the clearance?'])] * 2
    # Signed-out questions share a cap that protects the provider key; signed-in researchers are not capped.
    for _ in range(59): client.post('/api/papers/PMC123456/chat', json=question)
    assert client.post('/api/papers/PMC123456/chat', json=question).status_code == 429
    assert client.post('/api/papers/PMC123456/chat', json=question, headers={'Authorization': 'Bearer ' + token}).status_code == 200
    ends_with_assistant = {'messages': [{'role': 'user', 'content': 'q'}, {'role': 'assistant', 'content': 'a'}]}
    assert client.post('/api/papers/PMC123456/chat', json=ends_with_assistant, headers={'Authorization': 'Bearer ' + token}).status_code == 422


def test_pasted_provider_keys_are_cleaned_so_the_auth_header_is_valid():
    for raw in ['nvapi-Ab_1-x\n', ' "nvapi-Ab_1-x" ', 'Bearer nvapi-Ab_1-x', "'nvapi-Ab_1-x'\r\n"]:
        assert Settings(_env_file=None, nvidia_api_key=raw).nvidia_api_key.get_secret_value() == 'nvapi-Ab_1-x'
    assert Settings(_env_file=None).nvidia_api_key is None
