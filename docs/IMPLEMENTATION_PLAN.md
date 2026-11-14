# Hypothesim — implementation roadmap

Status: Phases 0–4 and subphases 5A–5B, 7A and 7B.1–7B.5 and 7C–7E complete. Phases 5–6 remain planned for the local demo; Phase 7 adds evidence-gated support for additional drugs. Current user-authorized change: plan an arbitrary-drug evidence-to-simulation workflow. 7B.1–7B.3 backend preparation tools, the 7B.4 reference audit and 7B.5 generalization acceptance, 7C generalized agent APIs and 7D workspace integration and 7E molecular inspection are complete; the next implementation chunk is 5C and requires its green light. 7B.4 completed the anticipated evidence-block branch; imatinib is not a second enabled profile. See `docs/subphase-reviews/7B.4.md`.

Canonical repository document: `docs/IMPLEMENTATION_PLAN.md` in `alenabhilash03-beep/DolphinsHackPton`.

## Execution policy: review after every subphase

This checkpoint applies to every subphase from 0A through 7E, including optional work. It is part of the existing subphase time budget rather than an additional implementation phase. A roadmap revision does not itself authorize implementation of the next subphase.

At the end of every subphase, before beginning another, Codex will report:

1. **Delivery and verification:** What was completed, the acceptance checks performed and their outcomes, and anything unresolved. A subphase is not complete merely because its time estimate has elapsed.
2. **Plan assessment:** An explicit verdict: **Keep the plan**, **Revision necessary — risk or constraint**, or **Revision recommended — supported opportunity**.
3. **Evidence and impact:** The concrete finding behind that verdict and its effect on scientific credibility, feasibility, dependencies, effort, timing, acceptance criteria, and the demo.
4. **Next chunk:** The proposed next subphase and its expected deliverable. Stop and await the user's green light before executing it.

### When a revision is justified

- **Risk or constraint:** Revise only when a material finding makes the current roadmap scientifically unsound, technically infeasible, or meaningfully threatens an essential acceptance criterion or the demonstration. Examples include unavailable essential evidence, an invalid model assumption, a failed integration approach, or a measured performance problem that cannot be resolved within the planned chunk.
- **Supported opportunity:** Consider a revision when verified progress, newly available evidence, or a demonstrated simplification creates enough capacity for a valuable improvement. Extra scope must have a bounded implementation cost and acceptance criteria, satisfy existing stretch gates, and preserve essential work, scientific standards, integration time, and the demo buffer.
- Routine implementation choices, ordinary debugging, minor estimate variation, speculative ideas, or a desire to keep editing the roadmap do not justify a revision.
- If no material revision is justified, say **Keep the plan** and retain the roadmap unchanged. A review is mandatory; a revision is conditional.

### How a justified revision is made and committed

1. Present the smallest concrete revision that addresses the finding or captures the opportunity. State what changes, why, and which subphases, dependencies, estimates, deliverables, and tests are affected.
2. Resolve the change with the user before executing changed or expanded scope. The green light for one subphase does not authorize later subphases or unagreed feature expansion.
3. Update this canonical roadmap at `docs/IMPLEMENTATION_PLAN.md` so it describes the current agreed plan. Preserve stable subphase identifiers; if a chunk is split or added, give it a clear identifier and dependency.
4. Add a concise entry to the revision history containing the triggering finding, agreed decision, affected chunks, and validation or acceptance impact.
5. Commit and publish the agreed roadmap revision to DolphinsHackPton before starting dependent work, then report its GitHub commit link. If publication is blocked, report that explicitly; do not claim the revision was committed remotely.
6. Resume only after the user gives the next subphase's green light. The report, revision, and next-chunk approval can be handled together without a redundant confirmation if the user's instruction already authorizes them.

A review that concludes **Keep the plan** does not require a roadmap-only GitHub commit. This checkpoint policy concerns plan revisions; implementation commits are separate.

### Revision history

| Revision | Trigger | Decision and impact |
| --- | --- | --- |
| Initial planning commit | User requested the full roadmap in GitHub and a review after every subphase | Preserve the original technical roadmap and add conditional risk/opportunity reassessment, documented revisions, GitHub commits for agreed changes, and a green-light boundary between chunks. Phase 0 remained unstarted at that historical revision. |
| 2026-11-14 — drug support expansion | User requested support for additional drug names after clarifying that Phase 5 does not provide it | Add Phase 7A–7D after the reproducible local-demo gates. Accept arbitrary names for assessment, but allow simulations only through reviewed drug/model profiles or explicit hypothetical custom inputs. Budget additional work beyond the original 36 hours; preserve existing subphase IDs and the primary demo. User also selected a local demo package, so hosted deployment is no longer a mandatory Phase 5/6 gate. This revision authorizes planning only. |
| 2026-11-14 — expansion ordering and scientific visuals | User requested additional drug support after reliability but before final testing, plus paper summaries and clearer playback visuals | Execution order is 5A → 5B → 7A–7D → 5C → 6A–6B. Stable IDs are retained. Extend the existing evidence/agent presentation with cited paper summaries and explicit links to model inputs and plots; related search candidates cannot become reviewed parameters automatically. Implement 5A now under this user request. Use the shared timeline for animation and chart playback without deforming experimental structures. No revised multi-drug support is claimed implemented by this planning change. |
| 2026-11-14 — guided structure inspection and experimental editing | User explicitly requested a guided interface tour, residue sidebar, and quick natural-language revisions | Expand 7C and 7D acceptance to require edits against a versioned current experiment, deterministic configuration, and updated result-linked interpretation. Add 7E for camera tours and coordinate-grounded residue inspection. Revised provisional Phase 7 estimate: 12–19 hours. Order: 7A → 7B → 7C → 7D → 7E → 5C → 6A–6B. Preserve existing IDs, scientific geometry, and review/green-light boundaries. Planning changes only; 7A remained unstarted at this historical revision. |
| 2026-11-14 — arbitrary-drug experiment preparation | User clarified that scientists must be able to research and simulate drugs beyond manually curated examples | Replace the second-profile-only expansion with reusable evidence retrieval, parameter extraction, applicability validation, missing-input clarification and deterministic configuration. Keep reviewed profiles as reference cases, not a drug-name allowlist. Split 7B into 7B.1–7B.5; expand 7C/7D acceptance to cover unregistered drugs. Only mathematical model implementations remain allowlisted. Provisional remaining Phase 7 effort: 21–33 hours; final testing/rehearsal remain separate. This commit changes the plan only. |

Hypothesim is feasible in 36 hours if the MVP centers on one carefully documented trastuzumab–HER2 experiment. The strongest demo combines a trustworthy numerical model, immediate scenario comparison, a real molecular structure, and an agent that shows its evidence.

The full specification exceeds a reliable 36-hour build. Additional drug support is now planned as a separately estimated Phase 7 after 5B reliability and before final testing/rehearsal. Automatic validation of newly discovered models, detailed tissue distribution, and downstream biological predictions remain outside the MVP.

Implementation through Phase 4 is recorded in `docs/subphase-reviews/`. The roadmap below preserves the original MVP sequence and adds the agreed expansion as Phase 7.

The planned scientific claim is deliberately bounded: Hypothesim explores how specified PK and binding assumptions change predicted target occupancy. It does not establish tumor response, clinical efficacy, or an appropriate treatment regimen.

## 1. Feasibility, priorities, and time budget

Assume three contributors: one on scientific computation, one on the frontend, and one on research/agent integration. A fourth contributor could handle molecular visualization and integration testing. With one developer, the core simulator remains achievable, but animation and research breadth should be reduced.

| Capability | Commitment for 36 hours |
| --- | --- |
| Trastuzumab–HER2 | Primary supported example with a reviewed evidence package |
| One-compartment PK and kinetic occupancy | Essential |
| Dose, schedule, half-life, clearance, binding controls | Essential, with mathematically linked controls |
| Baseline plus competing interventions | Essential; support three curves |
| Plotly concentration and occupancy plots | Essential |
| Real 1N8Z structure in 3Dmol.js | Essential |
| LangChain agent using real retrieval and simulation tools | Essential |
| LangSmith trace of a completed experiment | Essential |
| Evidence, assumptions, and limitations | Essential |
| Synchronized Canvas binding animation | First stretch; strictly time-boxed |
| Custom parameters in supported models | Essential, explicitly labeled hypothetical |
| Arbitrary-drug research and supported-model configuration | Phase 7 expansion beyond the original 36-hour MVP; reusable evidence-to-simulation workflow, with reviewed profiles as reference examples |
| Sensitivity analysis and reports | Defer |
| Advanced PK, tissue penetration, downstream PD | Defer |



A relevant scientific constraint: the [Herceptin prescribing information](https://www.gene.com/download/pdf/herceptin_prescribing.pdf) describes concentration-dependent clearance through linear and nonlinear elimination pathways. A constant-half-life model is therefore an approximation, and the interface must identify it as such. [Herceptin prescribing information](https://www.gene.com/download/pdf/herceptin_prescribing.pdf)

| Elapsed time | Main milestone |
| --- | --- |
| Hours 0–2 | Model scope, evidence requirements, and contracts agreed |
| Hours 2–7 | Tested numerical simulator accessible through FastAPI |
| Hours 7–12 | Interactive dashboard with direct simulation controls |
| Hours 12–18 | Research agent produces validated experiments |
| Hours 18–24 | Complete primary demo, including experimental structure |
| Hours 24–30 | Optional animation, reliability, and integration verification |
| Hours 30–36 | Feature freeze, deployment verification, rehearsal, buffer |



These are integration checkpoints. Team members can prepare independent components earlier against the agreed contracts.

## 2. Architecture and repository

Use a monorepo with two applications: Next.js for presentation and FastAPI for research and computation. Keep the simulator as a pure Python package inside the backend, with no LangChain dependency.

```text
React workspace
    ├── parameter edits ───────► FastAPI simulation endpoint
    │                                  │
    │                                  ▼
    │                           deterministic simulator
    │
    └── hypothesis submission ► research job
                                       │
                                       ▼
                               single LangChain agent
                                 ├── literature tools
                                 ├── evidence registry
                                 ├── structure metadata
                                 └── validated simulator

Simulation results ──► shared timeline ──► plots and schematic
Structure asset ────────────────────────► experimental structure viewer
```

Recommended choices:

| Area | Recommendation | Reason |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, Tailwind | Matches the preferred stack |
| Client state | Zustand | Small shared store for scenarios and timeline |
| Backend | FastAPI, Pydantic | Validated contracts and generated OpenAPI |
| Numerics | NumPy, SciPy | Deterministic computation with established solvers |
| Agent | Python LangChain create_agent | One tool-calling agent beside the simulator |
| Research | Europe PMC first; curated PK sources | Useful coverage without building many connectors |
| Structures | 3Dmol.js | Sufficient rendering and inspection with modest integration effort |
| Binding schematic | Canvas 2D | Lower implementation and rendering cost than a second 3D engine |
| Storage | Versioned JSON evidence; SQLite experiments/jobs | Inspectable scientific inputs and simple persistence |
| Deployment | Next.js service plus persistent Python service | SciPy and streamed research jobs fit a conventional backend |
| Local fallback | Both services on the demo laptop | Controls remain usable without hosted infrastructure |



Proposed repository layout—these paths describe future files:

```text
hypothesim/
├── apps/
│   ├── web/
│   │   ├── app/page.tsx
│   │   ├── components/
│   │   │   ├── HypothesisForm.tsx
│   │   │   ├── AgentActivity.tsx
│   │   │   ├── EvidencePanel.tsx
│   │   │   ├── ParameterPanel.tsx
│   │   │   ├── ScenarioComparison.tsx
│   │   │   ├── SimulationCharts.tsx
│   │   │   ├── StructureViewer.tsx
│   │   │   ├── BindingCanvas.tsx
│   │   │   ├── TimelineControls.tsx
│   │   │   └── InterpretationPanel.tsx
│   │   ├── lib/{api,contracts,units,timeline}.ts
│   │   └── stores/workspace.ts
│   └── api/
│       ├── app/
│       │   ├── main.py
│       │   ├── schemas/
│       │   ├── routes/{catalog,experiments,simulations}.py
│       │   ├── simulation/
│       │   │   ├── pk.py
│       │   │   ├── binding.py
│       │   │   ├── solver.py
│       │   │   ├── metrics.py
│       │   │   ├── validation.py
│       │   │   └── registry.py
│       │   ├── research/{europe_pmc,evidence,structures}.py
│       │   ├── agent/{workflow,tools,prompts}.py
│       │   └── services/{jobs,storage,cache}.py
│       └── tests/{unit,integration,fixtures}/
├── data/
│   ├── drugs/trastuzumab.json
│   ├── evidence/
│   ├── structures/1n8z.pdb
│   └── experiments/demo.json
├── tests/e2e/
├── docs/{model,evidence-policy,demo-runbook}.md
├── .env.example
├── compose.yaml
└── README.md
```

Pydantic schemas own the API contract. Generate TypeScript types from OpenAPI rather than maintaining two independent definitions.
Avoid authentication, collaboration, vector databases, Redis, and a separate distributed job queue during the hackathon. One backend process with bounded research jobs and persisted job status is sufficient.

## 3. Mathematical model and numerical methods

Use one-compartment linear PK driving a nondepleting, effective 1:1 binding model. This is a defensible exploratory starting point when its assumptions are visible.
Let:
- $A(t)$: central drug amount, in nmol.
- $V$: apparent distribution volume, in L.
- $R(t)$: administration rate, in nmol/hour.
- $C_p(t)=A(t)/V$: modeled central concentration, in nM.
- $\theta(t)$: occupied fraction of modeled target sites.
PK:
$$
\frac{dA}{dt}=R(t)-k_e A,
\qquad
k_e=\frac{\ln 2}{t_{1/2}}=\frac{CL}{V}
$$
Target-site exposure:
$$
C_{\mathrm{site}}(t)=\alpha C_p(t)
$$
Binding:
$$
\frac{d\theta}{dt}
=
k_{\mathrm{on}}C_{\mathrm{site}}(t)(1-\theta)
-
k_{\mathrm{off}}\theta
$$
Affinity:
$$
K_D=\frac{k_{\mathrm{off}}}{k_{\mathrm{on}}}
$$
The exposure factor $\alpha$ represents an explicitly specified relationship between central concentration and available drug at the target. It is an assumption unless supported for the relevant setting. Setting $\alpha=1$ means idealized equal exposure; it does not establish measured tumor exposure.
The model assumes negligible depletion of the PK drug pool by binding, fixed target-site availability, and no receptor turnover, internalization, avidity, tissue transport, or target-mediated clearance. Occupancy represents effective sites rather than a mechanistic model of bivalent antibody binding.
Administration and units
- Use finite IV infusion for the primary trastuzumab preset.
- Support repeated infusion schedules.
- Allow idealized instantaneous administration only in an explicitly hypothetical/custom configuration.
- Reject unsupported routes instead of silently treating them as IV.
- Convert mg/kg using an explicit body mass.
- Record molecular weight and molecular form used for mass-to-molar conversion.
The primary preset should reflect that Herceptin is administered by IV infusion; its label specifically excludes IV push or bolus administration. [Herceptin prescribing information](https://www.gene.com/download/pdf/herceptin_prescribing.pdf)
Canonical computational units:

| Quantity | Unit |
| --- | --- |
| Time | hour |
| Drug amount | nmol |
| Concentration and \(K_D\) | nM |
| Volume | L |
| Clearance | L/hour |
| \(k_{\mathrm{on}}\) | nM⁻¹ hour⁻¹ |
| \(k_{\mathrm{off}}\) | hour⁻¹ |
| Occupancy | fraction from 0 to 1 |



Important conversions:
$$
D_{\mathrm{nmol}}
=
\frac{D_{\mathrm{mg}}\times10^6}
{MW_{\mathrm{g/mol}}}
$$
$$
k_{\mathrm{on}}[\mathrm{nM}^{-1}\mathrm{h}^{-1}]
=
k_{\mathrm{on}}[\mathrm{M}^{-1}\mathrm{s}^{-1}]
\times 3.6\times10^{-6}
$$
Numerical approach
- Compute linear PK analytically within each constant-input interval.
- Split intervals at every infusion start, infusion end, or hypothetical bolus.
- Integrate occupancy using [SciPy solve_ivp](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html), initially with Radau.
- Use adaptive integration independently of the plotted sample grid.
- Include administration boundaries and extra early-time samples in returned data.
- Start with relative tolerance $10^{-6}$ and occupancy absolute tolerance $10^{-9}$; verify convergence before locking them.
- Reject failed or materially out-of-bounds solutions. Correct only negligible floating-point excursions.
Fast binding and slow PK can create stiffness; SciPy documents Radau and BDF for stiff systems. [SciPy solve_ivp](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html)
An optional second supported model can use equilibrium occupancy:
$$
\theta_{\mathrm{eq}}=\frac{C_{\mathrm{site}}}{C_{\mathrm{site}}+K_D}
$$
Use it only when equilibrium assumptions are suitable. If only $K_D$ is known, the system must not invent kinetic rates or claim to simulate binding residence time.
Linked controls and comparison semantics
- Editing half-life derives clearance at fixed $V$; editing clearance derives half-life.
- Editing $k_{\mathrm{on}}$ or $k_{\mathrm{off}}$ derives $K_D$.
- Editing $K_D$ requires a declared mechanism. Default: hold $k_{\mathrm{on}}$ fixed and derive $k_{\mathrm{off}}$.
- Never expose three independently editable affinity/kinetic values that can contradict one another.
The example hypothesis should produce three scenarios:

| Scenario | Change from baseline |
| --- | --- |
| Baseline | Reviewed starting configuration |
| Longer half-life | \(t_{1/2}\times3\), with clearance derived |
| Higher affinity | \(K_D/10\), through \(k_{\mathrm{off}}/10\) at fixed \(k_{\mathrm{on}}\) |



Keep dose, schedule, volume, initial conditions, exposure factor, and observation window equal unless the hypothesis explicitly changes them.
Calculate concentration AUC, occupancy AUC, endpoint occupancy, and time above a selectable occupancy threshold. Label thresholds as analytical choices, not established therapeutic thresholds. If occupancy has not fallen below a threshold by the end, report “beyond the simulated window.”
Evidence is available, but assay context matters. A primary study reports Herceptin Fab–HER2 kinetic measurements at 30°C. Those measurements can inform a reviewed binding preset, but their transfer to full-antibody in vivo behavior remains an explicit assumption. Preserve reported $K_D$ alongside the value derived from rounded reported rates. [Primary binding study](https://pmc.ncbi.nlm.nih.gov/articles/PMC3081289/)

## 4. Data structures and API contracts

Every numerical input must retain both its scientific meaning and its provenance.

| Schema | Required content |
| --- | --- |
| HypothesisRequest | Text; optional drug, target, dose, route, duration; current experiment reference for revisions |
| ParsedHypothesis | Resolved entities, interventions, outcome, ambiguity, unsupported requests |
| ParameterEvidence | Original value/unit, normalized value/unit, provenance category, source IDs, assay/population context, extraction status |
| EvidenceSource | Retrieved identifier, title, URL, retrieval time, supporting passage or table locator |
| DrugProfile | Molecular form, targets, supported models/routes, reviewed parameter sets, structure references |
| ScenarioConfig | Model ID/version, dosing schedule, PK/binding parameters, initial conditions, assumptions, overrides |
| ExperimentConfig | Parsed hypothesis, evidence snapshot, baseline, alternatives, support status, limitations |
| SimulationRequest | Validated scenarios, common duration, output sampling options, client revision |
| SimulationResult | Time series, metrics, events, diagnostics, warnings, exact resolved configuration, configuration hash |
| Interpretation | Result-linked claims, evidence references, assumptions, limitations, follow-up experiments |



Use separate fields for:
- Provenance: reported, calculated, assumed, user_supplied.
- Review status: candidate, reviewed, rejected.
An LLM-extracted number is a candidate, not automatically a reviewed measurement. A hypothetical intervention carries a link to the original parameter and a record of the transformation.
Recommended endpoints:

| Endpoint | Behavior |
| --- | --- |
| GET /api/health | Service and dependency status |
| GET /api/catalog/drugs | Supported profiles and capability flags |
| POST /api/experiments | Start research; return job ID immediately |
| GET /api/experiments/{id} | Retrieve status or validated configuration |
| GET /api/experiments/{id}/events | Stream factual progress events through SSE |
| POST /api/simulations | Direct deterministic comparison; no LLM invocation |
| POST /api/experiments/{id}/interpretations | Interpret a specific result revision |
| GET /api/structures/{id} | Serve cached approved structure assets |



Scientific support status belongs in the experiment response: supported, conditional, needs_parameters, or unsupported. Invalid numerical requests return structured validation errors. Retrieval failures must remain distinguishable from unavailable scientific evidence.

## 5. LangChain workflow and tools

Use one bounded tool-calling agent, with deterministic validation around its outputs. Current LangChain supports create_agent with structured response schemas and provider-native or tool-based [structured output](https://docs.langchain.com/oss/python/langchain/structured-output) strategies. Select and smoke-test a model supporting the required combination before feature development. [LangChain agents](https://docs.langchain.com/oss/python/langchain/agents), [structured output](https://docs.langchain.com/oss/python/langchain/structured-output)

| Tool | Input | Output and restriction |
| --- | --- | --- |
| resolve_drug_target | Drug and optional target names | Registry match, identifiers, ambiguity |
| search_literature | Bounded scientific query | Europe PMC results with genuine identifiers |
| fetch_evidence | Retrieved publication ID | Available abstract/open-access content with provenance |
| get_parameter_candidates | Drug, target, parameter names | Reviewed registry values and contextual candidates |
| get_structure_metadata | Supported drug–target pair | PDB metadata, chain mapping, cached asset availability |
| validate_experiment | Proposed configuration | Support decision, missing inputs, unit/model errors |
| run_simulation | Validated configuration | Deterministic result ID, metrics, diagnostics |



Europe PMC is the first literature connector; its REST API exposes searches, publication metadata, abstracts, and available full-text links. A separate PubMed connector can wait. [Europe PMC API](https://dev.europepmc.org/RestfulWebService)
Agent flow:
1. Parse the hypothesis into structured entities, intervention, and measurable comparison.
2. Resolve drug and target identities.
3. Retrieve literature and the reviewed parameter package.
4. Extract candidate evidence with units and assay context.
5. Select a model from the allowlisted registry.
6. Identify missing parameters and unsupported assumptions.
7. Construct baseline and intervention scenarios.
8. Pass deterministic validation.
9. Invoke the simulator.
10. Interpret the computed metrics and attach limitations.
Runtime discovery can enrich the evidence panel. For the hackathon, automatic simulation should use reviewed drug presets or explicitly supplied custom assumptions. Newly extracted measurements should not silently replace the primary demo’s reviewed parameters.
Guardrails:
- No arbitrary Python execution, equations, or model code generated by the agent.
- Source IDs in the final response must exist in retrieved tool results.
- Derived parameters require a recorded formula and valid inputs.
- Do not substitute IC50 or EC50 for $K_D$. ChEMBL contains distinct assay measures that require contextual interpretation. [ChEMBL assay documentation](https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/chembl-data-questions)
- Apply tool timeouts, bounded results, retry limits, and an overall research deadline.
- Stream tool activity and validation results; do not present hidden reasoning as an activity log.
- Treat retrieved text as source material, never as instructions.
Trace research, tools, validation, and simulation under a common experiment/run ID in LangSmith. Confirm the actual trace before calling the sponsored-track integration complete. [LangSmith tracing](https://docs.langchain.com/langsmith/trace-with-langchain)

## 6. Frontend interaction and synchronized visualization

The workspace should give most space to concentration and occupancy plots, with controls alongside them. Evidence and assumptions should remain accessible without covering the experiment.
Parameter updates
1. A slider immediately updates its displayed draft value.
2. The frontend derives linked values and validates bounds.
3. After a roughly 150 ms debounce, it submits the scenario comparison directly to FastAPI.
4. Requests carry a monotonically increasing revision.
5. Superseded requests are aborted where possible, and stale responses are ignored.
6. Charts and metrics update together from the accepted result.
7. Existing plots stay visible with a recalculating indicator.
Target: below 300 ms median and 700 ms p95 for a three-scenario update on the demo setup. These are acceptance targets to measure, not promised performance.
Freeze baseline configuration by default. Parameter edits affect the selected alternative; “update baseline” is an explicit workspace action.
Slider changes never trigger research or interpretation automatically. Show deterministic metric summaries immediately and mark earlier agent prose as belonging to its original result revision. An explicit “Explain current comparison” action invokes interpretation.
Experimental structure
Load 1N8Z with distinct styles for antibody light chain A, antibody heavy chain B, and HER2 chain C. The record contains a Fab–HER2 extracellular-domain complex, so label it accordingly. [RCSB 1N8Z](https://rcsb.org/structure/1N8Z)
Initial capabilities:
- Rotate, zoom, and reset camera.
- Toggle cartoon and surface representations.
- Select chains and inspect residues.
- Highlight an interface neighborhood, clearly described as a geometric proximity selection.
3Dmol.js supports molecular formats, selection-based styling, cartoons, surfaces, and clickable interactions. [3Dmol.js documentation](https://3dmol.csb.pitt.edu/doc/)
The structure viewer shares drug selection and scenario context with the workspace. Its atomic coordinates remain fixed during timeline playback and parameter edits. It may display synchronized occupancy text, but it does not acquire simulated molecular motion.
Binding schematic
Use a Canvas population with a fixed number of illustrative target sites.
- Occupied targets approximate $N_{\mathrm{sites}}\theta(t)$.
- Free-particle density follows concentration through a fixed, documented display scale.
- Display concentration and occupancy numerically alongside the animation.
- Use kinetic rates to suggest association/unbinding activity while keeping the occupied fraction anchored to the numerical solution.
- Reconstruct deterministically on backward scrubbing.
- Label the display “model-driven schematic; particle counts are illustrative.”
Do not let collision physics independently determine scientific occupancy. Very fast molecular events must be visually rescaled and identified as such.
Shared timeline
Store one simulationTime, playback state, playback speed, and active result revision. Plot cursors, metric readouts, and the schematic sample this same time.
Use interpolation within continuous segments and explicit event handling at discontinuities. Concentration jumps from hypothetical boluses must not be smoothed across; occupancy remains continuous at those events.

## 7. Executable roadmap

Subphases are the units we will run individually. Each has an observable acceptance condition. Other contributors can prepare parallel work against its contracts.

### Phase 0, hours 0–2, establishes the scientific and integration contract.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 0A — Scientific scope and evidence audit; about 1 hour | Create docs/model.md, docs/evidence-policy.md; define required parameters, source context, exposure assumption, primary administration, and intervention semantics. Review candidate binding and PK sources. | Complete when every required parameter has a reviewed source or an explicit assumption/missing-data designation. Stop unsupported claims here. |
| 0B — Schemas and service skeleton; about 1 hour | Establish repository, Pydantic contracts, generated frontend types, .env.example, health route, dependency locks, and test commands. Confirm LLM/tool/structured-output compatibility. | Health endpoint and minimal frontend run locally; a fixture configuration validates across Python and TypeScript. |



Phase deliverable: An agreed model document, evidence checklist, and runnable service skeleton.

### Phase 1, hours 2–7, delivers the numerical engine. Depends on Phase 0.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 1A — Units, administration, and PK; about 1.5 hours | Implement pk.py, unit normalization, dosing schedules, infusion intervals, and linked clearance/half-life rules. | Pure PK functions match analytical decay and infusion references; invalid doses, units, durations, and schedules fail validation. |
| 1B — Binding and comparison metrics; about 2 hours | Implement binding.py, solver.py, metrics.py; calculate occupancy and metrics for baseline plus two alternatives. | Match constant-concentration analytical binding, washout, zero-input behavior, bounds, and tighter-tolerance reference results. |
| 1C — Simulation API and reproducibility; about 1.5 hours | Implement simulation route, model registry, diagnostics, configuration hashing, bounded runtime, and response fixtures. | A direct API call returns three aligned scenarios with resolved parameters and deterministic results within documented tolerances. |



Phase deliverable: A tested FastAPI simulator that runs independently of research and LLM availability.

### Phase 2, hours 7–12, delivers the interactive scientific workspace. Depends on Phase 1 contracts.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 2A — Workspace, controls, scenario state; about 2 hours | Implement ParameterPanel, ScenarioComparison, API client, store, linked controls, reset, custom-mode labeling, and baseline protection. | Control edits produce valid requests; baseline remains stable; unsupported configurations show actionable errors. |
| 2B — Plotly comparison and timeline; about 2 hours | Implement concentration/occupancy charts, consistent scenario colors, units, legends, administration markers, cursor, playback, pause, and scrubbing. | All curves use the same observation window; timeline readouts agree with returned data. |
| 2C — Live update reliability; about 1 hour | Add debounce, stale-response handling, loading/error states, logarithmic kinetic sliders, and latency measurement. | Rapid edits cannot display an older result; parameter changes produce zero LLM requests; update targets are measured. |



Phase deliverable: A useful standalone simulation dashboard with responsive three-scenario comparison.

### Phase 3, hours 12–18, delivers evidence-backed experiment preparation. Depends on Phase 0 schemas and Phase 1 simulator.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 3A — Evidence registry and retrieval; about 2 hours | Implement Europe PMC client, cached source records, trastuzumab.json, provenance validation, and EvidencePanel. | Live search returns genuine identifiers; fixture tests cover missing abstracts, unavailable full text, contextual mismatches, and connector failure. |
| 3B — Single LangChain agent; about 2.5 hours | Implement workflow, tools, prompts, [structured output](https://docs.langchain.com/oss/python/langchain/structured-output), validation gates, simulation tool, and LangSmith instrumentation. | Primary hypothesis produces validated scenarios and an actual trace containing retrieval and simulation calls. Unknown drugs cannot bypass support checks. |
| 3C — Research jobs and workspace integration; about 1.5 hours | Implement job persistence, SSE events, HypothesisForm, AgentActivity, interpretation rendering, and revision linking. | Submission shows factual progress, then loads the validated experiment and result. Failed research leaves direct simulation usable. |



Phase deliverable: Natural-language hypothesis → retrieved evidence → validated experiment → numerical comparison → result-linked explanation.

### Phase 4, hours 18–24, completes the primary scientific demo. Depends on Phases 2 and 3.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 4A — Experimental structure viewer; about 2 hours | Implement client-only StructureViewer, cached 1N8Z asset, chain metadata, styles, residue inspection, and camera controls. | Correct entities load and remain interactively inspectable without RCSB connectivity. Dose and kinetic edits preserve the structure and camera. |
| 4B — Primary hypothesis walkthrough; about 2 hours | Finalize baseline, half-life ×3, and affinity ×10 scenario presets; add evidence badges, metric comparison, limitations, and follow-up recommendations. | The entire requested antibody workflow succeeds end to end. Conclusions cite actual simulation metrics and qualified evidence. |
| 4C — Scientific review and core acceptance; about 2 hours | Audit units, molecular forms, binding assumptions, schedules, linked controls, saturation, horizon effects, and unsupported routes/drugs. Update model documentation. | All essential acceptance tests pass; no critical scientific mismatch remains. |



Phase deliverable: A complete demonstrable MVP. This is the gate for adding stretch features.

### Phase 5, hours 24–30, adds bounded visual impact and hardens integration.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 5A — Optional Canvas schematic; maximum 2 hours | Implement BindingCanvas, deterministic target states, fixed concentration scale, timeline sampling, and reduced-motion support. | Occupancy agrees within one illustrative target site; scrubbing and replay are stable. Cut this feature if it threatens core reliability. |
| 5B — Failure recovery and deployment; about 2 hours | Configure deployment, local fallback, evidence/cache behavior, research deadlines, backend restart handling, asset loading, and trace verification. | Local smoke checks pass; source/LLM failure produces a truthful fallback state. Prepare hosting instructions, but public deployment requires a separately selected destination and is not a completion gate for the agreed local demo. |




5A/5B deliverable: a visually clear, resilient local workspace. Run Phase 7 next, then return to 5C to test the complete supported-drug set.

### Phase 7 — Arbitrary-drug evidence-to-simulation workflow

The product goal is that a scientist can enter any drug and hypothesis, have the agent research it, and run a supported mathematical model when the evidence and explicit assumptions permit. Reviewed drug profiles provide convenient defaults and regression references; they must not be the only way to configure an experiment. This is essential agreed expansion scope, not an optional second-drug demonstration.

7A and 7B.1–7B.5 are complete. The revised planning baseline for work after 7A is **21–33 engineering hours** (including the now-completed 7B.1–7B.5): 7B 10–16, 7C 5–8, 7D 4–6, 7E 2–3. This supersedes the earlier 12–19-hour estimate. Estimates are not completion guarantees; reassess after each execution chunk. Preserve final integration and rehearsal time. Dependencies: completed scientific acceptance and 5B resilience; execute 7B.1–7B.5, then 7C, 7D, 7E, 5C and Phase 6. Each chunk ends with the mandatory review, commit and green-light boundary.

Three experiment paths must be explicit:

- **Reviewed preset:** a versioned, audited drug-target profile supplies defaults and applicability limits.
- **Research-derived experiment:** an unregistered drug is researched and configured in an implemented model using source-backed, context-compatible values. Passing deterministic checks permits a conditional simulation, not promotion to an audited profile or proof of biological validity.
- **Researcher-specified experiment:** the scientist supplies missing values or explicit assumptions in a compatible model. Each assumed value is labeled; results are hypothetical. Missing values are never silently filled with another drug's defaults.

Every path uses validated scientific computation. Ambiguous identity, incompatible evidence, missing essential inputs, inaccessible sources and unsupported mechanisms return structured clarification or limitations. Accepting any name does not promise that every hypothesis can be simulated. The model implementation catalog is allowlisted; drug identities are not. New equations or executable code generated by the LLM are outside scope.

| Subphase | Concrete tasks, files, and interfaces | Tests and completion criterion |
| --- | --- | --- |
| **7A — Drug identity and model eligibility; completed** | Existing identity API, reviewed catalog, bounded ChEMBL lookup and callable tool. Preserve its metadata-only semantics and historical review. | Existing identity, ambiguity and source-failure checks pass. A database identity alone never authorizes a run. |
| **7B — Reusable research-to-simulation foundation; 10–16 hours, split below** | Build typed evidence/parameter packages, bounded research connectors, context-aware extraction, model applicability validation, missing-input handling and deterministic configuration for drugs without preset profiles. Audit a second candidate, initially imatinib–Abl, as a reference and stress test. | At least one unregistered compatible case produces a provenance-complete configuration through the reusable path without a per-drug code branch; blocked cases produce no curves. A second profile alone does not satisfy this subphase. |
| **7C — Agent orchestration and natural-language editing; complete** | Connect Nemotron through real LangChain tools for identity, literature search, source retrieval, structured extraction, applicability assessment, clarification, configuration, simulation and interpretation. Replace the fixed primary-question gate. Preserve original hypothesis and versioned edit contracts. Trace the full path with LangSmith. | Demonstrate an unregistered-drug research-to-run path and a missing-input clarification/resumption path, alongside reviewed presets. Edits match equivalent direct-control results. No omitted instructions, preset substitution, untraced invented values or agent-generated numerical results. |
| **7D — Arbitrary-drug workspace and revisions; complete** | Integrate research status, evidence/parameter review, missing-value fields, explicit hypothetical inputs, profile-specific controls, structure availability and quick natural-language editing. Keep the existing simulation during failures. Pass validated configuration and revision IDs through the frontend handoff. | A scientist enters an unregistered drug, inspects cited values and assumptions, supplies missing values if needed, and receives updated curves through a supported model. Also verify unsupported mechanism, ambiguous identity, source outage, no structure, stale response and original demo. Slider changes remain direct solver calls. |
| **7E — Guided interface tour and inspection sidebar; complete** | Deterministic camera tour, entity-aware interface focus and residue sidebar grounded in cached experimental coordinates. Preserve geometry and provide reduced-motion and missing-data states. | Verify entity identity, selection, coordinate-derived contacts and unchanged asset hashes after camera tours or parameter edits. Never imply computed proximity is binding energy. |

#### 7B execution chunks — run one at a time

| Chunk and dependency | Tasks, files and interfaces | Testable deliverable |
| --- | --- | --- |
| **7B.1 — Evidence and model-readiness contracts; complete. Depends on 7A.** | Audit the existing evidence, model and experiment schemas. Add `app/schemas/experiment_preparation.py`, model-capability definitions under `app/simulation/`, and `docs/EXPERIMENT_PREPARATION.md`; names may follow existing conventions. Define preparation states, parameter evidence, missing-input requests, allowed model requirements, source context, configuration provenance and revision/hash fields. Publish OpenAPI/TypeScript contracts. Preserve current 7A API behavior; define a separate preparation service contract. | Contract examples for a reviewed preset, a complete unregistered-drug package, missing binding/exposure data, incompatible assays and unsupported mechanisms. Schema tests reject missing units/provenance and invalid state transitions. No new drug is claimed runnable yet. |
| **7B.2 — Bounded evidence retrieval and extraction; complete. Depends on 7B.1.** | Extend `app/research/` with hypothesis/target-aware literature queries, accessible source retrieval and an extraction service with an injectable structured LLM adapter. Reuse Europe PMC/ChEMBL clients; add other sources only when needed and accessible. Store source snapshots/locators and extraction fixtures under `data/research/`. Expose callable tools/services for 7C. | Parameter candidates have source passages, units, contexts, retrieval status and timestamps. Tests cover inaccessible full text, conflicting papers, fabricated citations, prompt injection, absent values and outages. A search abstract or paper summary is not silently treated as a measured parameter. |
| **7B.3 — Model applicability and deterministic configuration; complete. Depends on 7B.2.** | Implement preparation validation/configuration under `app/research/` or existing configuration services. Map compatible evidence to implemented one-compartment PK plus kinetic occupancy; add equilibrium occupancy only with separately documented equations and checks. Resolve units, kinetics, route, exposure and endpoint constraints. Persist preparation ID, evidence hash and missing-input state. Accept explicit researcher answers/assumptions through a typed preparation API, then revalidate. | A complete unregistered case reaches a validated `ExperimentConfig` and existing solver without adding a drug-name branch. Missing inputs stop execution and resume when supplied. KD alone cannot invent kon/koff; equilibrium output does not claim kinetic transients. Audit assumptions and preserve source data. |
| **7B.4 — Reference audit and experimental structures; audit complete, candidate blocked. Depends on 7B.3.** | Audit a second candidate, initially imatinib–Abl, using the reusable preparation path. Review molecular form, MW, PK, kinetics/equilibrium, assay context, route, intracellular exposure and ATP competition. Store a versioned package under `data/drugs/` and a scientific review record. Verify actual bound entities before caching a structure; permit no-structure output. | Analytical/numerical reference checks and cited applicability limits. An IV input alone never establishes intracellular Abl exposure. If evidence blocks the candidate, document the block and revise the reference choice at review; do not claim the second profile complete or disable the generalized workflow. |
| **7B.5 — Generalization and API acceptance; complete. Depends on 7B.4.** | Add focused service/API integration tests, preparation examples and frontend handoff documentation. Exercise at least two unregistered names with different evidence readiness, including one complete compatible case and one clarification/blocked case. Use fixtures for repeatability and one bounded live retrieval check with source availability reported honestly. | Demonstrate name → evidence package → model assessment → missing-input resolution where needed → validated configuration → numerical result. Assert no per-drug allowlist is needed for preparation, every result links to inputs, unsupported cases never call the solver, and existing trastuzumab tests remain green. This is the foundation for agent orchestration, not a claim that 7C/7D are already implemented. |

#### Evidence, applicability and simulation contract

A parameter record must retain canonical drug/target identity and molecular form; value and units; reported/calculated/researcher-assumed classification; original source URL/identifier, accessible supporting passage/locator and retrieval time; experimental system, species, formulation, route, assay conditions and applicability notes where relevant. Calculated values record their formula and input IDs. Unknown context stays unknown rather than inferred. Preserve incompatible alternatives instead of averaging them silently. Extraction confidence is not scientific approval.

Preparation states include identity clarification, researching, needs inputs, unsupported, source unavailable, ready for conditional simulation, and failed validation. Model readiness requires all mandatory values, unit consistency, parameter/domain bounds, compatible binding evidence, explicit route/exposure/endpoint scope and an assumptions record. These checks detect defined inconsistencies; they cannot certify novel biological validity. The UI must expose that limitation and retain the research-derived classification.

Missing PK or binding inputs can be supplied explicitly by the researcher when the model applies. Unsupported mechanisms require an additional implemented model; filling in numbers does not make them supported. No automatic transfer of plasma concentration into intracellular or tumor concentration. Preserve model links such as KD = koff/kon and half-life/clearance; distinguish measured affinity from an apparent value affected by assay conditions or competition. No generated code execution or autonomous installation of new scientific models.

#### 7A execution contract — completed; see `docs/subphase-reviews/7A.md`

Purpose: identify what drug/target was requested and determine what is scientifically eligible before any new experiment is configured. Estimated 2–3 hours. This chunk does not yet generalize experiment generation or enable arbitrary drug simulations.

1. Define typed assessment inputs and outputs in the shared schemas. Input includes drug name plus optional target, route, endpoint and original hypothesis. Output includes canonical identity/aliases, molecular form, identifier provenance, retrieval status, reviewed profile/version if present, allowed model/route/intervention capabilities, support status, reasons, ambiguities and missing inputs.
2. Implement an explicit reviewed-profile catalog under `data/drugs/` and a resolver in `app/research/drug_identity.py`. Resolve registered aliases locally first. Add one bounded primary-database identity lookup with timeout, normalized identifiers, source links and repeatable cached fixtures for other names; select the connector based on verified access at implementation time. A retrieved identity is a candidate, not an approved scientific profile.
3. Implement deterministic eligibility checks for drug/target/form, route, endpoint, model compatibility, and required evidence. A name match alone cannot authorize simulation. Distinguish recognized-but-unreviewed drugs, ambiguous matches, missing data, provider outage and unsupported biological requests. Existing explicit custom mode remains hypothetical.
4. Expose `POST /api/research/assess` and a callable LangChain assessment tool over the same service. Publish generated OpenAPI/TypeScript contracts and document example requests in `docs/DRUG_SUPPORT.md`. Connect broader agent experiment preparation in 7C and the main hypothesis workspace in 7D; the existing primary experiment stays usable throughout.
5. Add `test_drug_identity.py` and eligibility API tests covering trastuzumab/Herceptin alias equivalence, conflicting targets/routes, an identified drug without a reviewed model, ambiguous/unknown names, missing parameters, and lookup failure. Assert no solver call and no fabricated profile/parameters on blocked assessments. Include one bounded live identity check when the selected source is available; ordinary tests use fixtures.

Testable deliverable: a local API assessment for any submitted drug name, returning a traceable identity and an explicit support/missing-input decision. Inspect it in FastAPI `/docs`; broad natural-language editing and the second runnable drug remain later chunks. End with the usual review, commit and green-light boundary before 7B.

#### 7C/7D experimental editing contract and acceptance examples

- Add a typed revision request with the base experiment/result ID, base configuration hash, current client revision, selected scenario context, and the user's original text. Store an explicit parent link and create a new result/revision; do not overwrite the source experiment or silently edit a protected baseline.
- Parse absolute values, relative multipliers, units, scope and requested comparisons into structured operations. Apply only supported operations through deterministic validators and configuration tools. Preserve unspecified parameters and linked relationships such as KD = koff/kon and half-life/clearance.
- Examples to verify: “Double the dose in the affinity alternative,” “Use a 21-day dosing interval in that alternative,” “Compare twofold and fivefold affinity improvement at fixed association rate,” and “Run this comparison for 120 days.” Match each accepted request against an equivalent direct-control/configuration result. Document any profile-specific limits.
- For a clear supported request, configure, simulate, and show the applied-change summary plus updated plots, metrics, schematic, and result-linked interpretation. Do not add a mandatory confirmation dialog to every routine edit. Ask for clarification when the scenario, units, reference value, or requested meaning is ambiguous.
- Additional compounds, unsupported routes/endpoints, contradictory edits, stale base revisions, missing evidence, and incomplete changes must fail explicitly. Never drop an instruction and substitute the registered primary comparison. Numeric claims come from the new solver output; old explanations remain tied to their original result.
- Parameter-only edits do not require a new literature search when the reviewed model/evidence scope remains applicable. A change of drug, target, route, or model requirements must go through eligibility and evidence checks again. Slider controls remain direct solver calls with no LLM.

#### 7E scientific interpretation boundary

The tour changes camera framing and highlighting only. The sidebar reports experimentally resolved geometry and computed distances in Å. Missing residues are reported as unresolved; no side chains, energetic interactions, mutations, docking poses, or dose-dependent conformations are synthesized. Published PK/kinetic rates are not attributed to an individual clicked residue without residue-specific evidence. The model-driven population schematic remains the visualization for changing concentration and occupancy.


Phase deliverable: arbitrary-drug research and conditional configuration in supported mathematical models, with source-backed parameter extraction, explicit missing-input clarification, researcher-specified hypothetical values, result-linked interpretation, direct controls, natural-language revisions, and the guided molecular viewer. Reviewed profiles remain reference examples and convenient defaults. A successful second preset alone does not satisfy this phase. Unsupported cases remain useful evidence/limitations responses.

Scope cutoff: retain arbitrary-drug preparation as essential. Defer extra connectors, extra curated presets and cosmetic enhancements before weakening evidence/provenance checks or restricting the workflow back to a drug-name allowlist. Newly invented models, unrestricted mechanisms, clinical recommendations and universal drug support remain outside scope. Reassess estimates at each chunk; final testing must include the unregistered-drug path and original demo. Hosting remains optional.

### Phase 5C — Final integration and performance, after 7E; about 2 hours.

| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 5C — End-to-end and performance checks; about 2 hours | Implement focused browser/API integration tests and profile chart updates, solver latency, memory, and rendering. | Core test matrix passes on the actual demonstration machine and browser. |

Test the original antibody workflow, reviewed reference profiles, research-derived unregistered-drug preparation, missing-input resumption and unsupported requests. This gate precedes the Phase 6 feature freeze; no additional drug work should start during rehearsal.

### Phase 6, hours 30–36, freezes and rehearses the release. No new features.


| Subphase | Tasks and files | Interface, verification, and completion |
| --- | --- | --- |
| 6A — Reproducible demo package; about 2 hours | Finalize demo.json, evidence snapshots, cached structure, README, environment instructions, and demo-runbook.md. | A clean startup reproduces the primary experiment; saved and live runs are visibly distinguished. |
| 6B — Rehearsal, fixes, and buffer; about 4 hours | Rehearse live and fallback paths; fix acceptance failures; verify final local startup and LangSmith trace. | Two consecutive successful rehearsals, including one with literature connectivity disabled. |



Phase deliverable: A frozen build, reproducible demonstration, and practiced recovery path.

## 8. Team parallelization and ownership

Parallel work should follow the shared schema rather than create independent scientific logic.

| Contributor | Primary ownership | Can start after |
| --- | --- | --- |
| A — Scientific/backend | Model, units, solver, metrics, simulation API | 0A |
| B — Frontend | Workspace, controls, charts, timeline | 0B, using agreed fixtures |
| C — Agent/evidence | Literature, evidence package, tools, tracing | 0A and 0B |
| D — Optional visualization/integration | Structure viewer, schematic, browser checks | 0B |



One person owns schema changes and integration decisions. The numerical engine remains the single source of scientific results; neither the agent nor frontend reimplements it.
For execution in this chat, we can run the named subphases sequentially. The table identifies work human teammates can prepare concurrently.

## 9. Risks, fallback decisions, and cutoffs


| Risk | Response and fallback |
| --- | --- |
| Missing or conflicting kinetic data | Preserve assay context; use reviewed compatible pairs. If kinetics are unavailable, offer a justified equilibrium model or request explicit custom inputs. |
| Plasma-to-tumor exposure unknown | Show the exposure assumption prominently; describe occupancy as conditional on it. |
| Full antibody versus Fab measurements | Store molecular form per parameter; document transfer assumptions. |
| Approximate linear PK | Label the model; avoid claiming reproduction of the full clinical PK model. |
| Occupancy remains near saturation | Report the result honestly; use a clearly labeled exploratory exposure or observation window when appropriate. Never alter evidence to force separation. |
| Agent invents values or citations | Validate against source records, reviewed parameters, unit rules, and model registry. |
| Retrieval timeout or rate limits | Bounded requests and cached evidence with retrieval timestamps. |
| LLM unavailable | Open the saved experiment and preserve direct controls; label it as saved, not live research. |
| Structure download or WebGL failure | Cache the real structure; provide an attributed static preview if rendering fails, with the interaction limit stated. |
| Fast kinetics make solving expensive | Stiff solver, parameter bounds, execution deadline, profiling; no silent switch to a different scientific model. |
| Animation diverges from plots | Anchor it to the returned occupancy; remove it if it fails validation. |
| Imatinib expands the scientific scope | Keep it deferred until the primary release passes every essential test. |



Explicit cutoffs:
- Hour 12: If direct numerical controls are unreliable, pause visual polish and agent expansion.
- Hour 18: If live research is unreliable, retain bounded live retrieval plus the reviewed parameter package. Cut additional connectors.
- Hour 24: Do not begin stretch work unless the full antibody workflow passes.
- Hour 26: Remove unfinished animation.
- Hour 30: Freeze features.
Imatinib should begin only with unexpected schedule margin. Although 1IEP supplies a real imatinib–Abl complex, bloodstream concentration does not by itself establish intracellular Abl exposure. Hypothetical IV administration, protein binding, intracellular availability, and ATP competition require explicit treatment or limitations. [RCSB 1IEP](https://www.rcsb.org/structure/1IEP)

## 10. Integration tests and demonstration strategy

The release must pass these tests:

| Test | Required result |
| --- | --- |
| Analytical PK reference | Decay and infusion calculations agree within documented tolerances |
| Analytical binding reference | Constant-exposure association and washout agree with exact solutions |
| Numerical convergence | Tighter tolerances do not materially change curves or comparison metrics |
| Unit equivalence | Equivalent input units produce equivalent normalized results |
| Linked controls | Half-life/clearance and affinity/kinetic relationships remain consistent |
| Repeated administration | Events occur at correct times without interpolation artifacts |
| Primary hypothesis | Three scenarios differ only in the intended interventions |
| Rapid slider edits | Latest revision wins; no LLM calls occur |
| Evidence integrity | Every reported parameter resolves to a retrieved/reviewed source record |
| Unknown drug | No fabricated profile, structure, or authoritative simulation |
| Insufficient evidence | Missing inputs are identified; custom assumptions remain explicit |
| Visualization agreement | Plot cursor, readouts, and schematic use the same result and time |
| Structure integrity | Simulation edits do not alter experimental coordinates |
| Dependency outage | Saved evidence and direct simulation work with truthful status labels |
| Interpretation revision | Explanation identifies the exact result it describes |



Run deterministic tests on every numerical change. Use fixed retrieval fixtures for repeatable integration tests and a small live smoke test before rehearsal; live external APIs should not determine whether the ordinary test suite passes.

The primary demo should take roughly four minutes:
1. Enter the trastuzumab half-life versus affinity hypothesis.
2. Show a real retrieval event and its cited evidence.
3. Show the selected model and its major assumptions.
4. Load the experimental Fab–HER2 structure.
5. Compare baseline, longer half-life, and higher affinity.
6. Change dose and kinetics; show immediate chart updates.
7. Scrub the timeline and show synchronized readouts and optional schematic.
8. Explain the computed comparison and recommend a relevant follow-up measurement.
9. Briefly show that an unsupported drug produces a limitation response.
Prepare a saved experiment containing the exact configuration, reviewed evidence, structure asset, model version, and expected metrics. The fallback must remain interactive and clearly identify saved research. The live LangChain integration should also have a verified trace available for inspection.

Phases 0–4 are complete. The next execution unit is 5C; 7A identity/eligibility and the 5B local resilience gate are complete. Phase 7 is agreed planned scope; no later Phase 7 implementation begins without its subphase green light.

## Current execution order (revision 2026-11-14)

Completed: Phases 0–4, 5A–5B, 7A and 7B.1–7B.5 and 7C–7E. Remaining: **5C → 6A → 6B**. The revised Phase 7 planning baseline after 7A is 21–33 hours, including the now-completed 7B.1–7B.5; the original 36-hour MVP estimate does not cover this expansion. Final rehearsal follows all agreed feature work.

### 7B.4 reference outcome

The imatinib–Abl audit completed the planned evidence-block path: no default clinical PK-to-intracellular occupancy profile was enabled. The verified mouse c-Abl/imatinib 1IEP structure is a related experimental reference. Cetuximab–EGFR is the proposed replacement reference candidate, with preliminary source leads only; it is not audited or runnable and an additional audit is not part of 7B.5. Generic preparation remains independent of a drug-name allowlist. This updates execution status and reference selection without expanding the implementation scope.

### 7B.5 generalization outcome

Full source-tool → preparation API → registered configuration → SciPy result acceptance passes for synthetic unregistered identities, including missing-rate clarification and an unseen generated name. Unsupported mechanisms and extraction outages never call the numerical solver. Cited candidate/assumed/calculated lineage, exact infusion PK, timeline alignment and restart reproduction are verified. A bounded live Europe PMC search/retrieval succeeded with explicitly labeled abstract fallback; no full real-drug parameter package or live generalized agent run is claimed. See `docs/subphase-reviews/7B.5.md` and `docs/PREPARATION_FRONTEND_HANDOFF.md`. No material scope revision is required; 7C is next and awaits its green light.

### 7C outcome

The generalized single-agent research/edit APIs are implemented with server-owned provenance/results, typed missing-input continuation, bounded whole-request edit grammar and durable result lineage. Live Nemotron research and numerical editing have readable LangSmith tool traces. See `docs/GENERALIZED_AGENT.md` and `docs/subphase-reviews/7C.md` for supported forms and boundaries: generic configuration requires explicit structured-baseline intent, unrecognized interventions clarify, and no additional scientifically reviewed drug is claimed. Existing primary jobs/dashboard remain compatible. Next is 7D to connect these APIs, questions and result revisions to the workspace; no material sequence revision is needed.

### 7D outcome

Generalized research, evidence review, typed researcher answers, explicit hypothetical identity/baseline preparation, language edits and new results are connected to the local workspace. Persisted background jobs provide factual activity and reload/recovery; direct numerical edits remain independent of the LLM and register their results for later language edits. Known complexes have correct entity/species labels; other drug–target pairs show unavailable structure without disabling compatible numerical models. Live browser acceptance covered missing-data research, explicitly synthetic input continuation, affinity alternatives, a direct KD edit and a language edit preserving that result. No additional reviewed drug profile or universal language parser is claimed. See `docs/subphase-reviews/7D.md`. No material plan revision is needed; 7E is next and awaits its green light.

### 7E outcome

The four-stop molecular camera tour and coordinate inspection sidebar are implemented for the two verified cached complexes. Independent NumPy distance references, strict atom/residue handling, asset checksums, reduced motion and browser selection checks pass. Dose/affinity edits leave inspected geometry unchanged. See `docs/MOLECULAR_INSPECTION.md` and `docs/subphase-reviews/7E.md`. No material plan revision is required. Phase 7 feature work is complete; 5C final integration/performance and 6A–6B local packaging/rehearsal remain. Stop for the next green light.

### Workspace theme integration outcome

The teammate’s frontend branch is integrated into the functional workspace, including the 7E molecular tour/sidebar. The main route now opens that workspace directly. See `docs/local-workspace-ui.md` and `docs/subphase-reviews/UI-theme-integration.md`. No material plan revision is needed; **5C → 6A → 6B** remain.
