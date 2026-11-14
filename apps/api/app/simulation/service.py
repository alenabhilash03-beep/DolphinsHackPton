"""Reproducible, bounded simulation responses for the direct API."""

import hashlib
import json
from math import isfinite
from time import perf_counter

from app.schemas.contracts import ExperimentConfig, ScenarioSeries, SimulationDiagnostics, SimulationRequest, SimulationResult
from app.simulation.comparison import ScenarioComputation, compare_experiment
from app.simulation.registry import MAX_RESULT_POINTS, MAX_RUNTIME_S, SimulationLimitError, validate_model_scope
from app.simulation.solver import ATOL, RTOL


def _canonical_hash(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _check_deadline(deadline: float) -> None:
    if perf_counter() > deadline:
        raise SimulationLimitError("Simulation exceeded the runtime budget")


def _timeline(results: tuple[ScenarioComputation, ...], configuration: ExperimentConfig, requested: int) -> tuple[list[float], list[float]]:
    horizon = configuration.duration_h
    boundaries = sorted({t for result in results for t in result.trajectory.pk.boundaries_h})
    mandatory = set(boundaries)
    # Keep crossing times on the shared grid, even when the plot is coarse.
    for result in results:
        for start, end in result.metrics.threshold.above_threshold_intervals_h:
            mandatory.update((start, end))
    extras = {min(horizon, 10 ** (j / 4 - 4)) for j in range(21)}
    extras.add(min(horizon, 24.0))
    for t in boundaries:
        for offset in (.001, .01, .1, 1.0, 6.0, 24.0):
            if 0 < t + offset < horizon:
                extras.add(t + offset)
    # A distinct pre-bolus sample prevents a plot from hiding the PK jump.
    for scenario in configuration.scenarios:
        for event in scenario.administration:
            if event.kind == "hypothetical_bolus" and 0 < event.start_h < horizon:
                extras.add(event.start_h - min(.001, event.start_h / 10))
    extras -= mandatory
    if len(mandatory) + len(extras) >= MAX_RESULT_POINTS:
        raise SimulationLimitError("Administration boundaries exceed the output-point budget")
    uniform_count = min(requested, MAX_RESULT_POINTS - len(mandatory) - len(extras))
    uniform = {i * horizon / (uniform_count - 1) for i in range(uniform_count)}
    times = sorted(mandatory | extras | uniform)
    if not all(isfinite(t) and 0 <= t <= horizon for t in times):
        raise ValueError("Generated timeline contains invalid times")
    return times, boundaries


def run_simulation(request: SimulationRequest, *, deadline: float | None = None) -> SimulationResult:
    """Compute without AI; a matching configuration yields the same result ID and values."""
    if not isinstance(request, SimulationRequest):
        raise TypeError("A validated SimulationRequest is required")
    end_time = deadline if deadline is not None else perf_counter() + MAX_RUNTIME_S
    definition = validate_model_scope(request.experiment)
    _check_deadline(end_time)
    results = compare_experiment(request.experiment, deadline=end_time)
    _check_deadline(end_time)
    horizon = request.experiment.duration_h
    times, boundaries = _timeline(results, request.experiment, request.output_points)

    series: list[ScenarioSeries] = []
    for result in results:
        trajectory = result.trajectory
        central: list[float] = []
        site: list[float] = []
        occupancy: list[float] = []
        for i, t in enumerate(times):
            if i % 128 == 0:
                _check_deadline(end_time)
            c = trajectory.pk.concentration_at(t)
            central.append(c)
            site.append(trajectory.exposure_factor * c)
            occupancy.append(trajectory.occupancy_at(t))
        series.append(ScenarioSeries(
            scenario_id=result.scenario_id,
            central_concentration_nM=central,
            target_site_concentration_nM=site,
            occupancy=occupancy,
            metrics=result.metrics,
        ))
    _check_deadline(end_time)

    configuration = request.experiment
    config_hash = _canonical_hash(configuration.model_dump(mode="json"))
    solver_version = results[0].trajectory.solver_version
    result_hash = _canonical_hash({
        "configuration_hash": config_hash,
        "output_points": request.output_points,
        "model_version": definition.version,
        "solver_version": solver_version,
    })
    warnings = list(definition.limitations)
    if any(item.metrics.threshold.status == "still_above_at_horizon" for item in results):
        warnings.append("At least one scenario remains above the analytical occupancy threshold at the horizon; its retention time is censored.")
    if any(event.kind == "hypothetical_bolus" for scenario in configuration.scenarios for event in scenario.administration):
        warnings.append("Hypothetical IV bolus is a custom mathematical input, not the labeled trastuzumab administration route.")
    return SimulationResult(
        result_id=f"sim-{result_hash[:24]}",
        client_revision=request.client_revision,
        configuration_hash=config_hash,
        model_version=definition.version,
        solver_version=solver_version,
        configuration=configuration,
        time_h=times,
        scenarios=series,
        diagnostics=SimulationDiagnostics(
            solver_method="Radau",
            relative_tolerance=RTOL,
            absolute_tolerance=ATOL,
            total_solver_knots=sum(len(segment.knots_h) for item in results for segment in item.trajectory.segments),
            event_boundaries_h=boundaries,
            output_point_count=len(times),
        ),
        warnings=warnings,
    )
