"""Adaptive binding solver driven by exact piecewise PK, independent of display sampling."""

from bisect import bisect_right
from dataclasses import dataclass
from math import exp, expm1, isfinite
from typing import Any

import numpy as np
from scipy.integrate import solve_ivp

from app.schemas.contracts import BindingParameters
from app.simulation.pk import PKSegment, PKTrajectory
from app.simulation.units import _finite

RTOL = 1e-6
ATOL = 1e-9
BOUND_TOL = 1e-8


@dataclass(frozen=True)
class BindingSegment:
    pk: PKSegment
    dense: Any  # SciPy OdeSolution: accepts absolute time, returns [theta, accumulated AUC]
    knots_h: tuple[float, ...]


@dataclass(frozen=True)
class BindingTrajectory:
    pk: PKTrajectory
    binding: BindingParameters
    exposure_factor: float
    segments: tuple[BindingSegment, ...]
    endpoint_occupancy: float
    occupancy_auc_h: float
    solver_version: str

    def occupancy_at(self, time_h: float) -> float:
        t = _finite(time_h, "time_h")
        if t > self.pk.horizon_h:
            raise ValueError("time_h exceeds the simulation horizon")
        if t == self.pk.horizon_h:
            return self.endpoint_occupancy
        starts = tuple(segment.pk.start_h for segment in self.segments)
        segment = self.segments[bisect_right(starts, t) - 1]
        return checked_occupancy(float(segment.dense(t)[0]))

    def occupancy_at_many(self, times_h: tuple[float, ...] | list[float]) -> tuple[float, ...]:
        return tuple(self.occupancy_at(t) for t in times_h)


def checked_occupancy(value: float) -> float:
    if not isfinite(value) or value < -BOUND_TOL or value > 1 + BOUND_TOL:
        raise ValueError("Binding solution left the physical occupancy range")
    return min(1.0, max(0.0, value))


def segment_concentration(segment: PKSegment, pk: PKTrajectory, time_h: float) -> float:
    dt = time_h - segment.start_h
    decay = exp(-pk.ke_h_inv * dt)
    amount = segment.initial_amount_nmol * decay + segment.input_rate_nmol_h * (-expm1(-pk.ke_h_inv * dt)) / pk.ke_h_inv
    return amount / pk.volume_L


def solve_binding(
    pk: PKTrajectory,
    binding: BindingParameters,
    exposure_factor: float,
    *,
    initial_occupancy: float = 0,
    rtol: float = RTOL,
    atol: float = ATOL,
) -> BindingTrajectory:
    if not isinstance(pk, PKTrajectory) or not isinstance(binding, BindingParameters):
        raise TypeError("Validated PKTrajectory and BindingParameters are required")
    alpha = _finite(exposure_factor, "exposure_factor")
    theta = _finite(initial_occupancy, "initial_occupancy")
    if theta > 1:
        raise ValueError("initial_occupancy must be at most one")
    rel_tol = _finite(rtol, "rtol", positive=True)
    abs_tol = _finite(atol, "atol", positive=True)
    if rel_tol > 1e-3 or abs_tol > 1e-6:
        raise ValueError("Solver tolerances are too loose for reported occupancy metrics")

    auc = 0.0
    segments: list[BindingSegment] = []
    kon = binding.association_nM_inv_h_inv
    koff = binding.dissociation_h_inv
    for pk_segment in pk.segments:
        def rhs(t: float, y: list[float]) -> tuple[float, float]:
            concentration = alpha * segment_concentration(pk_segment, pk, t)
            derivative = kon * concentration * (1 - y[0]) - koff * y[0]
            return derivative, y[0]

        result = solve_ivp(
            rhs,
            (pk_segment.start_h, pk_segment.end_h),
            (theta, auc),
            method="Radau",
            rtol=rel_tol,
            atol=(abs_tol, abs_tol),
            dense_output=True,
        )
        if not result.success or result.sol is None or not np.isfinite(result.y).all():
            raise ValueError(f"Binding integration failed on [{pk_segment.start_h}, {pk_segment.end_h}]")
        for value in result.y[0]:
            checked_occupancy(float(value))
        theta = checked_occupancy(float(result.y[0, -1]))
        auc = float(result.y[1, -1])
        if not isfinite(auc) or auc < -BOUND_TOL or auc > pk_segment.end_h + BOUND_TOL:
            raise ValueError("Occupancy AUC left its physical range")
        segments.append(BindingSegment(pk_segment, result.sol, tuple(float(t) for t in result.t)))
    solver_version = f"Radau-r{rel_tol:g}-a{abs_tol:g}-v1"
    return BindingTrajectory(pk, binding, alpha, tuple(segments), theta, max(0.0, auc), solver_version)
