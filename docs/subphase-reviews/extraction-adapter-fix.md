# Trastuzumab hypothetical-bolus research — extraction integration fix

The user's failed run `61d9bca31d62493c98ba2906f67235d2` used the primary half-life/affinity wording with `hypothetical_iv_bolus`. Its ledger showed real source retrieval, one unavailable extraction, another extraction with two candidate values, a rejected attempt and a later overall failure. It never configured or simulated an experiment. The two candidates were not committed to its preparation before failure; the saved preparation remains incomplete.

Read-only inspection of the matching LangSmith trace confirmed rejected legacy `guided_json` request fields in the NVIDIA adapter fallback and a subsequent 45-second ChatNVIDIA read timeout. The whole run lasted approximately 196 seconds. This was a provider/adapter failure, not a scientific finding that the hypothesis is false or that no relevant evidence exists.

## Fix

- Use NVIDIA's already-working tool-calling transport for one typed `ExtractionProposalBatch` response, rather than its `with_structured_output` fallback chain. Validate the tool name/count and schema locally; retain the existing exact-passage, number/unit, relation and applicability guards.
- Live testing also exposed a scalar `notes` string where a list was requested. Normalize only that untrusted, non-scientific note metadata. Never coerce parameter values, units or supporting passages. Unexpected/multiple tool calls and invalid scientific fields still fail closed.
- Expose the search-focus enum to the agent to reduce invalid tool arguments.
- Classify provider/research timeouts explicitly using fixed safe messages; no exception payloads or keys enter browser-facing errors.
- Explain the hypothetical-bolus versus reviewed-infusion distinction beside the route selection. Do not change the selected route, copy infusion inputs automatically, or claim the generic path has produced a bolus comparison.

## Verification

- Reused the same cached abstract from the unavailable extraction with the corrected live NVIDIA adapter and original bolus request. It returned `no_values` successfully: the selected abstract did not yield accepted scalar candidates. This verifies transport and validation, not a complete real-drug parameter package or a successful bolus simulation.
- Regression checks cover tool-based transport without guided output, rejected text-only/wrong/multiple calls, strict scientific schema failures, note-only normalization, timeout sanitization and route guidance. Full backend suite: 316 passing; frontend suite: 44 passing. Production build and shared contract checks pass.
- Original preparation/job records are preserved. No full custom-bolus rerun or reviewed-profile expansion is claimed. Verification metadata: `data/research/verification/extraction-adapter-fix.json`.

## Plan assessment

**Keep the plan.** This repairs the existing extraction integration and clarifies current scope. Next remains **8B.1 — grounded synthesis schema and tool**, awaiting its green light. For the reviewed primary comparison, choose IV infusion; a hypothetical bolus remains a custom preparation requiring compatible inputs and explicit assumptions.
