"use client";

import { memo } from "react";
import type { SimulationResult } from "../lib/contracts";
import { comparisonSummary, thresholdDescription } from "../lib/comparison-summary";
import { scenarioColor } from "../lib/plot-spec";

/** Current solver result only; all scientific numbers come from backend metrics. */
export const ScenarioComparison = memo(function ScenarioComparison({ result, busy }: { result: SimulationResult; busy: boolean }) {
  const config = result.configuration;
  const summary = comparisonSummary(result);
  const evidence = new Map(config.evidence.map((item) => [item.evidence_id, item]));
  const sourcesFor = (id: string): string[] => {
    const item = evidence.get(id);
    return [...new Set([...(item?.source_ids ?? []), ...(item?.parent_ids ?? []).flatMap(sourcesFor)])];
  };
  return <section aria-label="Scenario comparison">
    <h2>Compare the experiments</h2>
    <p>{config.mode === "custom" ? "Custom hypothetical comparison" : "Reviewed preset with hypothetical alternatives"} · {config.support.status} model scope.</p>
    <p role="status">{busy ? "Recalculating. The comparison below shows the last completed result." : `Showing completed result ${result.result_id}.`}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      {config.scenarios.map((scenario, index) => <article key={scenario.scenario_id} style={{ borderTop: `4px solid ${scenarioColor(scenario.scenario_id, index)}`, padding: 12, background: "#edf2e8" }}>
        <h3>{scenario.label}</h3>
        <p>{scenario.intervention === "baseline" ? "Protected reference scenario" : "Hypothetical intervention"}</p>
        <dl>
          <dt>Effective elimination half-life</dt><dd>{(scenario.pk.elimination_half_life_h / 24).toFixed(2)} days</dd>
          <dt>Model binding affinity KD</dt><dd>{scenario.binding.affinity_nM.toPrecision(4)} nM</dd>
          <dt>Association / dissociation</dt><dd>{scenario.binding.association_nM_inv_h_inv.toPrecision(4)} nM⁻¹ h⁻¹ / {scenario.binding.dissociation_h_inv.toPrecision(4)} h⁻¹</dd>
          <dt>Administration</dt><dd>{scenario.administration.length} event(s) · first amount {scenario.administration[0].amount_mg.toFixed(1)} mg</dd>
        </dl>
        <details><summary>Input evidence</summary><ul>{["pk.elimination_half_life_h", "binding.affinity_nM"].map((path) => {
          const item = evidence.get(scenario.parameter_evidence[path]);
          return item && <li key={path}>{item.parameter}: <strong>{item.provenance}</strong> · {item.applicability} · {item.review_status}
            {item.source_ids?.length ? ` · ${item.source_ids.join(", ")}` : ""}
            {item.parent_ids?.length ? ` · derived from ${item.parent_ids.join(", ")}` : ""}</li>;
        })}</ul></details>
        <p>Evidence sources: {[...new Set(Object.values(scenario.parameter_evidence).flatMap(sourcesFor))].map((id) => {
          const source = config.sources.find((item) => item.source_id === id);
          return source && <a key={id} href={source.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{id}</a>;
        })}</p>
      </article>)}
    </div>
    <h3>Numerical comparison over {(config.duration_h / 24).toFixed(1)} days</h3>
    <p>Occupancy AUC integrates the occupied fraction over time; its day unit is not a measured duration of biological benefit. The {(config.occupancy_threshold * 100).toFixed(1)}% threshold is analytical.</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
      <caption>Metrics computed by the deterministic numerical engine</caption>
      <thead><tr>{["Scenario", "Endpoint occupancy", "Occupancy AUC (days)", "Central concentration AUC (nM·h)", "Time above threshold (days)", "Threshold outcome"].map((label) => <th key={label} scope="col" style={{ padding: 8 }}>{label}</th>)}</tr></thead>
      <tbody>{result.scenarios.map((series) => <tr key={series.scenario_id}>
        <th scope="row" style={{ padding: 8 }}>{config.scenarios.find((scenario) => scenario.scenario_id === series.scenario_id)?.label}</th>
        <td>{(series.metrics.endpoint_occupancy * 100).toFixed(2)}%</td>
        <td>{(series.metrics.occupancy_auc_h / 24).toFixed(3)}</td>
        <td>{series.metrics.concentration_auc_nM_h.toPrecision(5)}</td>
        <td>{(series.metrics.threshold.total_time_above_h / 24).toFixed(3)}</td>
        <td>{thresholdDescription(series.metrics.threshold)}</td>
      </tr>)}</tbody>
    </table></div>
    <h3>What the current model predicts</h3>
    <ul>{summary.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul>
    <h3>Experiments that could test these assumptions</h3>
    <ul>{summary.followUps.map((item) => <li key={item}>{item}</li>)}</ul>
    <details><summary>Model assumptions and warnings</summary>
      <ul>{config.assumptions.map((item) => <li key={item.assumption_id}>{item.description}</li>)}</ul>
      <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </details>
  </section>;
});
