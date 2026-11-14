# Drug identity and scientific eligibility (7A)

This layer answers two separate questions: which molecular record was requested, and whether Hypothesim has an applicable reviewed model profile. It does not configure an experiment, invoke Nemotron, or run the numerical solver. Broader agent wiring and experimental editing belong to 7C; full experiment integration belongs to 7D. A diagnostic assessment panel is available in the current local workspace.

## Test locally

With the local launcher running, open the [workspace drug-support panel](http://127.0.0.1:3002/preview/plots#drug-support). Use the Herceptin, Imatinib, Gleevec, Unsupported route, and Unknown name buttons, or fill in the structured fields and click **Check drug support**. Results expose identity candidates, source status, missing inputs, and reviewed model limits. Gleevec offers explicit candidate-selection buttons. Editing a field clears the old assessment and cancels an outstanding request. These checks leave the experiment below unchanged and never invoke the LLM or solver.

For raw API testing, open [FastAPI docs](http://127.0.0.1:8001/docs), expand **Drug support → POST /api/research/assess**, select one of the provided examples, and click **Try it out → Execute**. The same route is forwarded by Next.js at `http://127.0.0.1:3002/api/research/assess`.

Example request:

```json
{"drug_name":"Herceptin","target":"HER2","route":"iv_infusion","endpoint":"target_occupancy"}
```

Expected outcomes:

| Request | Identity | Scientific outcome |
| --- | --- | --- |
| `trastuzumab`, `Herceptin`, or `CHEMBL1201585` | Same reviewed intact-antibody profile | Conditional model eligibility, explicit defaults/capabilities, configuration still required |
| Trastuzumab with target EGFR, form Fab, oral route, or efficacy endpoint | Reviewed identity, incompatible requested scope | Unsupported for this profile; no experiment or result |
| Trastuzumab with route `IV` | Reviewed identity; administration ambiguous | Needs explicit infusion versus bolus clarification |
| `imatinib` | ChEMBL candidate `CHEMBL941` | Needs a reviewed drug-target model and parameter/evidence package; no simulation approval |
| `Gleevec` | Parent and mesylate records match the brand | Ambiguous; specify a preferred molecular-form name or identifier |
| `Gleevec` with molecular form `imatinib mesylate` | Candidate `CHEMBL1642` | Identity is narrowed, but no reviewed simulation profile is conferred |
| Unmatched name | No exact record found | Needs an unambiguous identity; absence of an exact match is not proof that a drug or its literature does not exist |
| Provider outage | Valid cached candidates, if available; otherwise unavailable | Cache age/status remains explicit; never fabricate an identity or profile |

`model_eligible` means only that the structured drug/target/form/route/endpoint metadata fits an existing reviewed profile. **Every assessment has `runnable:false` and `configuration_required:true`.** No `ExperimentConfig` or `SimulationResult` is returned. The actual scientific configuration and its provenance must still pass deterministic validation.

## Planned preparation workflow

The revised Phase 7 plan adds a separate preparation workflow for drugs without reviewed presets: source-backed parameter extraction, model applicability checks, missing-input clarification, explicit researcher assumptions and deterministic configuration. It does not change the existing 7A assessment contract or make an identity match runnable. Reviewed profiles will be defaults/reference cases rather than the only permitted drug names. The contracts, retrieval/extraction tools and deterministic preparation runtime are implemented through 7B.3; see `PREPARATION_WORKFLOW.md`. Generalized agent orchestration and the UI remain pending. The next chunk is 7B.4 (reference audit). See `docs/IMPLEMENTATION_PLAN.md`.

## Inputs and result contract

`DrugAssessmentRequest` accepts a required `drug_name` and optional `target`, `molecular_form`, `route`, `endpoint`, and `original_hypothesis`. Original hypothesis text is preserved, including whitespace, but `hypothesis_parsed:false` explicitly states that natural-language interventions were not assessed by 7A. A successful identity assessment does not approve every instruction in that text.

`DrugAssessmentResponse` exposes the identity and lookup status, candidate list, source URLs, identifiers, molecular-form scope, retrieval timestamp or reviewed identity-check date, profile/version, target identifiers, support reasons, ambiguities, missing inputs, applied defaults, and model capabilities. A missing optional field defaults to the sole reviewed profile's value only when explicitly reported in `defaults_applied`.

Shared contracts are defined in `apps/api/app/schemas/drug_support.py` and exported through OpenAPI and `apps/web/lib/contracts.generated.ts`. Frontend aliases are exported from `apps/web/lib/contracts.ts`.

## Reviewed catalog and source boundaries

`data/drugs/catalog.json` links the existing scientific profile to its canonical name, ChEMBL identifier, profile version, gene-symbol alias, and reviewed target/form aliases. The catalog loader validates profile identity, safe file selection, molecular form and target linkage. Scientific parameter evidence stays in the existing audited profile; a catalog entry or a ChEMBL record alone does not validate new parameters.

Registered names and explicitly registered identifiers resolve locally. Other names use a bounded [ChEMBL molecule API](https://www.ebi.ac.uk/chembl/api/data/docs) lookup: exact preferred name first, then exact synonym if no preferred-name record matches. A ChEMBL identifier uses its exact record endpoint. Punctuation and salt suffixes are preserved. The client does not collapse parent compounds and salts, select the first ambiguous match, follow extra result pages, or infer target binding from molecule identity. A unique exact preferred name is more specific than an ambiguous brand synonym.

The connector caps payload size at 1 MB, makes at most two HTTP requests with a four-second socket timeout per request, and returns at most five candidates. Truncated pages stay ambiguous. Retrieved metadata has `database_candidate` provenance; no PK/binding numbers are extracted or promoted. Database preferred names describe records, not independently validated formulation or biological-model applicability.

Successful identity lookups may be cached in ignored `work/identity-cache/`. Checked-in seed fixtures live in `data/research/identity-cache/`, keyed by the normalized query's SHA-256. On an outage, a valid cache retains its original retrieval time and is labeled `cached_degraded`. Wrong-query, wrong-source, corrupted or review-promoted cache records are rejected. Provider identity mismatches fail closed rather than silently falling back to an unrelated record.

## LangChain tool and live check

`build_assessment_tool` in `app/agent/assessment_tool.py` returns a real typed LangChain tool named `assess_drug_model`. Its invocation schema is `{"request": {"drug_name": "Herceptin"}}`. It calls the same assessment service as the API. The existing three-tool primary agent remains unchanged; 7C will connect this eligibility tool to the generalized experiment workflow.

```sh
uv run python scripts/check_drug_support.py --live
```

This contacts the public identity API and verifies registered, candidate and ambiguous cases without an LLM or solver call. Add `--refresh-cache` only when intentionally refreshing the checked-in identity fixtures after reviewing the records. An outage/cache response is not reported as a successful live check. The ordinary test suite uses fixtures and injected clients.
