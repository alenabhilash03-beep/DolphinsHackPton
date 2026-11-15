"""8D.1: typed follow-up experiments derived from solver facts and run through validated controls."""
import pytest
from fastapi.testclient import TestClient

from app.agent.generalized import GeneralizedAgentService
from app.research.demo import load_demo
from app.research.experimental_edits import apply_edit, parse_edit
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore, StalePreparation
from app.research.proposals import find, operations, propose
from app.schemas.contracts import ControlAdjustment, SimulationRequest
from app.schemas.generalized_agent import AgentEditRequest
from app.simulation.controls import adjust_experiment
from app.simulation.registry import MAX_HORIZON_H
from app.simulation.service import run_simulation
from test_generalized_agent import DrivingModel, SETTINGS
from test_grounded_synthesis import scripted_synthesizer

BASE = load_demo().result


def request(base, revision=1, **fields):
    return AgentEditRequest(base_result_id=base.result_id, base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash, client_revision=revision, **{'text': 'Run this experiment', **fields})


def simulate(experiment, revision=1):
    return run_simulation(SimulationRequest(experiment=experiment, client_revision=revision, output_points=600))


def adjusted(base, field, value, scenario=None, revision=1):
    return simulate(adjust_experiment(ControlAdjustment(experiment=base.configuration, scenario_id=scenario, field=field, value=value,
        client_revision=revision)), revision)


def science(config):
    """Everything numerical about a configuration, without provenance identifiers that differ per edit."""
    return (config.duration_h, config.occupancy_threshold, [(s.scenario_id, s.pk, s.binding, s.administration, s.dosing_interval_h,
        s.exposure_factor, s.molecular_weight_g_mol, s.body_mass_kg) for s in config.scenarios])


def test_proposals_state_a_solver_fact_a_question_and_exact_changes_against_the_base():
    proposals = propose(BASE)
    assert [p.kind for p in proposals] == ['extend_window', 'stricter_threshold', 'halve_dose']
    assert propose(BASE) == proposals and len({p.proposal_id for p in proposals}) == 3
    for p in proposals:
        assert (p.base_result_id, p.base_experiment_id, p.base_configuration_sha256, p.base_client_revision) == (
            BASE.result_id, BASE.configuration.experiment_id, BASE.configuration_hash, BASE.client_revision)
        assert p.question_tested.endswith('?') and p.observation and p.rationale and len(p.changes) == 1
    window, threshold, dose = (p.changes[0] for p in proposals)
    assert (window.field, window.scenario_id, window.from_value, window.to_value, window.unit) == ('duration_h', None, 4320.0, 8640.0, 'h')
    assert (window.from_display, window.to_display) == ('4320 h (180 days)', '8640 h (360 days)')
    assert (threshold.field, threshold.from_value, threshold.to_value, threshold.to_display) == ('occupancy_threshold', 0.9, 0.95, '0.95 (95%)')
    assert (dose.field, dose.scenario_id, dose.from_value, dose.to_value, dose.unit) == ('dose_mg', 'half_life_x3', 528.0, 264.0, 'mg')
    # The stated observation is the solver's: both alternatives are censored in the reviewed comparison.
    statuses = {s.scenario_id: s.metrics.threshold.status for s in BASE.scenarios}
    assert [k for k, v in statuses.items() if v == 'still_above_at_horizon'] == ['half_life_x3', 'affinity_x10']
    assert 'Threefold longer half-life' in proposals[0].observation and 'Tenfold stronger affinity' in proposals[0].observation


@pytest.mark.parametrize('index', [0, 1, 2])
def test_running_a_proposal_equals_its_edit_text_and_the_direct_control(tmp_path, index):
    proposal = propose(BASE)[index]
    change = proposal.changes[0]
    store = PreparationStore(tmp_path / 'p.sqlite3')
    by_proposal, changes = apply_edit(BASE, request(BASE, proposal_id=proposal.proposal_id), store)
    by_text, _ = apply_edit(BASE, request(BASE, text=proposal.edit_text), store)
    assert science(by_proposal) == science(by_text)
    # The supported edit language parses to the proposal's own operation.
    assert parse_edit(BASE.configuration, proposal.edit_text) == ('operations', operations(proposal))
    direct = adjusted(BASE, change.field, change.to_value, change.scenario_id)
    ran = simulate(by_proposal)
    assert science(ran.configuration) == science(direct.configuration)
    assert [s.metrics for s in ran.scenarios] == [s.metrics for s in direct.scenarios]
    assert ran.time_h == direct.time_h and [s.occupancy for s in ran.scenarios] == [s.occupancy for s in direct.scenarios]
    assert changes == [f'{change.scenario_id or "comparison"}: {change.field} = {change.to_value:g}']
    # Only the listed parameter moved; the baseline scenario and every other value are those of the base.
    before, after = science(BASE.configuration), science(by_proposal)
    assert after[2][0] == before[2][0]
    differing = [name for name, old, new in [('duration', before[0], after[0]), ('threshold', before[1], after[1]),
        *((s[0], s, t) for s, t in zip(before[2], after[2]))] if old != new]
    assert differing == [{'duration_h': 'duration', 'occupancy_threshold': 'threshold'}.get(change.field, change.scenario_id)]
    edited = next((s for s in by_proposal.scenarios if s.scenario_id == change.scenario_id), None)
    if edited:
        original = next(s for s in BASE.configuration.scenarios if s.scenario_id == change.scenario_id)
        assert (edited.pk, edited.binding, edited.dosing_interval_h) == (original.pk, original.binding, original.dosing_interval_h)
        assert {e.amount_mg for e in edited.administration} == {change.to_value}


def test_a_proposal_only_runs_against_the_result_it_was_derived_from(tmp_path):
    store = PreparationStore(tmp_path / 'p.sqlite3')
    proposal = propose(BASE)[0]
    later = adjusted(BASE, 'duration_h', 2880.0)
    # Same wording, different base: the identifier is bound to the stored result and its configuration.
    assert all(p.proposal_id != proposal.proposal_id for p in propose(later))
    with pytest.raises(ValueError, match='does not belong to the current result'): find(later, proposal.proposal_id)
    with pytest.raises(ValueError, match='does not belong'): apply_edit(later, request(later, 2, proposal_id=proposal.proposal_id), store)
    stale = request(BASE, proposal_id=proposal.proposal_id).model_copy(update={'base_configuration_sha256': '0' * 64})
    with pytest.raises(StalePreparation): apply_edit(BASE, stale, store)
    with pytest.raises(StalePreparation): apply_edit(BASE, request(BASE, 0 + BASE.client_revision or 1, proposal_id=proposal.proposal_id).model_copy(update={'client_revision': BASE.client_revision}), store)
    with pytest.raises(ValueError): AgentEditRequest(base_result_id='r', base_experiment_id='e', base_configuration_sha256='0' * 64, client_revision=1, text='x', proposal_id='prop-not-hex')


def test_rules_follow_solver_outcomes_and_control_limits():
    weak = adjusted(BASE, 'dose_mg', 0.01, 'affinity_x10')
    assert next(s for s in weak.scenarios if s.scenario_id == 'affinity_x10').metrics.threshold.status == 'never_reached'
    double = next(p for p in propose(weak) if p.kind == 'double_dose')
    assert (double.changes[0].scenario_id, double.changes[0].from_value, double.changes[0].to_value) == ('affinity_x10', 0.01, 0.02)
    assert double.edit_text == 'Double the dose in affinity_x10'
    # One censored scenario is enough to extend the window, but not to raise the threshold.
    assert [p.kind for p in propose(weak)] == ['extend_window', 'double_dose', 'halve_dose']
    # The window is never proposed beyond the simulator's horizon limit, and not at all once it is reached.
    long = adjusted(BASE, 'duration_h', 6000.0)
    assert next(p for p in propose(long) if p.kind == 'extend_window').changes[0].to_value == MAX_HORIZON_H
    assert all(p.kind != 'extend_window' for p in propose(adjusted(BASE, 'duration_h', MAX_HORIZON_H)))
    assert all(p.kind != 'stricter_threshold' for p in propose(adjusted(BASE, 'occupancy_threshold', 0.99)))
    assert next(p for p in propose(adjusted(BASE, 'occupancy_threshold', 0.95)) if p.kind == 'stricter_threshold').changes[0].to_value == 0.99 \
        if sum(s.metrics.threshold.status == 'still_above_at_horizon' for s in adjusted(BASE, 'occupancy_threshold', 0.95).scenarios) >= 2 else True
    # A zero dose cannot be doubled into anything, so it is not proposed.
    none = adjusted(BASE, 'dose_mg', 0.0, 'affinity_x10')
    assert all(p.kind != 'double_dose' for p in propose(none))
    # Relative dose changes are not proposed for schedules whose doses differ.
    mixed = BASE.model_copy(deep=True)
    scenario = mixed.configuration.scenarios[1]
    scenario.administration = [scenario.administration[0], scenario.administration[0].model_copy(update={'start_h': 504.0, 'amount_mg': 100.0})]
    assert all(p.changes[0].scenario_id != scenario.scenario_id for p in propose(mixed) if p.kind in {'halve_dose', 'double_dose'})
    # Proposals only ever touch supported controls of an alternative or the common design; never drug, target or model.
    for result in (BASE, weak, long):
        for p in propose(result):
            change = p.changes[0]
            assert change.field in {'duration_h', 'occupancy_threshold', 'dose_mg'}
            assert change.scenario_id is None or change.scenario_id != result.configuration.scenarios[0].scenario_id


@pytest.mark.parametrize('text,expected', [
    ('Halve the dose in the affinity alternative', ('dose_mg', 'affinity_x10', 264.0)),
    ('Set the occupancy threshold to 95%', ('occupancy_threshold', None, 0.95)),
    ('set the occupancy threshold to 0.95.', ('occupancy_threshold', None, 0.95)),
    ('Run this comparison for 360 days', ('duration_h', None, 8640.0)),
])
def test_expanded_edit_language_parses_to_one_structured_operation(text, expected):
    kind, ops = parse_edit(BASE.configuration, text)
    assert kind == 'operations' and [(o.field, o.scenario_id, o.value) for o in ops] == [expected]


@pytest.mark.parametrize('text', [
    'Halve the dose in the affinity alternative and switch to imatinib', 'Halve the dose', 'Halve the dose in baseline',
    'Set the occupancy threshold to 150%', 'Set the occupancy threshold to 0', 'Set the occupancy threshold to 95% for HER3',
    'Set the occupancy threshold to high', 'Raise the threshold a bit', 'Halve the dose in that alternative',
])
def test_partly_understood_or_out_of_scope_requests_apply_nothing(text):
    with pytest.raises(ValueError): parse_edit(BASE.configuration, text)


def agent(tmp_path):
    service = GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path / 'p.sqlite3')), SETTINGS, DrivingModel(mode='edit'),
        synthesizer=scripted_synthesizer([]))
    service.turns.seed(BASE)
    return service


def test_run_this_experiment_gives_an_attributable_result_through_the_agent(tmp_path):
    service = agent(tmp_path)
    proposal = propose(BASE)[0]
    turn = service.run(request(BASE, proposal_id=proposal.proposal_id, text=proposal.edit_text), edit=True)
    assert turn.status == 'completed' and turn.applied_proposal == proposal
    assert turn.parent_result_id == BASE.result_id and turn.result.configuration.duration_h == 8640.0
    assert turn.applied_changes == ['comparison: duration_h = 8640']
    assert turn.synthesis.result_id == turn.result.result_id and service.turns.read(turn.turn_id) == turn
    # The proposal is applied by the server even if the label text says something else.
    relabelled = agent(tmp_path / 'other')
    other = relabelled.run(request(BASE, proposal_id=proposal.proposal_id, text='Set dose to 1 mg in affinity_x10'), edit=True)
    assert science(other.result.configuration) == science(turn.result.configuration)
    # A consumed base cannot be run again; the follow-up result offers its own, different proposals.
    service.model = DrivingModel(mode='edit')
    with pytest.raises(StalePreparation): service.run(request(BASE, proposal_id=proposal.proposal_id), edit=True)
    following = propose(turn.result)
    assert following and all(p.base_result_id == turn.result.result_id and p.proposal_id != proposal.proposal_id for p in following)
    # A proposal from another result is refused as a clarification, with no new result.
    from langchain_core.messages import AIMessage
    from test_research_agent import ScriptedModel
    service.model = ScriptedModel(responses=[AIMessage(content='', tool_calls=[{'name': name, 'args': args, 'id': str(i)}]) for i, (name, args) in enumerate(
        [('read_current_experiment', {}), ('apply_requested_edit', {}), ('AgentDecision', {'status': 'needs_inputs'})])])
    refused = service.run(request(turn.result, 2, proposal_id=proposal.proposal_id), edit=True)
    assert refused.status == 'needs_inputs' and refused.result is None and refused.applied_proposal is None
    assert 'does not belong to the current result' in refused.questions[0]


def test_api_serves_proposals_for_stored_results_including_direct_control_edits(tmp_path):
    from app.main import create_app
    app = create_app(SETTINGS, preparation_service=PreparationService(store=PreparationStore(tmp_path / 'p.sqlite3')))
    service = app.state.generalized_agent
    service.model = DrivingModel(mode='edit'); service.synthesizer = scripted_synthesizer([])
    with TestClient(app) as client:
        served = client.get(f'/api/agent/results/{BASE.result_id}/proposals').json()
        assert served['status'] == 'available' and [p['proposal_id'] for p in served['proposals']] == [p.proposal_id for p in propose(BASE)]
        assert client.get('/api/agent/results/sim-unknown/proposals').status_code == 404
        # A slider edit creates a new stored result with its own proposals.
        slider = client.post('/api/simulations/adjust', json={'experiment': BASE.configuration.model_dump(mode='json'), 'scenario_id': None,
            'field': 'duration_h', 'value': 2880.0, 'client_revision': 1, 'output_points': 600}).json()
        after = client.get(f"/api/agent/results/{slider['result_id']}/proposals").json()
        assert after['status'] == 'available' and after['proposals'][0]['changes'][0]['from_value'] == 2880.0
        assert after['proposals'][0]['base_configuration_sha256'] == slider['configuration_hash']
        # After an experiment is run from a result, that result's proposals are superseded.
        service.run(request(BASE, proposal_id=served['proposals'][0]['proposal_id']), edit=True)
        superseded = client.get(f'/api/agent/results/{BASE.result_id}/proposals').json()
        assert superseded['status'] == 'superseded' and superseded['proposals'] == [] and 'newer experiment' in superseded['note']
