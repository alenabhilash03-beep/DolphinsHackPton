# Preparation integration handoff — 7B.5

The generic backend can configure and simulate compatible, explicitly scoped inputs for a drug without a curated preset. This chunk verifies that foundation; the current hypothesis UI still uses the primary trastuzumab workflow. **7C now connects Nemotron through the [generalized agent APIs](GENERALIZED_AGENT.md); 7D connects that workflow to the workspace.** Entering an arbitrary name in today's hypothesis box is not yet the full research-to-simulation product flow.

## Ownership and interfaces

Use generated types from `apps/web/lib/contracts.ts` and current OpenAPI at `http://127.0.0.1:8001/docs`. Backend base URL in the local launcher is `http://127.0.0.1:8001`; the workspace is on port 3002. The listed paths are FastAPI routes. Corresponding Next.js preparation proxies have **not** been added. Keep credentials and research-source sessions on the server.

| Operation | Interface | Expected behavior |
| --- | --- | --- |
| Start | `POST /api/preparations`, `{request: PreparationRequest}` | 201 `PreparationRecord`; resolves identity and lists missing inputs, without searching or simulating |
| Research | Server-side shared-session LangChain evidence tools | Search → source handles → bounded source pages → exact-cited candidate extraction; status and access limits remain visible |
| Revise/answer | `POST /api/preparations/{id}/revise`, `PreparationUpdate` | New evaluated record with immutable history; send the latest revision and evidence hash |
| Read/resume | `GET /api/preparations/{id}` | Latest persisted record; `?revision=N` reads an immutable historical record |
| Configure | `POST /api/preparations/{id}/configure`, `PreparationVersion` | `ConfiguredPreparation` containing the exact experiment and server-registered configuration hash |
| Run | `POST /api/simulations`, `SimulationRequest` | `SimulationResult`; only an exact registered research-derived configuration is accepted |
| Direct controls | `POST /api/simulations/adjust`, `ControlAdjustment` | Deterministic recalculation, parent configuration lineage, no LLM call |

There is no generic HTTP extraction endpoint. The future agent owns the evidence-tool session. Build `build_preparation_research_toolkit(service, extractor=...)` with the same document service used for preparation. A new per-agent session must share the intended persistent store/cache while keeping session handles scoped. Persisted document IDs are server-generated; source handles cannot be replaced with arbitrary URLs or client-created source objects. Streamed generalized agent progress and clarification orchestration are 7C work, not new 7B.5 endpoints.

## UI state mapping

| `preparation.state` | Display/action |
| --- | --- |
| `identity_clarification` | Ask the returned identity/form/target question; preserve ambiguity and source status |
| `researching` | Evidence evaluation in progress; do not show a runnable result |
| `needs_inputs` | Render `missing_inputs[].question`, reason, expected unit and permitted resolution; submit typed answers |
| `source_unavailable` | Show source/identity availability limits, retry or collect explicit hypothetical inputs |
| `unsupported` | Explain the unsupported mechanism/route/endpoint; no Run action |
| `failed_validation` | Show `reasons` and failed checks; preserve the last accepted result as belonging to its earlier revision |
| `ready_for_configuration` | Offer configuration; `preparation.runnable` stays false; use the separate configuration response and numerical result to advance the workspace |

`checks` and readiness are consistency assessments, not scientific approval. Display `classification`, `identity_retrieval_status`, source content kind, retrieval time and cached status. Reported/calculated/researcher-assumed values need distinct labels; prepared evidence remains `candidate`. An abstract fallback must be labeled as an abstract. A complete set of numbers never enables unimplemented transport, explicit competition, irreversible binding, oral absorption or efficacy models.

## Request sequence

For every revision/configuration request, construct the version from the **latest response**, rather than incrementing it in the client:

```ts
const version = (record: PreparationRecord) => ({
  base_revision: record.preparation.revision,
  base_evidence_sha256: record.preparation.evidence_sha256,
});
// POST /api/preparations/{id}/revise
const body: PreparationUpdate = {
  ...version(currentRecord),
  parameters: explicitResearcherAnswers,
};
// POST /api/preparations/{id}/configure
const configurationBody = version(latestRecord);
// POST /api/simulations; pass the returned experiment unchanged
const simulationBody: SimulationRequest = {
  experiment: configured.experiment,
  client_revision: nextClientRevision,
  output_points: 600,
};
```

These snippets show payload construction, not new client/server functions. Successful updates normally add **two** server revisions (internal researching, then evaluated). `client_revision` is a separate UI request-order token. Keep only the latest response for a control request; do not let stale responses replace the current graphs. A 409 requires reload/reconciliation; do not silently retry an old edit against newly changed scientific inputs.

Text `answers` are restricted to outstanding identity/target/route questions. A missing number must be a `PreparationParameter` with original value/unit, explicit provenance and context. A researcher assumption additionally requires rationale, timezone-aware entry time and applicability notes. Never turn missing evidence into a default measurement. Original input IDs are immutable; replacements use new IDs and explicit selection. The agent must ask the scientist before attributing assumptions to them.

Errors: 404 unknown preparation/history; 409 stale scientific revision/hash; 422 malformed input, invalid source claim or configuration not ready. A scientifically blocked case commonly returns **200 with a blocked state**, so HTTP success alone does not mean ready. Configuration returns `hypothesis_parsed:false`: 7B configures one structured baseline and preserves original hypothesis text. Natural-language edits and scenario design remain 7C.

## Connecting evidence, plots and molecular views

Keep `{preparation_id, preparation_revision, evidence_sha256, configuration_sha256, experiment_id, result_id, client_revision}` together with each accepted result. `result.configuration_hash` must equal the configuration hash used for that run. Evidence context includes preparation/hash references, source snapshot hashes and exact source passages; calculated values carry parent IDs. This lets an evidence selection identify the actual plotted scenario parameters rather than implying a paper directly generated a curve.

Use `result.time_h` for all traces and the single playback/scrubbing clock. Central and prescribed target-site concentration are different series; occupancy is dimensionless 0–1. All scenario series share that timeline. Use the existing timeline interpolation and renderer helpers rather than rerunning research during playback. Direct controls use the numerical endpoint; stale interpretation belongs to its prior result until explicitly refreshed.

Preparation does not automatically provide a molecular complex for every drug. Structure metadata is independent of simulation readiness. A verified related structure may be species/construct limited, as shown by the blocked imatinib audit. A missing structure must leave plots usable and show an honest unavailable state. Never deform experimental coordinates when concentration or affinity changes. Generalized asset selection remains 7D; guided inspection is 7E.

## Repeatable acceptance examples

`data/examples/preparation-acceptance.json` contains **synthetic software recipes**, not literature or database evidence. It defines two unrelated names, scope/design and original input values. `initially_missing` identifies the rate deliberately omitted from the second source fixture; the recipe retains its value only for the later explicitly assumed answer. These are not directly submit-ready reported parameters: the tests first retrieve server-generated source IDs and construct cited proposals through the real extraction-validation path.

Run:

```sh
.venv/bin/python -m pytest apps/api/tests/test_preparation_acceptance.py
.venv/bin/python scripts/check_preparation_retrieval.py
```

The offline suite injects synthetic identity/search transport and a deterministic structured extractor stub, then exercises actual LangChain tools, source parsers, validation, SQLite, FastAPI and SciPy. It covers complete/resumed cases, an unseen generated name, unsupported mechanisms, extraction outage, exact infusion PK, aligned plots, citation/result lineage and restart replay. It proves software generalization, **not that two real drugs have been scientifically validated**.

The second command performs one real search and at most two bounded source-page attempts. It requires network access, makes no LLM/extraction/solver call, records full-text versus abstract access honestly and exits nonzero for no results/unavailable sources. The dated verification record is `data/research/verification/7B.5-retrieval.json`; raw snapshots stay in ignored `work/`. A past successful record is not a guarantee of current provider availability.
