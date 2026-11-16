"use client";
/**
 * A research run that ended without a simulation still presents everything it gathered: the question, the
 * evidence-only answer, every paper (with Delve deeper), the cited values extracted, and the verified structure.
 * What a simulation would still need is listed last, collapsed, instead of being the headline.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { AgentTurn } from "../lib/contracts";
import { listPapers, type ListedPaper } from "../lib/paper-list";
import { PaperList, PaperReader } from "./PaperReader";
import { ResearchPaperReview } from "./ResearchPaperReview";
import { ScientificAnswer } from "./ScientificAnswer";
import type { MeasurementCard, VIEWER_PDB } from "../lib/synthesis-view";

export function EvidenceReport({ turn, question, system, structure, viewer = "unavailable", onFocusMeasurement, needs }: {
  turn: AgentTurn; question: string; system: string; structure?: ReactNode;
  viewer?: keyof typeof VIEWER_PDB; onFocusMeasurement?: (card: MeasurementCard) => void; needs?: ReactNode;
}) {
  const [reader, setReader] = useState<ListedPaper | null>(null);
  const papers = useMemo(() => listPapers(turn as Parameters<typeof listPapers>[0], null), [turn]);
  const values = (turn.research_papers ?? []).reduce((count, paper) => count + (paper.extraction?.parameters?.length ?? 0), 0);
  const structureFound = turn.structure?.status === "available";
  return <div className="investigation-view evidence-report" id="answer">
    <section className="investigation-question" aria-label="Question"><p className="eyebrow">Question</p><h2>{question}</h2>
      <dl><div><dt>System</dt><dd>{system}</dd></div><div><dt>Papers read</dt><dd>{papers.length}</dd></div>
        <div><dt>Cited values</dt><dd>{values}</dd></div><div><dt>Structure</dt><dd>{structureFound ? `PDB ${turn.structure?.metadata?.provenance?.pdb_id ?? ""}` : "None verified"}</dd></div>
        <div><dt>Simulation</dt><dd>Not run · inputs incomplete</dd></div></dl></section>
    <ScientificAnswer turn={turn} shown={null} viewer={viewer} onFocusMeasurement={onFocusMeasurement} questionShown/>
    {!turn.synthesis?.answer && !(turn.synthesis?.evidence_findings ?? []).length && <section className="investigation-block evidence-report-note">
      <h2>What the agent found</h2><p>The evidence below was gathered for this question. No written answer passed validation, so the papers, values and structure are presented as found.</p></section>}
    {reader ? <PaperReader paper={reader} onClose={() => setReader(null)}/> : <PaperList papers={papers} onOpen={setReader}/>}
    {values > 0 && <details className="science-records" open><summary>Values extracted from the papers <span>{values}</span></summary><ResearchPaperReview papers={turn.research_papers ?? []}/></details>}
    {structureFound && structure && <section className="investigation-block evidence-report-structure"><h2>Experimental structure</h2>{structure}</section>}
    {needs && <details className="science-records"><summary>To run a simulation, the model still needs <span>optional</span></summary>{needs}</details>}
  </div>;
}
