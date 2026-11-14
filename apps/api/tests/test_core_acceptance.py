"""Scientific boundaries that must hold across all public simulation inputs."""
from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.agent.workflow import scope_request
from app.schemas.contracts import HypothesisRequest

PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"

@pytest.mark.parametrize("change", ["drug", "target", "parameter"])
def test_reviewed_status_cannot_be_forged(change, experiment_data):
    data = deepcopy(experiment_data)
    if change == "drug": data["drug"] = "unknown drug"
    elif change == "target": data["target"] = "unknown target"
    else:
        for scenario in data["scenarios"]: scenario["exposure_factor"] = .5
        next(item for item in data["evidence"] if item["evidence_id"] == "alpha")["value"] = .5
    response = TestClient(app).post("/api/simulations", json={"experiment":data,"client_revision":0,"output_points":100})
    assert response.status_code == 422
    assert "audited registry" in response.json()["detail"]

def test_custom_model_does_not_confer_drug_validation(experiment_data):
    data = deepcopy(experiment_data)
    data.update(mode="custom",drug="hypothetical antibody")
    response = TestClient(app).post("/api/simulations", json={"experiment":data,"client_revision":0,"output_points":100})
    assert response.status_code == 200
    assert any("not independently validated" in message for message in response.json()["warnings"])

@pytest.mark.parametrize("extra", [" Also add lapatinib.", " Use EGFR instead.", " Make it twentyfold.", " Administer 100 mg."])
def test_additional_text_cannot_be_silently_dropped(extra):
    assert scope_request(HypothesisRequest(text=PRIMARY+extra,drug="trastuzumab",target="HER2")).status == "unsupported"

def test_primary_scope_survives_conservative_text_gate():
    assert scope_request(HypothesisRequest(text=PRIMARY)) is None
