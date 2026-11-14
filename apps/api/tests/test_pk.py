"""Reference calculations and administration-boundary checks for subphase 1A."""

from math import exp, isclose, log

import pytest
from pydantic import ValidationError

from app.schemas.contracts import BolusEvent, InfusionEvent, PKParameters, ScenarioConfig
from app.simulation.pk import compile_pk, propagate_amount, resolve_pk_parameters
from app.simulation.units import (
    clearance_L_day_to_L_h,
    days_to_hours,
    koff_s_inv_to_h_inv,
    kon_M_inv_s_inv_to_nM_inv_h_inv,
    mg_per_kg_to_mg,
    mg_per_L_to_nM,
    mg_to_nmol,
)


def test_canonical_conversions_and_primary_parameters():
    assert mg_per_kg_to_mg(8, 66) == 528
    assert mg_to_nmol(528, 148_000) == pytest.approx(3567.5675675675675)
    assert mg_per_L_to_nM(1, 148_000) == pytest.approx(6.756756756756757)
    assert kon_M_inv_s_inv_to_nM_inv_h_inv(62.3e4) == pytest.approx(2.2428)
    assert koff_s_inv_to_h_inv(8.16e-5) == pytest.approx(0.29376)
    assert clearance_L_day_to_L_h(0.127) == pytest.approx(0.005291666666666667)
    assert days_to_hours(180) == 4320


def test_linked_pk_edits(experiment_data):
    base = ScenarioConfig.model_validate(experiment_data["scenarios"][0]).pk
    long_life = resolve_pk_parameters(base, "elimination_half_life_h", base.elimination_half_life_h * 3)
    assert long_life.volume_L == base.volume_L
    assert long_life.clearance_L_h == pytest.approx(base.clearance_L_h / 3)
    assert long_life.elimination_half_life_h == pytest.approx(base.elimination_half_life_h * 3)
    more_clearance = resolve_pk_parameters(base, "clearance_L_h", base.clearance_L_h * 2)
    assert more_clearance.elimination_half_life_h == pytest.approx(base.elimination_half_life_h / 2)
    more_volume = resolve_pk_parameters(base, "volume_L", base.volume_L * 2)
    assert more_volume.clearance_L_h == base.clearance_L_h
    assert more_volume.elimination_half_life_h == pytest.approx(base.elimination_half_life_h * 2)


def test_exact_decay_and_constant_infusion():
    ke = log(2) / 10
    assert propagate_amount(100, 0, ke, 10) == pytest.approx(50)
    assert propagate_amount(0, 10, ke, 10) == pytest.approx(10 * (1 - exp(-ke * 10)) / ke)
    assert propagate_amount(7, 3, 0, 2) == 13
    assert propagate_amount(7, 3, 1e-15, 2) == pytest.approx(13, rel=1e-13)


def test_primary_single_infusion_and_washout(experiment_data):
    scenario = ScenarioConfig.model_validate(experiment_data["scenarios"][0])
    t = compile_pk(scenario.pk, scenario.molecular_weight_g_mol, scenario.administration, 4320)
    rate = mg_to_nmol(528, 148_000) / 1.5
    expected_peak = rate * (1 - exp(-t.ke_h_inv * 1.5)) / t.ke_h_inv
    assert t.boundaries_h == (0, 1.5, 4320)
    assert t.amount_at(0) == 0
    assert t.amount_at(1.5) == pytest.approx(expected_peak)
    assert t.concentration_at(1.5) == pytest.approx(expected_peak / 2.62)
    assert t.amount_at(4320) == pytest.approx(expected_peak * exp(-t.ke_h_inv * (4320 - 1.5)))
    assert t.concentrations_at((0, 1.5, 4320))[1] == pytest.approx(t.concentration_at(1.5))


def test_repeated_schedule_matches_superposition_and_horizon_semantics(experiment_data):
    scenario = ScenarioConfig.model_validate(experiment_data["scenarios"][0])
    events = [
        InfusionEvent(start_h=0, duration_h=1.5, amount_mg=528),
        InfusionEvent(start_h=504, duration_h=.5, amount_mg=396),
        InfusionEvent(start_h=1008, duration_h=.5, amount_mg=396),
        InfusionEvent(start_h=1512, duration_h=.5, amount_mg=396),
        InfusionEvent(start_h=2016, duration_h=.5, amount_mg=396),
    ]
    t = compile_pk(scenario.pk, 148_000, events, 2016)
    assert 504 in t.boundaries_h and 504.5 in t.boundaries_h
    assert 2016 in t.boundaries_h
    assert t.amount_at(2016) == pytest.approx(
        sum(
            mg_to_nmol(event.amount_mg, 148_000) / event.duration_h
            * (1 - exp(-t.ke_h_inv * event.duration_h)) / t.ke_h_inv
            * exp(-t.ke_h_inv * (2016 - event.start_h - event.duration_h))
            for event in events[:-1]
        )
    )


def test_partial_infusion_is_only_partially_delivered(experiment_data):
    pk = ScenarioConfig.model_validate(experiment_data["scenarios"][0]).pk
    t = compile_pk(pk, 148_000, [InfusionEvent(start_h=0, duration_h=10, amount_mg=100)], 2)
    rate = mg_to_nmol(100, 148_000) / 10
    assert t.amount_at(2) == pytest.approx(rate * (1 - exp(-t.ke_h_inv * 2)) / t.ke_h_inv)
    assert t.amount_at(2) < mg_to_nmol(20, 148_000)


def test_hypothetical_bolus_has_jump_and_requires_opt_in(experiment_data):
    pk = ScenarioConfig.model_validate(experiment_data["scenarios"][0]).pk
    events = [BolusEvent(kind="hypothetical_bolus", start_h=2, amount_mg=100)]
    with pytest.raises(ValueError, match="opt-in"):
        compile_pk(pk, 148_000, events, 10)
    t = compile_pk(pk, 148_000, events, 10, allow_hypothetical_bolus=True)
    assert t.amount_at(2 - 1e-9) == 0
    assert t.amount_at(2) == pytest.approx(mg_to_nmol(100, 148_000))
    assert t.amount_at(10) == pytest.approx(mg_to_nmol(100, 148_000) * exp(-t.ke_h_inv * 8))
    at_end = compile_pk(pk, 148_000, [BolusEvent(kind="hypothetical_bolus", start_h=10, amount_mg=100)], 10, allow_hypothetical_bolus=True)
    assert at_end.amount_at(10) == 0


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1, True])
def test_invalid_numeric_inputs_fail(bad, experiment_data):
    with pytest.raises(ValueError):
        mg_to_nmol(bad, 148_000)
    with pytest.raises(ValueError):
        propagate_amount(0, 0, .1, bad)
    base = ScenarioConfig.model_validate(experiment_data["scenarios"][0]).pk
    with pytest.raises(ValueError):
        resolve_pk_parameters(base, "volume_L", bad)


def test_invalid_units_durations_and_schedule_fail(experiment_data):
    pk = ScenarioConfig.model_validate(experiment_data["scenarios"][0]).pk
    with pytest.raises(ValueError):
        mg_to_nmol(1, 0)
    with pytest.raises(ValueError):
        clearance_L_day_to_L_h(0)
    with pytest.raises(ValidationError):
        InfusionEvent(start_h=0, duration_h=0, amount_mg=1)
    with pytest.raises(ValueError, match="overlap"):
        compile_pk(pk, 148_000, [
            InfusionEvent(start_h=0, duration_h=2, amount_mg=1),
            InfusionEvent(start_h=1, duration_h=2, amount_mg=1),
        ], 10)
    with pytest.raises(ValueError, match="after"):
        compile_pk(pk, 148_000, [InfusionEvent(start_h=11, duration_h=1, amount_mg=1)], 10)
    with pytest.raises(ValueError):
        compile_pk(pk, 148_000, [InfusionEvent(start_h=0, duration_h=1, amount_mg=1)], 0)


def test_pk_trajectory_bounds(experiment_data):
    scenario = ScenarioConfig.model_validate(experiment_data["scenarios"][0])
    t = compile_pk(scenario.pk, scenario.molecular_weight_g_mol, scenario.administration, 10)
    with pytest.raises(ValueError):
        t.amount_at(-1)
    with pytest.raises(ValueError):
        t.amount_at(11)
    assert isclose(t.ke_h_inv, log(2) / scenario.pk.elimination_half_life_h, rel_tol=1e-6)
