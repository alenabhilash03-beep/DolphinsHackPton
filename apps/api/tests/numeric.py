"""Cross-platform comparison of solver payloads.

A result ID is derived from the configuration hash, so the same ID can be produced by solves on
different machines whose BLAS/libm differ in the last floating-point bits. Everything that is not a
float must match exactly; floats must agree to a relative 1e-6 (absolute 1e-12 near zero).
"""
from math import isclose


def assert_same_solution(left, right, path='result', rel=1e-6, abs_tol=1e-12):
    if hasattr(left, 'model_dump'): left = left.model_dump(mode='json')
    if hasattr(right, 'model_dump'): right = right.model_dump(mode='json')
    if isinstance(left, float) or isinstance(right, float):
        assert isinstance(left, (int, float)) and isinstance(right, (int, float)), path
        assert isclose(left, right, rel_tol=rel, abs_tol=abs_tol), f'{path}: {left} != {right}'
    elif isinstance(left, dict):
        assert isinstance(right, dict) and left.keys() == right.keys(), path
        for key in left: assert_same_solution(left[key], right[key], f'{path}.{key}', rel, abs_tol)
    elif isinstance(left, list):
        assert isinstance(right, list) and len(left) == len(right), path
        for i, (a, b) in enumerate(zip(left, right)): assert_same_solution(a, b, f'{path}[{i}]', rel, abs_tol)
    else:
        assert left == right, f'{path}: {left!r} != {right!r}'
