# Generalized Nemotron agent — 7C

The new **FastAPI generalized-agent service** runs a single LangChain tool-calling agent. Nemotron selects and invokes evidence and preparation tools; numerical results and their interpretation values come from deterministic services. The existing primary research job endpoint remains compatible. The [7D dashboard](WORKSPACE_RESEARCH.md) now uses persisted background jobs around these tools, including progress, clarification forms and result handoff.

## Interfaces

- `POST /api/agent/research`: `AgentResearchRequest` → `AgentTurn`.
- `POST /api/agent/edits`: `AgentEditRequest` → `AgentTurn`.
- `GET /api/agent/turns/{turn_id}`: durable turn, scientific inputs, questions, result and trace metadata.

See `http://127.0.0.1:8001/docs` and generated TypeScript aliases. These synchronous routes remain on FastAPI; the workspace uses the newer queued routes through fixed-path Next.js proxies. These endpoints are synchronous; use the configured backend research timeout when integrating. They do not add a new SSE stream. Agent calls are bounded to 24 tool actions, 52 graph steps, a configured turn deadline checked before model/tool calls and at completion, and a 45-second provider-call timeout. A call already in progress can extend wall time beyond the turn deadline. Calls within a turn are serialized around its authoritative state. Original preparation source/session limits still apply.

Example research body:

```json
{
  "request": {
    "drug_name": "imatinib",
    "target": "ABL1",
    "route": "hypothetical_iv_bolus",
    "original_hypothesis": "How would hypothetical bloodstream imatinib input change ABL1 occupancy? Research evidence and identify missing parameters."
  },
  "client_revision": 0,
  "structured_baseline": false
}
```

The agent resolves identity, searches Europe PMC, retrieves bounded pages, calls structured cited extraction, submits extracted candidates and assesses missing inputs through tools. Unknown or unsupported drugs are not replaced by trastuzumab. Candidate evidence remains candidate; a known identity/structure alone does not authorize a run.

`structured_baseline:true` explicitly authorizes the one-baseline configuration service once compatible inputs/scope/design exist. It does **not** authorize invented researcher assumptions. When false, a general unregistered-drug request can research and clarify but cannot silently substitute a baseline for a requested intervention. The registered primary trastuzumab comparison has a separate tool guarded by the original exact scientific scope. Other initial interventions require clarification and a supported subsequent edit, rather than unimplemented biology or dropped instructions.

## Missing-input continuation

Retain the returned `preparation_id`, original `PreparationRequest`, latest scientific revision/hash and client revision. Send another research request with:

- the unchanged original `request`;
- `preparation_id`;
- optional `researcher_update: PreparationUpdate`, containing explicit answers/assumptions and its latest base revision/hash;
- `structured_baseline:true` when the researcher intends that structured baseline.

The server applies typed researcher answers before the model runs. Agent-created parameter submissions must be unchanged candidates produced by this turn's extractor. It cannot invent `researcher_assumed` values, answer identity questions on the scientist's behalf, relabel source evidence, access another preparation or simulate a different configuration. Scope/design rationales remain explicit model assumptions; they are not measured evidence. Existing source checks, units, PK/binding consistency and receipt validation still apply. Drug/target changes require a new preparation. Stale answers return 409 before a provider call.

The model's final schema contains only a status. Preparation/result identifiers and numerical conclusions are attached by the server from the execution ledger. Completion requires an actual matching configuration, solver result and interpretation tool call. Missing evidence yields questions and no curves. Tool validation failures return a bounded rejection so the agent can correct inputs; they do not become accepted evidence. Provider/time-budget failures return 503 without claiming success. A preparation update may already be persisted when a provider fails: reload it before retrying.

## Natural-language edits

The saved reviewed demo is registered as an initial edit base when available. Results from new generalized turns register automatically. Supply the stored `base_result_id`, `base_experiment_id`, `base_configuration_sha256`, increasing `client_revision`, original `text`, and `selected_scenario_id` when the text refers to “that alternative”. No full client-modified experiment is trusted as an edit base.

The edit agent calls `read_current_experiment`, `apply_requested_edit`, `simulate_current_comparison`, and `interpret_current_result`. The whole original text is parsed by a conservative deterministic grammar; the LLM cannot rephrase it to omit an unsupported clause. Supported forms include:

- “Double the dose in the affinity alternative” (also triple; all infusion doses must share the same reference amount).
- “Use a 21-day dosing interval in that alternative” (selected scenario required).
- “Compare twofold and fivefold affinity improvement at fixed association rate” (creates alternatives from the protected baseline; numeric `2fold`/`5fold` also accepted).
- “Run this comparison for 120 days” (hours also supported).
- “Set dose to 100 mg in [scenario ID]”, “Set half-life to 21 days in [scenario ID]”, and “Set affinity to 2 nM in the affinity alternative”.

Other wording/units, ambiguous scenarios, baseline scenario edits, mixed loading/maintenance relative-dose edits, contradictory instructions or additional clauses produce clarification without an applied result. This is bounded experimental editing, not a claim of universal natural-language understanding. Supported parameter edits use existing control validators, preserve unspecified parameters and linked relationships, and require no literature search or routine confirmation dialog. Direct sliders still bypass the LLM entirely.

Every successful edit has a new experiment/result and `parent_result_id`; prior turns/results remain immutable. Only one child can consume a result as the current edit head; stale/concurrent commits return 409. Rejected clarification turns do not consume the head. Repeat edits use the latest successful result, not the original base. The default SQLite store holds turn history, result payloads and child links alongside preparation receipts. A missing saved demo does not prevent independent research.

## Interpretation and visual handoff

The interpretation tool returns solver-linked endpoint occupancy, occupancy AUC and threshold status for each scenario, source/evidence IDs, original assumptions, limitations and follow-up measurements. It never infers clinical outcomes. Source summaries describe selected parameter lineage, not an invented narrative about the whole article. They link PK inputs to concentration/occupancy graphs and binding inputs to occupancy. Source availability/abstract versus full text stays in the preparation metadata. Numeric claims are assembled from the solver, not LLM arithmetic.

7D connects `turn.result` directly to the existing aligned plots/timeline/schematic, display `applied_changes`, questions, provenance and interpretation, and retain all base/hash/client revision fields. No molecular coordinate deformation is introduced. Guided molecular inspection is implemented in [7E](MOLECULAR_INSPECTION.md). The current primary dashboard remains usable while this integration is pending.

## Verification

```sh
.venv/bin/python -m pytest apps/api/tests/test_generalized_agent.py
.venv/bin/python scripts/run_generalized_agent.py --mode research --require-tracing
.venv/bin/python scripts/run_generalized_agent.py --mode edit --require-tracing
```

Offline checks use a scripted chat provider with the actual LangChain graph and scientific tools, plus clearly synthetic source/extraction fixtures. They test research-to-run, missing-rate continuation, invented-assumption rejection, edit equivalence, fixed-kon affinity alternatives, unsupported/additional wording, stale bases and fabricated completion. These are software checks, not a new reviewed real-drug model.

Live free NVIDIA checks and remote LangSmith spans are recorded in `data/research/verification/7C-research.json` and `7C-edit.json`. Real imatinib research returned missing inputs with no simulation; a live 120-day edit ran the numerical engine and returned linked interpretation. An early invalid-locator failure led to recoverable tool rejections; an early copied-ID mismatch led to server-owned final identifiers. No paid OpenAI calls or source access circumvention were used. Raw source snapshots/keys stay local and ignored.
