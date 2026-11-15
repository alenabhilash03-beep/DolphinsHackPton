import { linkedTurnResult } from "./agent-workspace.js";
export const INVESTIGATION_STAGES = [
    {
        id: "preparation",
        label: "Identity & inputs",
        stages: [
            "preparation"
        ]
    },
    {
        id: "literature",
        label: "Papers",
        stages: [
            "literature"
        ]
    },
    {
        id: "extraction",
        label: "Extraction",
        stages: [
            "extraction"
        ]
    },
    {
        id: "configuration",
        label: "Parameters",
        stages: [
            "configuration",
            "editing"
        ]
    },
    {
        id: "simulation",
        label: "Simulation",
        stages: [
            "simulation"
        ]
    },
    {
        id: "structure",
        label: "Structure",
        stages: [
            "structure"
        ]
    },
    {
        id: "interpretation",
        label: "Findings",
        stages: [
            "interpretation"
        ]
    }
];
const TOOL_NAMES = {
    start_experiment_preparation: "Resolve identity and model inputs",
    read_experiment_preparation: "Read saved preparation",
    update_experiment_preparation: "Assess evidence and missing inputs",
    search_hypothesis_evidence: "Search scientific papers",
    retrieve_evidence_source: "Retrieve a source snapshot",
    extract_cited_parameters: "Extract cited parameter candidates",
    configure_prepared_experiment: "Configure the supported experiment",
    prepare_reviewed_comparison: "Load the reviewed comparison",
    read_current_experiment: "Read the current experiment",
    apply_requested_edit: "Configure the requested change",
    simulate_current_comparison: "Run the numerical simulator",
    interpret_current_result: "Interpret the numerical result",
    synthesize_grounded_answer: "Write the grounded scientific answer",
    inspect_verified_structure: "Inspect the verified experimental structure",
    measure_structure_residue: "Measure a residue distance"
};
export const toolLabel = (event)=>TOOL_NAMES[event.tool_name ?? ""] ?? "Scientific tool";
export const stateLabel = (state)=>({
        started: "Running",
        succeeded: "Completed",
        rejected: "Rejected",
        needs_inputs: "Needs input",
        unsupported: "Unsupported",
        failed: "Failed",
        interrupted: "Interrupted"
    })[state] ?? state;
export function stageSummary(attempts, busy) {
    if (!attempts.length) return busy ? "Not run yet" : "Not run";
    if (attempts.some((t)=>!t.outcome)) return "Running";
    const counts = new Map();
    for (const attempt of attempts){
        const state = attempt.outcome.state;
        counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return [
        ...counts
    ].map(([state, count])=>`${count} ${stateLabel(state).toLowerCase()}`).join(" · ");
}
/** Build a view of observed execution only. No timers may advance scientific stages. */ export function investigationView(job) {
    const events = job?.execution_events ?? [];
    const attempts = [];
    const byId = new Map();
    const ids = new Set();
    let runStart = false, runEnd = null, invalid = false;
    for (const [index, event] of events.entries()){
        if (event.run_id !== job?.execution_run_id || event.sequence !== index + 1 || ids.has(event.event_id) || runEnd) {
            invalid = true;
            break;
        }
        ids.add(event.event_id);
        if (event.kind === "run") {
            if (event.state === "started") {
                if (runStart) invalid = true;
                runStart = true;
            } else {
                if (!runStart) invalid = true;
                runEnd = event;
            }
            continue;
        }
        if (!runStart || !event.tool_call_id || !event.tool_name) {
            invalid = true;
            break;
        }
        if (event.state === "started") {
            if (byId.has(event.tool_call_id)) {
                invalid = true;
                break;
            }
            const attempt = {
                start: event,
                outcome: null
            };
            byId.set(event.tool_call_id, attempt);
            attempts.push(attempt);
        } else {
            const attempt = byId.get(event.tool_call_id);
            if (!attempt || attempt.outcome || attempt.start.tool_name !== event.tool_name || attempt.start.stage !== event.stage) {
                invalid = true;
                break;
            }
            attempt.outcome = event;
        }
    }
    if (runEnd && attempts.some((item)=>!item.outcome)) invalid = true;
    const observed = invalid ? [] : attempts;
    const snapshots = observed.flatMap((item)=>item.outcome?.summary?.experiment ? [
            item.outcome.summary.experiment
        ] : []);
    const solver = observed.filter((item)=>item.start.tool_name === "simulate_current_comparison");
    const lastSolver = solver.at(-1) ?? null;
    const receipt = lastSolver?.outcome?.state === "succeeded" ? lastSolver.outcome.summary?.result ?? null : null;
    let result = null;
    try {
        if (job?.status === "completed" && job.turn) result = linkedTurnResult(job.turn);
    } catch  {
        invalid = true;
    }
    const accepted = !!(!invalid && result && receipt && runEnd?.state === "succeeded" && job?.turn?.execution_run_id === job?.execution_run_id && job?.turn?.execution_events?.length === events.length && job.turn.execution_events.every((event, index)=>event.event_id === events[index].event_id) && receipt.result_id === result.result_id && receipt.experiment_id === result.configuration.experiment_id && receipt.configuration_sha256 === result.configuration_hash && receipt.client_revision === result.client_revision && observed.some((item)=>item.start.tool_name === "interpret_current_result" && item.outcome?.state === "succeeded" && item.outcome.summary?.result?.result_id === receipt.result_id && item.outcome.summary.result.configuration_sha256 === receipt.configuration_sha256) && snapshots.some((s)=>s.configuration_sha256 === receipt.configuration_sha256));
    const sources = new Set(observed.flatMap((item)=>item.start.tool_name === "retrieve_evidence_source" && item.outcome?.state === "succeeded" ? (item.outcome.summary?.sources ?? []).flatMap((s)=>s.source_id ? [
                s.source_id
            ] : []) : []));
    const active = observed.findLast((item)=>!item.outcome) ?? null;
    return {
        invalid,
        legacy: !events.length,
        attempts: invalid ? [] : observed,
        active: invalid ? null : active,
        snapshot: invalid ? null : snapshots.at(-1) ?? null,
        receipt: invalid ? null : receipt,
        accepted: invalid ? false : accepted,
        result: invalid ? null : result,
        runEnd: invalid ? null : runEnd,
        sourceCount: sources.size,
        stages: INVESTIGATION_STAGES.map((stage)=>{
            const tools = invalid ? [] : observed.filter((item)=>stage.stages.includes(item.start.stage));
            return {
                ...stage,
                attempts: tools,
                state: tools.at(-1)?.outcome?.state ?? (tools.length ? "started" : "not_run")
            };
        })
    };
}
export function parameterLabel(path) {
    const names = {
        duration_h: "Observation window",
        occupancy_threshold: "Analytical occupancy threshold",
        "pk.volume_L": "Distribution volume",
        "pk.clearance_L_h": "Clearance",
        "pk.elimination_half_life_h": "Effective half-life",
        "binding.association_nM_inv_h_inv": "Association rate (kon)",
        "binding.dissociation_h_inv": "Dissociation rate (koff)",
        "binding.affinity_nM": "Binding affinity (KD)",
        molecular_weight_g_mol: "Molecular weight",
        body_mass_kg: "Body mass",
        exposure_factor: "Prescribed exposure factor",
        initial_amount_nmol: "Initial amount",
        initial_occupancy: "Initial occupancy",
        dosing_interval_h: "Dosing interval"
    };
    return names[path] ?? path.replace(/^administration\.(\d+)\./, (_, n)=>`Dose ${Number(n) + 1} · `).replace("amount_mg", "amount").replace("start_h", "start").replace("duration_h", "infusion duration");
}
export function scientificNumber(value) {
    if (value == null) return "None";
    if (value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 100000)) return value.toExponential(3);
    return new Intl.NumberFormat("en-US", {
        maximumSignificantDigits: 5
    }).format(value);
}
export function changedParameters(snapshot) {
    return [
        ...snapshot.parameters,
        ...snapshot.schedules.flatMap((s)=>s.parameter_evidence ?? [])
    ].filter((p)=>p.change === "changed" || p.change === "added");
}
