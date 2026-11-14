"""Assessment remains separate from experiment configuration, AI and numerical execution."""
import json
from fastapi.testclient import TestClient
import pytest
from app.agent.assessment_tool import build_assessment_tool
from app.config import Settings
from app.main import create_app
from app.research.drug_identity import DrugAssessmentService, load_profile_catalog
from app.schemas.drug_support import DrugAssessmentRequest, DrugAssessmentResponse

class NoNetwork:
    def lookup(self, name): raise AssertionError("Registered identities must resolve without network")

def setup():
    service = DrugAssessmentService(NoNetwork())
    api = TestClient(create_app(Settings(_env_file=None,nvidia_api_key=None,langsmith_api_key=None),assessment_service=service))
    return api, service

def test_registered_aliases_have_same_reviewed_profile_and_explicit_defaults(monkeypatch):
    def forbidden(*args,**kwargs): raise AssertionError("Assessment must never run agent or solver")
    monkeypatch.setattr("app.agent.workflow.run_research",forbidden)
    monkeypatch.setattr("app.simulation.service.run_simulation",forbidden)
    api, _ = setup()
    results = [api.post("/api/research/assess",json={"drug_name":name}).json() for name in ("trastuzumab"," HERCEPTIN ","CHEMBL1201585")]
    assert {item["profile_id"] for item in results} == {"trastuzumab-her2-intact-v1"}
    assert all(item["model_eligible"] and not item["runnable"] and item["configuration_required"] for item in results)
    assert results[0]["support"]["status"] == "conditional"
    assert results[0]["defaults_applied"]["route"] == "iv_infusion"
    assert results[0]["capabilities"][0]["maximum_duration_h"] == 8760

@pytest.mark.parametrize("fields", [{"target":"EGFR"},{"molecular_form":"Fab"},{"route":"oral"},{"route":"hypothetical_iv_bolus"},{"endpoint":"clinical efficacy"}])
def test_reviewed_identity_does_not_approve_incompatible_scope(fields):
    api, _ = setup()
    body = api.post("/api/research/assess",json={"drug_name":"trastuzumab",**fields}).json()
    assert body["identity_status"] == "reviewed_identity" and body["support"]["status"] == "unsupported"
    assert not body["model_eligible"] and not body["runnable"]

def test_iv_ambiguity_and_original_hypothesis_are_preserved():
    api, _ = setup()
    text = "  Double the dose\nwithout dropping this instruction.  "
    body = api.post("/api/research/assess",json={"drug_name":"trastuzumab","route":"IV","original_hypothesis":text}).json()
    assert body["support"]["status"] == "needs_parameters" and body["ambiguities"]
    assert body["request"]["original_hypothesis"] == text and not body["hypothesis_parsed"]
    assert not body["runnable"]

def test_langchain_tool_matches_typed_api_and_has_real_input_schema():
    api, service = setup()
    request = {"drug_name":"Herceptin","target":"HER2","route":"IV infusion"}
    tool = build_assessment_tool(service)
    assert tool.name == "assess_drug_model"
    result = tool.invoke({"request":request})
    assert result == api.post("/api/research/assess",json=request).json()
    assert "DrugAssessmentRequest" in tool.args_schema.model_json_schema()["$defs"]

@pytest.mark.parametrize("payload", [{"drug_name":" "},{"drug_name":"x"*201},{"drug_name":"\ufb03"*100},{"drug_name":"trastuzumab","made_up_parameter":2}])
def test_invalid_requests_are_rejected_before_lookup(payload):
    api, _ = setup()
    assert api.post("/api/research/assess",json=payload).status_code == 422

def test_catalog_cannot_point_at_unmatched_profile(tmp_path):
    from app.config import ROOT
    data = json.loads((ROOT / "data/drugs/catalog.json").read_text())
    data["profiles"][0]["profile_id"] = "unreviewed-profile"
    path = tmp_path / "catalog.json"; path.write_text(json.dumps(data))
    with pytest.raises(ValueError,match="reviewed profile"):
        load_profile_catalog(path)

def test_candidate_cannot_claim_reviewed_model_eligibility():
    _, service = setup()
    data = service.assess(DrugAssessmentRequest(drug_name="trastuzumab")).model_dump(mode="json")
    data["resolved_identity"]["provenance"] = "database_candidate"
    with pytest.raises(ValueError,match="registered profile"):
        DrugAssessmentResponse.model_validate(data)

def test_api_candidate_and_source_outage_do_not_expose_runnable_configuration(tmp_path):
    from urllib.error import URLError
    from app.config import ROOT
    from app.research.chembl import ChEMBLIdentityClient
    def offline(url): raise URLError("offline")
    service = DrugAssessmentService(ChEMBLIdentityClient(offline,cache_dir=tmp_path,seed_dir=ROOT/"data/research/identity-cache"))
    api = TestClient(create_app(Settings(_env_file=None),assessment_service=service))
    for name, identity_status in (("imatinib","candidate_identity"),("unknown example","unavailable")):
        response = api.post("/api/research/assess",json={"drug_name":name})
        assert response.status_code == 200
        body = response.json()
        assert body["identity_status"] == identity_status and not body["runnable"] and not body["model_eligible"]
        assert "experiment" not in body and "result" not in body and body["profile_id"] is None
