# Primary antibody walkthrough

Start FastAPI and Next.js using the README. Open `/preview/plots`. Keep the configured NVIDIA free endpoint available for research; the numerical workspace works independently of it.

1. Submit the prefilled trastuzumab–HER2 hypothesis. Show the actual profile, literature, and simulation completion events. An unavailable or unsupported research request leaves the existing numerical workspace usable.
2. Inspect the cached experimental 1N8Z complex. Identify the Fab light/heavy chains and HER2 extracellular domain, toggle surfaces, and inspect chain C residue 557. Explain that this is experimental fragment geometry.
3. Read the three comparison cards: baseline, threefold elimination half-life, and tenfold lower KD achieved through slower dissociation. Expand the input evidence to see provenance and derivation parents; source links point to the reviewed evidence.
4. Compare endpoint occupancy, occupancy AUC, concentration AUC, time above threshold, and threshold status. The primary 180-day result predicts approximately 62.90%, 99.82%, and 94.44% endpoint occupancy. Both alternatives remain above the 90% analytical threshold at the horizon. Their actual loss times are censored; this does not establish which retains occupancy longest.
5. Play or scrub the timeline: the graph reveal boundaries and colored sample markers move together with the binding schematic. Use the reveal checkbox for full-curve overview; select baseline or either alternative in the schematic. Endpoint metrics summarize the entire window and do not change merely because the cursor moves.
6. Change an alternative's dose or binding parameter. The direct deterministic simulator updates the cards, table, and current-result conclusions. The scientific answer is marked as describing an earlier result, and the follow-up proposals and history update to the edited curves. The experimental molecular geometry stays fixed.
7. Reset the experiment to restore the original comparison. Show the assumptions and suggested follow-up measurements: target-site exposure, matched kinetics, and actual engineered-variant PK. Extend the observation window to investigate censored loss times within the supported model and duration limits.

The current preview provides functional scientific presentation; the frontend contributor can restyle its components. Do not present occupancy as measured tumor engagement, efficacy, or clinical superiority.

Related-paper discovery results appear in the activity panel after live research. The reviewed S2/S3 summary cards explain their model role and link directly to concentration and occupancy plots. Candidate abstract excerpts are discovery material and do not become model inputs automatically.

## Phase 8 additions to show

After step 1 completes, the workspace has four further panels above the plots. Continue with:

8. **Investigation panel.** Point to the observed stages (papers, extraction, parameters, simulation, structure, findings) and expand the tool-by-tool log. These are recorded tool outcomes, not a progress animation.
9. **Scientific answer.** Read the verdict and its stated basis, then the key solver findings; click a value to open its plot. Show a cited paper finding with its verbatim quote and abstract-only marker. For the primary question the expected verdict is mixed or not determined, because both alternatives stay above the 90% threshold for the whole window.
10. **Structural context.** Click **Show in structure** on the first measurement card. The viewer opens on GLY B:103 and LYS C:593 and shows 2.417 Å, recomputed from the same coordinates. State that this is geometry only.
11. **Run a follow-up experiment.** Choose **Raise the occupancy threshold to 95%** and run it. The new answer addresses the original question: the longer half-life scenario is still above 95% at the end of the window while the stronger-affinity scenario falls below it.
12. **Investigation history.** Show the steps, reopen the first one, and point out the notice that continuing from it starts a new branch. Reload the page to show that the displayed result and the history return.

Say plainly what has not been shown: live paper retrieval can fail or return abstracts only, extraction often finds no usable values, and only trastuzumab has produced a real simulation so far.
