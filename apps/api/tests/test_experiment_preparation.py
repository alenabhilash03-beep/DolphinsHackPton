"""Scientific provenance and preparation boundaries for the future agent tool workflow."""
import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.main import create_app
from app.schemas.experiment_preparation import (
    PreparationParameter, ResearchPreparation, validate_preparation_transition,
)
from app.simulation.capabilities import get_preparation_requirements
from app.schemas.contracts import MODEL_ID

EXAMPLES = Path(__file__).resolve().parents[3] / 'data/examples/preparation-contracts.json'


@pytest.fixture
def examples():
    return json.loads(EXAMPLES.read_text())


def test_all_preparation_examples_round_trip(examples):
    assert {item['state'] for item in examples.values()} >= {'ready_for_configuration', 'needs_inputs', 'unsupported', 'failed_validation'}
    for item in examples.values():
        preparation = ResearchPreparation.model_validate(item)
        assert ResearchPreparation.model_validate_json(preparation.model_dump_json()) == preparation
        assert preparation.runnable is False
        assert preparation.configuration_required is True
    assert examples['complete_unregistered']['profile_id'] is None


@pytest.mark.parametrize('mutation', ['missing_unit', 'no_passage', 'unknown_source', 'unavailable_source',
    'no_formula', 'unknown_parent', 'cycle', 'duplicate_evidence', 'no_assumption_rationale', 'naive_timestamp'])
def test_invalid_provenance_rejected(examples, mutation):
    item = examples['complete_unregistered']
    parameter = item['parameters'][0]
    if mutation == 'missing_unit':
        parameter.pop('unit')
    elif mutation == 'no_passage':
        parameter['passages'] = []
    elif mutation == 'unknown_source':
        parameter['passages'][0]['source_id'] = 'invented'
    elif mutation == 'unavailable_source':
        item['sources'][0]['retrieval_status'] = 'unavailable'
    elif mutation in {'no_formula', 'unknown_parent', 'cycle'}:
        parameter['provenance'] = 'calculated'
        parameter['parent_ids'] = ['unknown' if mutation == 'unknown_parent' else parameter['parameter_id']]
        parameter['formula'] = None if mutation == 'no_formula' else 'input * 2'
    elif mutation == 'duplicate_evidence':
        item['parameters'].append(copy.deepcopy(parameter))
    elif mutation == 'no_assumption_rationale':
        parameter['provenance'] = 'researcher_assumed'
        parameter['entered_at'] = '2026-11-14T12:00:00Z'
    else:
        item['sources'][0]['retrieved_at'] = '2026-11-14T12:00:00'
    with pytest.raises(ValidationError):
        ResearchPreparation.model_validate(item)


@pytest.mark.parametrize('mutation', ['missing_parameter', 'wrong_unit', 'wrong_identity', 'wrong_target',
    'incompatible', 'candidate_parent', 'unknown_selection', 'failed_check', 'missing_check',
    'duplicate_check', 'oral', 'efficacy', 'unknown_model', 'unresolved', 'missing_inputs',
    'no_assumptions', 'runnable', 'review_promotion', 'bad_hash', 'missing_base_hash'])
def test_ready_is_not_a_bypass(examples, mutation):
    item = examples['complete_unregistered']
    parameter = item['parameters'][0]
    if mutation == 'missing_parameter':
        item['selected_parameters'].pop(parameter['parameter'])
    elif mutation == 'wrong_unit':
        parameter['unit'] = 'mL'
    elif mutation == 'wrong_identity':
        parameter['context']['drug_identifier'] = 'another-drug'
    elif mutation == 'wrong_target':
        parameter['context']['target_identifier'] = 'another-target'
    elif mutation == 'incompatible':
        parameter['applicability'] = 'incompatible'
    elif mutation == 'candidate_parent':
        parent = copy.deepcopy(parameter)
        parent['parameter_id'] = 'unselected-parent'
        parent['applicability'] = 'candidate'
        item['parameters'].append(parent)
        parameter.update(provenance='calculated', parent_ids=['unselected-parent'], formula='input')
    elif mutation == 'unknown_selection':
        item['selected_parameters'][parameter['parameter']] = 'invented'
    elif mutation == 'failed_check':
        item['checks'][0]['outcome'] = 'fail'
    elif mutation == 'missing_check':
        item['checks'].pop()
    elif mutation == 'duplicate_check':
        item['checks'].append(copy.deepcopy(item['checks'][0]))
    elif mutation in {'oral', 'efficacy'}:
        item['request']['route' if mutation == 'oral' else 'endpoint'] = mutation
    elif mutation == 'unknown_model':
        item['model_id'] = 'llm-invented-model'
    elif mutation == 'unresolved':
        item['resolved_target_identifier'] = None
    elif mutation == 'missing_inputs':
        item['missing_inputs'] = examples['missing_binding']['missing_inputs']
    elif mutation == 'no_assumptions':
        item['assumptions'] = []
    elif mutation == 'runnable':
        item['runnable'] = True
    elif mutation == 'review_promotion':
        item['profile_id'] = 'invented-reviewed-profile'
    elif mutation == 'bad_hash':
        item['evidence_sha256'] = 'unversioned'
    else:
        item['base_experiment_id'] = 'previous-result'
    with pytest.raises(ValidationError):
        ResearchPreparation.model_validate(item)


def test_missing_inputs_are_actionable(examples):
    item = examples['missing_binding']
    assert ResearchPreparation.model_validate(item).missing_inputs[0].question
    item['missing_inputs'] = []
    with pytest.raises(ValidationError):
        ResearchPreparation.model_validate(item)


def test_researcher_assumption_is_explicit(examples):
    item = examples['missing_binding']['parameters'][-1]
    assert item['provenance'] == 'researcher_assumed'
    assert PreparationParameter.model_validate(item).entered_at
    item.pop('rationale')
    with pytest.raises(ValidationError):
        PreparationParameter.model_validate(item)


def test_clarifications_must_return_through_validation(examples):
    before = ResearchPreparation.model_validate(examples['missing_binding'])
    update = before.model_dump(mode='json')
    update.update(state='researching', revision=before.revision + 1)
    current = ResearchPreparation.model_validate(update)
    validate_preparation_transition(before, current)
    ready = examples['complete_unregistered']
    ready.update(preparation_id=before.preparation_id, revision=before.revision + 1)
    with pytest.raises(ValueError, match='transition'):
        validate_preparation_transition(before, ResearchPreparation.model_validate(ready))
    with pytest.raises(ValueError, match='revision'):
        validate_preparation_transition(before, before)


def test_changed_ready_record_requires_revalidation(examples):
    before = ResearchPreparation.model_validate(examples['complete_unregistered'])
    update = before.model_dump(mode='json')
    update.update(revision=1)
    update['request']['original_hypothesis'] = 'Use a different exposure assumption'
    with pytest.raises(ValueError, match='revalidation'):
        validate_preparation_transition(before, ResearchPreparation.model_validate(update))


def test_capabilities_describe_only_implemented_model():
    requirement = get_preparation_requirements(MODEL_ID)
    assert requirement.scientific_approval is False
    assert requirement.required_parameters['binding.affinity_nM'] == 'nM'
    assert 'oral' not in requirement.routes
    with pytest.raises(ValueError):
        get_preparation_requirements('equilibrium-not-yet-implemented')


def test_preparation_schemas_published_without_new_execution_endpoint():
    schema = create_app().openapi()
    for name in ['ResearchPreparation', 'PreparationRequest', 'PreparationAnswers', 'ModelPreparationRequirements']:
        assert name in schema['components']['schemas']
    assert not any('/preparations' in route for route in schema['paths'])
