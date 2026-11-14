# Local workspace usability update

The local `/preview/plots` route now has scoped green/sage styling, navigation anchors, numbered workflow sections, a readable hypothesis form, an example-question action, optional experiment details, a factual activity panel, and distinct scientific interpretation, structure, controls, comparison, and graph areas. Controls and results sit side by side on larger screens and stack on narrower screens. Slider inputs have explicit accessible names. The root page links directly to the workspace.

The form displays its limited trastuzumab–HER2 support before submission. A running job disables duplicate submissions through the primary form button. Research status and errors remain visible; technical job details are expandable. The existing API, solver, provenance, structure geometry, and result-linkage rules continue to supply the scientific content.

Verification: TypeScript and production build passed; all 19 frontend tests passed. In the browser, the styled form completed live primary research with live literature verification, and a subsequent dose edit produced a new custom result. This is a usability update to the current Phase 4 workspace, not implementation of Phase 5 or Phase 7. No roadmap revision is needed for these presentation changes. The visual frontend contributor can replace the scoped styles and components independently.

## 7A local testing panel

The workspace now exposes the completed identity and eligibility API through `DrugSupportPanel`, with quick examples, optional target/form/route/endpoint fields, source links, explicit ambiguity selection, missing-input explanations, model limits, and an expandable raw record. Requests are cancellable and stale responses are ignored. This diagnostic panel does not configure or replace an experiment; generalized profile switching and experiment editing remain in 7C–7D.

Verification: TypeScript, 21 frontend tests, and production build passed. Browser checks confirmed reviewed Herceptin, live Gleevec ambiguity, exact mesylate selection, unsupported oral trastuzumab, and an unknown-name result. The scenario-comparison content stayed identical across the assessment checks. No browser errors were observed.

Plan assessment: no material roadmap revision is needed. This user-requested panel makes completed 7A functionality testable; 7B remains the next subphase.

## Manual workspace checklist

1. Open `/preview/plots`. In **Check what we can model**, try each quick example. Herceptin should match the conditional reviewed model; imatinib should identify a database record without approving simulation; Gleevec should request a molecular-form choice; oral trastuzumab should be outside model scope; an unknown name should report no exact match (or source unavailability during an outage). None should change the existing simulation.
2. Under **Start with your question**, use the example and submit research. Expect factual activity events, evidence retrieval, a numerical comparison, and result-linked interpretation. Expand paper summaries and the research record to inspect sources. The live model uses the configured NVIDIA endpoint; service errors must be visible.
3. For a repeatable alternative, use **Open saved demo · no live research**. It must be labeled as saved, and the numerical workspace should remain interactive.
4. In experiment controls, select an alternative and change dose, half-life, association, dissociation, or KD. Expect a fresh deterministic result after the control settles, a protected baseline, and linked KD/kinetic values. No LLM call is needed. Dosing interval uses **Apply interval**. Reset restores the preset.
5. Press Play. Expect the timeline, plot reveal/markers, and binding schematic to advance together. Pause and scrub to inspect another time. Static experimental structure geometry should not change. The schematic represents modeled populations, not atomistic dynamics.
6. Rotate/zoom the 1N8Z viewer, toggle chain/surface/interface selections, focus Fab or HER2, and inspect chain C residue 557. Expect a residue identification and highlight. The guided tour and inspection sidebar remain planned for 7E.
7. At the untouched 180-day preset, endpoint occupancy is approximately 62.90% baseline, 99.82% longer half-life, and 94.44% stronger affinity. Both alternatives remain above the analytical 90% threshold at the horizon, so no longest-retention winner should be claimed.
