from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.research.demo import DEMO_PATH, DemoSnapshot, load_demo
from app.schemas.contracts import SimulationRequest
from app.simulation.service import run_simulation

def test_saved_demo_matches_current_solver_and_public_asset():
    saved = load_demo()
    current = run_simulation(SimulationRequest(experiment=saved.experiment, client_revision=0, output_points=600))
    assert saved.result == current
    root = Path(__file__).resolve().parents[3]
    assert DEMO_PATH.read_bytes() == (root / "apps/web/public/demo/trastuzumab-demo.json").read_bytes()
    assert saved.research_status == "saved_no_live_agent" and saved.retrieval_status == "cached_reviewed"
    assert TestClient(app).get("/api/demo").json()["origin"] == "saved_reviewed_demo"

def test_saved_interpretation_cannot_point_to_a_different_result():
    data = load_demo().model_dump(mode="json")
    data["interpretation"]["result_id"] = "different-result"
    with pytest.raises(ValueError, match="does not match"):
        DemoSnapshot.model_validate(data)
