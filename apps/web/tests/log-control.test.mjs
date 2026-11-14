import assert from "node:assert/strict";
import test from "node:test";

import { KINETIC_RANGES, fromLogPosition, toLogPosition } from "../lib/log-control.ts";

test("logarithmic kinetic controls round-trip across their supported UI ranges", () => {
  for (const range of Object.values(KINETIC_RANGES)) {
    assert.ok(Math.abs(fromLogPosition(0, range.min, range.max) / range.min - 1) < 1e-12);
    assert.ok(Math.abs(fromLogPosition(1, range.min, range.max) / range.max - 1) < 1e-12);
    for (const fraction of [.1, .25, .5, .75, .9]) {
      const value = fromLogPosition(fraction, range.min, range.max);
      assert.ok(Math.abs(toLogPosition(value, range.min, range.max) - fraction) < 1e-12);
    }
  }
});

test("the slider clamps display positions without silently changing the model", () => {
  assert.equal(toLogPosition(1e-12, 1e-6, 1), 0);
  assert.equal(toLogPosition(1e3, 1e-6, 1), 1);
  assert.ok(Math.abs(fromLogPosition(-1, 1e-6, 1) / 1e-6 - 1) < 1e-12);
  assert.ok(Math.abs(fromLogPosition(2, 1e-6, 1) - 1) < 1e-12);
  assert.throws(() => toLogPosition(0, 1e-6, 1), /positive/);
  assert.throws(() => fromLogPosition(.5, 0, 1), /positive/);
});
