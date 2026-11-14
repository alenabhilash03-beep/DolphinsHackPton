import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { comparisonSummary, thresholdDescription } from "../lib/comparison-summary.ts";

const result = JSON.parse(readFileSync(new URL("../../../data/examples/simulation-result.reference.json", import.meta.url)));

test("primary comparison uses solver endpoints and qualifies censored retention", () => {
  const summary = comparisonSummary(result);
  assert.ok(summary.claims[0].includes(`${(result.scenarios[1].metrics.endpoint_occupancy * 100).toFixed(2)}%`));
  assert.ok(summary.claims.some((claim) => claim.includes("loss time is censored")));
  assert.ok(summary.followUps.some((item) => item.includes("Extend the washout")));
});

test("custom endpoints and threshold outcomes replace original conclusions", () => {
  const edited = structuredClone(result);
  edited.scenarios[1].metrics.endpoint_occupancy = 0.1;
  for (const series of edited.scenarios) series.metrics.threshold.status = "never_reached";
  const summary = comparisonSummary(edited);
  assert.ok(summary.claims[0].includes("10.00%"));
  assert.ok(!summary.claims.some((item) => item.includes("loss time is censored")));
  assert.ok(!summary.followUps.some((item) => item.includes("Extend the washout")));
  assert.equal(thresholdDescription(edited.scenarios[1].metrics.threshold), "Threshold never reached");
  edited.scenarios[1].metrics.threshold.status = "ambiguous_without_more_resolution";
  assert.ok(comparisonSummary(edited).claims.some((item) => item.includes("crossing is unresolved")));
});
