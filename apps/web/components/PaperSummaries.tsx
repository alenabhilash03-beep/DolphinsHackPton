"use client";
import type { ExperimentConfig, PaperSummary } from "../lib/contracts";

export function PaperSummaries({ summaries, experiment }: { summaries: PaperSummary[]; experiment: ExperimentConfig }) {
  return <div className="paper-summaries"><h3>How the papers inform these plots</h3>
    <p>Reviewed summaries of the parameter sources. The plotted scenarios are model predictions, not digitized results from these papers.{experiment.mode === "custom" && " Current control edits are unreviewed hypothetical inputs; these papers describe the reference inputs."}</p>
    {summaries.map((summary) => {
      const source = experiment.sources.find((item) => item.source_id === summary.source_id);
      if (!source) return null;
      return <article className="paper-card" key={summary.source_id}>
        <span className="scope-badge">{summary.source_id} · Reviewed parameter source</span>
        <h3><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h3>
        <p>{summary.finding}</p><p><strong>Why it matters:</strong> {summary.hypothesis_relevance}</p>
        <p><strong>Connection to your curves:</strong> {summary.use_in_model}</p>
        <div className="paper-plot-links">{summary.plot_ids.map((id) => <a key={id} href={`#plot-${id}`}>View {id === "concentration" ? "PK concentration" : "occupancy"} plot →</a>)}</div>
        <p className="paper-limit"><strong>Limit:</strong> {summary.limitation}</p>
        <details><summary>Evidence locator</summary><p>{summary.locator} · parameter records: {summary.evidence_ids.join(", ")}</p></details>
      </article>;
    })}
  </div>;
}
