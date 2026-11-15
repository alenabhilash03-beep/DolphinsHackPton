# Investigation history, reopening and contextual follow-up — 8D.2

An investigation is now a tree of stored results. Each step is kept exactly as computed, can be reopened, and can be continued. Follow-up answers know the original question and what came before.

## What is stored

Every result in the store records:

- its **parent** result;
- its **origin**: `research`, `agent_edit` (a change in words), `proposal` (a follow-up experiment), `direct_control` (a slider or exact-value edit), `direct_simulation` or `saved_demo`;
- a **title**: the research question, the edit text, the proposal title, or a readable description of the control change such as "Dose per infusion set to 600 mg in Tenfold stronger affinity";
- the **turn** that produced it, when there was one, and a creation time.

A direct control edit carries the configuration it edited. The server finds the stored result with that configuration hash and records it as the parent. Results are never modified after they are stored. One exception is recorded honestly: when a research turn computes a result that is already stored without a turn (the saved demo or a plain simulation with the same ID), the turn is attached to that existing row.

Databases created before this change gain the new columns on start; their results appear as plain simulations with no parent.

## API

| Route | Returns |
| --- | --- |
| `GET /api/agent/investigations/{result_id}` | `InvestigationHistory`: the whole tree containing that result, parents before children, with the original research question when there is one |
| `GET /api/agent/results/{result_id}` | `StoredResult`: the stored result unchanged, its origin, parent, number of children and producing `turn_id` |

A `HistoryEntry` holds identifiers, origin, depth, title, applied changes, drug and target, window and threshold, up to three scenario outcomes (endpoint occupancy, threshold status, time above threshold), the answer's verdict and statement, up to four paper titles with a count, the inspected structure ID, the number of children and whether an agent experiment was already run from it. It contains no time series. A tree is cut at 80 entries with `truncated: true`.

## Continuing and branching

- By default a result accepts **one** agent experiment. A second request from the same result is refused (HTTP 409), so a stale tab or a late request cannot silently fork it. This is unchanged.
- `AgentEditRequest.branch: true` says explicitly "continue from this earlier result". It skips only that one check. The base identifiers, configuration hash and revision are still verified, and nothing stored is changed. The first experiment run from a result remains its default continuation.
- Direct control edits never use up that one agent experiment.
- `GET …/proposals` for a result that already has an experiment returns `superseded` with its proposals and a note that running one starts a new branch.

## Context for follow-up turns

An edit or proposal turn receives:

- the **original research question**, taken from the nearest research step in its ancestry;
- **at most six earlier steps**, each a title, origin, applied changes, one short outcome line per scenario, and the earlier verdict and answer (300 characters).

With a question in the ancestry, the synthesizer is told that this result follows an experiment change and must answer the original question with this result only. `ScientificSynthesis.original_text` is then the question, and `AgentTurn.original_text` remains the change. Earlier steps are background: their numbers are not allowed in statements and their conclusions must not be copied. Without a research question (for example edits of the saved demo) the turn behaves as before and its verdict stays undetermined.

Two additions keep earlier context from distorting the answer:

- the current result's threshold outcomes are sent as a stated fact, including the ordering when exactly one compared scenario is still above the threshold at the end of the window;
- an answer or implication saying that both or all scenarios stay above the threshold is refused when the solver says otherwise.

## Workspace

**Investigation history** appears once there are two or more steps. Each step shows its number and kind, title, window and threshold, papers read and structure inspected, applied changes, one line per scenario, and the verdict and answer. Steps are indented by branch depth. The displayed step is marked.

- **Reopen** loads a stored result and the answer of the turn that produced it. Nothing is recalculated. A newer reopen request wins over an older one.
- When the displayed step already has an agent experiment, a notice says that a change in words or a follow-up experiment from here starts a new branch, and such requests are sent with `branch: true`.
- After a reload the workspace returns to the result that was on screen, including a result made by a direct control edit, and the history is rebuilt from the server.
- The history shown always belongs to the displayed result; a late response for other curves is ignored.

## Verification

```sh
.venv/bin/python -m pytest apps/api/tests/test_investigation_history.py
npm run test:workspace --workspace apps/web
```

Backend tests cover research → direct edit → agent follow-up → reopen → continue; the tree's order, depth and summaries; bounded context and payload size; branching rules and immutability; persistence across a restart and older databases; long chains; and parent linking of direct edits. Frontend tests cover row rendering, the branch rule, ignoring history for other curves and the proxy routes. Browser and live outcomes are in `data/research/verification/8D.2-history.json`.

## Not included

There is no deleting, renaming or merging of steps, no comparison view between two steps, and no export. Needs-input research turns that produced no result are not listed, because the history is a tree of results.
