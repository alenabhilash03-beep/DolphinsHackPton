# Demo examples — 5C.1

These are the questions for the judged demo, chosen from repeated **live** runs (NVIDIA Nemotron, live Europe PMC retrieval, real solver and structure tools) on 2026-11-15. Receipts are in [`data/research/verification/5C.1-demo-examples.json`](../data/research/verification/5C.1-demo-examples.json). Live outcomes vary between runs because paper access and model output vary, so every count below is an observation, not a guarantee.

## Demo mode: recorded replays (default on)

For the judged demo, the two questions below are answered by **replaying a recorded live agent run** instead of calling the model, so they always work and take a predictable time. The replay files in `data/demo/replay/` were produced from real runs through the app's job API (`scripts/record_demo_replay.py`): the same tool calls and outcomes, papers, extracted values, solver result, 1N8Z measurements and cited answer. The server re-emits the recorded steps through the normal execution ledger, paced like the recording and capped at 25 s for the question and 15 s for the follow-up, and stores the result exactly as a live run does (history, proposals, sharing and reload all work). Result IDs are the solver's deterministic hashes, identical to a live run.

| Step | What to do | Replay |
| --- | --- | --- |
| 1 | Experiments → **Use the trastuzumab example** → **Research and simulate** | about 25 s, endpoint occupancy 62.90% / 99.82% / 94.44%, answer *Mixed* |
| 2 | Click the **Run this comparison for 120 days** suggestion → **Update and simulate** | about 15 s, the comparison rerun over 120 days, answer *Follow-up experiment result* |

Matching is exact (typographic apostrophes, case, spacing and a trailing "?" or "." are tolerated). The follow-up replays from the Q1 result or from **Load reference** (same result ID), and can be run more than once (later runs become branches). Any other question or edit runs the live agent. Replayed turns are labelled `recorded_replay` under **Run identifiers & trace**, with the recorded run ID. Turn it off with `DEMO_REPLAY=false`; pace with `DEMO_REPLAY_RESEARCH_S` and `DEMO_REPLAY_EDIT_S`. To re-record, run each question live through the app, save the completed job JSON, then:

```sh
uv run python scripts/record_demo_replay.py --job q1-job.json --name q1-trastuzumab
uv run python scripts/record_demo_replay.py --job q2-job.json --name q2-120-days --edit-text "Run this comparison for 120 days"
```

## Main demo — trastuzumab (HER2)

### Question 1 — the research question

> **Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?**
>
> Drug `trastuzumab` · Target `HER2` · Route `IV infusion` (the prefilled example)

**Live reliability:** 8 of 10 runs completed end to end since the 5C.1 extraction fix (83–131 s). The two others failed for different reasons. One stream was interrupted, now retried automatically (5C.1b). In the other, every extraction was rejected and the run now ends as *needs inputs*. **Always have Load saved demo ready.** Later on 2026-11-15, slow model turns made research finish inside the wrap-up window, which then skipped the reviewed comparison and ended at *needs inputs* (2 of 2 live runs). The wrap-up now still loads and simulates the reviewed comparison once research is complete; after that fix, 2 of 2 live runs completed (109 s and 127 s, 62.90% / 99.82% / 94.44%) and the 95% follow-up completed in 32 s. A further failure mode followed: with model turns of 25–30 s, the deadline arrived after the simulation but before the cited answer, so the answer was skipped (or the whole run failed). The research limit is now 300 s and an accepted result earns a 90 s closing grace for interpretation, structure and the answer. Through the web app's job API afterwards: 3 of 3 completed with a grounded answer (109 s, 185 s, 303 s). Expect up to about 5 minutes when the free endpoint is slow. (See the [5C.1](subphase-reviews/5C.1.md) and [5C.1b](subphase-reviews/5C.1b.md) reviews.)

What the judges see the agent do, in order (all recorded tool outcomes):

1. **Search** Europe PMC and **retrieve** two papers: the Quartino population-PK analysis and the pegylated trastuzumab-fragment SPR study.
2. **Extract cited values.** In every successful run the agent pulled clearance **0.127 L/day** and central volume **2.62 L** from the Quartino paper. These are exactly the audited model inputs from the same paper. In one run it also extracted KD **0.131 nM**, matching the audited affinity. Some extraction attempts are rejected by the validators (a reported range, an EC50 that is not a KD); the agent retries and the rejection is shown, not hidden.
3. **Configure and simulate** the audited comparison: baseline, threefold half-life, tenfold affinity (slower dissociation).
4. **Inspect the real structure** 1N8Z (Fab–HER2 crystal structure) and measure interface contacts, e.g. GLY B:103 ↔ LYS C:593 at 2.417 Å.
5. **Write the cited answer:** endpoint occupancy 62.90% / 99.82% / 94.44% at 180 days. Verdict *mixed / not determined*: both alternatives stay above the 90% threshold for the whole window, so the model cannot yet say which lasts longer.

### Question 2 — the MVP follow-up: "Run this comparison for 120 days"

> **Run this comparison for 120 days** (click the suggestion under **Change the experiment**, then **Update and simulate**)

This is the follow-up the MVP demo uses (owner decision, 2026-11-15). It is replayed in demo mode (about 15 s). The agent reads the stored experiment, changes the comparison window from 180 to 120 days (`duration_h = 2880`), reruns the solver and writes a new cited answer:

- Endpoint occupancy at 120 days: baseline **96.88%**, threefold half-life **99.93%**, tenfold affinity **99.68%**.
- All three stay above the 90% threshold for the whole window, so the answer is *Follow-up experiment result* (not determined): the time above threshold is censored. The answer notes that endpoint occupancy and occupancy AUC are higher for the half-life change.

What it shows judges: the agent iterating on its own experiment from plain words, with the history keeping both steps. It does not settle the question. If you want the follow-up that does, the **"Raise the occupancy threshold to 95%"** proposal card (live, about 25–35 s; 3 of 3 live runs earlier) shows baseline and tenfold affinity falling below 95% while threefold half-life stays above. It is not replayed, so it depends on the live AI service.

### Why this pair

- It shows the full loop twice: research → cited extraction → simulation → 3D structure → cited answer, then the agent changing its own experiment from plain words.
- It is the only path with repeated live success. In demo mode both steps replay recorded live runs, about 40 s in total.
- If the network or model fails during the demo, **Load saved demo** opens the same reviewed result, clearly labeled as saved (browser-checked with the API down).

## What to say, and what not to say

Say: *"The agent decides what to research, reads the papers, extracts cited values, assembles and runs the experiment, measures the real crystal structure and writes an answer where every number links to a paper quote or the solver. The AI never invents a number."*

Also accurate: *"It independently pulled the same clearance and volume the audited model uses."*

Avoid: *"The curves come from the numbers the AI just extracted."* For this question the curves use the audited reference inputs; the fresh extractions are shown alongside and, here, agree with them. Avoid any claim about patient outcomes: occupancy is a conditional model prediction, not efficacy or safety.

## Candidates not ready for the live demo

| Candidate | Live result after 5C.1b | Why it is not a main demo |
| --- | --- | --- |
| Trastuzumab baseline built from the agent's own extracted values | 2 of 2 honest *needs inputs*, with cited affinity and half-life candidates | Takes about 3 minutes and asks the researcher for the missing inputs rather than drawing curves |
| Imatinib → ABL1, hypothetical IV bolus | 2 of 2 honest *needs inputs*, with the 1IEP small-molecule structure and cited KD candidates | Same: a good illustration of honest limits, but slow and with no simulation |

Before 5C.1b these failed every live run with provider errors; they now end honestly. If time allows in the demo, the imatinib question is a strong 30-second aside: *"for a drug we can't model safely, the agent says exactly what's missing instead of inventing numbers."* Start it before the talk, or show a recorded run.

## Re-running

```sh
uv run python scripts/run_demo_candidate.py --name q1 --drug trastuzumab --target HER2 --route iv_infusion \
  --question "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"
uv run python scripts/run_demo_candidate.py --name q2 --edit "Set the occupancy threshold to 95%"
uv run python scripts/summarize_demo_runs.py
```

Requires `NVIDIA_API_KEY` in `.env` and network access to `www.ebi.ac.uk`, `europepmc.org` and `integrate.api.nvidia.com`. Re-run both questions on the demonstration machine and network before rehearsal.
