"""Mass-action binding kinetics and linked affinity controls."""

from math import isfinite
from typing import Literal

from app.schemas.contracts import BindingParameters
from app.simulation.units import _finite, _result


def resolve_binding_parameters(
    current: BindingParameters,
    changed: Literal["association_nM_inv_h_inv", "dissociation_h_inv", "affinity_nM"],
    value: float,
) -> BindingParameters:
    """Edit one kinetic quantity; an affinity edit holds association fixed."""
    edited = _finite(value, changed, positive=True)
    association = edited if changed == "association_nM_inv_h_inv" else current.association_nM_inv_h_inv
    dissociation = edited if changed == "dissociation_h_inv" else current.dissociation_h_inv
    if changed == "affinity_nM":
        dissociation = _result(association * edited, "dissociation")
        if dissociation <= 0:
            raise ValueError("Derived dissociation must be positive")
    affinity = _result(dissociation / association, "affinity")
    return BindingParameters(
        association_nM_inv_h_inv=association,
        dissociation_h_inv=dissociation,
        affinity_nM=affinity,
    )


def binding_derivative(
    occupancy: float, site_concentration_nM: float, binding: BindingParameters
) -> float:
    theta = _finite(occupancy, "occupancy")
    if theta > 1:
        raise ValueError("occupancy must be at most one")
    concentration = _finite(site_concentration_nM, "site_concentration_nM")
    if not isinstance(binding, BindingParameters):
        raise TypeError("binding must be validated BindingParameters")
    rate = binding.association_nM_inv_h_inv * concentration * (1 - theta) - binding.dissociation_h_inv * theta
    if not isfinite(rate):
        raise ValueError("Binding derivative is nonfinite")
    return rate
