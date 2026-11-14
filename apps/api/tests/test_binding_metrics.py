"""Analytical binding references, threshold topology, and fair comparison checks."""

from math import exp, log

import pytest

from app.schemas.contracts import BindingParameters, BolusEvent, ExperimentConfig, InfusionEvent, PKParameters
from app.simulation.binding import binding_derivative, resolve_binding_parameters
from app.simulation.comparison import compare_experiment
from app.simulation.metrics import calculate_metrics, concentration_auc_nM_h, threshold_outcome
from app.simulation.pk import compile_pk
from app.simulation.solver import solve_binding


def _pk(volume=1.0, clearance=1.0):
    return PKParameters(volume_L=volume, clearance_L_h=clearance, elimination_half_life_h=log(2) * volume / clearance)


def _binding(kon=1.0, koff=1.0):
    return BindingParameters(association_nM_inv_h_inv=kon, dissociation_h_inv=koff, affinity_nM=koff / kon)


def test_affinity_edits_hold_association_and_derive_dissociation():
    base = _binding(2.2428, .29376)
    stronger = resolve_binding_parameters(base, "affinity_nM", base.affinity_nM / 10)
    assert stronger.association_nM_inv_h_inv == base.association_nM_inv_h_inv
    assert stronger.dissociation_h_inv == pytest.approx(base.dissociation_h_inv / 10)
    assert stronger.affinity_nM == pytest.approx(base.affinity_nM / 10)
    assert resolve_binding_parameters(base, "dissociation_h_inv", base.dissociation_h_inv * 2).affinity_nM == pytest.approx(base.affinity_nM * 2)
    assert resolve_binding_parameters(base, "association_nM_inv_h_inv", base.association_nM_inv_h_inv * 2).affinity_nM == pytest.approx(base.affinity_nM / 2)
    with pytest.raises(ValueError):
        resolve_binding_parameters(base, "affinity_nM", float("nan"))
    assert binding_derivative(.25, 1, _binding()) == pytest.approx(.5)


def test_constant_concentration_matches_exact_binding_and_auc():
    # R=ke*A makes central C exactly 1 nM throughout [0,10].
    pk = compile_pk(_pk(), 1_000_000, [InfusionEvent(start_h=0, duration_h=10, amount_mg=10)], 10, initial_amount_nmol=1)
    trajectory = solve_binding(pk, _binding(), 1)
    for t in (0, .01, 1, 5, 10):
        assert pk.concentration_at(t) == pytest.approx(1, abs=1e-12)
        assert trajectory.occupancy_at(t) == pytest.approx(.5 * (1 - exp(-2 * t)), abs=2e-7)
    metrics = calculate_metrics(trajectory, .45)
    assert metrics.concentration_auc_nM_h == pytest.approx(10, abs=1e-10)
    assert metrics.occupancy_auc_h == pytest.approx(5 - .25 * (1 - exp(-20)), abs=2e-6)
    assert metrics.threshold.first_upward_crossing_h == pytest.approx(-log(.1) / 2, abs=2e-6)
    assert metrics.threshold.status == "still_above_at_horizon"
    assert metrics.threshold.first_subsequent_downward_crossing_h is None


def test_zero_input_washout_matches_exponential_decay():
    pk = compile_pk(_pk(), 1_000_000, [InfusionEvent(start_h=0, duration_h=1, amount_mg=0)], 10)
    trajectory = solve_binding(pk, _binding(kon=1, koff=.2), 1, initial_occupancy=1)
    for t in (0, .2, 1, 5, 10):
        assert trajectory.occupancy_at(t) == pytest.approx(exp(-.2 * t), abs=2e-7)
    metrics = calculate_metrics(trajectory, .5)
    assert metrics.concentration_auc_nM_h == 0
    assert metrics.occupancy_auc_h == pytest.approx((1 - exp(-2)) / .2, abs=2e-6)
    assert metrics.threshold.status == "crossed_within_window"
    assert metrics.threshold.first_upward_crossing_h is None  # initially above q
    assert metrics.threshold.above_threshold_intervals_h[0][1] == pytest.approx(log(2) / .2, abs=2e-6)


def test_repeated_bolus_produces_multiple_above_threshold_intervals():
    pk = compile_pk(
        _pk(), 1_000_000,
        [BolusEvent(kind="hypothetical_bolus", start_h=t, amount_mg=10) for t in (0, 10, 20)],
        30, allow_hypothetical_bolus=True,
    )
    trajectory = solve_binding(pk, _binding(), 1)
    outcome = threshold_outcome(trajectory, .5)
    assert len(outcome.above_threshold_intervals_h) == 3
    assert outcome.status == "crossed_within_window"
    assert outcome.first_upward_crossing_h == pytest.approx(outcome.above_threshold_intervals_h[0][0])
    assert outcome.first_subsequent_downward_crossing_h == pytest.approx(outcome.above_threshold_intervals_h[0][1])
    assert outcome.total_time_above_h == pytest.approx(sum(b - a for a, b in outcome.above_threshold_intervals_h))
    assert all(b < c for (_, b), (c, _) in zip(outcome.above_threshold_intervals_h, outcome.above_threshold_intervals_h[1:]))
    assert trajectory.occupancy_at(10) == pytest.approx(trajectory.occupancy_at(10 - 1e-9), abs=1e-7)
    initially_above = threshold_outcome(solve_binding(pk, _binding(), 1, initial_occupancy=1), .5)
    assert initially_above.above_threshold_intervals_h[0][0] == 0
    assert initially_above.first_upward_crossing_h is not None
    assert initially_above.first_upward_crossing_h >= 10


def test_repeated_finite_infusions_produce_separate_threshold_intervals():
    pk = compile_pk(
        _pk(), 1_000_000,
        [InfusionEvent(start_h=t, duration_h=.1, amount_mg=10) for t in (0, 10, 20)],
        30,
    )
    outcome = threshold_outcome(solve_binding(pk, _binding(), 1), .5)
    assert len(outcome.above_threshold_intervals_h) == 3
    assert .1 < outcome.above_threshold_intervals_h[0][0] < 1  # kinetic lag after the infusion ends
    assert outcome.above_threshold_intervals_h[1][0] > 10


def test_threshold_never_reached_and_zero_target_exposure():
    pk = compile_pk(_pk(), 1_000_000, [InfusionEvent(start_h=0, duration_h=1, amount_mg=10)], 10)
    trajectory = solve_binding(pk, _binding(), 0)
    assert trajectory.occupancy_at(10) == 0
    outcome = threshold_outcome(trajectory, .9)
    assert outcome.status == "never_reached"
    assert outcome.total_time_above_h == 0
    assert outcome.above_threshold_intervals_h == []
    with pytest.raises(ValueError):
        threshold_outcome(trajectory, 1)
    with pytest.raises(ValueError):
        solve_binding(pk, _binding(), 1, initial_occupancy=1.000001)


def test_solver_tolerance_convergence_and_plot_grid_independence(experiment_data):
    experiment = ExperimentConfig.model_validate(experiment_data)
    scenario = experiment.scenarios[0]
    pk = compile_pk(scenario.pk, scenario.molecular_weight_g_mol, scenario.administration, experiment.duration_h)
    normal = solve_binding(pk, scenario.binding, scenario.exposure_factor)
    tight = solve_binding(pk, scenario.binding, scenario.exposure_factor, rtol=1e-8, atol=1e-11)
    mn = calculate_metrics(normal, experiment.occupancy_threshold)
    mt = calculate_metrics(tight, experiment.occupancy_threshold)
    assert mn.endpoint_occupancy == pytest.approx(mt.endpoint_occupancy, abs=3e-6)
    assert mn.occupancy_auc_h == pytest.approx(mt.occupancy_auc_h, abs=.01)
    assert mn.threshold.first_subsequent_downward_crossing_h == pytest.approx(mt.threshold.first_subsequent_downward_crossing_h, abs=.02)
    # Dense-solution metrics are unchanged by the frontend's chosen sample times.
    normal.occupancy_at_many([0, 1.5, 10, 100, 4320])
    assert calculate_metrics(normal, .9) == mn
    assert concentration_auc_nM_h(pk) > 0


def test_three_fixture_scenarios_keep_the_requested_controls_fixed(experiment_data):
    results = compare_experiment(ExperimentConfig.model_validate(experiment_data))
    assert len(results) == 3
    assert [item.scenario_id for item in results] == ["baseline", "half_life_x3", "affinity_x10"]
    baseline, half_life, affinity = results
    assert baseline.metrics.concentration_auc_nM_h == pytest.approx(affinity.metrics.concentration_auc_nM_h)
    assert half_life.metrics.concentration_auc_nM_h > baseline.metrics.concentration_auc_nM_h
    assert half_life.metrics.threshold.status == "still_above_at_horizon"
    assert affinity.metrics.threshold.status == "still_above_at_horizon"
    assert baseline.metrics.threshold.status == "crossed_within_window"
    assert 0 <= baseline.metrics.endpoint_occupancy <= 1
