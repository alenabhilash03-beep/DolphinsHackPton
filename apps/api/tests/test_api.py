import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def client():
    return TestClient(create_app(Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None)))


def test_health_is_truthful_without_credentials():
    response = client().get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["simulation_available"] is True
    assert body["stage"] == "research"
    assert body["research_available"] is True
    assert body["ai_credentials_configured"] is False


def test_server_validates_example(experiment_data):
    response = client().post("/api/contracts/experiments/validate", json=experiment_data)
    assert response.status_code == 200
    assert response.json()["scenario_count"] == 3


def test_server_rejects_inconsistent_affinity(experiment_data):
    experiment_data["scenarios"][0]["binding"]["affinity_nM"] = 99
    assert client().post("/api/contracts/experiments/validate", json=experiment_data).status_code == 422


def test_local_browser_origins_only():
    allowed = client().options("/api/health", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    denied = client().options("/api/health", headers={"Origin": "https://unrelated.example", "Access-Control-Request-Method": "GET"})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in denied.headers


def test_openapi_contains_simulation_route_and_future_contracts():
    document = client().get("/openapi.json").json()
    assert "SimulationResult" in document["components"]["schemas"]
    assert "/api/simulations" in document["paths"]
    assert "SimulationDiagnostics" in document["components"]["schemas"]
