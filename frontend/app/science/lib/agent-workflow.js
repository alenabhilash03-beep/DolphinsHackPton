/**
 * View model for the live agent-workflow screen (5C.3). Pure: every stage, paper, value and metric comes from
 * recorded execution events (and, once complete, the turn). Nothing advances on a timer.
 */ import { changedParameters, investigationView, parameterLabel, scientificNumber, toolLabel, unitLabel } from "./investigation.js";
export const WORKFLOW_STAGES = [
    {
        id: "question",
        label: "Question",
        doing: "Resolving drug, target and required inputs"
    },
    {
        id: "search",
        label: "Literature search",
        doing: "Searching Europe PMC"
    },
    {
        id: "reading",
        label: "Reading papers",
        doing: "Retrieving source text"
    },
    {
        id: "extraction",
        label: "Cited extraction",
        doing: "Extracting values with exact source checks"
    },
    {
        id: "model",
        label: "Model inputs",
        doing: "Assembling and validating the experiment"
    },
    {
        id: "simulation",
        label: "Simulation",
        doing: "Solving exposure and binding equations"
    },
    {
        id: "structure",
        label: "3D structure",
        doing: "Measuring the experimental drug–target interface"
    },
    {
        id: "answer",
        label: "Grounded answer",
        doing: "Writing an answer that cites every claim"
    }
];
const STAGE_OF = {
    start_experiment_preparation: "question",
    read_experiment_preparation: "question",
    read_current_experiment: "question",
    search_hypothesis_evidence: "search",
    retrieve_evidence_source: "reading",
    extract_cited_parameters: "extraction",
    update_experiment_preparation: "model",
    configure_prepared_experiment: "model",
    prepare_reviewed_comparison: "model",
    apply_requested_edit: "model",
    simulate_current_comparison: "simulation",
    inspect_verified_structure: "structure",
    measure_structure_residue: "structure",
    interpret_current_result: "answer",
    synthesize_grounded_answer: "answer"
};
const RESEARCH_ONLY = [
    "search",
    "reading",
    "extraction"
];
/** Convert a reported value to the model's canonical unit for the same parameter, or null if unknown. */ const UNIT_FACTORS = {
    "h": 1,
    "hour": 1,
    "hours": 1,
    "hr": 1,
    "day": 24,
    "days": 24,
    "d": 24,
    "min": 1 / 60,
    "minutes": 1 / 60,
    "L": 1,
    "l": 1,
    "mL": 1e-3,
    "ml": 1e-3,
    "L/h": 1,
    "L/hour": 1,
    "L/hr": 1,
    "L/day": 1 / 24,
    "L/d": 1 / 24,
    "mL/h": 1e-3,
    "mL/hour": 1e-3,
    "mL/day": 1e-3 / 24,
    "mL/min": 0.06,
    "h^-1": 1,
    "hour^-1": 1,
    "1/h": 1,
    "/h": 1,
    "s^-1": 3600,
    "1/s": 3600,
    "/s": 3600,
    "min^-1": 60,
    "day^-1": 1 / 24,
    "nM^-1 h^-1": 1,
    "nM^-1 hour^-1": 1,
    "M^-1 s^-1": 3600 / 1e9,
    "M^-1s^-1": 3600 / 1e9,
    "M-1 s-1": 3600 / 1e9,
    "M^-1 h^-1": 1e-9,
    "nM": 1,
    "pM": 1e-3,
    "uM": 1e3,
    "µM": 1e3,
    "M": 1e9,
    "g/mol": 1,
    "Da": 1,
    "kDa": 1e3,
    "kg": 1,
    "1": 1
};
export function canonicalValue(value, unit) {
    const factor = UNIT_FACTORS[unit.trim()] ?? UNIT_FACTORS[unit.trim().replace(/\s+/g, " ")];
    return factor == null ? null : value * factor;
}
const close = (a, b)=>Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 0.01);
const plural = (n, word)=>`${n} ${word}${n === 1 ? "" : "s"}`;
const outcomeOf = (event)=>event?.state ?? "started";
function inputDisplay(p) {
    if (p.value == null) return "not set";
    if (p.parameter === "occupancy_threshold") return `${scientificNumber(p.value * 100)}%`;
    if (p.parameter === "duration_h") return `${scientificNumber(p.value / 24)} days`;
    if (p.unit === "g/mol" && p.value >= 1000) return `${scientificNumber(p.value / 1000)} kDa`;
    return `${scientificNumber(p.value)} ${unitLabel(p.unit)}`.trim();
}
/** Build the screen's state from a job. `now` only drives the elapsed-time readout. */ export function workflowModel(job, now = Date.now()) {
    const view = investigationView(job);
    const edit = job?.mode === "edit";
    const attempts = view.attempts;
    const done = job?.status === "completed" || job?.status === "failed";
    const stages = WORKFLOW_STAGES.map((stage)=>{
        // Interpreting the result is preparation for the answer: the answer node lights only once the agent starts
        // writing it (or the run ends), so it never shows a check while the answer is still being composed.
        const tools = attempts.filter((a)=>STAGE_OF[a.start.tool_name ?? ""] === stage.id && (stage.id !== "answer" || done || attempts.some((b)=>b.start.tool_name === "synthesize_grounded_answer")));
        const running = tools.some((a)=>!a.outcome);
        const states = tools.map((a)=>outcomeOf(a.outcome));
        let state = "waiting";
        if (running) state = "active";
        else if (states.includes("succeeded")) state = states.some((s)=>s === "rejected") ? "warning" : "done";
        else if (states.some((s)=>s === "failed" || s === "interrupted")) state = "failed";
        else if (states.length) state = "warning";
        else if (done || edit && RESEARCH_ONLY.includes(stage.id)) state = "skipped";
        return {
            ...stage,
            state,
            calls: tools.length
        };
    });
    // Papers: every retrieved source, with the outcome of extraction on it.
    const papers = [];
    const byDocument = new Map();
    for (const attempt of attempts){
        const name = attempt.start.tool_name, summary = attempt.outcome?.summary;
        if (name === "retrieve_evidence_source" && attempt.outcome?.state === "succeeded") {
            for (const source of summary?.sources ?? []){
                const key = source.document_id ?? source.source_id ?? `doc-${papers.length}`;
                if (byDocument.has(key)) continue;
                const paper = {
                    key,
                    title: source.title ?? source.source_id ?? "Retrieved source",
                    access: source.content_kind === "full_text" ? "Full text" : source.content_kind === "abstract" ? "Abstract" : (source.content_kind ?? "Source").replaceAll("_", " "),
                    retrieval: source.retrieval_status ?? null,
                    extraction: "pending",
                    values: 0
                };
                byDocument.set(key, paper);
                papers.push(paper);
            }
        }
    }
    const values = [];
    const seenValues = new Set();
    let rejectedExtractions = 0, extractionCalls = 0;
    for (const attempt of attempts){
        if (attempt.start.tool_name !== "extract_cited_parameters") continue;
        extractionCalls++;
        const summary = attempt.outcome?.summary;
        const key = summary?.sources?.[0]?.document_id ?? summary?.sources?.[0]?.source_id;
        const paper = key ? byDocument.get(key) : undefined;
        const state = attempt.outcome?.state;
        // A running extraction does not record which paper it reads, so no single paper is singled out.
        if (!attempt.outcome) {
            if (paper) paper.extraction = "reading";
            continue;
        }
        if (state === "rejected") {
            rejectedExtractions++;
            if (paper && paper.extraction !== "values") paper.extraction = "rejected";
            continue;
        }
        if (state === "failed") {
            if (paper && paper.extraction !== "values") paper.extraction = "unavailable";
            continue;
        }
        const found = summary?.candidates ?? [];
        if (paper) {
            paper.values = Math.max(paper.values, summary?.candidate_count ?? found.length);
            paper.extraction = paper.values ? "values" : paper.extraction === "values" ? "values" : "no_values";
        }
        for (const item of found){
            const id = `${item.parameter}=${item.value}${item.unit}`;
            if (seenValues.has(id)) continue;
            seenValues.add(id);
            values.push({
                parameter: item.parameter,
                label: parameterLabel(item.parameter),
                display: `${scientificNumber(item.value)} ${unitLabel(item.unit)}`.trim(),
                canonical: canonicalValue(item.value, item.unit),
                matches: false
            });
        }
    }
    // Model inputs: the configured experiment, baseline values first, then each alternative's changes.
    const snapshot = view.snapshot;
    const inputs = [];
    if (snapshot) {
        const changed = changedParameters(snapshot);
        const changedKeys = new Set(changed.map((p)=>`${p.scenario_id}:${p.parameter}`));
        const base = snapshot.parameters.filter((p)=>!p.scenario_id || p.scenario_id === snapshot.schedules[0]?.scenario_id);
        const pick = [
            ...base.filter((p)=>![
                    "duration_h",
                    "occupancy_threshold"
                ].includes(p.parameter)),
            ...changed
        ];
        const seen = new Set();
        const TAG = {
            half_life_x3: "half-life ×3",
            affinity_x10: "affinity ×10",
            custom: "alternative"
        };
        const tagOf = new Map(snapshot.schedules.map((s)=>[
                s.scenario_id,
                TAG[s.intervention] ?? null
            ]));
        for (const p of pick){
            const key = `${p.scenario_id ?? "common"}:${p.parameter}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // An extracted value that equals this input (in canonical units) independently confirms it.
            const matching = p.value == null || changedKeys.has(`${p.scenario_id}:${p.parameter}`) ? [] : values.filter((v)=>v.parameter === p.parameter && v.canonical != null && close(v.canonical, p.value));
            matching.forEach((v)=>{
                v.matches = true;
            });
            inputs.push({
                key,
                label: parameterLabel(p.parameter),
                display: inputDisplay(p),
                provenance: p.provenance.replaceAll("_", " "),
                reviewed: p.review_status === "reviewed",
                sources: p.source_ids ?? [],
                changed: changedKeys.has(`${p.scenario_id}:${p.parameter}`),
                confirmed: matching.length > 0,
                scenario: p.scenario_id ? tagOf.get(p.scenario_id) ?? null : null
            });
        }
    }
    const labels = new Map((job?.turn?.result?.configuration.scenarios ?? []).map((s)=>[
            s.scenario_id,
            s.label
        ]));
    const metrics = (view.receipt?.metrics ?? []).map((m, i)=>({
            scenarioId: m.scenario_id,
            index: i,
            label: labels.get(m.scenario_id) ?? (i === 0 ? "Baseline" : m.scenario_id.replaceAll("_", " ")),
            occupancy: m.endpoint_occupancy,
            status: m.threshold_status
        }));
    const structureEvent = attempts.map((a)=>a.outcome?.summary?.structure).filter(Boolean).at(-1) ?? null;
    const searches = attempts.filter((a)=>a.start.tool_name === "search_hypothesis_evidence");
    const sourcesFound = new Set(searches.flatMap((a)=>(a.outcome?.summary?.sources ?? []).map((s)=>s.source_handle ?? s.source_id ?? ""))).size;
    const synthesis = job?.turn?.synthesis ?? null;
    const answerAttempt = attempts.filter((a)=>a.start.tool_name === "synthesize_grounded_answer" && a.outcome?.state === "succeeded").at(-1) ?? null;
    const extracting = attempts.some((a)=>a.start.tool_name === "extract_cited_parameters" && !a.outcome);
    for (const paper of papers)if (paper.extraction === "pending") paper.extraction = extracting ? "reading" : done ? "not_extracted" : "pending";
    const metric = {
        question: edit ? "Stored experiment" : stages[0].calls ? "Identity resolved" : null,
        search: searches.length ? plural(sourcesFound, "source") + " found" : null,
        reading: papers.length ? plural(papers.length, "paper") + " read" : null,
        extraction: extractionCalls ? values.length ? plural(values.length, "cited value") : rejectedExtractions ? `${rejectedExtractions} rejected` : "no values" : null,
        model: snapshot ? `${plural(snapshot.schedules.length, "scenario")}` : null,
        simulation: view.receipt ? `${view.receipt.output_point_count} time points` : null,
        structure: structureEvent ? structureEvent.available ? `PDB ${structureEvent.pdb_id}` : "none verified" : stages[6].state === "failed" ? "failed" : null,
        answer: synthesis ? synthesis.status === "grounded" ? "cited answer" : `answer ${synthesis.status}` : answerAttempt ? "written" : stages[7].state === "failed" ? "failed" : null
    };
    const started = job?.execution_events?.[0]?.timestamp ? Date.parse(job.execution_events[0].timestamp) : null;
    const ended = view.runEnd?.timestamp ? Date.parse(view.runEnd.timestamp) : null;
    const elapsed = started ? Math.max(0, ((ended ?? now) - started) / 1000) : 0;
    const log = attempts.map((a)=>{
        const s = a.outcome?.summary, name = a.start.tool_name ?? "";
        const detail = name === "search_hypothesis_evidence" && s?.source_count != null ? plural(s.source_count, "source") : name === "retrieve_evidence_source" && s?.sources?.[0] ? `${s.sources[0].content_kind === "full_text" ? "full text" : (s.sources[0].content_kind ?? "source").replaceAll("_", " ")} · ${s.sources[0].retrieval_status ?? ""}`.trim() : name === "extract_cited_parameters" && a.outcome?.state === "succeeded" ? plural(s?.candidate_count ?? 0, "cited candidate") : a.outcome?.state === "rejected" ? "rejected by server validation" : s?.result ? `result ${s.result.result_id.slice(0, 12)}…` : s?.structure?.available ? `PDB ${s.structure.pdb_id}${s.structure.interface_residue_pair_count != null ? ` · ${s.structure.interface_residue_pair_count} contacts` : ""}` : s?.experiment ? plural(s.experiment.parameters.length, "parameter") : null;
        return {
            id: a.start.tool_call_id ?? a.start.event_id,
            stage: STAGE_OF[name] ?? "question",
            label: toolLabel(a.start),
            state: a.outcome?.state ?? "started",
            seconds: a.outcome?.elapsed_ms != null ? a.outcome.elapsed_ms / 1000 : null,
            detail
        };
    });
    const status = view.invalid ? "invalid" : !job ? "starting" : job.status === "failed" ? "failed" : job.status === "completed" ? job.turn?.status ?? "completed" : job.status === "queued" ? "queued" : "running";
    // Show what matters first: each alternative's change, then PK and binding inputs; bookkeeping inputs last.
    const KEY = [
        "pk.elimination_half_life_h",
        "pk.clearance_L_h",
        "pk.volume_L",
        "binding.affinity_nM",
        "binding.dissociation_h_inv",
        "binding.association_nM_inv_h_inv"
    ];
    const rank = (i)=>i.changed ? 0 : i.confirmed ? 1 : KEY.some((k)=>parameterLabel(k) === i.label) ? 2 + KEY.findIndex((k)=>parameterLabel(k) === i.label) / 10 : 9;
    const ordered = [
        ...inputs
    ].sort((a, b)=>rank(a) - rank(b));
    const shownInputs = ordered.slice(0, 6), hiddenInputs = ordered.length - shownInputs.length;
    const audited = shownInputs.length > 0 && shownInputs.every((i)=>i.reviewed);
    return {
        status,
        edit,
        audited,
        shownInputs,
        hiddenInputs,
        stages: stages.map((s)=>({
                ...s,
                metric: metric[s.id]
            })),
        active: view.active ? {
            stage: STAGE_OF[view.active.start.tool_name ?? ""] ?? "question",
            label: toolLabel(view.active.start)
        } : null,
        papers,
        values,
        inputs,
        metrics,
        threshold: snapshot?.occupancy_threshold ?? null,
        structure: structureEvent,
        synthesis,
        log,
        toolCalls: attempts.length,
        elapsed,
        runId: job?.execution_run_id ?? null,
        accepted: view.accepted
    };
}
/** A copy of a finished job showing only its first `count` events, for a clearly labeled replay. */ export function replayJob(job, count) {
    const events = job.execution_events ?? [];
    if (count >= events.length) return job;
    return {
        ...job,
        status: "running",
        turn: undefined,
        execution_events: events.slice(0, count)
    };
}
/** Replay schedule (ms after start for each event): real spacing, compressed to about `targetMs`. */ export function replaySchedule(events, targetMs = 22000) {
    if (!events.length) return [];
    const start = Date.parse(events[0].timestamp), total = Math.max(1, Date.parse(events.at(-1).timestamp) - start);
    const factor = Math.min(1, targetMs / total);
    let previous = 0;
    return events.map((e)=>{
        previous = Math.max(previous + 180, (Date.parse(e.timestamp) - start) * factor);
        return Math.round(previous);
    });
}
