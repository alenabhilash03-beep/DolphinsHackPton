"""Exact piecewise one-compartment PK for finite IV infusions and explicit boluses.

Amounts are nmol, time is hours, volume is liters, and concentration is nM.
Boluses are separately labeled hypothetical inputs, never a product preset.
"""

from bisect import bisect_right
from dataclasses import dataclass
from math import exp, expm1, isfinite, log
from typing import Literal, Sequence

from app.schemas.contracts import BolusEvent, DoseEvent, InfusionEvent, PKParameters
from app.simulation.units import _finite, _result, mg_to_nmol


def resolve_pk_parameters(
    current: PKParameters,
    changed: Literal["clearance_L_h", "elimination_half_life_h", "volume_L"],
    value: float,
) -> PKParameters:
    """Apply one explicit edit; derive the dependent field at fixed volume or clearance."""
    edited = _finite(value, changed, positive=True)
    volume = edited if changed == "volume_L" else current.volume_L
    clearance = edited if changed == "clearance_L_h" else current.clearance_L_h
    if changed == "elimination_half_life_h":
        clearance = _result(log(2) * volume / edited, "clearance")
        if clearance <= 0:
            raise ValueError("Derived clearance must be positive")
    half_life = _result(log(2) * volume / clearance, "half-life")
    return PKParameters(
        volume_L=volume,
        clearance_L_h=clearance,
        elimination_half_life_h=half_life,
    )


def propagate_amount(amount_nmol: float, input_rate_nmol_h: float, ke_h_inv: float, dt_h: float) -> float:
    """Exact constant-input solution, stable as ke*dt approaches zero."""
    amount = _finite(amount_nmol, "amount_nmol")
    rate = _finite(input_rate_nmol_h, "input_rate_nmol_h")
    ke = _finite(ke_h_inv, "ke_h_inv")
    dt = _finite(dt_h, "dt_h")
    decay = exp(-ke * dt)
    delivered = rate * dt if ke == 0 else rate * (-expm1(-ke * dt)) / ke
    result = _result(amount * decay + delivered, "amount")
    if result < 0:
        raise ValueError("Calculated amount is negative")
    return result


@dataclass(frozen=True)
class PKSegment:
    start_h: float
    end_h: float
    initial_amount_nmol: float  # post-event amount at start_h
    input_rate_nmol_h: float


@dataclass(frozen=True)
class PKTrajectory:
    """Right-continuous at boluses except at T, where new input is excluded."""

    horizon_h: float
    volume_L: float
    ke_h_inv: float
    segments: tuple[PKSegment, ...]
    endpoint_amount_nmol: float

    def amount_at(self, time_h: float) -> float:
        t = _finite(time_h, "time_h")
        if t > self.horizon_h:
            raise ValueError("time_h exceeds the simulation horizon")
        if t == self.horizon_h:
            return self.endpoint_amount_nmol
        starts = tuple(segment.start_h for segment in self.segments)
        segment = self.segments[bisect_right(starts, t) - 1]
        return propagate_amount(
            segment.initial_amount_nmol,
            segment.input_rate_nmol_h,
            self.ke_h_inv,
            t - segment.start_h,
        )

    def concentration_at(self, time_h: float) -> float:
        return _result(self.amount_at(time_h) / self.volume_L, "concentration")

    def concentrations_at(self, times_h: Sequence[float]) -> tuple[float, ...]:
        return tuple(self.concentration_at(t) for t in times_h)

    @property
    def boundaries_h(self) -> tuple[float, ...]:
        return tuple(segment.start_h for segment in self.segments) + (self.horizon_h,)


def compile_pk(
    pk: PKParameters,
    molecular_weight_g_mol: float,
    administration: Sequence[DoseEvent],
    horizon_h: float,
    *,
    initial_amount_nmol: float = 0,
    allow_hypothetical_bolus: bool = False,
) -> PKTrajectory:
    """Compile an ordered, non-overlapping schedule into exact PK intervals.

    Events starting at T are allowed but supply no amount inside [0,T].
    Events after T and an infusion extending past T are rejected/trimmed,
    respectively. The latter contributes only its delivered fraction.
    """
    horizon = _finite(horizon_h, "horizon_h", positive=True)
    mw = _finite(molecular_weight_g_mol, "molecular_weight_g_mol", positive=True)
    amount = _finite(initial_amount_nmol, "initial_amount_nmol")
    if not isinstance(pk, PKParameters):
        raise TypeError("pk must be a validated PKParameters instance")
    if not administration:
        raise ValueError("administration must contain at least one event")
    if len(administration) > 100:
        raise ValueError("administration exceeds 100 events")

    boundaries = {0.0, horizon}
    starts: dict[float, list[DoseEvent]] = {}
    previous_end = -1.0
    for event in administration:
        if not isinstance(event, (InfusionEvent, BolusEvent)):
            raise TypeError("administration contains an invalid event")
        if event.start_h < previous_end:
            raise ValueError("Events must be sorted and must not overlap")
        if event.start_h > horizon:
            raise ValueError("An event starts after the simulation horizon")
        if isinstance(event, BolusEvent) and not allow_hypothetical_bolus:
            raise ValueError("Hypothetical bolus requires explicit opt-in")
        previous_end = event.start_h + (event.duration_h if isinstance(event, InfusionEvent) else 0)
        starts.setdefault(event.start_h, []).append(event)
        boundaries.add(event.start_h)
        if isinstance(event, InfusionEvent):
            boundaries.add(min(previous_end, horizon))

    ordered = sorted(boundaries)
    ke = pk.clearance_L_h / pk.volume_L
    if not isfinite(ke) or ke <= 0:
        raise ValueError("Derived elimination rate must be finite and positive")
    segments: list[PKSegment] = []
    for left, right in zip(ordered, ordered[1:]):
        for event in starts.get(left, []):
            if isinstance(event, BolusEvent):
                amount = _result(amount + mg_to_nmol(event.amount_mg, mw), "bolus amount")
        rate = 0.0
        for event in administration:
            if isinstance(event, InfusionEvent) and event.start_h <= left < event.start_h + event.duration_h:
                rate = _result(mg_to_nmol(event.amount_mg, mw) / event.duration_h, "infusion rate")
                break
        segments.append(PKSegment(left, right, amount, rate))
        amount = propagate_amount(amount, rate, ke, right - left)
    return PKTrajectory(horizon, pk.volume_L, ke, tuple(segments), amount)
