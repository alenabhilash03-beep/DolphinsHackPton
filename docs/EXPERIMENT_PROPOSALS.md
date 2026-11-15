# Runnable follow-up experiments — 8D.1

Every stored numerical result now offers a short list of follow-up experiments that can be run with one click. A proposal is a server-derived, exact change to that result's configuration. It is not written by a language model, and it never changes the drug, target, route or model; those require new research.

## What a proposal contains

`ExperimentProposal`:

- `title`, `observation` (the solver fact that prompted it), `rationale` and `question_tested`;
- `changes`: each with the control field, a readable parameter name, scenario ID and label (or none for the whole comparison), unit, `from_value`, `to_value` and display strings such as `4320 h (180 days) → 8640 h (360 days)`;
- `base_result_id`, `base_experiment_id`, `base_configuration_sha256` and `base_client_revision`;
- `edit_text`: the same change in the supported edit language;
- `proposal_id`: a hash of the base result, its configuration hash and the change.

`GET /api/agent/results/{result_id}/proposals` returns a `ProposalSet`. It works for any stored result, including results created by direct control edits. If an experiment has already been run from that result, the status is `superseded`; the proposals are still listed, with a note that running one starts a new branch (8D.2).

## Rules

Proposals are deterministic and at most four are returned, in this order:

| Kind | When the solver shows | Change |
| --- | --- | --- |
| `extend_window` | At least one scenario is still above the threshold when the window ends | Double the observation window, capped at the simulator's 8760-hour limit; not offered at the limit |
| `stricter_threshold` | Two or more scenarios stay above the threshold for the whole window | Raise the threshold to 95%, or to 99% if it is already at least 95% |
| `double_dose` | An alternative never reaches the threshold | Double its dose |
| `halve_dose` | An alternative stays above the threshold for the whole window | Halve its dose |

Dose proposals apply only to alternatives whose schedule is infusions of one common, non-zero amount. The baseline scenario is never changed. A threshold change is analytical: the curves do not move.

Changed values are hypothetical design inputs. When run, they are recorded with user-supplied provenance exactly as a direct control edit is.

## Running one

**Run this experiment** submits an ordinary edit job with `proposal_id` set. The request does not contain the changes. The server:

1. checks the base result, experiment, configuration hash and revision, as for any edit;
2. re-derives the proposals from the stored base and finds the one with that ID; an unknown or foreign ID is refused as a clarification and nothing is applied;
3. applies its operations through `adjust_experiment`, the same validator the sliders and edits in words use;
4. runs the solver, interpretation and grounded synthesis as an edit turn.

The completed turn records `applied_proposal` and `parent_result_id`. The answer panel shows which proposal produced the result and from which base. The `text` of such a request is only a label; the applied change is always the proposal's.

By default only one experiment can be run from a result. The new result has its own proposals. Since 8D.2 an earlier result can be reopened and continued as an explicit branch; see [INVESTIGATION_HISTORY.md](INVESTIGATION_HISTORY.md).

## Edit language

`experimental_edits.py` now parses a request into structured `EditOperation`s (`parse_edit`) and applies them (`apply_operations`). The whole text must match one supported form or nothing is applied. Two forms were added:

- "Halve the dose in [scenario]"
- "Set the occupancy threshold to 95%" (or a fraction such as 0.95)

Every proposal's `edit_text` parses to that proposal's own operation, so typing it gives the identical experiment.

## Workspace

**Run a follow-up experiment** appears under the scientific answer for the displayed result. Each card shows the title, the question it tests, why, the exact change, the base result and the equivalent edit text. Cards are re-derived whenever the displayed result changes, including after a slider edit, and a card is only shown if it belongs to the displayed result. Buttons are disabled while a run or recalculation is in progress.

The model-written "What to test next" items in the answer remain qualitative suggestions; they are not runnable.

## Verification

```sh
.venv/bin/python -m pytest apps/api/tests/test_experiment_proposals.py
npm run test:workspace --workspace apps/web
```

Backend tests cover: content and stability of proposals for the reviewed result; equality of a run proposal with its edit text and with the direct control, including identical solver metrics and curves; that only the listed parameter changes and the baseline is untouched; stale and foreign bases; rule preconditions and limits; the added edit forms and refusal of partly understood or out-of-scope text; the agent run with attribution; and the API, including results from direct control edits and the superseded state. Frontend tests cover the request built for a run, refusal for a non-displayed result, change text and the proxy route. Browser outcomes are in `data/research/verification/8D.1-proposals.json`.

## Not included

Investigation history, reopening earlier results and branching are 8D.2. Proposals do not yet use paper evidence or structural measurements, and none adds or removes scenarios.
