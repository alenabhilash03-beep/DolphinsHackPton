# Grounded scientific synthesis — 8B.1

Each agent turn can now carry a structured scientific answer, `AgentTurn.synthesis` (`ScientificSynthesis`). It is additive: the deterministic `Interpretation` (solver-linked claims and parameter lineage) is unchanged. The workspace displays it in the Scientific answer panel described under [Presentation](#presentation--8b2).

The language model writes qualitative statements only. The server owns every citation's source metadata and every solver number, and discards the whole proposal if any reference fails validation.

## What the answer contains

| Section | Meaning | Who writes it |
| --- | --- | --- |
| `answer` | One or two sentences with a verdict: `supported`, `not_supported`, `mixed` or `undetermined`. `basis` states whether it rests on paper findings, solver fields, both or neither. | Model, validated |
| `evidence_findings` | `claim_kind: paper_finding`. What an inspected passage reports, with a stance (`supports`, `contradicts`, `context`) and 1–3 citations. `abstract_only` is true when every citation is abstract-only. | Model statement; server citation metadata |
| `simulation_implications` | `claim_kind: conditional_simulation_prediction`. A statement plus the `SolverQuantity` records it refers to. | Model statement; server quantities |
| `next_experiments` | `claim_kind: hypothesis_needing_validation`. Kind (`measurement`, `simulation_change`, `literature_review`), proposal, rationale and what it addresses. Qualitative only; typed runnable proposals are 8D.1. | Model, validated |
| `disagreements` | `origin: synthesis` references two or more findings. `origin: extraction_conflict` comes from competing extracted candidates. | Model / server |
| `missing_evidence` | `origin: preparation` or `extraction` is derived from the preparation's missing inputs or extraction outcomes when no simulation ran. `origin: synthesis` is model-authored. | Server / model |
| `limitations` | Fixed scope statement, model limitations and warnings of the result, access limits, then model-authored additions. | Server first, then model |
| `source_access` | Every inspected source: full text or abstract, retrieval status, extraction outcome, passages supplied and any access limitation. | Server |

A `SynthesisCitation` holds `document_id`, `source_id`, `locator`, the verbatim `quote` and `content_kind`. A `SolverQuantity` holds `result_id`, `scenario_id`, `metric`, the solver's `value` (or threshold `status`), `unit` and a display string. Metrics are `endpoint_occupancy`, `occupancy_auc_h`, `concentration_auc_nM_h`, `threshold_status` and `total_time_above_h`.

`status` is `grounded`, `unavailable` or `rejected`. Only a grounded synthesis contains model-authored text. The other two keep the server-derived sections (source access, missing evidence, extraction conflicts, limitations) and explain the outcome in `notes`.

`basis` is `research_and_simulation`, `research_only`, `simulation_only` or `none`. Result linkage (`result_id`, `experiment_id`, `configuration_sha256`, `client_revision`) is complete or absent.

## What the model is given

Only this turn's material:

- the submitted hypothesis or edit text, drug and target, marked as untrusted data;
- the passages of each retrieved source that were inspected (at most 6 sources, 8 passages each, 36,000 characters), with access kind and extraction outcome. Passages matching the instruction-injection pattern are withheld and cannot be cited;
- validated extraction candidates, known missing inputs and candidate conflicts;
- for an accepted result: its ID, server-formatted metric displays per scenario, configured design values, model assumptions and limitations. No time series, prompts or full provenance.

Audited reference inputs of a reviewed preset are not retrieved passages and are never citable. When the simulation used them, the payload and the limitations say that the inspected papers did not supply the simulation inputs.

The call is a single structured data call with reasoning output disabled, as for extraction. It has no tools.

## Validation

A proposal is rejected, with field-specific feedback for one corrected retry, when:

- a citation names a document or locator not supplied in this turn, or its quote is not a verbatim contiguous excerpt (at least 12 characters) of that passage;
- a finding shares no key term with its own quotes (a coarse lexical check that catches simulation facts filed under a paper citation);
- a statement contains a number that its own references do not contain. Paper findings and disagreements may use only numbers from their cited quotes or the hypothesis. Simulation implications and the answer may use the display values of the metrics they reference, configured design values and the hypothesis. Other sections may use design values and the hypothesis. Spelled-out quantities are checked like digits; identifier suffixes such as HER-2 are not treated as numbers;
- `result_id` names a different result, a metric names an unknown scenario, or solver metrics are referenced when no result exists. An omitted `result_id` binds to the one result that was supplied;
- a determined verdict has no finding or solver reference, a disagreement references fewer than two existing findings, or finding IDs repeat;
- an edit request is given a verdict other than `undetermined` (an edit is an instruction, not a hypothesis);
- a "how long" question is answered `supported` or `not_supported` from solver fields alone while two or more scenarios are still above threshold at the horizon. Their time above threshold is cut off by the observation window and cannot rank them;
- a statement is a serialized list or object rather than prose, or contains an identifier with an underscore (a scenario ID or field name) instead of plain words.

Surplus list items and references are dropped and over-long quotes shortened to a verbatim prefix before validation; a single-string or one-field-object `limitations` shape is unwrapped. Nothing is added or reworded, and every retained item is validated.

`require_current(synthesis, result)` rejects a synthesis for any other result and checks each quantity against its solver field exactly. `AgentTurn` runs it on construction, so a stored turn cannot pair a synthesis with a different result. A direct slider edit produces a new `result_id`, which makes the earlier synthesis stale by this check; 8B.2 uses it to mark the displayed answer.

Validation does not prove that a qualitative statement is entailed by its quote. It guarantees that the quote exists in an inspected passage, that stated numbers come from the statement's own references, and that solver values are the solver's.

## Agent tool and workflow

`synthesize_grounded_answer` takes no arguments. It is recorded in the execution ledger's `interpretation` stage.

- After `interpret_current_result`, it is the only tool offered until it has been attempted, in research and edit turns.
- When research has inspected source text and no result exists, the final decision is withheld until it has been attempted; other research tools remain available.
- It runs at most three model attempts (two corrective retries) and never retries beyond that. It is skipped, with an honest `unavailable` record, when under 30 seconds of the research budget remain, so that a slow synthesis cannot cost an accepted result.
- An `unavailable` or `rejected` synthesis leaves the turn status and numerical result unchanged. The tool record is `failed` or `rejected`; the run can still succeed.
- A turn with no retrieved source and no result has no synthesis (`AgentTurn.synthesis` is null).

Facts the server has already established are sent to the model as `server_rules_for_this_answer` (for example that compared scenarios are all still above threshold at the horizon, with their labels), so the first attempt usually passes. Numbers stated in the supplied model assumptions and limitations may be restated in limitations, missing evidence and next experiments, never in paper findings.

## Presentation — 8B.2

`ScientificAnswer` renders `turn.synthesis` directly under the investigation panel (`#answer`). Logic is in `apps/web/lib/synthesis-view.ts`; nothing is computed or reworded in the browser.

- **Answer first.** The question, a verdict badge that names its basis ("Mixed by the conditional simulation"), the basis of the whole synthesis, then the answer statement.
- **Key solver findings.** Each simulation implication with its solver values as chips: scenario label, metric in words and the server display string. A chip opens the matching plot. Time above threshold is flagged "cut off by the observation window" when that scenario never dropped below the threshold.
- **What the inspected papers report.** Stance, abstract-only marker, statement and verbatim quotes with locator. Each cited source links to the article, to its extraction record in the papers section, to plots, and lists either the simulation parameter records it supplied or its unused extracted candidates. It states when a source was not a simulation input.
- **Then** disagreements, what to test next, and collapsed missing evidence, limitations and source access. Access limitations stay visible in the findings header and under Source access.

States:

| State | When | What is shown |
| --- | --- | --- |
| current | The synthesis references exactly the displayed result (ID, configuration hash, revision) | Full answer |
| stale | The displayed result differs, for example after a slider edit | A notice; answer statement and solver findings dimmed and labelled as from the earlier result; paper findings unchanged |
| evidence only | Research inspected sources and ran no simulation | Answer, findings, missing evidence; no solver section; a note that any curves below belong to an earlier experiment |
| unavailable / rejected | No model text was accepted | The server's note, plus server-derived missing evidence, limitations and source access |
| invalid | Linkage or a quantity does not match the turn's own result | An alert; no answer text or numbers |
| none | Saved demo, or a turn with no synthesis | Nothing; the previous notes remain |

While a current grounded answer is shown, the Evidence view keeps only the sources of the simulation inputs and drops the repeated interpretation claims, limitations and follow-ups. Model details are unchanged.

Not included: typed runnable proposals (8D.1) and investigation history (8D.2). An answer is not regenerated automatically after a slider edit; use an edit in words or new research.

## Verification

```sh
.venv/bin/python -m pytest apps/api/tests/test_grounded_synthesis.py
.venv/bin/python scripts/check_grounded_synthesis.py
.venv/bin/python scripts/run_generalized_agent.py --mode edit --require-tracing
.venv/bin/python scripts/run_generalized_agent.py --mode primary --require-tracing
```

The offline tests use synthetic passages, a scripted synthesizer, the real LangChain agent loop and the real solver. They cover nonexistent, altered and joined citations; unsupported digits and spelled-out quantities; cross-scenario numbers; stale and foreign result references; altered quantities; abstract-only access; contradictory findings and extraction conflicts; no-result research; missing data and provider failure; the corrected retry; withheld instruction-like text; tool ordering; edits; and the time budget.

`apps/web/tests/synthesis-view.test.mjs` covers current/stale/evidence-only/invalid states, solver-value chips and censoring flags, citation-to-paper/plot/parameter links and labels. For browser checks, `scripts/serve_investigation_ui_checks.py` now returns a scripted synthetic answer through real validation; add `--complete-research` to make synthetic research reach a numerical result.

`check_grounded_synthesis.py` calls the live pinned Nemotron synthesizer through the agent tool on the synthetic test abstract. It verifies the software path only. `--mode primary` runs the live reviewed research question and needs Europe PMC access. Recorded outcomes are in `data/research/verification/8B.1-synthesis.json`.
