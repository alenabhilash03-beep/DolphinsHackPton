/** Presentation logic for the grounded scientific answer. Pure: no fetching, no invented text or numbers. */ export const METRIC_LABELS = {
    endpoint_occupancy: "Endpoint occupancy",
    occupancy_auc_h: "Occupancy AUC",
    concentration_auc_nM_h: "Concentration AUC",
    threshold_status: "Threshold outcome",
    total_time_above_h: "Time above threshold"
};
export const metricPlot = (metric)=>metric === "concentration_auc_nM_h" ? "concentration" : "occupancy";
export const parameterPlots = (parameter)=>parameter.startsWith("pk.") ? [
        "concentration",
        "occupancy"
    ] : [
        "occupancy"
    ];
function solverField(result, scenarioId, metric) {
    const metrics = result.scenarios.find((item)=>item.scenario_id === scenarioId)?.metrics;
    if (!metrics) return undefined;
    return metric === "threshold_status" ? metrics.threshold.status : metric === "total_time_above_h" ? metrics.threshold.total_time_above_h : metrics[metric];
}
const quantitiesOf = (synthesis)=>[
        ...synthesis.answer?.quantities ?? [],
        ...(synthesis.simulation_implications ?? []).flatMap((item)=>item.quantities)
    ];
/** The server validates linkage; the browser re-checks before showing any number beside a claim. */ export function synthesisLinked(turn) {
    const synthesis = turn.synthesis;
    if (!synthesis) return false;
    const result = turn.result ?? null;
    if (synthesis.result_id == null) return result == null && quantitiesOf(synthesis).length === 0;
    if (!result || synthesis.result_id !== result.result_id || synthesis.configuration_sha256 !== result.configuration_hash || synthesis.experiment_id !== result.configuration.experiment_id || synthesis.client_revision !== result.client_revision) return false;
    return quantitiesOf(synthesis).every((q)=>q.result_id === result.result_id && (q.metric === "threshold_status" ? q.status : q.value) === solverField(result, q.scenario_id, q.metric));
}
/** Current only for the exact displayed result; a direct control edit makes an earlier answer stale. */ export function answerState(turn, shown) {
    if (!turn?.synthesis) return "none";
    if (!synthesisLinked(turn)) return "invalid";
    const synthesis = turn.synthesis;
    if (synthesis.result_id == null) return "evidence_only";
    return shown && shown.result_id === synthesis.result_id && shown.configuration_hash === synthesis.configuration_sha256 && shown.client_revision === synthesis.client_revision ? "current" : "stale";
}
export function verdictLabel(synthesis) {
    const answer = synthesis.answer;
    if (!answer) return synthesis.status === "rejected" ? "Written answer not accepted" : "Written answer unavailable";
    const basis = {
        conditional_simulation: "by the conditional simulation",
        paper_evidence: "by inspected paper passages",
        paper_evidence_and_conditional_simulation: "by inspected passages and the conditional simulation",
        none: ""
    }[answer.basis];
    const verdict = {
        supported: "Supported",
        not_supported: "Not supported",
        mixed: "Mixed",
        undetermined: "Not determined"
    }[answer.verdict];
    return answer.verdict === "undetermined" || !basis ? verdict : `${verdict} ${basis}`;
}
export const basisLabel = (synthesis)=>({
        research_and_simulation: "Inspected papers + numerical simulation",
        research_only: "Inspected papers only · no simulation was run",
        simulation_only: "Numerical simulation only · no papers inspected in this turn",
        none: "No papers or simulation available"
    })[synthesis.basis];
/** Deduplicated solver values referenced by the answer and its implications, in first-mention order. */ export function keyQuantities(turn) {
    const synthesis = turn.synthesis, result = turn.result;
    if (!synthesis || !result) return [];
    const chips = new Map();
    for (const q of quantitiesOf(synthesis)){
        const key = `${q.scenario_id}:${q.metric}`;
        if (chips.has(key)) continue;
        const status = result.scenarios.find((item)=>item.scenario_id === q.scenario_id)?.metrics.threshold.status;
        chips.set(key, {
            key,
            scenarioId: q.scenario_id,
            metric: METRIC_LABELS[q.metric],
            display: q.display,
            plot: metricPlot(q.metric),
            scenario: result.configuration.scenarios.find((item)=>item.scenario_id === q.scenario_id)?.label ?? q.scenario_id,
            // Time above threshold is cut off by the observation window when the scenario never drops below it.
            censored: q.metric === "total_time_above_h" && status === "still_above_at_horizon"
        });
    }
    return [
        ...chips.values()
    ];
}
/** Connect a cited passage to its paper card, extracted candidates, plots and any simulation parameter record. */ export function findingLinks(turn, finding) {
    const seen = new Set();
    return finding.citations.filter((c)=>!seen.has(c.document_id) && seen.add(c.document_id)).map((citation)=>{
        const paper = (turn.research_papers ?? []).find((item)=>item.document_id === citation.document_id);
        const access = (turn.synthesis?.source_access ?? []).find((item)=>item.document_id === citation.document_id);
        const records = (turn.result?.configuration.evidence ?? []).filter((item)=>(item.source_ids ?? []).includes(citation.source_id));
        return {
            documentId: citation.document_id,
            title: paper?.source.title ?? access?.title ?? citation.source_id,
            url: paper?.source.url ?? null,
            anchor: `paper-${citation.document_id}`,
            access: citation.content_kind === "abstract" ? "Abstract only" : citation.content_kind === "full_text" ? "Full-text passage" : citation.content_kind.replaceAll("_", " "),
            simulationUse: !turn.result ? "No simulation was run from this source." : records.length ? "This source supplies simulation inputs listed below." : paper?.use_in_simulation === "reviewed_reference_separate" ? "Not a simulation input: the curves use separately audited reference values." : "Not a simulation input for the displayed curves.",
            // A candidate already used as a simulation input is listed once, as its parameter record.
            candidates: (paper?.extraction.parameters ?? []).filter((item)=>!records.some((record)=>record.parameter === item.parameter)).map((item)=>({
                    parameter: item.parameter,
                    text: `${item.parameter} = ${item.original_value} ${item.original_unit}`,
                    plots: parameterPlots(item.parameter)
                })),
            records: records.map((item)=>({
                    evidenceId: item.evidence_id,
                    text: `${item.parameter} = ${item.original_value} ${item.original_unit} · ${item.review_status}`,
                    plots: parameterPlots(item.parameter)
                }))
        };
    });
}
/** One-line access summary that keeps abstract-only limits visible beside the answer. */ export function accessSummary(synthesis) {
    const sources = synthesis.source_access ?? [];
    if (!sources.length) return null;
    const abstracts = sources.filter((item)=>item.content_kind === "abstract").length;
    return `${sources.length} source${sources.length === 1 ? "" : "s"} inspected` + (abstracts ? ` · ${abstracts} abstract-only` : " · full-text passages");
}
const residueText = (r)=>`${r.residue_name} ${r.chain}:${r.residue_number}${r.insertion_code ?? ""}`;
/** One card per measurement the agent obtained; values are the server's, shown to three decimals as in the viewer. */ export function measurementCards(turn) {
    const structure = turn?.structure, pdbId = structure?.metadata?.provenance?.pdb_id;
    if (!structure || structure.status !== "available" || !pdbId) return [];
    return (structure.measurements ?? []).map((item)=>{
        const c = item.contact, side = (r)=>({
                chain: r.chain,
                resi: r.residue_number,
                icode: r.insertion_code ?? ""
            });
        return {
            id: item.measurement_id,
            pdbId,
            drug: residueText(c.drug_residue),
            target: residueText(c.target_residue),
            atoms: `${c.drug_atom.name} ↔ ${c.target_atom.name}`,
            distance: `${c.distance_angstrom.toFixed(3)} Å`,
            withinCutoff: c.within_cutoff,
            origin: item.kind === "interface_contact" ? "Closest interface contact" : "Agent-requested residue distance",
            focus: {
                pdbId,
                drug: side(c.drug_residue),
                target: side(c.target_residue)
            }
        };
    });
}
/** Cards cited by a structural statement must be measurements of this turn; otherwise the statement is not shown. */ export function structuralObservations(turn) {
    const cards = new Map(measurementCards(turn).map((card)=>[
            card.id,
            card
        ]));
    const made = new Map((turn?.structure?.measurements ?? []).map((item)=>[
            item.measurement_id,
            item
        ]));
    return (turn?.synthesis?.structural_context ?? []).flatMap((item)=>{
        const linked = item.measurements.every((m)=>JSON.stringify(made.get(m.measurement_id)) === JSON.stringify(m));
        return linked ? [
            {
                statement: item.statement,
                cards: item.measurements.map((m)=>cards.get(m.measurement_id))
            }
        ] : [];
    });
}
/** The viewer can show a measurement only for the structure it currently displays. */ export const VIEWER_PDB = {
    trastuzumab: "1N8Z",
    imatinib: "1IEP",
    unavailable: null
};
export function canFocus(card, viewer) {
    return VIEWER_PDB[viewer] === card.pdbId;
}
