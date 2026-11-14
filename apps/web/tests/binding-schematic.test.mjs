import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { schematicState, TARGET_SITES, MAX_FREE_PARTICLES } from "../lib/binding-schematic.ts";
const result = JSON.parse(readFileSync(new URL("../../../data/examples/simulation-result.reference.json", import.meta.url)));
test("schematic agrees with every solver sample within one site and replays deterministically", () => {
  for (const series of result.scenarios) for (let i = 0; i < result.time_h.length; i++) {
    const state = schematicState(result, i, series.scenario_id);
    assert.ok(Math.abs(state.occupiedSites / TARGET_SITES - series.occupancy[i]) <= 1 / TARGET_SITES);
    assert.equal(state.timeHours, result.time_h[i]);
    assert.deepEqual(state, schematicState(result, i, series.scenario_id));
  }
});
test("population display uses a fixed concentration scale with explicit clipping", () => {
  const custom = structuredClone(result);
  custom.scenarios[0].occupancy[0] = 1;
  custom.scenarios[0].target_site_concentration_nM[0] = 1e6;
  const state = schematicState(custom, 0, "baseline");
  assert.equal(state.occupiedSites, TARGET_SITES);
  assert.equal(state.freeParticles, MAX_FREE_PARTICLES);
  assert.equal(state.clipped, true);
  assert.equal(schematicState(result, 0, "baseline").freeParticles, 0);
});
