"use client";

import type { AgentTurn, SimulationResult } from "../lib/contracts";
import { accessSummary, answerState, basisLabel, canFocus, findingLinks, keyQuantities, measurementCards, structuralObservations, verdictLabel, VIEWER_PDB, type MeasurementCard, type PlotId, type QuantityChip } from "../lib/synthesis-view";
import { locatorLabel, readableText } from "../lib/readable";

const STANCE = { supports: "Supports the hypothesis", contradicts: "Contradicts the hypothesis", context: "Context" } as const;
const KIND = { measurement: "Measurement", simulation_change: "Simulation change", literature_review: "Literature review" } as const;
const plotName = (id: PlotId) => id === "concentration" ? "concentration plot" : "occupancy plot";

function Chips({ chips }: { chips: QuantityChip[] }) {
  return <ul className="answer-chips">{chips.map(chip => <li key={chip.key}><a href={`#plot-${chip.plot}`} title={`Show the ${plotName(chip.plot)}`}>
    <span>{chip.scenario} · {chip.metric}</span><strong>{chip.display}</strong>{chip.censored && <em>cut off by the observation window</em>}</a></li>)}</ul>;
}

/** Agent-measured coordinate pairs; a card opens the same residues and distance in the molecular viewer. */
export function MeasurementCards({ cards, viewer, onFocus }: { cards: MeasurementCard[]; viewer: keyof typeof VIEWER_PDB; onFocus?: (card: MeasurementCard) => void }) {
  return <ul className="measurement-cards">{cards.map(card => <li key={card.id}>
    <span className="measurement-id">{card.id} · {card.origin}</span>
    <strong>{card.drug} ↔ {card.target}</strong>
    <span className="measurement-distance">{card.distance}<small>{card.atoms} · {card.withinCutoff ? "within 4 Å" : "beyond 4 Å"} · PDB {card.pdbId}</small></span>
    {onFocus && canFocus(card, viewer) ? <button type="button" onClick={() => onFocus(card)}>Show in structure →</button>
      : <small>Not available in the current structure view.</small>}
  </li>)}</ul>;
}

/** One answer above its supporting detail. Prose is server-validated; every number shown is a solver field. */
export function ScientificAnswer({ turn, shown, viewer = "unavailable", onFocusMeasurement, questionShown = false }: { turn: AgentTurn | null; shown: SimulationResult | null;
  viewer?: keyof typeof VIEWER_PDB; onFocusMeasurement?: (card: MeasurementCard) => void; questionShown?: boolean }) {
  const state = answerState(turn, shown);
  if (state === "none" || !turn?.synthesis) return null;
  if (state === "invalid") return <section id="answer" className="answer-panel" aria-label="Scientific answer">
    <p role="alert">The written answer for this run could not be matched to its numerical result, so it is not shown. The curves and evidence below are unaffected.</p></section>;
  const synthesis = turn.synthesis, stale = state === "stale";
  const chips = keyQuantities(turn), byKey = new Map(chips.map(chip => [chip.key, chip]));
  const implications = synthesis.simulation_implications ?? [], findings = synthesis.evidence_findings ?? [];
  const disagreements = synthesis.disagreements ?? [], missing = synthesis.missing_evidence ?? [];
  const limitations = synthesis.limitations ?? [], next = synthesis.next_experiments ?? [], access = accessSummary(synthesis);
  const cards = measurementCards(turn), observations = structuralObservations(turn), cited = new Set(observations.flatMap(item => item.cards.map(card => card.id)));
  const uncited = cards.filter(card => !cited.has(card.id)), notMeasured = turn.structure?.not_measured ?? [];
  return <section id="answer" className={`answer-panel${stale ? " is-stale" : ""}`} aria-label="Scientific answer">
    <div className="answer-summary">
    <div className="answer-heading"><div>{questionShown ? <h2 className="answer-title">Answer</h2> : <><p className="eyebrow">Scientific answer</p><h2>{synthesis.original_text}</h2></>}</div>
      <div className="answer-badges"><span className="answer-verdict" data-verdict={synthesis.answer?.verdict ?? synthesis.status}>{verdictLabel(synthesis,!!turn?.parent_result_id)}</span><span className="answer-basis">{basisLabel(synthesis)}</span></div></div>
    {turn.applied_proposal && <p className="answer-origin">Follow-up experiment run from a proposal: <strong>{turn.applied_proposal.title}</strong>. {turn.applied_proposal.changes.map(change => `${change.parameter}${change.scenario_label ? ` (${change.scenario_label})` : ""}: ${change.from_display} → ${change.to_display}`).join("; ")}. Run from result {turn.applied_proposal.base_result_id}.</p>}
    {!turn.applied_proposal && turn.original_text !== synthesis.original_text && <p className="answer-origin">Change applied to reach this result: <strong>{turn.original_text}</strong>. The answer addresses the investigation's original question with this result.</p>}
    {stale && <p className="answer-stale" role="status"><strong>This answer describes an earlier result.</strong> The curves below now reflect {shown ? "your direct parameter changes" : "a different experiment"}, so its solver values and simulation statements no longer apply.{findings.length ? " Paper findings are unchanged." : ""} Use <a href="#revise">Change the experiment in words</a> or new research to get an answer for the current curves.</p>}
    {state === "evidence_only" && shown && <p className="scope-note">No simulation was run for this question. The curves below belong to an earlier experiment and are not part of this answer.</p>}
    {synthesis.answer ? <p className="answer-statement">{synthesis.answer.statement}</p>
      : <p className="answer-unavailable">{synthesis.notes?.[0] ?? "No written answer was accepted for this run."} {turn.result ? "The numerical result, plots and evidence below are unaffected." : "Evidence gathered in this run is listed below."}</p>}
    {synthesis.answer && (synthesis.notes ?? []).map((note, index) => <p className="answer-access-note" key={index}>{note}</p>)}
    </div>
    {chips.length > 0 && <section className="answer-solver" aria-label="Key solver findings">
      <div className="answer-section-heading"><h3>Key solver findings</h3><span>{stale ? "From the earlier result · not the displayed curves" : "Conditional model predictions · values copied from the solver"}</span></div>
      {implications.length ? <ul className="answer-implications">{implications.map((item, index) => <li key={index}><p>{item.statement}</p>
        <Chips chips={[...new Map(item.quantities.map(q => [`${q.scenario_id}:${q.metric}`, byKey.get(`${q.scenario_id}:${q.metric}`)!])).values()].filter(Boolean)}/></li>)}</ul> : <Chips chips={chips}/>}
    </section>}
    {findings.length > 0 && <details className="answer-detail" open><summary>What the inspected papers report <span>{findings.length} finding{findings.length === 1 ? "" : "s"}{access ? ` · ${access}` : ""}</span></summary>
      {findings.map(finding => <article className="answer-finding" key={finding.finding_id} data-stance={finding.stance}>
        <p><span className="answer-stance">{STANCE[finding.stance]}</span>{finding.abstract_only && <span className="answer-access">Abstract only</span>} {finding.statement}</p>
        {finding.citations.map((citation, index) => <blockquote key={index}>“{citation.quote}”<small>{citation.content_kind === "abstract" ? "Abstract" : locatorLabel(citation.locator)}</small></blockquote>)}
        {findingLinks(turn, finding).map(link => <div className="answer-links" key={link.documentId}>
          <p>{link.url ? <a href={link.url} target="_blank" rel="noreferrer">{link.title} ↗</a> : link.title} · <a href={`#${link.anchor}`}>extraction record ↓</a></p>
          <p>{link.simulationUse}{!link.records.length && turn.result ? <> <a href="#paper-evidence">Simulation input sources →</a></> : null}</p>
          {link.records.length > 0 && <details className="answer-inputs" open={link.records.length <= 3}><summary>{link.records.length} simulation input{link.records.length === 1 ? "" : "s"} from this source</summary>
            <ul>{link.records.map(record => <li key={record.evidenceId} title={`Parameter record ${record.evidenceId}`}>{readableText(record.text)} · {record.plots.map(id => <a key={id} href={`#plot-${id}`}>{plotName(id)} →</a>)}</li>)}</ul></details>}
          {link.candidates.length > 0 && <ul>{link.candidates.map((candidate, index) => <li key={index}>Extracted candidate: {readableText(candidate.text)} · {turn.result
            ? <>informs the {candidate.plots.map(id => <a key={id} href={`#plot-${id}`}>{plotName(id)} →</a>)}</>
            // Without a simulation there are no curves of this question to link to.
            : `would inform the ${candidate.plots.map(plotName).join(" and ")} once a simulation can run`}</li>)}</ul>}
        </div>)}
      </article>)}
    </details>}
    {!findings.length && access && <p className="answer-access-note">{access}. {synthesis.status === "grounded" ? "No paper finding was cited for this answer." : "No paper finding was accepted."}</p>}
    {(turn.structure || synthesis.structure_note) && <section className="answer-structure" aria-label="Structural context">
      <div className="answer-section-heading"><h3>Structural context</h3><span>{cards.length ? `Agent-measured coordinates · PDB ${cards[0].pdbId} · geometry only` : "No verified structure for this drug and target"}</span></div>
      {synthesis.structure_note && <p className="answer-structure-note">{synthesis.structure_note}</p>}
      {observations.map((item, index) => <div className="answer-observation" key={index}><p>{item.statement}</p><MeasurementCards cards={item.cards} viewer={viewer} onFocus={onFocusMeasurement}/></div>)}
      {uncited.length > 0 && (observations.length ? <details className="answer-detail"><summary>Other agent measurements <span>{uncited.length}</span></summary><MeasurementCards cards={uncited} viewer={viewer} onFocus={onFocusMeasurement}/></details>
        : <MeasurementCards cards={uncited} viewer={viewer} onFocus={onFocusMeasurement}/>)}
      {notMeasured.length > 0 && <ul className="answer-not-measured">{notMeasured.map((note, index) => <li key={index}>Not measured: {note}</li>)}</ul>}
      {cards.length > 0 && <p className="answer-access-note">Distances are between heavy atoms in deposited coordinates. They do not establish hydrogen bonds, binding energy, affinity or kinetic rates.</p>}
    </section>}
    {disagreements.length > 0 && <section className="answer-disagreements" aria-label="Disagreements in the evidence"><h3>Where the evidence disagrees</h3>
      <ul>{disagreements.map((item, index) => <li key={index}>{readableText(item.statement)}{item.finding_ids?.length ? <small> Findings {item.finding_ids.join(", ")}</small> : <small> Competing extracted candidates</small>}</li>)}</ul></section>}
    {next.length > 0 && <section className="answer-next" aria-label="Hypotheses needing validation"><div className="answer-section-heading"><h3>What to test next</h3><span>Hypotheses needing experimental validation</span></div>
      <ul>{next.map((item, index) => <li key={index}><span className="answer-kind">{KIND[item.kind]}</span><p>{readableText(item.proposal)}</p><small>{readableText(item.rationale)}</small></li>)}</ul></section>}
    {missing.length > 0 && <details className="answer-detail"><summary>Missing evidence <span>{missing.length}</span></summary><ul>{missing.map((item, index) => <li key={index}>{readableText(item.statement)}</li>)}</ul></details>}
    {limitations.length > 0 && <details className="answer-detail"><summary>Limitations of this answer <span>{limitations.length}</span></summary><ul>{limitations.map((item, index) => <li key={index}>{readableText(item)}</li>)}</ul></details>}
    {(synthesis.source_access ?? []).some(item => item.limitation) && <details className="answer-detail"><summary>Source access <span>{access}</span></summary>
      <ul>{(synthesis.source_access ?? []).map(item => <li key={item.document_id}><a href={`#paper-${item.document_id}`}>{item.title}</a> · extraction {item.extraction_status.replaceAll("_", " ")}{item.limitation ? ` · ${item.limitation}` : ""}</li>)}</ul></details>}
  </section>;
}
