import assert from "node:assert/strict";
import test from "node:test";

import { example } from "../lib/example.generated.ts";
import { buildControlAdjustment, buildSimulationRequest, editableScenarioIds } from "../lib/workspace-state.ts";

test("baseline is never an editable alternative", () => {
  assert.deepEqual(editableScenarioIds(example), ["half_life_x3", "affinity_x10"]);
  assert.throws(() => buildControlAdjustment(example, "baseline", "dose_mg", 600, 1), /baseline is protected/);
  assert.throws(() => buildControlAdjustment(example, "missing", "binding.affinity_nM", .01, 1), /baseline is protected/);
});

test("linked edits are sent to the server with revision and complete experiment", () => {
  const request = buildControlAdjustment(example, "half_life_x3", "pk.elimination_half_life_h", 600, 8, 200);
  assert.equal(request.field, "pk.elimination_half_life_h");
  assert.equal(request.value, 600);
  assert.equal(request.scenario_id, "half_life_x3");
  assert.equal(request.client_revision, 8);
  assert.equal(request.output_points, 200);
  assert.equal(request.experiment, example);
  assert.equal(buildSimulationRequest(example, 9, 100).experiment, example);
});

test("global controls and scientific numeric checks fail before a network call", () => {
  assert.equal(buildControlAdjustment(example, null, "duration_h", 240, 1).scenario_id, null);
  assert.equal(buildControlAdjustment(example, "affinity_x10", "dosing_interval_h", null, 2).value, null);
  assert.throws(() => buildControlAdjustment(example, "affinity_x10", "duration_h", 240, 1), /Global controls/);
  assert.throws(() => buildControlAdjustment(example, null, "dose_mg", 600, 1), /baseline is protected/);
  assert.throws(() => buildControlAdjustment(example, "affinity_x10", "binding.affinity_nM", 0, 1), /positive/);
  assert.throws(() => buildControlAdjustment(example, "affinity_x10", "dose_mg", -1, 1), /negative/);
  assert.throws(() => buildControlAdjustment(example, null, "occupancy_threshold", 1, 1), /between 0 and 1/);
  assert.throws(() => buildControlAdjustment(example, "affinity_x10", "dose_mg", Number.NaN, 1), /finite/);
});
