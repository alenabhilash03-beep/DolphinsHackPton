/** Exact reads from the simulator's shared sample array; the UI never invents values. */

import type { SimulationResult } from "./contracts";

export interface ScenarioReadout {
  scenarioId: string;
  label: string;
  centralConcentrationNM: number;
  targetSiteConcentrationNM: number;
  occupancyFraction: number;
}

export interface TimelineReadout {
  index: number;
  timeHours: number;
  timeDays: number;
  scenarios: ScenarioReadout[];
}

export function nearestTimeIndex(times: readonly number[], timeHours: number): number {
  if (times.length === 0) return 0;
  if (!Number.isFinite(timeHours) || timeHours <= times[0]) return 0;
  const last = times.length - 1;
  if (timeHours >= times[last]) return last;
  let low = 0;
  let high = last;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] <= timeHours) low = middle;
    else high = middle;
  }
  return timeHours - times[low] <= times[high] - timeHours ? low : high;
}

export function readoutAtIndex(result: SimulationResult | null, index: number): TimelineReadout | null {
  if (!result || result.time_h.length === 0) return null;
  const resolved = Math.min(result.time_h.length - 1, Math.max(0, Math.floor(index)));
  const labels = new Map(result.configuration.scenarios.map((scenario) => [scenario.scenario_id, scenario.label]));
  return {
    index: resolved,
    timeHours: result.time_h[resolved],
    timeDays: result.time_h[resolved] / 24,
    scenarios: result.scenarios.map((scenario) => ({
      scenarioId: scenario.scenario_id,
      label: labels.get(scenario.scenario_id) ?? scenario.scenario_id,
      centralConcentrationNM: scenario.central_concentration_nM[resolved],
      targetSiteConcentrationNM: scenario.target_site_concentration_nM[resolved],
      occupancyFraction: scenario.occupancy[resolved],
    })),
  };
}
