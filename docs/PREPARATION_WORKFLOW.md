# Conditional experiment preparation — 7B.3

Implemented: persistent preparation, missing-input resolution, explicit unit conversion, deterministic configuration and scientific simulation tools. There is no drug-name model allowlist: an unregistered, resolved identity can use the implemented equations when compatible evidence and explicit assumptions are supplied. The generalized Nemotron orchestration remains 7C; the integrated workspace flow remains 7D. This service configures **one structured baseline** and explicitly returns `hypothesis_parsed:false`; natural-language interventions/comparisons are not silently inferred here.

## Agent-facing tools

`build_preparation_research_toolkit(service, extractor=...)` composes the three 7B.2 evidence tools and five new preparation tools over **the same source-document session**. Use one session per future agent preparation. The injected structured extractor is optional; the configured NVIDIA extractor is used lazily by the evidence tool. No LLM is called by preparation, validation, unit conversion or numerical execution.

| Tool | Responsibility |
| --- | --- |
| `start_experiment_preparation` | Resolve identity through 7A and report missing structured inputs; does not search papers or copy preset parameters |
| `read_experiment_preparation` | Read the current record, original hypothesis, provenance, questions, revision and evidence hash |
| `update_experiment_preparation` | Submit snapshot IDs, original extracted values, explicit researcher assumptions, selections, scope/design or outstanding clarification answers |
| `configure_prepared_experiment` | Revalidate a ready record and produce a conditional `ExperimentConfig` with a durable server validation receipt |
| `simulate_prepared_experiment` | Invoke the deterministic numerical engine on that registered configuration |

The future agent owns the research → extraction → applicability → clarification → configuration → simulation → interpretation sequence through these tools. It must not fill missing measurements from general knowledge or manufacture researcher assumptions. Structured design/model assumptions must be explained as assumptions; unsupported or ambiguous biological requests must remain blocked or clarified. Tool availability in this chunk is not a claim that the current primary agent already uses them.

## HTTP interfaces

| Method/path | Body or output |
| --- | --- |
| `POST /api/preparations` | `CreatePreparation` → `PreparationRecord` (201) |
| `GET /api/preparations/{id}?revision=N` | Current record or an immutable historical revision |
| `POST /api/preparations/{id}/revise` | `PreparationUpdate` → newly evaluated record |
| `POST /api/preparations/{id}/configure` | `PreparationVersion` → `ConfiguredPreparation` |
| `POST /api/simulations` | Existing `SimulationRequest`; research-derived configurations require their registered receipt |
| `POST /api/simulations/adjust` | Existing direct controls, preserving hypothetical provenance and recording parent configuration lineage |

The new endpoints appear under **Experiment preparation** in [local Swagger](http://127.0.0.1:8001/docs) after restarting the launcher. Frontend types are exported from `apps/web/lib/contracts.ts`. No new Next.js preparation proxy or user-facing setup form is added here; the UI contributor can integrate against these contracts in 7D.

Start example:

```json
{
  "request": {
    "drug_name": "imatinib",
    "target": "ABL",
    "route": "hypothetical_iv_bolus",
    "original_hypothesis": "Explore a hypothetical bloodstream-input model for this drug and target."
  }
}
```

Creation performs identity lookup only. It returns explicit missing inputs, not a research answer or curves. Every revise/configure request must include the latest `base_revision` and `base_evidence_sha256` from the response; stale versions return **409**. Invalid source claims, unsupported payload fields or malformed inputs return **422** without changing the prior record. Model incompatibility/missing evidence is represented by the preparation state and reasons. Unknown record IDs return **404**.

## Scientific inputs and decisions

`PreparationScope` explicitly declares molecular form, species, target compartment, binding/PK regimes, competition assumptions and rationale. Supported equations remain linear-effective one-compartment PK plus reversible 1:1 effective kinetic occupancy. Irreversible/cooperative binding, an explicit competition model, other PK models, oral/subcutaneous input and downstream efficacy endpoints are not implemented. Unknown mechanism/competition asks for clarification. Unspecified IV asks infusion versus hypothetical bolus; the service does not choose one.

Identity resolution is separate from preset eligibility. A 7A `candidate_identity` without a profile is allowed to proceed to evidence assessment. Original identity source/lookup metadata is retained. An absent/ambiguous/unavailable identity does not automatically become known: a researcher can explicitly declare a hypothetical identity with a rationale, after which only researcher-assumed parameters are permitted. That path never claims a verified database record or measured drug properties.

A reported input must cite server-retrieved snapshot IDs and exact passages. Callers cannot upload a source object, assign review or pass applicability checks. At least one cited passage must support the original scalar number/unit; additional context passages may come from the same publication, including other pages. Source bounds/ranges are not exact scalar parameters. Context strings must be word-delimited source mentions. Unsupported normalizations and formulas supplied by a caller are rejected. Source content remains data, never executable code.

For selected inputs, checks include:

- Resolved/proposed drug and target identity, molecular form and species. Binding sources must mention the declared target; identity labels alone are insufficient. Common directly named salt qualifiers beyond the resolved form are blocked rather than silently transferred; this is a conservative screen, not complete chemical entity understanding.
- Explicit IV/population context for reported PK; apparent oral CL/F and V/F do not become IV clearance/volume.
- Matched publication and declared assay/population context for reported PK/binding combinations. Identical numbers or generic context strings from unrelated papers do not establish compatibility. Hypothetical composites remain explicitly assumed inputs.
- Positive finite model parameters (exposure factor can be zero), canonical units, model horizon/event limits, ordered/nonoverlapping administration and agreement between event kind and declared route.
- An explicit target-exposure factor and compartment. IV input alone never establishes intracellular concentration. There is no automatic tissue transport, unbound-fraction or ATP-competition calculation.

These checks detect specified inconsistencies and preserve provenance. They **do not prove correct parameter meaning, complete biological applicability, source truth or expert review**. Published observations remain `candidate` evidence and all prepared outcomes remain conditional. For example, a source-matched number can still require scientific review of construct, mutation, cohort or assay interpretation. IC50-containing binding passages are conservatively held for clarification rather than automatically becoming KD. Arbitrary mechanisms do not become supported by supplying enough numbers.

## Units and linked parameters

`preparation_units.py` is an explicit conversion table, not an LLM formula interpreter. Examples include mL → L, mL/min → L/hour, day → hour, s^-1 → hour^-1, M^-1 s^-1 → nM^-1 hour^-1, M/µM/pM → nM and kDa → g/mol. Case is preserved; unsupported/weight-normalized PK units are reported as missing/unsupported conversions. Original measurements and units remain immutable parent records; normalization produces calculated child records with a fixed conversion formula and factor.

The service can derive half-life from compatible volume/clearance, or clearance from volume/half-life. It derives KD from a supplied compatible kon/koff pair. It does **not** invent kon/koff from KD alone, and does not infer a kinetic rate from equilibrium affinity plus an unsupported biological assumption. Supplying inconsistent linked measurements fails validation. Source rounding differences require explicit selection/derivation, not silent numerical alteration. Equilibrium-only occupancy remains unimplemented.

Conflicting candidates require an explicit `selected_parameters` choice. Setting a field's selection to `null` explicitly excludes supplied candidates for that field, allowing an implemented linked derivation when its inputs exist. Replaced/unselected measurements are retained. A new assumption/override needs a new parameter ID, rationale and timezone-aware entry time; existing IDs cannot be rewritten.

`PreparationDesign` carries explicit mg-based events, duration, initial amount/occupancy and an analytical threshold. Default initial values are zero, and the default threshold is 0.9; the returned design and assumptions expose them. These are experiment design settings, not clinical dosing or efficacy thresholds. This subphase prepares one baseline; multiple interventions and natural-language revisions will extend configuration in 7C.

## Persistence, versions and execution gate

`work/preparations.sqlite3` is the default SQLite store; optional `PREPARATION_DB_PATH` overrides it. The store preserves immutable revisions. An update atomically records an internal `researching` revision followed by the evaluated outcome, so successful updates normally increment revision by **two**. Optimistic revision/hash checks and a SQLite write transaction ensure one concurrent writer wins. Failed input validation does not leave a partial revision. Connections close after each operation.

The evidence digest is canonical JSON SHA-256 of the request, identity/provenance, model, scope, design, source snapshots, parameter graph and selections. Presentation state/reasons/check flags are not a source of scientific authority. Ready records still have **`runnable:false` and `configuration_required:true`**. Configuration rechecks the evidence hash, snapshot versions, passages and computed applicability before storing an immutable configuration-hash receipt.

`ExperimentConfig.mode` now includes `research_derived`. Reported measurements retain candidate review status; assumed values map to explicit user-supplied evidence; normalization/linked values remain calculated. The mode does not confer scientific review. The public solver and contract-validation endpoint reject an unregistered or modified research-derived configuration even when its JSON/Pydantic structure is valid. Existing reviewed-preset and custom paths retain their prior evidence rules. Original baseline hash/metrics remain unchanged.

The numerical equations remain independent of the agent. Their service layer checks the preparation receipt before running research-derived input; pure PK/binding functions do not call an LLM or literature provider. Direct controls verify the parent receipt, apply the existing deterministic edit, and register the child with a parent configuration hash. This keeps parameter recalculation independent of the LLM. Historical registered configurations remain reproducible after subsequent preparation revisions; stale *configuration requests* cannot overwrite the current record.

Cache replay preserves the original retrieval time and original snapshot digest reference, while exposing cached status. The original digest reference is assigned from a verified file, not trusted from an incoming cache claim. Configuration checks the stored source version against the current/original verified snapshot version. A changed source requires a new evidence revision. Candidate evidence includes snapshot hash/retrieval metadata and exact source passages in its context for downstream tracing.

## Test locally

```sh
.venv/bin/python -m pytest apps/api/tests/test_preparation_workflow.py
# Local reviewed identity lookup, entirely synthetic software inputs, no external calls or LLM:
.venv/bin/python scripts/check_preparation.py
# Optional arbitrary identity lookup; all numerical values still synthetic, no LLM:
.venv/bin/python scripts/check_preparation.py --live-identity --drug imatinib --target ABL
```

The script calls the actual preparation tools, configures a zero-free-drug dissociation test, runs SciPy and checks occupancy against the analytical exponential solution. It writes a clearly labeled software-test artifact to ignored `work/preparation-check.json`. It does not establish drug-specific PK or a reviewed imatinib model. If live identity is unavailable, a validated 7A cache can be used with `cached_degraded` reported honestly.

API tests cover unregistered source-backed synthetic data, assumption-only input, clarification/resumption, unsupported mechanisms, source/context/form/target mismatch, cache/source versions, units/relationships, malicious formulas, stale/concurrent updates, altered configuration receipts, server restarts, direct controls, and analytical PK/binding checks. Synthetic article/identity fixtures are not scientific evidence.

Next: **7B.4 — reference audit and experimental structures**. Review a real second candidate, initially imatinib–Abl, against these scientific gates. Missing evidence must produce a documented block or explicitly labeled assumptions; it cannot count as a reviewed profile.
