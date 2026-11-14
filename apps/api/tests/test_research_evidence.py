"""Source identity and outage behavior at the literature-to-model boundary."""

import json
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.research.europe_pmc import EuropePMCClient, RetrievalError
from app.research.registry import DATA_ROOT, load_cached_record, load_curated_profile, validate_literature_identity


def core_record(**changes):
    record = {
        "id": "30467591", "source": "MED", "pmid": "30467591", "pmcid": "PMC6394489",
        "doi": "10.1007/s00280-018-3728-z", "title": "Trastuzumab pharmacokinetic study",
        "pubYear": "2019", "abstractText": "<h4>Methods</h4> Measured serum concentrations.",
        "fullTextUrlList": {"fullTextUrl": [{"availabilityCode": "OA", "documentStyle": "html", "url": "https://europepmc.org/articles/PMC6394489"}]},
    }
    record.update(changes)
    return record


def client_with(record):
    calls = []
    def fetch(url):
        calls.append(parse_qs(urlsplit(url).query))
        return json.dumps({"hitCount": 1, "resultList": {"result": [record]}}).encode()
    return EuropePMCClient(fetch), calls


def test_live_core_result_preserves_ids_and_encoded_query():
    research, calls = client_with(core_record())
    result = research.search("trastuzumab AND HER2", page_size=1)
    assert calls[0]["query"] == ["trastuzumab AND HER2"]
    assert calls[0]["resultType"] == ["core"]
    assert result.retrieval_status == "live"
    assert result.records[0].pmid == "30467591"
    assert result.records[0].title == "Trastuzumab pharmacokinetic study"
    assert result.records[0].abstract.startswith("Methods")
    assert result.records[0].full_text_status == "open_access_link"


def test_missing_abstract_and_full_text_are_not_invented():
    research, _ = client_with(core_record(abstractText="", fullTextUrlList={"fullTextUrl": []}, isOpenAccess="Y"))
    item = research.search("trastuzumab").records[0]
    assert item.abstract is None and item.abstract_available is False
    assert item.full_text_status == "not_confirmed" and item.full_text_url is None


def test_exact_pmid_and_context_gate_reject_mismatched_provider_record():
    research, _ = client_with(core_record(id="99999999", pmid="99999999"))
    with pytest.raises(RetrievalError, match="exact requested"):
        research.lookup_pmid("30467591")
    profile = load_curated_profile()
    with pytest.raises(ValueError, match="identifiers"):
        validate_literature_identity(research.search("trastuzumab").records[0], profile.literature_checks[0])


def test_reviewed_profile_rejects_fragment_rate_substitution(tmp_path):
    raw = json.loads((DATA_ROOT / "drugs/trastuzumab.json").read_text())
    next(item for item in raw["experiment"]["evidence"] if item["evidence_id"] == "kon")["context"]["form"] = "Fab fragment"
    file = tmp_path / "invalid.json"
    file.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match="intact trastuzumab"):
        load_curated_profile(file)


def test_cache_mismatch_cannot_relabel_a_reviewed_source(tmp_path):
    profile = load_curated_profile()
    check = profile.literature_checks[0]
    cached = json.loads((DATA_ROOT / f"research/cache/{check.pmid}.json").read_text())
    cached["doi"] = "10.0000/unrelated"
    (tmp_path / f"{check.pmid}.json").write_text(json.dumps(cached))
    with pytest.raises(ValueError, match="identifiers"):
        load_cached_record(check, tmp_path)


def test_connector_failure_is_explicit_and_cached_profile_remains_available():
    def fail(_url):
        raise URLError("offline")
    research = EuropePMCClient(fail)
    api = TestClient(create_app(Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None), research))
    search = api.get("/api/research/search", params={"q": "trastuzumab"})
    assert search.status_code == 503
    assert "unavailable" in search.json()["detail"]
    cached = api.get("/api/research/evidence/trastuzumab")
    assert cached.status_code == 200
    assert cached.json()["retrieval_status"] == "cached"
    assert [item["pmid"] for item in cached.json()["literature"]] == ["30467591", "27043557"]
