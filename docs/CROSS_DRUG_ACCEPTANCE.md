# Cross-drug acceptance — 8E.2

Phase 8 acceptance passes across the reviewed primary workflow, unregistered identities, explicit hypothetical inputs, missing-input continuation and rejected model requests. This verifies software boundaries; it does not establish that every drug has sufficient measurements for a scientifically meaningful occupancy prediction.

## Reproduce the offline matrix

From the repository root, run:

```sh
.venv/bin/python scripts/check_cross_drug_acceptance.py
```

The script runs nine integration cases and writes JUnit, a log and an explicitly labeled report under ignored `work/8E.2/`. No hosted model or credentials are required. Identities, literature, extraction and synthesis are synthetic or scripted. The actual LangChain graph, FastAPI background queue, scientific validators, deterministic solver, citation/result validation, history persistence and verified primary coordinates execute.

| Case | Required outcome |
| --- | --- |
| Reviewed trastuzumab–HER2 | Research/extraction precede the solver; a result-linked answer and verified 1N8Z measurement follow. A runnable proposal produces a child result; history and the original answer survive reopening/restart. |
| Three unregistered identities, including a generated unseen name | Each gets its own preparation, conditional baseline, answer and affinity alternatives. No trastuzumab/HER2/1N8Z result or structure is substituted. |
| Missing dissociation rate | No solver before clarification. A typed, explicitly hypothetical researcher answer enables continuation; provenance remains user supplied. |
| Unknown identity declared hypothetical | Explicit identity declaration and typed assumptions are required. The resulting simulation-only answer claims no paper-derived measurements. |
| Oral administration / irreversible binding | Unsupported outcomes, no solver receipt and no borrowed prior result. |
| Cetuximab/imatinib audits and mismatched structures | Read-only evidence blocks cannot be submitted as simulations. Structure availability matches both drug and target. |
| Extraction outage | Research-only answer and an unavailable extraction label; no numerical claim or unrelated reference result. |

The three unregistered names are three parameterizations of one test, and the unsupported routes/mechanisms are two parameterizations: nine cases in total.

## Live provider and scientific-source checks

Separately from those fixtures, real requests used the configured free NVIDIA Nemotron endpoint and live scientific retrieval. All three LangSmith runs were remotely verified. Aggregate receipts are committed in `data/research/verification/8E.2-acceptance.json`; private stores, raw documents and local test logs remain ignored.

- **Primary research, 84.45 seconds:** the original threefold-half-life versus tenfold-affinity question with IV infusion completed. Both the population PK paper and pegylated trastuzumab-fragment paper were retrieved as full text, with live provenance. Four extraction attempts included a rejected attempt that the agent corrected. The PK source yielded two accepted candidate values (clearance and central volume); the bounded fragment-source extraction yielded no usable values. This is an inspected-excerpt outcome, not a claim that the entire paper lacks quantitative data. The agent then configured the separately audited reviewed comparison, ran the solver, interpreted it, inspected 1N8Z and produced a grounded answer. New candidates were not silently substituted into the preset.
- **Invented unfamiliar name, 44.58 seconds:** the live agent returned `needs_inputs`, with no accepted identity, paper, simulation or borrowed structure. Recoverable tool argument/assumption rejections remained in the trace. The run demonstrates honest missing-data behavior, not successful scientific support for an invented compound.
- **Primary follow-up, 16.42 seconds:** “Set the occupancy threshold to 95%” produced a child result and grounded answer addressing the original question. Baseline and affinity alternatives crossed within the window; the longer-half-life scenario remained above threshold at the horizon. History retained both results. No structural reinspection was needed for this analytical threshold edit.

These timings are observations from individual runs, not latency guarantees. Successful unfamiliar-drug numerical paths were tested with explicit synthetic inputs; this subphase does not claim a new clinically validated drug preset or an additional successful live literature-to-solver drug.

## Browser rehearsal and fixes

An isolated backend on 8101 and frontend on 3003 used clearly labeled synthetic evidence and a scripted provider, while retaining the real graph, persistence, solver and molecular assets. The production local workspace on 3002 remained separate.

The browser verified the primary grounded answer and structure handoff (the viewer independently displayed the agent's 2.417 Å residue contact), then a new Compound X/Target Y question missing a dissociation rate, explicit hypothetical input continuation, a twofold/fivefold affinity comparison and restoration after reload. The unfamiliar pair correctly had no verified structure. The backend matrix additionally covers unsupported requests and extraction outages; those are not claimed as live-provider browser rehearsals.

Two presentation defects were fixed:

1. A no-result research answer could display follow-up cards for preserved curves from an earlier drug. Such cards are now hidden for that turn; displayed-result proposal cards explicitly name their drug and target.
2. Reloading during a new drug's missing-input state could restore the previous curves **and their old answer**, overwriting the new research context. Reload now restores only the earlier curves in that case, preserving the new answer, preparation and structure context. Explicit history reopening still restores that result's own answer.

The scripted browser harness also now resumes a preparation rather than restarting research. This is an acceptance-harness correction, not a production-agent change.

## Capability boundaries and next gate

Trastuzumab–HER2 remains the sole reviewed preset. Cetuximab–EGFR and imatinib–Abl audits remain evidence-blocked for automatic clinical PK-to-occupancy simulation. Generalized arbitrary-name research and explicit hypothetical preparation remain available within one-compartment linear PK, reversible noncompetitive mass-action binding, supported IV input and fixed target-site assumptions. Coordinate measurements describe experimental geometry; they do not calculate affinity, docking, molecular dynamics or clinical efficacy.

**Keep the plan.** Phase 8 is complete. Next is 5C: integration and performance profiling on the actual demonstration machine, including plot/playback responsiveness, solver latency, rendering and memory. Then 6A packages the local demonstration and 6B rehearses live and offline recovery.
