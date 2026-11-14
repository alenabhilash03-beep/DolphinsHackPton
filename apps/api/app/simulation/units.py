"""Conversions into the model's canonical hour, nmol, nM, and liter units."""

from math import isfinite


def _finite(value: float, name: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    invalid = value <= 0 if positive else value < 0
    if invalid:
        raise ValueError(f"{name} must be {'positive' if positive else 'nonnegative'}")
    return float(value)


def _result(value: float, name: str) -> float:
    if not isfinite(value):
        raise ValueError(f"{name} conversion exceeds finite model range")
    return value


def mg_to_nmol(amount_mg: float, molecular_weight_g_mol: float) -> float:
    amount = _finite(amount_mg, "amount_mg")
    mw = _finite(molecular_weight_g_mol, "molecular_weight_g_mol", positive=True)
    return _result(amount * 1_000_000 / mw, "amount")


def mg_per_kg_to_mg(dose_mg_kg: float, body_mass_kg: float) -> float:
    dose = _finite(dose_mg_kg, "dose_mg_kg")
    mass = _finite(body_mass_kg, "body_mass_kg", positive=True)
    return _result(dose * mass, "dose")


def mg_per_L_to_nM(concentration_mg_L: float, molecular_weight_g_mol: float) -> float:
    return mg_to_nmol(concentration_mg_L, molecular_weight_g_mol)


def kon_M_inv_s_inv_to_nM_inv_h_inv(rate: float) -> float:
    return _result(_finite(rate, "association_rate") * 3.6e-6, "association_rate")


def koff_s_inv_to_h_inv(rate: float) -> float:
    return _result(_finite(rate, "dissociation_rate") * 3600, "dissociation_rate")


def clearance_L_day_to_L_h(clearance: float) -> float:
    return _result(_finite(clearance, "clearance", positive=True) / 24, "clearance")


def days_to_hours(days: float) -> float:
    return _result(_finite(days, "days") * 24, "time")
