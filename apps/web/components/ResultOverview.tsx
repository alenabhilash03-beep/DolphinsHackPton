"use client";

import { memo } from "react";
import type { SimulationResult } from "../lib/contracts";
import { comparisonSummary, thresholdDescription } from "../lib/comparison-summary";
import { scenarioColor } from "../lib/plot-spec";

/** Endpoint metrics are server-computed; no efficacy or retention winner is inferred. */
export const ResultOverview = memo(function ResultOverview({ result, busy }: { result: SimulationResult; busy: boolean }) {
  const summary = comparisonSummary(result);
  const baseline = result.scenarios[0].metrics.endpoint_occupancy;
  return <section className="result-overview" aria-label="Key simulation findings">
    <div className="overview-heading"><div><p className="eyebrow">Result snapshot</p><h2>What changes at {(result.configuration.duration_h / 24).toFixed(0)} days?</h2></div><span className="scope-badge">{busy ? "Updating · last result shown" : "Conditional model prediction"}</span></div>
    <div className="outcome-grid">{result.scenarios.map((series, index) => {
      const scenario = result.configuration.scenarios.find(item => item.scenario_id === series.scenario_id)!;
      const delta = (series.metrics.endpoint_occupancy - baseline) * 100;
      return <article className="outcome-card" key={series.scenario_id} style={{borderTopColor:scenarioColor(series.scenario_id,index)}}>
        <span className="outcome-name">{scenario.label}</span><strong>{(series.metrics.endpoint_occupancy * 100).toFixed(2)}<small>%</small></strong>
        <span className="outcome-unit">Endpoint target occupancy</span>
        <p className="outcome-delta">{index === 0 ? "Protected baseline" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} percentage points vs baseline`}</p>
        <span className="outcome-threshold">{thresholdDescription(series.metrics.threshold)}</span>
      </article>;
    })}</div>
    <div className="finding-callout"><span aria-hidden="true">↳</span><p><strong>Interpretation boundary</strong>{summary.claims[summary.claims.length - 2]} <span>Occupancy alone does not establish efficacy or safety.</span></p></div>
  </section>;
});
