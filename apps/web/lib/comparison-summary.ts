/** Conclusions depend only on validated solver metrics, including censoring states. */
import type { SimulationResult } from "./contracts";

export function thresholdDescription(threshold: SimulationResult["scenarios"][number]["metrics"]["threshold"]): string {
  switch (threshold.status) {
    case "still_above_at_horizon": return "Still above at horizon; loss time is censored";
    case "never_reached": return "Threshold never reached";
    case "ambiguous_without_more_resolution": return "Crossing unresolved; no retention ranking";
    case "crossed_within_window": return threshold.first_subsequent_downward_crossing_h == null
      ? "Crossed within window; no subsequent downward crossing reported"
      : `First subsequent loss at ${(threshold.first_subsequent_downward_crossing_h / 24).toFixed(2)} days`;
  }
}

export function comparisonSummary(result: SimulationResult): { claims: string[]; followUps: string[] } {
  const config = result.configuration;
  const baseline = result.scenarios[0];
  const alternatives = result.scenarios.slice(1);
  const claims = alternatives.map((series) => {
    const label = config.scenarios.find((scenario) => scenario.scenario_id === series.scenario_id)?.label ?? series.scenario_id;
    const delta = (series.metrics.endpoint_occupancy - baseline.metrics.endpoint_occupancy) * 100;
    return `${label}: endpoint occupancy is ${(series.metrics.endpoint_occupancy * 100).toFixed(2)}% at ${(config.duration_h / 24).toFixed(1)} days (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} percentage points versus baseline).`;
  });
  if (alternatives.some((series) => series.metrics.threshold.status === "still_above_at_horizon")) {
    claims.push("At least one alternative is still above the analytical threshold at the horizon. Its loss time is censored, so these results do not establish which alternative retains occupancy longest.");
  } else if (alternatives.some((series) => series.metrics.threshold.status === "ambiguous_without_more_resolution")) {
    claims.push("A threshold crossing is unresolved. Resolve it before comparing retention times.");
  } else {
    claims.push("Threshold times describe only the configured schedule and observation window; repeated dosing may produce multiple intervals above threshold.");
  }
  claims.push("These are predictions of a conditional exposure and binding model. Target occupancy alone does not establish efficacy or safety.");
  const followUps = [
    "Measure free drug exposure at relevant HER2 target sites to test the prescribed target-exposure assumption.",
    "Measure matched intact-antibody binding kinetics at 37 °C before transferring the apparent assay rates to a biological setting.",
    "Measure PK and binding together for engineered variants to test the assumption that half-life and affinity can change independently.",
  ];
  if (result.scenarios.some((series) => series.metrics.threshold.status === "still_above_at_horizon")) {
    followUps.unshift("Extend the washout observation window to resolve the censored occupancy-loss times.");
  }
  return { claims, followUps };
}
