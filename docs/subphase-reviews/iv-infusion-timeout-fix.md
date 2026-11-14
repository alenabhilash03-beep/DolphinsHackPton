# IV-infusion timeout repair

## Observed failure

The user submitted the primary trastuzumab half-life-versus-affinity question using IV infusion. Job `199daebc2194492e945c066c7038168a` recovered from two rejected search calls that changed copied request fields, retrieved evidence, and successfully prepared the reviewed comparison. Its next NVIDIA model request timed out after 45 seconds. Total elapsed time was 76.19 seconds, below the 180-second research limit. The simulator had not been called. This was not an infusion incompatibility or an extraction failure.

The configuration tool handed roughly 14,991 characters of configuration/provenance back to the LLM before a no-argument simulation call. That unnecessary payload and copied-request rejections made the handoff less efficient; the trace does not prove payload size alone caused external provider latency.

## Repair

- Bind immutable request and resolved extraction identity server-side, removing them from the session tool schemas.
- Return compact numeric configuration receipts while retaining complete provenance server-side and in accepted results.
- Explicitly signal availability of the exact audited comparison through the existing route-aware scope checker. It still requires prepare, actual numerical execution and interpretation. Other hypotheses retain the generic evidence/clarification path.
- Retry a model timeout once when 46 seconds remain in the existing budget. Scientific tools and edits are not replayed.
- Keep incomplete generic drafts saved, but do not present them as missing inputs for an independently audited preset result.

No equations, parameter measurements, supported routes or drug coverage changed.

## Acceptance

The exact stored failed request completed with the real configured Nemotron model and remote-verified LangSmith tracing in **10.44 seconds**, calling `prepare_reviewed_comparison`, `simulate_current_comparison`, and `interpret_current_result`. It used reviewed-preset inputs and fresh SciPy results, not a new live extraction package. No timeout retry was needed in this live success. The local browser also completed the same question in **8.2 seconds**, showing three actual tool invocations and an accepted numerical result.

**322 backend tests and 44 frontend tests pass.** New regression coverage includes compact handoff/provenance retention, immutable session inputs, successful timeout recovery without replaying edits/solver, one-retry/deadline limits, and incomplete-draft resumption with the reviewed profile. Verification metadata: `data/research/verification/iv-infusion-timeout-fix.json`. External provider failures can still exhaust the bounded retry; accepted results remain protected.

## Plan decision

**Keep the plan.** This is a reliability repair. Next remains **8B.1 — Grounded synthesis schema and tool**, awaiting authorization.
