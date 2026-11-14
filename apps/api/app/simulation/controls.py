"""Server-authoritative control edits with explicit, unreviewed user provenance."""

from datetime import datetime, timezone
from math import floor
from uuid import uuid4

from app.schemas.contracts import (
    Assumption, ControlAdjustment, ExperimentConfig, InfusionEvent, ParameterEvidence,
)
from app.simulation.binding import resolve_binding_parameters
from app.simulation.pk import resolve_pk_parameters
from app.simulation.registry import MAX_EVENTS_PER_SCENARIO, MAX_HORIZON_H

UNITS = {
    "pk.volume_L": "L",
    "pk.clearance_L_h": "L/hour",
    "pk.elimination_half_life_h": "hour",
    "binding.association_nM_inv_h_inv": "nM^-1 hour^-1",
    "binding.dissociation_h_inv": "hour^-1",
    "binding.affinity_nM": "nM",
    "exposure_factor": "1",
    "dose_mg": "mg",
    "dosing_interval_h": "hour",
}


def _evidence_id() -> str:
    return f"edit_{uuid4().hex}"


def _append_user_evidence(
    experiment: ExperimentConfig,
    scenario_id: str,
    field: str,
    value: float,
    revision: int,
    parent_ids: list[str],
) -> str:
    key = _evidence_id()
    unit = UNITS[field]
    experiment.evidence.append(ParameterEvidence(
        evidence_id=key,
        parameter=field,
        value=value,
        unit=unit,
        original_value=value,
        original_unit=unit,
        normalization="Entered in the canonical model unit; no unit conversion",
        provenance="user_supplied",
        estimate_type="design_input",
        review_status="candidate",
        applicability="conditional_transfer",
        parent_ids=parent_ids,
        rationale=f"User adjusted {field} in scenario {scenario_id}; this is an unreviewed hypothetical input.",
        context={"scenario_id": scenario_id, "client_revision": str(revision)},
        entered_at=datetime.now(timezone.utc),
    ))
    return key


def _append_derived_evidence(
    experiment: ExperimentConfig,
    field: str,
    value: float,
    formula: str,
    parent_ids: list[str],
) -> str:
    key = _evidence_id()
    unit = UNITS[field]
    experiment.evidence.append(ParameterEvidence(
        evidence_id=key,
        parameter=field,
        value=value,
        unit=unit,
        original_value=value,
        original_unit=unit,
        normalization=formula,
        provenance="calculated",
        estimate_type="derivation",
        review_status="candidate",
        applicability="conditional_transfer",
        parent_ids=parent_ids,
        formula=formula,
        context={"calculation": "deterministic linked-control update"},
    ))
    return key


def _set_custom_scope(experiment: ExperimentConfig, description: str, scenario_id: str | None) -> None:
    if experiment.mode != "research_derived":
        experiment.mode = "custom"
    experiment.support.status = "conditional"
    if "User-edited mathematical experiment; values are unreviewed." not in experiment.support.reasons:
        experiment.support.reasons.append("User-edited mathematical experiment; values are unreviewed.")
    assumption_id = _evidence_id()
    experiment.assumptions.append(Assumption(assumption_id=assumption_id, description=description))
    for scenario in experiment.scenarios:
        if scenario_id is None or scenario.scenario_id == scenario_id:
            scenario.assumption_ids.append(assumption_id)
    if scenario_id is not None:
        scenario = next(s for s in experiment.scenarios if s.scenario_id == scenario_id)
        scenario.intervention = "custom"
        if not scenario.label.startswith("Custom: "):
            scenario.label = f"Custom: {scenario.label}"


def adjust_experiment(adjustment: ControlAdjustment, *, preparation_store=None) -> ExperimentConfig:
    """Return a new validated configuration; never mutate the caller's baseline."""
    if not isinstance(adjustment, ControlAdjustment):
        raise TypeError("A validated ControlAdjustment is required")
    store = None
    if adjustment.experiment.mode == "research_derived":
        from app.research.preparation import default_preparation_store
        store = preparation_store or default_preparation_store()
        store.require_configuration(adjustment.experiment)
    def finish(experiment):
        result = ExperimentConfig.model_validate(experiment.model_dump(mode="python"))
        if store is not None:
            from app.simulation.registry import validate_model_scope
            validate_model_scope(result)
            store.register_control_configuration(adjustment.experiment, result)
        return result
    experiment = adjustment.experiment.model_copy(deep=True)
    field = adjustment.field
    value = adjustment.value
    if adjustment.scenario_id is None:
        if field == "duration_h":
            assert value is not None
            if value > MAX_HORIZON_H:
                raise ValueError(f"Duration exceeds the {MAX_HORIZON_H:g}-hour MVP limit")
            if any(event.start_h > value for scenario in experiment.scenarios for event in scenario.administration):
                raise ValueError("New duration ends before a scheduled dose; shorten the schedule first")
            experiment.duration_h = value
        elif field == "occupancy_threshold":
            assert value is not None
            experiment.occupancy_threshold = value
        else:
            raise ValueError("Unknown global control")
        _set_custom_scope(experiment, f"User set {field} to {value}; this changes the common comparison window or analytical threshold.", None)
        return finish(experiment)

    scenario_index = next((i for i, s in enumerate(experiment.scenarios) if s.scenario_id == adjustment.scenario_id), None)
    if scenario_index is None:
        raise ValueError("Unknown scenario_id")
    if scenario_index == 0 or experiment.scenarios[scenario_index].intervention == "baseline":
        raise ValueError("The baseline is protected; edit an alternative or reset the experiment")
    scenario = experiment.scenarios[scenario_index]
    old_refs = dict(scenario.parameter_evidence)

    if field.startswith("pk."):
        assert value is not None
        edited = field.split(".")[1]
        scenario.pk = resolve_pk_parameters(scenario.pk, edited, value)
        user_key = _append_user_evidence(experiment, scenario.scenario_id, field, value, adjustment.client_revision, [old_refs[field]])
        scenario.parameter_evidence[field] = user_key
        derived = "pk.clearance_L_h" if edited == "elimination_half_life_h" else "pk.elimination_half_life_h"
        if edited == "elimination_half_life_h":
            formula = "clearance_L_h = ln(2) * volume_L / elimination_half_life_h"
            parents = [scenario.parameter_evidence["pk.volume_L"], user_key]
        else:
            formula = "elimination_half_life_h = ln(2) * volume_L / clearance_L_h"
            parents = [scenario.parameter_evidence["pk.volume_L"], scenario.parameter_evidence["pk.clearance_L_h"]]
        derived_value = getattr(scenario.pk, derived.split(".")[1])
        scenario.parameter_evidence[derived] = _append_derived_evidence(experiment, derived, derived_value, formula, parents)
    elif field.startswith("binding."):
        assert value is not None
        edited = field.split(".")[1]
        scenario.binding = resolve_binding_parameters(scenario.binding, edited, value)
        user_key = _append_user_evidence(experiment, scenario.scenario_id, field, value, adjustment.client_revision, [old_refs[field]])
        scenario.parameter_evidence[field] = user_key
        derived = "binding.dissociation_h_inv" if edited == "affinity_nM" else "binding.affinity_nM"
        if edited == "affinity_nM":
            formula = "dissociation_h_inv = association_nM_inv_h_inv * affinity_nM"
            parents = [scenario.parameter_evidence["binding.association_nM_inv_h_inv"], user_key]
        else:
            formula = "affinity_nM = dissociation_h_inv / association_nM_inv_h_inv"
            parents = [scenario.parameter_evidence["binding.dissociation_h_inv"], scenario.parameter_evidence["binding.association_nM_inv_h_inv"]]
        derived_value = getattr(scenario.binding, derived.split(".")[1])
        scenario.parameter_evidence[derived] = _append_derived_evidence(experiment, derived, derived_value, formula, parents)
    elif field == "exposure_factor":
        assert value is not None
        scenario.exposure_factor = value
        scenario.parameter_evidence[field] = _append_user_evidence(experiment, scenario.scenario_id, field, value, adjustment.client_revision, [old_refs[field]])
    elif field == "dose_mg":
        assert value is not None
        if any(event.kind != "infusion" for event in scenario.administration):
            raise ValueError("Dose control currently supports finite infusion schedules only")
        old_amount_refs = [old_refs.get(f"administration.{i}.amount_mg") for i in range(len(scenario.administration))]
        scenario.administration = [event.model_copy(update={"amount_mg": value}) for event in scenario.administration]
        for i, previous in enumerate(old_amount_refs):
            path = f"administration.{i}.amount_mg"
            scenario.parameter_evidence[path] = _append_user_evidence(
                experiment, scenario.scenario_id, "dose_mg", value, adjustment.client_revision,
                [previous] if previous else [],
            )
    elif field == "dosing_interval_h":
        if any(event.kind != "infusion" for event in scenario.administration):
            raise ValueError("Dosing interval currently supports finite infusion schedules only")
        first = scenario.administration[0]
        assert isinstance(first, InfusionEvent)
        if value is None:
            scenario.administration = [first]
            scenario.dosing_interval_h = None
            scenario.parameter_evidence.pop("dosing_interval_h", None)
            for path in list(scenario.parameter_evidence):
                if path.startswith("administration.") and path != "administration.0.amount_mg":
                    del scenario.parameter_evidence[path]
        else:
            maintenance = scenario.administration[1] if len(scenario.administration) > 1 else first
            assert isinstance(maintenance, InfusionEvent)
            if value < max(first.duration_h, maintenance.duration_h):
                raise ValueError("Dosing interval must be at least each infusion duration")
            count = floor((experiment.duration_h - first.start_h) / value) + 1
            if count < 2:
                raise ValueError("No repeat dose falls inside the horizon; use a single-dose schedule")
            if count > MAX_EVENTS_PER_SCENARIO:
                raise ValueError(f"Schedule exceeds the {MAX_EVENTS_PER_SCENARIO}-event MVP limit")
            previous_amount_refs = [old_refs.get(f"administration.{i}.amount_mg") for i in range(len(scenario.administration))]
            scenario.administration = [first] + [
                maintenance.model_copy(update={"start_h": first.start_h + i * value})
                for i in range(1, count)
            ]
            scenario.dosing_interval_h = value
            for path in list(scenario.parameter_evidence):
                if path.startswith("administration."):
                    del scenario.parameter_evidence[path]
            for i in range(count):
                prior = previous_amount_refs[min(i, len(previous_amount_refs) - 1)]
                if prior:
                    scenario.parameter_evidence[f"administration.{i}.amount_mg"] = prior
            previous_interval = old_refs.get("dosing_interval_h")
            scenario.parameter_evidence["dosing_interval_h"] = _append_user_evidence(
                experiment, scenario.scenario_id, field, value, adjustment.client_revision,
                [previous_interval] if previous_interval else [],
            )
    else:
        raise ValueError("Unsupported scenario control")

    _set_custom_scope(experiment, f"User changed {field} for scenario {scenario.scenario_id} to {value}; baseline was preserved.", scenario.scenario_id)
    return finish(experiment)
