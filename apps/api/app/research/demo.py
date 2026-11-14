"""Versioned saved demo, loaded without an AI or literature request."""
from datetime import datetime
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, model_validator
from app.schemas.contracts import ExperimentConfig, Interpretation, SimulationResult
from app.simulation.registry import MODEL_VERSION, validate_model_scope

DEMO_PATH = Path(__file__).resolve().parents[4] / "data/demo/trastuzumab-demo.json"

class DemoSnapshot(BaseModel):
    origin: Literal["saved_reviewed_demo"] = "saved_reviewed_demo"
    generated_at: datetime
    research_status: Literal["saved_no_live_agent"] = "saved_no_live_agent"
    retrieval_status: Literal["cached_reviewed"] = "cached_reviewed"
    experiment: ExperimentConfig
    result: SimulationResult
    interpretation: Interpretation

    @model_validator(mode="after")
    def matching_result(self):
        validate_model_scope(self.experiment)
        if self.result.configuration != self.experiment or self.result.model_version != MODEL_VERSION:
            raise ValueError("Saved demo does not match the current reviewed model")
        if self.interpretation.result_id != self.result.result_id or self.interpretation.experiment_id != self.experiment.experiment_id:
            raise ValueError("Saved interpretation does not match the numerical result")
        return self

def load_demo() -> DemoSnapshot:
    return DemoSnapshot.model_validate_json(DEMO_PATH.read_text())
