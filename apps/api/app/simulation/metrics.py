"""Exact PK exposure and dense-solution occupancy summaries."""

from math import expm1, isfinite

from scipy.optimize import brentq

from app.schemas.contracts import ScenarioMetrics, ThresholdOutcome
from app.simulation.pk import PKTrajectory
from app.simulation.solver import BindingSegment, BindingTrajectory, segment_concentration


def concentration_auc_nM_h(pk: PKTrajectory) -> float:
    """Integrate the exact piecewise PK amount, including partial infusions."""
    total = 0.0
    for segment in pk.segments:
        dt = segment.end_h - segment.start_h
        x = pk.ke_h_inv * dt
        if x < 1e-3:
            decay_integral = 1 - x / 2 + x * x / 6 - x**3 / 24 + x**4 / 120
            input_integral = .5 - x / 6 + x * x / 24 - x**3 / 120 + x**4 / 720
        else:
            decay_integral = -expm1(-x) / x
            input_integral = (x + expm1(-x)) / (x * x)
        total += (segment.initial_amount_nmol * dt * decay_integral + segment.input_rate_nmol_h * dt * dt * input_integral) / pk.volume_L
    if not isfinite(total) or total < 0:
        raise ValueError("Concentration AUC is outside finite physical range")
    return total


def _derivative(segment: BindingSegment, trajectory: BindingTrajectory, t: float) -> float:
    theta = float(segment.dense(t)[0])
    site_concentration = trajectory.exposure_factor * segment_concentration(segment.pk, trajectory.pk, t)
    return trajectory.binding.association_nM_inv_h_inv * site_concentration * (1 - theta) - trajectory.binding.dissociation_h_inv * theta


def _unique_times(values: list[float]) -> list[float]:
    ordered = sorted(values)
    result: list[float] = []
    for value in ordered:
        if not result or value - result[-1] > 1e-9:
            result.append(value)
    return result


def _segment_above_intervals(segment: BindingSegment, trajectory: BindingTrajectory, q: float) -> list[tuple[float, float]]:
    knots = list(segment.knots_h)
    extrema: list[float] = []
    for left, right in zip(knots, knots[1:]):
        dl = _derivative(segment, trajectory, left)
        dr = _derivative(segment, trajectory, right)
        if dl * dr < 0:
            extrema.append(brentq(lambda t: _derivative(segment, trajectory, t), left, right, xtol=1e-11))
    partition = _unique_times(knots + extrema)
    crossings: list[float] = []
    for left, right in zip(partition, partition[1:]):
        fl = float(segment.dense(left)[0]) - q
        fr = float(segment.dense(right)[0]) - q
        if fl * fr < 0:
            crossings.append(brentq(lambda t: float(segment.dense(t)[0]) - q, left, right, xtol=1e-11))
    points = _unique_times([segment.pk.start_h, segment.pk.end_h] + crossings + [t for t in partition if abs(float(segment.dense(t)[0]) - q) <= 1e-12])
    intervals: list[tuple[float, float]] = []
    for left, right in zip(points, points[1:]):
        if right > left and float(segment.dense((left + right) / 2)[0]) >= q:
            intervals.append((left, right))
    return intervals


def threshold_outcome(trajectory: BindingTrajectory, threshold: float) -> ThresholdOutcome:
    if not isfinite(threshold) or not 0 < threshold < 1:
        raise ValueError("Threshold must be finite and strictly between zero and one")
    raw: list[tuple[float, float]] = []
    for segment in trajectory.segments:
        raw.extend(_segment_above_intervals(segment, trajectory, threshold))
    merged: list[tuple[float, float]] = []
    for start, end in raw:
        if merged and start <= merged[-1][1] + 1e-9:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    total = sum(end - start for start, end in merged)
    if not merged:
        status = "never_reached"
        first_up = first_down = None
    else:
        status = "still_above_at_horizon" if merged[-1][1] >= trajectory.pk.horizon_h - 1e-9 else "crossed_within_window"
        # If initially occupied above q, no upward crossing happened in the window.
        first_rise = next(((start, end) for start, end in merged if start > 1e-9), None)
        first_up = first_rise[0] if first_rise else None
        first_down = first_rise[1] if first_rise and first_rise[1] < trajectory.pk.horizon_h - 1e-9 else None
    return ThresholdOutcome(
        status=status,
        total_time_above_h=total,
        first_upward_crossing_h=first_up,
        first_subsequent_downward_crossing_h=first_down,
        above_threshold_intervals_h=merged,
    )


def calculate_metrics(trajectory: BindingTrajectory, threshold: float) -> ScenarioMetrics:
    return ScenarioMetrics(
        concentration_auc_nM_h=concentration_auc_nM_h(trajectory.pk),
        occupancy_auc_h=trajectory.occupancy_auc_h,
        endpoint_occupancy=trajectory.endpoint_occupancy,
        threshold=threshold_outcome(trajectory, threshold),
    )
