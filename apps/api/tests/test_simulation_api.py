"""Direct API acceptance and reproducibility checks for subphase 1C."""

import json
from pathlib import Path
from time import perf_counter

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas.contracts import SimulationRequest, SimulationResult
from app.simulation.registry import SimulationLimitError
from app.simulation.service import run_simulation

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module")
def api_client():
    return TestClient(create_app(Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None)))


def test_three_scenario_api_response_matches_checked_in_reference(api_client, experiment_data):
    payload = {"experiment": experiment_data, "client_revision": 7, "output_points": 100}
    response = api_client.post("/api/simulations", json=payload)
    assert response.status_code == 200, response.text
    result = SimulationResult.model_validate(response.json())
    reference = json.loads((ROOT / "data/examples/simulation-result.reference.json").read_text())
    assert result.result_id == reference["result_id"]
    assert result.configuration_hash == reference["configuration_hash"]
    assert result.model_version == reference["model_version"]
    assert result.solver_version == reference["solver_version"]
    assert result.client_revision == 7
    assert result.configuration.experiment_id == experiment_data["experiment_id"]
    assert [s.scenario_id for s in result.scenarios] == ["baseline", "half_life_x3", "affinity_x10"]
    assert result.time_h[0] == 0 and result.time_h[-1] == 4320
    assert result.diagnostics.event_boundaries_h == [0, 1.5, 4320]
    assert all(t in result.time_h for t in result.diagnostics.event_boundaries_h)
    assert result.diagnostics.output_point_count == len(result.time_h)
    assert len(result.time_h) <= 5000
    for actual, expected in zip(result.scenarios, reference["scenarios"]):
        assert len(actual.central_concentration_nM) == len(result.time_h)
        assert len(actual.target_site_concentration_nM) == len(result.time_h)
        assert len(actual.occupancy) == len(result.time_h)
        assert actual.metrics.concentration_auc_nM_h == pytest.approx(expected["metrics"]["concentration_auc_nM_h"], rel=1e-6)
        assert actual.metrics.occupancy_auc_h == pytest.approx(expected["metrics"]["occupancy_auc_h"], rel=1e-6)
        assert actual.metrics.endpoint_occupancy == pytest.approx(expected["metrics"]["endpoint_occupancy"], abs=2e-6)
        assert actual.metrics.threshold.status == expected["metrics"]["threshold"]["status"]
    assert result.scenarios[0].metrics.threshold.status == "crossed_within_window"
    assert all(s.metrics.threshold.status == "still_above_at_horizon" for s in result.scenarios[1:])


def test_hashes_and_metrics_are_independent_of_client_revision_and_plot_density(experiment_data):
    base = run_simulation(SimulationRequest(experiment=experiment_data, client_revision=1, output_points=100))
    revised = run_simulation(SimulationRequest(experiment=experiment_data, client_revision=99, output_points=100))
    dense = run_simulation(SimulationRequest(experiment=experiment_data, client_revision=1, output_points=5000))
    assert base.result_id == revised.result_id
    assert base.configuration_hash == revised.configuration_hash == dense.configuration_hash
    assert base.time_h == revised.time_h
    assert base.scenarios == revised.scenarios
    assert dense.result_id != base.result_id
    assert len(dense.time_h) <= 5000
    assert [s.metrics for s in dense.scenarios] == [s.metrics for s in base.scenarios]


def test_invalid_and_out_of_scope_requests_return_422(api_client, experiment_data):
    payload = {"experiment": experiment_data, "client_revision": 1, "output_points": 100}
    payload["experiment"]["duration_h"] = 8761
    response = api_client.post("/api/simulations", json=payload)
    assert response.status_code == 422 and "MVP limit" in response.json()["detail"]
    payload["experiment"]["duration_h"] = 4320
    payload["output_points"] = 5001
    assert api_client.post("/api/simulations", json=payload).status_code == 422
    payload["output_points"] = 100
    payload["experiment"]["scenarios"][0]["administration"] = [
        {"kind": "hypothetical_bolus", "start_h": 0, "amount_mg": 528}
    ]
    response = api_client.post("/api/simulations", json=payload)
    assert response.status_code == 422 and "custom mode" in response.json()["detail"]


def test_event_budget_and_explicit_custom_bolus(api_client, experiment_data):
    payload = {"experiment": experiment_data, "client_revision": 1, "output_points": 100}
    payload["experiment"]["scenarios"][0]["administration"] = [
        {"kind": "infusion", "start_h": 2 * i, "duration_h": 1, "amount_mg": 1}
        for i in range(65)
    ]
    response = api_client.post("/api/simulations", json=payload)
    assert response.status_code == 422 and "64-event" in response.json()["detail"]
    payload["experiment"]["mode"] = "custom"
    payload["experiment"]["scenarios"][0]["administration"] = [
        {"kind": "hypothetical_bolus", "start_h": 10, "amount_mg": 528}
    ]
    response = api_client.post("/api/simulations", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()
    assert 10 in result["time_h"]
    assert any(9.998 < t < 10 for t in result["time_h"])
    assert any("Hypothetical IV bolus" in warning for warning in result["warnings"])


def test_runtime_budget_checked_before_work(experiment_data):
    request = SimulationRequest(experiment=experiment_data, client_revision=1)
    with pytest.raises(SimulationLimitError, match="runtime budget"):
        run_simulation(request, deadline=perf_counter() - 1)


def test_simulation_endpoint_is_documented(api_client):
    document = api_client.get("/openapi.json").json()
    operation = document["paths"]["/api/simulations"]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/SimulationRequest")
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/SimulationResult")
