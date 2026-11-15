import type { AgentTurn } from "../lib/contracts";
import { plural, unitLabel } from "../lib/investigation";

export function ResearchPaperReview({ papers }: { papers: NonNullable<AgentTurn["research_papers"]> }) {
  if (!papers.length) return null;
  return <section className="research-panel" aria-label="Papers inspected in this run">
    <p className="eyebrow">Live literature review</p><h2>Papers read & values extracted</h2>
    {papers.map(paper => <article key={paper.document_id} id={`paper-${paper.document_id}`} style={{scrollMarginTop:88}}>
      <h3><a href={paper.source.url} target="_blank" rel="noreferrer">{paper.source.title} ↗</a></h3>
      <p>{paper.source.content_kind === "abstract" ? "Abstract only" : "Bounded full-text passages"} · {paper.source.retrieval_status} · {plural((paper.extraction.parameters ?? []).length,"cited candidate value")}</p>
      {paper.use_in_simulation === "reviewed_reference_separate" && <p className="scope-note">These papers were inspected in this run. The simulation uses the separately audited reference inputs shown with the graphs; these fresh candidates did not replace them.</p>}
      {paper.extraction.status === "no_values" && <p>No supported numerical parameters were found in the inspected passages. This does not mean the whole paper or wider literature lacks relevant data.</p>}
      {paper.extraction.status === "unavailable" && <p>Extraction could not be completed. No values from this attempt were accepted.</p>}
      {paper.extraction.status === "rejected" && <p>The extraction produced no accepted candidates after source checks.</p>}
      <details><summary>Inspect extracted values & source passages</summary>
        {(paper.extraction.parameters ?? []).map(value => <div key={value.parameter_id}>
          <p><strong>{value.parameter}: {value.original_value} {unitLabel(value.original_unit)}</strong> · reported candidate · applicability not yet approved</p>
          {value.passages?.map((passage, index) => <blockquote key={index}>{passage.supporting_passage}<br/><small>{passage.locator}</small></blockquote>)}
        </div>)}
        <p>Inspected locators: {paper.inspected_locators.join(", ")}</p>
        {(paper.extraction.rejected_candidates ?? []).map((reason,index) => <p key={index}>{reason}</p>)}
        {(paper.extraction.notes ?? []).map((note,index) => <p key={index}>{note}</p>)}
      </details>
    </article>)}
  </section>;
}
