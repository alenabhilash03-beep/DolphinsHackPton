"""Supported deterministic models and explicit MVP computational limits."""

from dataclasses import dataclass

from app.schemas.contracts import ExperimentConfig, MODEL_ID

MODEL_VERSION = "one_compartment_effective_binding_v1.0.0"
MAX_HORIZON_H = 8760.0
MAX_EVENTS_PER_SCENARIO = 64
MAX_RESULT_POINTS = 5000
MAX_RUNTIME_S = 8.0


class SimulationLimitError(ValueError):
    """A request exceeds the tested computational envelope or time budget."""


@dataclass(frozen=True)
class ModelDefinition:
    model_id: str
    version: str
    supported_event_kinds: tuple[str, ...]
    limitations: tuple[str, ...]


MODELS = {
    MODEL_ID: ModelDefinition(
        model_id=MODEL_ID,
        version=MODEL_VERSION,
        supported_event_kinds=("infusion", "hypothetical_bolus"),
        limitations=(
            "One-compartment linear PK is a conditional reduction, not a calibrated clinical concentration model.",
            "Target-site exposure is prescribed from central concentration; it is not a measured free tissue concentration.",
            "Binding uses fixed effective sites without depletion, turnover, transport, or avidity.",
        ),
    )
}


def validate_model_scope(experiment: ExperimentConfig) -> ModelDefinition:
    if experiment.duration_h > MAX_HORIZON_H:
        raise SimulationLimitError(f"Duration exceeds the {MAX_HORIZON_H:g}-hour MVP limit")
    model_ids = {scenario.model_id for scenario in experiment.scenarios}
    if len(model_ids) != 1 or not model_ids <= MODELS.keys():
        raise ValueError("Experiment requires one registered model for all scenarios")
    definition = MODELS[next(iter(model_ids))]
    for scenario in experiment.scenarios:
        if len(scenario.administration) > MAX_EVENTS_PER_SCENARIO:
            raise SimulationLimitError(f"A scenario exceeds the {MAX_EVENTS_PER_SCENARIO}-event MVP limit")
        if any(event.kind not in definition.supported_event_kinds for event in scenario.administration):
            raise ValueError("Administration kind is unsupported by this model")
        if experiment.mode != "custom" and any(event.kind == "hypothetical_bolus" for event in scenario.administration):
            raise ValueError("Hypothetical bolus requires custom mode")
    if experiment.mode == "reviewed_preset":
        # Schema consistency alone cannot confer scientific review on caller-supplied values.
        from app.research.registry import load_curated_profile
        reviewed = load_curated_profile().experiment
        excluded = {"experiment_id", "title"}
        if experiment.model_dump(exclude=excluded) != reviewed.model_dump(exclude=excluded):
            raise ValueError("Reviewed preset differs from the audited registry; use explicit custom mode for hypothetical changes")
    return definition
