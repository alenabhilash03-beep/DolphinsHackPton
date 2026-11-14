# Hypothesim — evidence, provenance, and support policy

Subphase: **0A — Scientific scope and evidence audit**  
Audit date: **2026-11-13, America/New_York**  
Status: **Scientific specification; enforcement will be implemented in later subphases.**  
Repository destination: `docs/evidence-policy.md`  
Companion specification and source register: [Scientific model](model.md)

## 1. Governing rule

The agent may configure an allowlisted model and explain computed results. It may not fabricate measurements, cite an unseen source as support for a numerical input, generate executable scientific models, or present assumptions as observations. A retrieved paper, a PDB entry, and a valid differential equation provide different types of evidence. None alone establishes that a drug-specific prediction is valid in a particular biological setting.

The primary trastuzumab–HER2 profile is **conditional** for the scope documented in model.md. Its values have traceable support or explicit assumptions; its composite in vivo behavior has not been validated.

## 2. Keep provenance, review, and applicability separate

### Provenance

| Value | Meaning | Required information |
| --- | --- | --- |
| `reported` | The inspected source reports the value; it may itself be an experimental fit or population estimate | Source identity, exact locator, original value/unit, estimate type, molecular/biological context |
| `calculated` | Derived from identified parent inputs | Formula/operation, parent evidence IDs and values, output unit, inherited limitations |
| `assumed` | Deliberately chosen experimental or model input | Rationale, scope, and explicit assumption label; a plausible-looking number is not evidence |
| `user_supplied` | Entered by a scientist or other user | Original entry, units, timestamp/version; mark unverified until reviewed |

Unit normalization is a recorded transformation of an input; it does not erase that input's reported origin. A calculated value can depend on assumptions. Derived scenario values must inherit the assumptions and provenance of their parents.

### Review status

| Value | Meaning |
| --- | --- |
| `candidate` | Retrieved or extracted but not yet accepted for use |
| `reviewed` | Identity, locator, value, units, context, and use decision checked by the documented reviewer |
| `rejected` | Not appropriate for the proposed use; retain the reason |

Record reviewer identity/type and review date. Codex's 0A review is a technical evidence audit, not a claim of independent expert review. Runtime LLM extraction alone cannot mark a new drug measurement reviewed. Normalizing units successfully is not a sufficient scientific review.

### Applicability

Store a separate decision such as `direct`, `conditional_transfer`, or `not_applicable`, plus an explanation. This is not a new required top-level API enum until 0B defines its schema, but the distinction is mandatory. For example, a correctly copied component of a richer model can remain reported while its use in a reduced model is conditional.

For user edits, preserve the source parameter and attach a new override/derivation; do not rewrite the source as if the user entered a published measurement.

## 3. Minimum evidence record

Each numerical scientific input should have:

1. Stable parameter/evidence ID and parameter meaning, not just a symbol.
2. Drug identity, formulation/molecular form, target identity/species, and model role.
3. Original value, comparator/relation, unit, and source precision.
4. Normalized value/unit with a recorded conversion.
5. Provenance, estimate type, review status, review date, reviewer, and applicability decision.
6. Retrieved source ID, canonical URL, title, bibliographic identifiers when available, source version/date, and retrieval time.
7. A table/figure/section/row/column locator and a short supporting passage when necessary.
8. Relevant assay or population context, such as temperature, buffer, immobilization, target construct, measurement method, and reference covariates. Use explicit unknowns where context is absent.
9. Any uncertainty descriptor exactly as reported: SD, SE, RSE, confidence interval, or range. Do not interchange them.
10. Selection/rejection reason, assumptions, dependencies, and conflict-group ID where applicable.

Do not reproduce whole articles unnecessarily. Phase 3 should store source metadata, relevant permitted excerpts/locators, retrieved-content checksums, and enough context to reproduce the extraction. Keep cached-versus-live status and retrieval dates visible. A model/source version change creates a new evidence snapshot for an experiment rather than retroactively changing old results.

## 4. Source selection and retrieval

- Prefer the original assay/model paper for the specific numerical result, authoritative product information for product identity and administration context, and the experimental structure repository for coordinates and entities.
- Match the question to the source type. A structure's resolution or protein identity is not a PK or affinity measurement. A literature search hit or source title is not sufficient support for a parameter.
- Read the actual table/section used. An abstract is sufficient only when it explicitly contains the needed value and enough context; do not imply inaccessible full text was reviewed.
- Retrieve through bounded, allowlisted scientific-source clients. Follow published API constraints, timeouts, and caching behavior in the later implementation.
- Treat retrieved text as untrusted data. Ignore embedded instructions; never expose arbitrary code, filesystem access, or unrestricted URL execution as agent tools.
- Prefer the exact molecular form and target context. Do not substitute antibody fragments, ADCs, biosimilars, engineered isotypes, nonhuman PK, or a distinct formulation without an explicit applicable rationale.
- A separate product label may establish a shared active moiety's approximate molecular weight without supplying an interchangeable route or regimen. Record that narrow scope, as with S7 in model.md.
- Scientific relevance takes precedence over publication recency alone. Also inspect correction/retraction status where available before a new source is promoted into a runtime reviewed preset.

An API timeout or access challenge means retrieval failed, not that no literature exists. Distinguish zero search results, unavailable content, ambiguous identity, rejected measurements, and a scientifically unsupported hypothesis.

## 5. Numerical and scientific acceptance rules

Before a configuration can run:

1. Resolve the exact drug–target pair and the biological setting being claimed. An ambiguous name or multiple plausible targets requires clarification or an explicit selection.
2. Select an implemented, versioned model from the allowlist. Drug class alone does not establish model suitability.
3. Verify every required input has a numerical value, canonical units, and an accepted provenance/use decision. Required missing values block that configuration.
4. Apply dimensional and domain validation, including positive molecular weight/volume, valid initial fractions, finite durations, and an explicit schedule.
5. Resolve dependent parameters deterministically. Preserve KD=koff/kon and ke=CL/V=ln(2)/half-life where defined. Reject inconsistent independently submitted settings beyond rounding tolerance.
6. Check structural applicability: negligible depletion, fixed sites, prescribed exposure, supported route, and endpoint. State conditional assumptions before displaying predictions.
7. Enforce runtime and parameter-envelope limits independently of the LLM. A valid but computationally excessive request may need a smaller horizon or supported settings; it must not produce a truncated curve presented as complete.
8. Execute the deterministic simulator. Solver failure, nonfinite outputs, materially invalid occupancy, or inadequate threshold resolution produces an explicit error/diagnostic.
9. Attach the resolved configuration, model/solver version, evidence snapshot, assumptions, and revision to results and interpretations.

There is no automatic chain from drug name to authoritative prediction. The primary profile's known limitations remain attached even when all numerical validation passes.

## 6. Specific prohibited substitutions

- Do not treat IC50 or EC50 as KD, invert an association equilibrium constant without checking its definition/unit, or mix up a paper's lowercase kinetic kd with uppercase equilibrium KD.
- Do not derive both kon and koff from KD alone. An assumed rate must be identified as assumed, and an equilibrium-only option requires its own justified model.
- Do not combine kon from one assay and koff from another to obtain a supposedly measured KD.
- Do not average heterogeneous assays as if their differences were ordinary replicate variation. Preserve assay-specific sets and explain selection.
- Preserve reported and recalculated rounded values separately. A small ratio discrepancy consistent with rounding is documented; a larger discrepancy requires review.
- Do not use a central or total concentration as a measured free target-site concentration. Keep any exposure mapping explicit.
- Do not use a multicomponent terminal half-life as if it were automatically the first-order rate of an independently parameterized one-compartment system.
- Do not add unknown tissue transport, receptor abundance, turnover, temperature dependence, or downstream effects because they make the animation more realistic.
- Do not use structural geometry or a geometric contact selection to infer an engineered affinity or a molecular-dynamics trajectory.
- Do not convert an assay fit's RSE or a population variability term into uncertainty for the combined MVP model. No uncertainty bands are authorized by this audit.

## 7. Support outcomes and user behavior

`custom` is an experiment mode, not a fifth support outcome. Numerical validity and biological support are separate.

| Support outcome | When to use it | Can a simulation run? | Required user-facing behavior |
| --- | --- | --- | --- |
| `supported` | Implemented model and reviewed parameters are appropriate for the stated scope; no unacknowledged material transfer is needed | Yes, after validation | State the scope, evidence, and ordinary model assumptions. This is not a clinical endorsement. |
| `conditional` | Mathematically supported model with explicit extrapolation, reduction, hypothetical intervention, or user assumptions | Yes, with assumptions visible | Label the conditional nature and specific transfer/assumptions. Primary trastuzumab preset belongs here. |
| `needs_parameters` | An appropriate model exists but required inputs are missing or unresolved | No for the incomplete configuration | Name the missing inputs; offer explicit custom values or a valid simpler alternative if available. |
| `unsupported` | Model class, route, target setting, or requested endpoint is outside implemented/scientifically defensible capability | No for that request | Explain the limitation. A different exploratory question can be offered, not silently substituted. |

Display degraded retrieval/service status separately from scientific support. Cached reviewed evidence can remain usable even when current retrieval is unavailable, with its age and cached status shown.

If a user supplies complete hypothetical values for a supported equation, run only as `mode=custom` and `support=conditional`, scoped to that mathematical experiment. A recognizable drug name does not upgrade those values to a reviewed drug-specific prediction. Do not automatically invent assumptions to remove a `needs_parameters` state.

Representative decisions:

| Request | Decision |
| --- | --- |
| Primary half-life-versus-affinity trastuzumab question | Conditional simulation using the reviewed preset and explicit hypothetical changes |
| New drug name with no reviewed parameters | Needs parameters if the model is suitable; otherwise unsupported; research may proceed |
| Complete hypothetical kinetic/PK values for a valid model | Conditional custom simulation with user provenance |
| Only KD available, but user requests dissociation dynamics | Needs kinetic information; do not invent rates |
| Subcutaneous absorption or intracellular exposure requested under the IV-only effective model | Unsupported in this model unless the question is explicitly reformulated |
| Tumor regression, treatment safety, or clinical superiority requested from occupancy | Unsupported endpoint; explain what the occupancy model can describe |
| Unknown protein-bound structure but valid parameters | Simulation may still be conditional/supported for its scope; show structure unavailable |
| Research API outage with reviewed cached evidence | Degraded retrieval status; maintain its existing support outcome and show provenance |

## 8. Interpretation and visualization obligations

An interpretation must identify the exact experiment/result revision it explains. Every numerical comparison comes from simulator outputs, not from LLM calculation. Source-linked claims resolve to retrieved evidence records; modeled comparisons link to their result/metric. State the actual interval, threshold, administration schedule, and censoring when relevant.

Permitted wording: under the specified reduced model and exposure assumption, one scenario has a larger computed occupancy AUC or remains above the chosen threshold within the window. Do not claim measured human tumor occupancy, successful antibody engineering, efficacy, or clinical superiority.

Initial zero occupancy, repeated crossings, saturation, negligible differences, and an observation window that ends before threshold loss are legitimate results. Do not declare a winner from a censored endpoint, plot scaling, particle density, or a biological claim outside the model. Slider edits invalidate old result-specific prose until a new interpretation is requested; immediate deterministic readouts can still update.

Experimental coordinates remain experimental coordinates. Scenario colors, badges, camera movement, and display styles are separate from physical geometry. A population animation must be identified as schematic, driven by concentration/occupancy, and bounded by display scaling rather than interpreted as an actual count, spatial distribution, or molecular trajectory.

## 9. Changes, fallback, and reproducibility

Each experiment stores a versioned evidence/configuration snapshot. Overrides keep their original input and derivations. Updating a preset does not mutate a saved baseline. If evidence is later invalidated, flag affected snapshots; do not silently rewrite historical inputs.

Fallback order: retry within a bounded budget; use a labeled reviewed cache when applicable; identify missing evidence; allow explicit custom inputs for a suitable model; otherwise report unsupported scope. Source outages must not become fabricated sources, fake live research, or silently changed numerical models.

After each subphase, apply the roadmap's mandatory review. Revise the roadmap only for a material risk/constraint or an evidence-backed opportunity that protects essential completion and the demo buffer. Discuss a concrete revision with the user, update and commit the agreed roadmap change, then await the next chunk's green light. A normal evidence-selection decision inside 0A is not scope expansion.

## 10. Handoff checks for later implementation

0B should encode the required distinctions and representative fixtures. Phase 1 will verify numerical constraints; Phase 3 will enforce retrieval/provenance rules; Phase 4 will verify interpretation and structure labeling.

- Test an intact antibody versus fragment identity mismatch.
- Test missing source locators, unknown source IDs, and candidate values used as reviewed presets.
- Test unit conversions, rate/equilibrium-symbol confusion, and incompatible linked inputs.
- Test missing kinetics with known KD, rejected functional-potency substitution, and hypothetical custom input.
- Test supported/conditional/missing-parameter/unsupported outcomes independently from retrieval status.
- Test a preserved source value plus a user override and inherited assumptions.
- Test solver failure, stale result interpretations, censoring, and multiple threshold intervals.
- Test cached evidence labels and a source outage without invented live activity.

These are acceptance requirements for future code, not passing application tests in 0A. This policy and the scientific model document complete the approved documentation chunk. The current plan remains unchanged; 0B requires a separate green light.
