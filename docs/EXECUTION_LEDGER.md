# Structured agent execution ledger — 8A.1

The existing generalized-agent endpoints now return additive `execution_run_id` and `execution_events` fields. Read live progress with `GET /api/agent/jobs/{job_id}`. Completed turns and `GET /api/agent/turns/{turn_id}` retain the same event sequence. Existing `events: string[]` activity messages remain compatible. Old stored jobs/turns default to an empty ledger; no historical execution is invented.

## Lifecycle and identifiers

Each attempted server run has a `run-…` ID. Every structured record has a unique `evt-…` ID and a contiguous, one-based sequence number. Each actual registered scientific-tool invocation has a server-generated `exec-…` ID, shared by its start and outcome records. This is an execution correlation ID, distinct from provider tool-message IDs and LangSmith span IDs.

A run/tool starts with `state: started`, a timezone-aware timestamp, and no outcome or duration. Its terminal record reports elapsed milliseconds and a typed summary. Tool states distinguish `succeeded`, `rejected`, `needs_inputs`, `unsupported` and `failed`; interrupted actions receive `interrupted` on owner-process recovery. Source-unavailable responses are failed tools with `summary.outcome: unavailable`; a completed extraction that found no values is `succeeded` with `outcome: no_values`. A valid preparation-read operation can succeed while reporting a preparation state and missing-input count; that is not permission to simulate.

Run success is published only after scientific final validation and the durable turn transaction succeed. A stale base can fail a run before any provider/tool call. A real solver may finish before a later provider or commit failure: its successful tool receipt remains in the ledger, but the overall run/job fails. **Only an accepted completed turn may replace the workspace result.** A tool receipt alone must not be used as successful-turn authorization.

The service serializes tool actions as before. Live polling can expose a solver `started` record while it is running. Recovery preserves completed records and closes only genuinely open actions; it does not relabel a finished tool as a failure. The existing single-process queue, capacity limits, owner-PID rules and versioned edit guards still apply.

## Scientific payloads

- Search reports source-handle count and bounded session handles. Retrieval links actual source IDs to document IDs, snapshot hashes, content kind and live/cached access. Handles and citation source IDs are separate fields.
- Extraction reports candidate count and the already retrieved source reference, without copying source passages or model prose into telemetry.
- Configuration tools and accepted edits project the authoritative validated configuration into an `ExperimentSnapshot`, including its canonical SHA-256 hash, global duration/threshold, PK/binding/exposure/initial-condition values and full typed dose schedules. Repeated identical configurations within a run are not duplicated.
- Each numerical parameter carries canonical units, evidence ID, actual provenance/review status and up to three inherited citation source IDs. A flag marks truncated citation lists; full lineage remains in the configuration/turn. Values with no per-parameter evidence mapping are explicitly `design_input` / `not_reviewed`, not measured or reviewed values.
- Initial alternatives compare against their protected baseline. Edits compare matching scenario IDs against the selected previous result; newly created alternatives compare against the current baseline. Global design changes compare against the previous result when one exists. The `comparison`, `change`, reference value and numerical delta fields make this explicit. Dose-event comparisons are positional; complete reference schedules are retained so inserted/removed events are visible without assuming event identity.
- Solver completion returns a `SolverReceipt`: result ID, experiment ID, configuration hash, client revision, model/solver versions, output-point count and per-scenario numerical metrics. No time-series arrays are copied into telemetry. Receipt/configuration mismatches fail rather than publishing a successful solver event.

All new payloads use closed schemas and bounded lists: 128 records/run, 48 main parameter entries/snapshot, three scenarios, 100 dose events/scenario, 300 timing/amount provenance entries/scenario and 20 source references/summary. Citations on individual parameter entries are capped at three with explicit truncation flags. These limits are compatible with the existing three-scenario/100-dose scientific contract. The agent retains its stricter 24-action/turn limit.

New ledger payloads exclude raw tool arguments, prompts, paper passages, source URLs/titles, free-text configuration labels, arbitrary exception text and private reasoning. Exceptions are classified by a fixed error code. The surrounding existing job/turn still contains the scientist's submitted request and accepted scientific evidence; the ledger does not change those APIs' existing visibility.

## Verification and consumer handoff

`apps/api/tests/test_execution_ledger.py` exercises the real LangChain graph with a scripted offline provider and the actual SciPy solver. It covers research/configure/run and missing inputs; baseline/previous-result deltas and linked KD/koff; source metadata; rejection/recovery; provider/solver/commit failures; stale bases; active polling; durable queue and turn/API reads; interrupted-owner recovery; bounded projections; legacy records; and receipt integrity.

Run:

```sh
.venv/bin/python -m pytest apps/api/tests/test_execution_ledger.py
.venv/bin/python scripts/run_generalized_agent.py --mode edit --require-tracing
```

The live command uses the pinned NVIDIA endpoint and a separate local edit-verification store; it does not consume a user's edit head. It now verifies ledger sequences and receipt linkage and writes a report under ignored `work/`. Committed bounded verification metadata is in `data/research/verification/8A.1-execution.json`.

**8A.2 is now complete:** the [live investigation panel](INVESTIGATION_PANEL.md) renders these events and parameter snapshots in the compact workspace. This subphase provides contracts, persistence and numerical attribution; the frontend rendering is documented separately in 8A.2. Provider token streaming, private reasoning display, new model equations and new drug profiles are outside 8A.1.
