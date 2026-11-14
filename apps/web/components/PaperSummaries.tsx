"use client";
import type { ExperimentConfig, PaperSummary } from "../lib/contracts";

export function PaperSummaries({ summaries, experiment }: { summaries: PaperSummary[]; experiment: ExperimentConfig }) {
  return <div className="paper-summaries"><h3>How the papers inform these plots</h3>
    <p>Source-linked summaries of parameter inputs. Review status is shown for each source. The plotted scenarios are model predictions, not digitized results from these papers.{experiment.mode === "custom" && " Current control edits are unreviewed hypothetical inputs; these papers describe the reference inputs."}</p>
    {summaries.map((summary) => {
      const source = experiment.sources.find((item) => item.source_id === summary.source_id);
      if (!source) return null;
      const reviewed=summary.evidence_ids.every(id=>experiment.evidence.find(e=>e.evidence_id===id)?.review_status==="reviewed");
      return <article className="paper-card" key={summary.source_id}>
        <span className="scope-badge">{summary.source_id} · {reviewed ? "Reviewed reference inputs" : "Candidate source inputs · conditional"}</span>
        <h3><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></h3>
        <p className="paper-key-finding">{summary.finding}</p><details><summary>Hypothesis relevance & source locator</summary><p>{summary.hypothesis_relevance}</p><p>{summary.locator} · parameter records: {summary.evidence_ids.join(", ")}</p></details>
        <p><strong>Connection to your curves:</strong> {summary.use_in_model}</p>
        <div className="paper-plot-links">{summary.plot_ids.map((id) => <a key={id} href={`#plot-${id}`}>View {id === "concentration" ? "PK concentration" : "occupancy"} plot →</a>)}</div>
        <p className="paper-limit"><strong>Limit:</strong> {summary.limitation}</p>

      </article>;
    })}
  </div>;
}
