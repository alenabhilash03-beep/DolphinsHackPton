# Primary antibody walkthrough

Start FastAPI and Next.js using the README. Open `/preview/plots`. Keep the configured NVIDIA free endpoint available for research; the numerical workspace works independently of it.

1. Submit the prefilled trastuzumab–HER2 hypothesis. Show the actual profile, literature, and simulation completion events. An unavailable or unsupported research request leaves the existing numerical workspace usable.
2. Inspect the cached experimental 1N8Z complex. Identify the Fab light/heavy chains and HER2 extracellular domain, toggle surfaces, and inspect chain C residue 557. Explain that this is experimental fragment geometry.
3. Read the three comparison cards: baseline, threefold elimination half-life, and tenfold lower KD achieved through slower dissociation. Expand the input evidence to see provenance and derivation parents; source links point to the reviewed evidence.
4. Compare endpoint occupancy, occupancy AUC, concentration AUC, time above threshold, and threshold status. The primary 180-day result predicts approximately 62.90%, 99.82%, and 94.44% endpoint occupancy. Both alternatives remain above the 90% analytical threshold at the horizon. Their actual loss times are censored; this does not establish which retains occupancy longest.
5. Play or scrub the timeline: the graph reveal boundaries and colored sample markers move together with the binding schematic. Use the reveal checkbox for full-curve overview; select baseline or either alternative in the schematic. Endpoint metrics summarize the entire window and do not change merely because the cursor moves.
6. Change an alternative's dose or binding parameter. The direct deterministic simulator updates the cards, table, and current-result conclusions. The prior agent interpretation disappears when its result ID no longer matches. The experimental molecular geometry stays fixed.
7. Reset the experiment to restore the original comparison. Show the assumptions and suggested follow-up measurements: target-site exposure, matched kinetics, and actual engineered-variant PK. Extend the observation window to investigate censored loss times within the supported model and duration limits.

The current preview provides functional scientific presentation; the frontend contributor can restyle its components. Do not present occupancy as measured tumor engagement, efficacy, or clinical superiority. The next 4C gate audits the full scientific workflow before calling the core MVP complete.

Related-paper discovery results appear in the activity panel after live research. The reviewed S2/S3 summary cards explain their model role and link directly to concentration and occupancy plots. Candidate abstract excerpts are discovery material and do not become model inputs automatically.
