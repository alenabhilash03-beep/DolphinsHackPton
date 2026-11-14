import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildScientificPlot, scenarioColor } from "../lib/plot-spec.ts";
import { nearestTimeIndex, readoutAtIndex } from "../lib/timeline.ts";

const result = JSON.parse(readFileSync(new URL("../../../data/examples/simulation-result.reference.json", import.meta.url), "utf8"));

test("timeline readouts use exactly the server's aligned sample values", () => {
  const eventIndex = result.time_h.indexOf(1.5);
  assert.ok(eventIndex > 0);
  assert.equal(nearestTimeIndex(result.time_h, 1.5), eventIndex);
  assert.equal(nearestTimeIndex(result.time_h, -1), 0);
  assert.equal(nearestTimeIndex(result.time_h, 5000), result.time_h.length - 1);
  assert.equal(nearestTimeIndex(result.time_h, result.time_h[40]), 40);
  const readout = readoutAtIndex(result, eventIndex);
  assert.equal(readout.timeHours, 1.5);
  assert.equal(readout.timeDays, 1.5 / 24);
  assert.equal(readout.scenarios.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(readout.scenarios[i].centralConcentrationNM, result.scenarios[i].central_concentration_nM[eventIndex]);
    assert.equal(readout.scenarios[i].targetSiteConcentrationNM, result.scenarios[i].target_site_concentration_nM[eventIndex]);
    assert.equal(readout.scenarios[i].occupancyFraction, result.scenarios[i].occupancy[eventIndex]);
  }
  assert.equal(readoutAtIndex(null, 0), null);
  assert.equal(readoutAtIndex(result, 100_000).timeHours, 4320);
});

test("both graphs share the horizon, scenario colors, cursor, and dose markers", () => {
  const concentration = buildScientificPlot(result, "concentration", 1.5);
  const occupancy = buildScientificPlot(result, "occupancy", 1.5);
  assert.deepEqual(concentration.layout.xaxis.range, [0, 180]);
  assert.deepEqual(occupancy.layout.xaxis.range, [0, 180]);
  assert.equal(concentration.layout.xaxis.title.text, "Time (days)");
  assert.equal(concentration.layout.yaxis.title.text, "Central concentration (nM)");
  assert.equal(occupancy.layout.yaxis.title.text, "Target occupancy (%)");
  const central = concentration.data[0];
  const occupied = occupancy.data[0];
  assert.deepEqual(central.x, result.time_h.map((hour) => hour / 24));
  assert.deepEqual(central.y, result.scenarios[0].central_concentration_nM);
  assert.deepEqual(occupied.y, result.scenarios[0].occupancy.map((fraction) => fraction * 100));
  for (let i = 0; i < result.scenarios.length; i++) {
    assert.deepEqual(concentration.data[i].x, occupied.x);
    assert.equal(concentration.data[i].line.color, occupancy.data[i].line.color);
    assert.equal(concentration.data[i].x.at(-1), 180);
    assert.equal(occupancy.data[i].x.at(-1), 180);
  }
  assert.equal(central.line.color, occupied.line.color);
  assert.equal(central.line.color, scenarioColor("baseline", 0));
  assert.equal(concentration.data.at(-1).name, "Dose starts");
  assert.deepEqual(concentration.data.at(-1).x, [0]);
  assert.equal(occupancy.data.at(-1).name, "Dose starts");
  assert.ok(concentration.layout.shapes.some((shape) => shape.x0 === 1.5 / 24 && shape.line.dash === "dash"));
  assert.ok(occupancy.layout.shapes.some((shape) => shape.y0 === 90 && shape.y1 === 90));
});

test("target-site series are explicitly labeled as prescribed exposure", () => {
  const withSite = buildScientificPlot(result, "concentration", 0, { showTargetSite: true });
  assert.equal(withSite.data.filter((trace) => trace.name.includes("prescribed site")).length, 3);
  assert.deepEqual(withSite.data[1].y, result.scenarios[0].target_site_concentration_nM);
  assert.equal(withSite.data[1].line.dash, "dash");
});

test("concentration lines break at a hypothetical bolus while occupancy stays continuous", () => {
  const edited = structuredClone(result);
  const bolusTime = edited.time_h[20];
  edited.configuration.scenarios[1].administration = [
    { kind: "hypothetical_bolus", start_h: bolusTime, amount_mg: 100 },
  ];
  const concentration = buildScientificPlot(edited, "concentration", bolusTime);
  const occupancy = buildScientificPlot(edited, "occupancy", bolusTime);
  const alternativeLabel = edited.configuration.scenarios[1].label;
  const split = concentration.data.filter((trace) => trace.name === `${alternativeLabel} · central`);
  assert.equal(split.length, 2);
  assert.equal(split[0].x.at(-1), edited.time_h[19] / 24);
  assert.equal(split[1].x[0], bolusTime / 24);
  assert.equal(split[1].showlegend, false);
  assert.equal(occupancy.data.filter((trace) => trace.name === alternativeLabel).length, 1);
});
