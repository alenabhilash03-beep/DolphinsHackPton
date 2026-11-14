"""Regenerate the reviewed saved demo with the deterministic solver; no network or AI."""
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from app.agent.workflow import _interpret
from app.research.demo import DemoSnapshot
from app.research.registry import load_curated_profile
from app.schemas.contracts import SimulationRequest
from app.simulation.service import run_simulation

def main():
    experiment = load_curated_profile().experiment
    result = run_simulation(SimulationRequest(experiment=experiment, client_revision=0, output_points=600))
    snapshot = DemoSnapshot(generated_at=datetime.now(timezone.utc), experiment=experiment, result=result,
                            interpretation=_interpret(result, ["extend_washout_window", "measure_target_site_exposure", "measure_37c_kinetics", "measure_variant_pk"]))
    payload = snapshot.model_dump_json(indent=2) + "\n"
    for path in (ROOT / "data/demo/trastuzumab-demo.json", ROOT / "apps/web/public/demo/trastuzumab-demo.json"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload)
    print(f"Saved reviewed demo prepared: {result.result_id}; no live research performed")

if __name__ == "__main__":
    main()
