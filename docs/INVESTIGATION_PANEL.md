# Live investigation panel — 8A.2

The compact workspace now renders the 8A.1 execution ledger outside the collapsed hypothesis editor. Open `/preview/plots`; the same component is also used by the main workspace. A newly accepted request expands the panel and brings it into view. Opening a saved demo instead shows **Saved reference results / Saved · no live execution**, without inventing a tool replay.

## What is visible

- **Observed stages:** identity/inputs, papers, extraction, parameters, numerical simulation and interpretation. Stage labels report observed tool outcomes, not percentages or predictions that an entire stage is finished. Parameter-only edits leave paper research marked **Not run**.
- **Actual configuration:** changed canonical values, the reference value and delta, baseline/previous-result comparison, provenance and review status. Full values and complete dose schedules expand on demand. Pending configurations use their actual scenario IDs rather than borrowing labels from an unrelated displayed experiment.
- **Numerical result:** solver-returned endpoint occupancy, occupancy AUC, threshold status and aligned sample count. These remain conditional model outputs. A solver can return before the whole agent turn finishes; such values are explicitly marked **agent result not accepted** and never replace the displayed graphs.
- **Tool log:** separate attempts and outcomes, server-reported durations, source-access types, candidate/missing-input counts and fixed error categories. A rejected attempt remains visible after a later successful retry.
- **Trace/provenance:** expandable run, job, result, configuration-hash and trace identifiers. No raw prompts, private reasoning or provider exception payloads are added to the UI.

The live elapsed timer measures time since the current tool's server timestamp; it never advances a stage. Final durations come from the ledger. Existing 1.5-second job polling remains unchanged, so a very fast numerical call may first appear as completed. No artificial delay is added to production execution.

## Result handoff and recovery

Structured runs must have a consistent sequence/run identity, paired invocation outcomes, a committed successful run, matching job/turn ledger IDs, an authoritative configuration snapshot, and matching solver/interpretation receipts before replacing the workspace result. The prior result remains during research, missing inputs, failed runs or invalid linkage. A direct control edit after a completed agent run is clearly identified as a different displayed result.

Legacy runs without structured records remain readable; tool success is not inferred from old request strings. Reload resumes the saved job and restores its factual ledger. Missing-input questions and typed preparation answers appear after the investigation panel and remain available when the hypothesis editor is collapsed. Existing request epochs still prevent a late response from replacing a saved demo or newer request. Loading a saved demo abandons the browser's old job view; it does not cancel the provider's in-flight work.

## Test locally

1. Continue from the latest displayed result. Open **Change the experiment in words**, enter **Run this comparison for 90 days**, and choose **Apply edit & simulate**.
2. Watch the investigation panel expand. It should show parameter tools and real numerical/interpretation outcomes; papers remain not run for this parameter-only edit.
3. Verify the observation-window delta, units, provenance and accepted result. The graphs below should update to the new horizon only after acceptance.
4. Expand **Tool-by-tool execution** and **All parameter values, provenance & dose schedules**. Reload to inspect the restored completed record.
5. Start new research through **Edit hypothesis** to inspect source/extraction stages. Missing data should yield questions and leave the earlier curves intact.

If a saved edit base already has a newer child, use the current result or make an explicit direct parameter change to create a fresh result; the existing linear edit-head guard is retained. Investigation-history branching is planned in 8D.

## Acceptance checks

`apps/web/tests/investigation.test.mjs` covers receipt/configuration/interpretation linkage, partial running records, failed runs after a real solver receipt, missing inputs, malformed ledgers, rejected/retried tools, deduplicated retrieved sources, legacy/saved idle states and changed schedule parameters. Existing epoch, numerical-control and visualization tests remain in force.

For reproducible failure-state browser checks, `scripts/serve_investigation_ui_checks.py` is a **developer-only synthetic acceptance backend**. It runs the actual LangChain graph and SciPy engine with scripted provider/synthetic evidence, never a hosted provider. It deliberately holds numerical calls for 8 seconds so running/reload states can be inspected. Pair it with a separate Next process:

```sh
.venv/bin/python scripts/serve_investigation_ui_checks.py
API_BASE_URL=http://127.0.0.1:8101 npm run start --workspace apps/web -- --port 3102
```

Use `/preview/plots` on port 3102. Supported edits first exercise a recoverable rejected tool. A 121-day edit deliberately fails the scripted provider after the actual solver returns; the previous accepted curves must remain. Research using **Compound X / Target Y / SYNTHETIC UI acceptance: structured baseline occupancy experiment.** has a missing dissociation-rate fixture and must not simulate. This server is not a live demonstration or an additional validated drug; stop both fixture processes after verification.

A real Nemotron browser edit and synthetic browser failure checks are recorded separately in `data/research/verification/8A.2-ui.json`. The ordinary local launcher uses the configured real backend, not the acceptance harness.
