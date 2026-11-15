# Demo examples — 5C.1

These are the questions for the judged demo, chosen from repeated **live** runs (NVIDIA Nemotron, live Europe PMC retrieval, real solver and structure tools) on 2026-11-15. Receipts are in [`data/research/verification/5C.1-demo-examples.json`](../data/research/verification/5C.1-demo-examples.json). Live outcomes vary between runs because paper access and model output vary, so every count below is an observation, not a guarantee.

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

### Question 2 — the follow-up that settles it

> **Set the occupancy threshold to 95%** (click **Run this experiment** on the "Raise the occupancy threshold to 95%" card)

**Live reliability:** 3 of 3 runs completed (21–26 s). The agent reads the stored experiment, applies the change, reruns the solver and writes a new cited answer that addresses the original question:

- Baseline and **tenfold affinity fall below 95%** within the window.
- **Threefold half-life stays above 95%** for the whole 180 days.

This is the punchline: under a stricter threshold, extending half-life sustains HER2 occupancy longer than a tenfold affinity gain, in this conditional model. The answer badge reads *Follow-up experiment result*; the investigation history now shows two steps, and reload restores both.

### Why this pair

- It shows the full loop twice: research → cited extraction → simulation → 3D structure → cited answer, then an iteration that changes the conclusion.
- It is the only path with repeated live success. Total live time is about 2 minutes.
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
