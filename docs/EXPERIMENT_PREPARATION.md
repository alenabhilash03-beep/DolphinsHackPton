# Experiment preparation contracts — 7B.1

Status: contracts, model requirements, synthetic examples and tests implemented. Agent-callable [retrieval/extraction services](EVIDENCE_EXTRACTION.md) are implemented in 7B.2; applicability/configuration and persisted clarification are 7B.3; agent orchestration is 7C; workspace integration is 7D. There is no preparation HTTP endpoint or new runnable drug in this chunk.

## Agent ownership and tool boundaries

Nemotron is the LLM behind the LangChain agent. The agent will research each hypothesis by calling source-search/retrieval tools, perform source-grounded structured parameter extraction through a tool, request applicability checks, resolve missing inputs, configure the experiment through a tool, call the numerical solver, and interpret the actual returned result. The user does not manually run a separate research pipeline. Tools handle bounded I/O and deterministic validation/computation; the LLM never supplies numeric simulation outputs or executable equations.

Planned service/tool interfaces use the following records:

| Stage | Input/output contract | Authority |
| --- | --- | --- |
| Start research | `PreparationRequest` → preparation ID/revision and research state | Agent calls identity and retrieval tools; drug names are not an allowlist |
| Retrieve/extract | Sources and `PreparationParameter` records → `ResearchPreparation` | Extraction proposes source-grounded candidates; no review promotion |
| Assess applicability | Preparation evidence → checks and missing inputs or `ready_for_configuration` | Deterministic service checks supported model requirements and context |
| Clarify/resume | `PreparationAnswers` with base revision/hash → new preparation revision | Researcher answers or explicit assumptions; service rejects stale answers and revalidates |
| Configure/run | Validated preparation → `ExperimentConfig` → existing `SimulationResult` | Separate configuration/provenance and solver validation gates; planned for 7B.3 |
| Interpret | Current configuration/result IDs and numerical outputs → cited explanation | Agent explains actual returned results and limitations; 7C integration |

These are service contracts, not implemented tool endpoints. Existing 7A assessment remains metadata-only and unchanged. The existing `ExperimentPreparation` in `schemas/contracts.py` is the legacy primary-agent outcome; the new `ResearchPreparation` deliberately has a distinct name and cannot be submitted to `/api/simulations`.

## Records and provenance

`PreparationRequest` retains the original hypothesis text (including whitespace), arbitrary drug name, and optional target, form and route; the default endpoint is target occupancy. Unknown scientific context remains null.

Each `PreparationParameter` carries a finite numeric value, unit, original value/unit, normalization explanation, canonical drug identity, target/form/context where available, applicability notes and one of:

- `reported`: source ID, supporting passage and locator. Source records retain URL, title, content kind, retrieval time, status, identifiers and optional snapshot hash. A passage cannot reference an unavailable source.
- `calculated`: parent parameter IDs and an explicit formula. Parent references must exist and be acyclic; selected ancestors must also be applicable. Formula strings are documentation, not executable code.
- `researcher_assumed`: rationale and timezone-aware entry time. These values remain explicit hypothetical inputs rather than reported measurements.

Keep all conflicting candidate records; `selected_parameters` identifies the evidence proposed for each model field. A selection must reference evidence for the same field. Ready records additionally require matching drug/target identities, canonical units, compatible/conditional selected evidence and derivation parents, all ten named check results, explicit model/exposure assumptions, a supported route/endpoint and no missing inputs. These are **record-integrity checks**, not verification that a cited passage is true, that extraction is faithful, or that the recorded applicability checks actually ran. 7B.2 must verify passages against retrieved content; 7B.3 must compute applicability results rather than trusting LLM-authored checks.

`evidence_sha256` identifies a preparation evidence version. 7B.1 validates its format only. 7B.3 must define canonical hashing, recompute it server-side, persist revisions and reject stale answers. A client-provided hash, profile name or readiness state is never authorization to run. `base_experiment_id` and `base_configuration_sha256` appear together when preparation starts from an existing experiment; `parent_preparation_id` supports lineage. An existing audited profile can only be loaded through the registry in later configuration; schema fields cannot confer review status.

## Readiness states and revisions

- `identity_clarification`: identity or form unresolved.
- `researching`: research, extraction or revalidation underway.
- `needs_inputs`: actionable missing-input questions, units where applicable, and allowed resolution types.
- `unsupported`: requested mechanism or scope has no applicable implemented model.
- `source_unavailable`: evidence access failed; do not claim evidence absence.
- `failed_validation`: evidence/configuration checks did not pass.
- `ready_for_configuration`: structurally complete preparation metadata awaiting authoritative configuration validation.

Every preparation record has **`runnable:false` and `configuration_required:true`**, including ready records. There is intentionally no `ready_for_conditional_simulation` state yet. Only a separately validated experiment can reach the simulator.

`validate_preparation_transition(previous, current)` requires matching preparation ID and the next revision. Missing-input answers must return through research/revalidation before readiness; changed requests and changed ready records must also return to research. Recoverable source failures and unsupported outcomes can restart research. The helper does not persist records or enforce concurrency by itself; 7B.3 must invoke it inside its update service.

## Implemented mathematical model requirements

`simulation/capabilities.py` reads the existing model/version and computational limits from `simulation/registry.py`. It describes one-compartment linear PK with effective kinetic target occupancy, IV infusion or explicit hypothetical IV bolus, and target occupancy as endpoint. Requirements are independent of drug name.

Canonical fields include volume (L), clearance (L/hour), half-life (hour), association (nM^-1 hour^-1), dissociation (hour^-1), KD (nM), molecular weight (g/mol), body mass (kg), and target-exposure factor (dimensionless). Administration, horizon, initial conditions and analytical threshold are additional configuration inputs. Half-life/clearance and KD/rates must remain linked. Actual domains, numerical relationships, schedules and evidence-to-value checks remain authoritative in validated configuration; recorded preparation checks are not substitutes.

Equilibrium-only occupancy, oral absorption, intracellular transport, ATP competition and downstream efficacy are not implemented. No automatic mapping of blood concentration to intracellular Abl exposure is permitted. KD alone cannot create kinetic rates. Adding a future equilibrium model requires documented equations and reference checks; merely adding its name to metadata does not implement it.

Current `ExperimentConfig` accepts reviewed presets or existing hypothetical custom configurations, and restricts candidate evidence use. 7B.3 must deliberately introduce a research-derived configuration/provenance path with tests. Do not relabel candidates as reviewed or weaken current safeguards just to pass preparation into the solver.

## Inspect and test

The five examples in `data/examples/preparation-contracts.json` cover a preset-path record, complete unregistered preparation, missing kinetics/exposure inputs, incompatible assays and unsupported mechanism. **All numeric values, compound identities and source passages are synthetic contract fixtures, not usable scientific evidence.** Zero-filled hash examples are placeholders, not computed evidence hashes. The preset-path example tests profile fields without asserting an actual audited profile.

OpenAPI publishes these schemas under components; it adds no execution route. Frontend consumers can import the named types from `apps/web/lib/contracts.ts`. Standalone JSON Schema is `contracts/preparation.schema.json`; Python validators enforce cross-field checks beyond JSON Schema.

```sh
.venv/bin/python -m pytest apps/api/tests/test_experiment_preparation.py
npm run contracts:check
npm run typecheck
```

7B.2 retrieval/extraction tools are complete. Next chunk: **7B.3**, deterministic applicability/configuration and missing-input resolution. Agent orchestration remains in 7C; these services will be called by that agent, not run as a substitute for it.
