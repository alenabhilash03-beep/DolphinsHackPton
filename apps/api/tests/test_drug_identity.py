"""Exact identities, salt/brand ambiguity, cache provenance and fail-closed lookup boundaries."""
from hashlib import sha256
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
import pytest
from app.research.chembl import ChEMBLIdentityClient, IdentityLookup, IdentityMismatch
from app.research.drug_identity import DrugAssessmentService
from app.schemas.drug_support import DrugAssessmentRequest

ROOT = Path(__file__).resolve().parents[3]
SEEDS = ROOT / "data/research/identity-cache"

def saved(name):
    return IdentityLookup.model_validate_json((SEEDS / (sha256(name.lower().encode()).hexdigest() + ".json")).read_text())

def rows(name):
    return [{"molecule_chembl_id":item.identifiers["chembl_id"],"pref_name":item.canonical_name,"molecule_type":item.molecule_type,
             "molecule_hierarchy":{"parent_chembl_id":item.parent_identifier},
             "molecule_synonyms":[{"molecule_synonym":alias} for alias in item.aliases]} for item in saved(name).candidates]

def client(tmp_path, drug_rows=None):
    def fetch(url):
        query = parse_qs(urlparse(url).query)
        if "pref_name__iexact" in query:
            name = query["pref_name__iexact"][0]
            found = rows("imatinib") if name == "imatinib" else []
        else:
            name = query["molecule_synonyms__molecule_synonym__iexact"][0]
            found = rows("gleevec") if name == "gleevec" else []
        found = drug_rows if drug_rows is not None else found
        return json.dumps({"molecules":found,"page_meta":{"total_count":len(found)}}).encode()
    return ChEMBLIdentityClient(fetch, cache_dir=tmp_path/"runtime", seed_dir=tmp_path/"seeds")

def test_exact_name_preserves_identity_without_enabling_simulation(tmp_path):
    result = DrugAssessmentService(client(tmp_path)).assess(DrugAssessmentRequest(drug_name="Imatinib",target="Abl"))
    assert result.identity_status == "candidate_identity"
    assert result.resolved_identity.identifiers == {"chembl_id":"CHEMBL941"}
    assert result.support.status == "needs_parameters" and not result.model_eligible and not result.runnable
    assert result.profile_id is None and result.capabilities == []

def test_brand_alias_does_not_silently_collapse_salt_and_parent(tmp_path):
    service = DrugAssessmentService(client(tmp_path))
    ambiguous = service.assess(DrugAssessmentRequest(drug_name="Gleevec"))
    assert ambiguous.identity_status == "ambiguous" and ambiguous.resolved_identity is None
    assert {item.identifiers["chembl_id"] for item in ambiguous.candidates} == {"CHEMBL941","CHEMBL1642"}
    specific = service.assess(DrugAssessmentRequest(drug_name="Gleevec",molecular_form="imatinib mesylate"))
    assert specific.resolved_identity.identifiers["chembl_id"] == "CHEMBL1642"
    assert not specific.model_eligible
    conflict = service.assess(DrugAssessmentRequest(drug_name="imatinib",molecular_form="imatinib mesylate"))
    assert conflict.identity_status == "ambiguous" and conflict.resolved_identity is None

def test_unknown_name_does_not_invent_drug_or_profile(tmp_path):
    result = DrugAssessmentService(client(tmp_path)).assess(DrugAssessmentRequest(drug_name="unregistered-example"))
    assert result.identity_status == "not_found" and result.candidates == []
    assert result.support.status == "needs_parameters" and not result.model_eligible

def test_wrong_provider_identity_is_rejected_even_with_cache(tmp_path):
    seeded = client(tmp_path)
    seeded.lookup("imatinib")
    malicious = rows("imatinib")
    malicious[0]["pref_name"] = "UNRELATED COMPOUND"
    with pytest.raises(IdentityMismatch):
        client(tmp_path, malicious).lookup("imatinib")

def test_outage_cache_retains_time_and_candidate_status(tmp_path):
    def offline(url): raise URLError("offline")
    cached = ChEMBLIdentityClient(offline, cache_dir=tmp_path, seed_dir=SEEDS)
    result = cached.lookup("imatinib")
    assert result.retrieval_status == "cached_degraded" and result.retrieved_at == saved("imatinib").retrieved_at
    assessment = DrugAssessmentService(cached).assess(DrugAssessmentRequest(drug_name="imatinib"))
    assert not assessment.model_eligible and assessment.profile_id is None
    missing = DrugAssessmentService(cached).assess(DrugAssessmentRequest(drug_name="another unknown identity"))
    assert missing.identity_status == "unavailable" and missing.resolved_identity is None

def test_corrupt_cache_does_not_fall_through_to_other_seed(tmp_path):
    path = tmp_path / (sha256(b"imatinib").hexdigest() + ".json")
    data = saved("imatinib").model_dump(mode="json")
    data["candidates"][0]["provenance"] = "reviewed_registry"
    path.write_text(json.dumps(data))
    def offline(url): raise URLError("offline")
    with pytest.raises(IdentityMismatch):
        ChEMBLIdentityClient(offline, cache_dir=tmp_path, seed_dir=SEEDS).lookup("imatinib")

def test_unknown_identifier_404_is_not_mislabeled_as_provider_outage(tmp_path):
    def missing(url): raise HTTPError(url,404,"not found",{},None)
    result = ChEMBLIdentityClient(missing, cache_dir=tmp_path, seed_dir=tmp_path).lookup("CHEMBL999999999")
    assert result.total_matches == 0 and result.complete and result.retrieval_status == "live"

def test_truncated_identity_page_cannot_resolve_by_first_candidate(tmp_path):
    records = rows("gleevec")
    def fetch(url):
        field = parse_qs(urlparse(url).query)
        data = {"molecules":[],"page_meta":{"total_count":0}} if "pref_name__iexact" in field else {"molecules":records,"page_meta":{"total_count":10}}
        return json.dumps(data).encode()
    service = DrugAssessmentService(ChEMBLIdentityClient(fetch,cache_dir=tmp_path,seed_dir=tmp_path))
    result = service.assess(DrugAssessmentRequest(drug_name="gleevec",molecular_form="imatinib"))
    assert result.identity_status == "ambiguous" and result.resolved_identity is None
