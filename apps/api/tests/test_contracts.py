import json
from math import nan

import pytest
from pydantic import ValidationError

from app.schemas.contracts import ExperimentConfig, ExperimentPreparation, HypothesisRequest


def test_reviewed_example_round_trips(experiment_data):
    config = ExperimentConfig.model_validate(experiment_data)
    assert len(config.scenarios) == 3
    assert config.support.status == "conditional"
    assert ExperimentConfig.model_validate_json(config.model_dump_json()) == config


@pytest.mark.parametrize("path,value", [
    (("pk", "elimination_half_life_h"), 24),
    (("binding", "affinity_nM"), 50),
    (("pk", "volume_L"), -1),
    (("pk", "volume_L"), "2.62"),
    (("exposure_factor",), nan),
    (("initial_occupancy",), 1.1),
])
def test_invalid_scientific_configuration_rejected(experiment_data, path, value):
    target = experiment_data["scenarios"][0]
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        ExperimentConfig.model_validate(experiment_data)


@pytest.mark.parametrize("change", ["unknown_source", "candidate", "cycle", "wrong_unit", "unreviewed_parent"])
def test_evidence_cannot_bypass_review(experiment_data, change):
    by_id = {e["evidence_id"]: e for e in experiment_data["evidence"]}
    if change == "unknown_source":
        by_id["volume"]["source_ids"] = ["invented"]
    elif change == "candidate":
        by_id["kon"]["review_status"] = "candidate"
    elif change == "cycle":
        by_id["half"]["parent_ids"] = ["half_triple"]
    elif change == "wrong_unit":
        by_id["volume"]["unit"] = "mL"
    else:
        # Parent need not be directly assigned to a scenario to require review.
        parent = dict(by_id["alpha"], evidence_id="parent_only", review_status="candidate")
        experiment_data["evidence"].append(parent)
        by_id["half"]["parent_ids"].append("parent_only")
    with pytest.raises(ValidationError):
        ExperimentConfig.model_validate(experiment_data)


def test_assumed_parameters_cannot_be_upgraded_to_supported(experiment_data):
    experiment_data["support"]["status"] = "supported"
    with pytest.raises(ValidationError):
        ExperimentConfig.model_validate(experiment_data)


def test_unknown_drug_can_return_missing_parameters_without_configuration():
    outcome = ExperimentPreparation.model_validate({"support": {
        "status": "needs_parameters", "reasons": ["No reviewed drug-specific parameters"],
        "missing_parameters": ["binding kinetics"],
    }})
    assert outcome.experiment is None


def test_unsupported_scope_cannot_carry_runnable_configuration(experiment_data):
    with pytest.raises(ValidationError):
        ExperimentPreparation.model_validate({"support": {"status": "unsupported", "reasons": ["No suitable model"]}, "experiment": experiment_data})


def test_overlapping_infusions_rejected(experiment_data):
    event = experiment_data["scenarios"][0]["administration"][0]
    experiment_data["scenarios"][0]["administration"].append(dict(event, start_h=1))
    with pytest.raises(ValidationError):
        ExperimentConfig.model_validate(experiment_data)


def test_empty_hypothesis_rejected():
    with pytest.raises(ValidationError):
        HypothesisRequest(text="   ")
