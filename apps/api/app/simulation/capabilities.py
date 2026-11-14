"""Preparation requirements for implemented equations, independent of drug-name presets."""
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract, Identifier, MODEL_ID
from app.simulation.registry import MODELS, MAX_HORIZON_H, MAX_EVENTS_PER_SCENARIO


class ModelPreparationRequirements(Contract):
    model_id: Identifier
    model_version: Identifier
    routes: list[str]
    endpoints: list[str]
    required_parameters: dict[str, str]
    required_experiment_inputs: list[str]
    relationships: list[str]
    limitations: list[str]
    maximum_duration_h: Annotated[float, Field(gt=0)]
    maximum_events_per_scenario: Annotated[int, Field(gt=0)]
    scientific_approval: Literal[False] = False


def get_preparation_requirements(model_id: str | None) -> ModelPreparationRequirements:
    if model_id != MODEL_ID:
        raise ValueError("No implemented preparation model for this identifier")
    definition = MODELS[model_id]
    return ModelPreparationRequirements(
        model_id=definition.model_id, model_version=definition.version,
        routes=["iv_infusion", "hypothetical_iv_bolus"], endpoints=["target_occupancy"],
        required_parameters={
            "pk.volume_L": "L", "pk.clearance_L_h": "L/hour", "pk.elimination_half_life_h": "hour",
            "binding.association_nM_inv_h_inv": "nM^-1 hour^-1", "binding.dissociation_h_inv": "hour^-1",
            "binding.affinity_nM": "nM", "molecular_weight_g_mol": "g/mol", "body_mass_kg": "kg", "exposure_factor": "1",
        },
        required_experiment_inputs=["administration: amount_mg, start_h, infusion duration_h when applicable",
            "duration_h", "initial_amount_nmol", "initial_occupancy", "occupancy_threshold"],
        relationships=["KD = koff / kon", "half_life = ln(2) * volume / clearance"],
        limitations=[*definition.limitations,
            "No automatic plasma-to-intracellular exposure transfer or ATP-competition correction.",
            "Equilibrium-only occupancy, oral absorption and downstream efficacy are not implemented.",
            "All selected parameter domains, linked relationships and administration schedules still require configuration validation."],
        maximum_duration_h=MAX_HORIZON_H, maximum_events_per_scenario=MAX_EVENTS_PER_SCENARIO,
    )
