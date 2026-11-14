"""Small, explicit conversion table; never interpret formulas supplied by an LLM."""
import re
import unicodedata
from math import isfinite


def unit_key(value: str) -> str:
    value = unicodedata.normalize('NFKC', value).replace('−', '-').replace('μ', 'u').replace('µ', 'u')
    value = re.sub(r'\b(hours?|hrs?)\b', 'h', value)
    value = re.sub(r'\b(seconds?|secs?)\b', 's', value)
    value = re.sub(r'\b(days?)\b', 'd', value)
    return value.replace(' ', '').replace('^', '').replace('·', '')


_CONVERSIONS = {
    'L': {'L':1., 'mL':.001},
    'L/hour': {'L/h':1., 'mL/h':.001, 'mL/min':.06, 'L/d':1/24},
    'hour': {'h':1., 'd':24., 'min':1/60, 's':1/3600},
    'nM^-1 hour^-1': {'nM-1h-1':1., 'M-1s-1':3.6e-6, 'M-1h-1':1e-9, 'nM-1s-1':3600.},
    'hour^-1': {'h-1':1., 's-1':3600., 'min-1':60., 'd-1':1/24},
    'nM': {'nM':1., 'M':1e9, 'uM':1000., 'pM':.001},
    'g/mol': {'g/mol':1., 'Da':1., 'kDa':1000.},
    'kg': {'kg':1., 'g':.001},
    '1': {'1':1.},
}


def normalize_parameter(value: float, unit: str, canonical_unit: str) -> tuple[float, float]:
    table = {unit_key(key): factor for key, factor in _CONVERSIONS[canonical_unit].items()}
    factor = table.get(unit_key(unit))
    if factor is None:
        raise ValueError(f'No approved conversion from {unit} to {canonical_unit}')
    normalized = value * factor
    if not isfinite(normalized):
        raise ValueError('Unit conversion produced a nonfinite value')
    return normalized, factor
