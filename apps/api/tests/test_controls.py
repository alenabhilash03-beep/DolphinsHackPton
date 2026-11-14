"""Linked live controls preserve baseline and label user evidence honestly."""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.schemas.contracts import ControlAdjustment, ExperimentConfig
from app.simulation.controls import adjust_experiment


def _edit(experiment, field, value, scenario_id="half_life_x3", revision=1):
    return adjust_experiment(ControlAdjustment(
        experiment=experiment, scenario_id=scenario_id, field=field, value=value,
        client_revision=revision, output_points=100,
    ))


def test_half_life_edit_derives_clearance_and_keeps_baseline(experiment_data):
    original = ExperimentConfig.model_validate(experiment_data)
    edited = _edit(original, "pk.elimination_half_life_h", original.scenarios[1].pk.elimination_half_life_h * 2)
    assert edited.scenarios[0] == original.scenarios[0]
    assert original.mode == "reviewed_preset"
    assert edited.mode == "custom"
    alternative = edited.scenarios[1]
    assert alternative.intervention == "custom"
    assert alternative.pk.clearance_L_h == pytest.approx(original.scenarios[1].pk.clearance_L_h / 2)
    assert alternative.pk.volume_L == original.scenarios[1].pk.volume_L
    assert len(edited.evidence) == len(original.evidence) + 2
    user = next(e for e in edited.evidence if e.evidence_id == alternative.parameter_evidence["pk.elimination_half_life_h"])
    derived = next(e for e in edited.evidence if e.evidence_id == alternative.parameter_evidence["pk.clearance_L_h"])
    assert user.provenance == "user_supplied" and user.review_status == "candidate" and user.entered_at
    assert user.parent_ids == [original.scenarios[1].parameter_evidence["pk.elimination_half_life_h"]]
    assert derived.provenance == "calculated" and derived.review_status == "candidate"
    assert user.evidence_id in derived.parent_ids
    assert ExperimentConfig.model_validate(edited.model_dump(mode="json")) == edited


@pytest.mark.parametrize("field,new_value,dependent,expected", [
    ("pk.clearance_L_h", .01, "pk.elimination_half_life_h", 2.62 * .6931471805599453 / .01),
    ("pk.volume_L", 5.24, "pk.elimination_half_life_h", .6931471805599453 * 5.24 / (.127 / 24 / 3)),
    ("binding.affinity_nM", .01, "binding.dissociation_h_inv", 2.2428 * .01),
    ("binding.association_nM_inv_h_inv", 4.0, "binding.affinity_nM", .29376 / 4),
    ("binding.dissociation_h_inv", .1, "binding.affinity_nM", .1 / 2.2428),
])
def test_linked_controls(field, new_value, dependent, expected, experiment_data):
    edited = _edit(ExperimentConfig.model_validate(experiment_data), field, new_value)
    scenario = edited.scenarios[1]
    group, name = dependent.split(".")
    assert getattr(getattr(scenario, group), name) == pytest.approx(expected)
    evidence = next(e for e in edited.evidence if e.evidence_id == scenario.parameter_evidence[dependent])
    assert evidence.provenance == "calculated" and evidence.review_status == "candidate"


def test_dose_and_interval_changes_are_explicit_and_resettable(experiment_data):
    original = ExperimentConfig.model_validate(experiment_data)
    dosed = _edit(original, "dose_mg", 600)
    assert dosed.scenarios[0] == original.scenarios[0]
    assert dosed.scenarios[1].administration[0].amount_mg == 600
    assert dosed.scenarios[1].parameter_evidence["administration.0.amount_mg"]
    repeated = _edit(dosed, "dosing_interval_h", 504, revision=2)
    assert repeated.scenarios[1].dosing_interval_h == 504
    assert len(repeated.scenarios[1].administration) == 9
    assert all(event.amount_mg == 600 for event in repeated.scenarios[1].administration)
    assert repeated.scenarios[1].administration[-1].start_h == 4032
    single = _edit(repeated, "dosing_interval_h", None, revision=3)
    assert single.scenarios[1].dosing_interval_h is None
    assert len(single.scenarios[1].administration) == 1
    assert single.scenarios[1].administration[0].amount_mg == 600
    assert all(not path.startswith("administration.1.") for path in single.scenarios[1].parameter_evidence)


def test_global_duration_and_threshold_apply_to_shared_comparison(experiment_data):
    original = ExperimentConfig.model_validate(experiment_data)
    shorter = _edit(original, "duration_h", 100, scenario_id=None)
    assert shorter.duration_h == 100
    assert [s.pk for s in shorter.scenarios] == [s.pk for s in original.scenarios]
    assert all(s.assumption_ids != base.assumption_ids for s, base in zip(shorter.scenarios, original.scenarios))
    lower = _edit(shorter, "occupancy_threshold", .8, scenario_id=None)
    assert lower.occupancy_threshold == .8


def test_invalid_controls_do_not_mutate_input(experiment_data):
    original = ExperimentConfig.model_validate(experiment_data)
    snapshot = deepcopy(original)
    with pytest.raises(ValueError, match="baseline is protected"):
        _edit(original, "dose_mg", 600, scenario_id="baseline")
    with pytest.raises(ValueError, match="Unknown scenario"):
        _edit(original, "dose_mg", 600, scenario_id="made-up")
    with pytest.raises(ValueError, match="No repeat dose"):
        _edit(original, "dosing_interval_h", 10000)
    with pytest.raises(ValueError, match="New duration ends before"):
        _edit(_edit(original, "dosing_interval_h", 504), "duration_h", 100, scenario_id=None)
    assert original == snapshot


def test_unreviewed_reported_value_still_cannot_enter_custom_run(experiment_data):
    edited = _edit(ExperimentConfig.model_validate(experiment_data), "exposure_factor", .5)
    raw = edited.model_dump(mode="json")
    by_id = {item["evidence_id"]: item for item in raw["evidence"]}
    by_id["kon"]["review_status"] = "candidate"
    with pytest.raises(ValidationError, match="Unreviewed source"):
        ExperimentConfig.model_validate(raw)


def test_adjust_route_returns_resolved_configuration_and_errors(experiment_data):
    client = TestClient(create_app(Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None)))
    payload = {"experiment": experiment_data, "scenario_id": "affinity_x10", "field": "binding.affinity_nM", "value": .01, "client_revision": 4, "output_points": 100}
    response = client.post("/api/simulations/adjust", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["client_revision"] == 4
    assert body["configuration"]["mode"] == "custom"
    assert body["configuration"]["scenarios"][0] == ExperimentConfig.model_validate(experiment_data).model_dump(mode="json")["scenarios"][0]
    assert body["configuration"]["scenarios"][2]["binding"]["dissociation_h_inv"] == pytest.approx(2.2428 * .01)
    payload["scenario_id"] = "baseline"
    denied = client.post("/api/simulations/adjust", json=payload)
    assert denied.status_code == 422 and "baseline is protected" in denied.json()["detail"]
