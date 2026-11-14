# Hypothesim — scientific model and evidence audit

Subphase: **0A — Scientific scope and evidence audit**  
Audit date: **2026-11-13, America/New_York**  
Status: **Documentation complete; numerical implementation and empirical validation have not begun.**  
Repository destination: `docs/model.md`  
Companion specification: [Evidence policy](evidence-policy.md)

## 1. Scientific scope and decision

The MVP will explore how stated administration, elimination, and effective binding assumptions change modeled drug concentration and target-site occupancy. Its primary drug–target example is intact trastuzumab–HER2. The experiment uses a one-compartment linear PK approximation driving effective 1:1 binding kinetics with a nondepleting drug reservoir.

**The primary preset is conditional, not a validated prediction of human tumor occupancy.** Source review establishes traceable input values; it does not validate this combined reduced model in vivo. Central exposure, target-site exposure, and occupancy must remain distinguishable in results and explanations. Occupancy is the endpoint; there is no downstream efficacy, tumor-growth, toxicity, survival, or treatment-selection model.

0A found enough evidence and explicit assumptions to specify this exploratory configuration. No missing input prevents the next implementation subphase. Missing tumor exposure, live-cell kinetics, and model calibration restrict interpretation; they are not silently filled with measurements from unrelated settings.

## 2. Reviewed source register

The following sources were inspected for the uses identified below. Source IDs are local audit identifiers. Bibliographic identity and section/table locators must be preserved when machine-readable evidence records are created in Phase 3. Retrieval date for every entry: 2026-11-13. Full-text caching and checksums remain Phase 3 work.

| ID | Primary source | Locator and permitted use |
| --- | --- | --- |
| S1 | [Genentech, Herceptin IV prescribing information, revision May 2026](https://www.gene.com/download/pdf/herceptin_prescribing.pdf) | Sections 2.3, 11, and 12.3: identity, infusion schedule reference, and PK limitations. |
| S2 | [Quartino et al., population PK analysis, Cancer Chemotherapy and Pharmacology 83:329–340 (2019), DOI 10.1007/s00280-018-3728-z](https://link.springer.com/article/10.1007/s00280-018-3728-z) | Table 1, journal p. 332; typical-patient context on p. 334. [Publisher PDF](https://link.springer.com/content/pdf/10.1007/s00280-018-3728-z.pdf). PMCID PMC6394489; PMID 30467591. |
| S3 | [Pegylated Trastuzumab Fragments Acquire an Increased in Vivo Stability but Show a Largely Reduced Affinity for the Target Antigen, Int J Mol Sci 17(4):491 (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4848947/) | Table 3 and Methods 4.11: matched intact-antibody binding-rate pair. DOI 10.3390/ijms17040491; PMID 27043557. |
| S4 | [RCSB PDB 1N8Z](https://rcsb.org/structure/1N8Z) | Experimental method, resolution, assembly and entity/chain metadata. PDB DOI 10.2210/pdb1N8Z/pdb. |
| S5 | [High Affinity Antigen Recognition of the Dual Specific Variants of Herceptin Is Entropy-Driven in Spite of Structural Plasticity](https://pmc.ncbi.nlm.nih.gov/articles/PMC3081289/) | Results associated with Figure 2: alternative Fab measurements; not the primary intact-antibody rate pair. |
| S6 | [Characterisation of an engineered trastuzumab IgE antibody and effector cell mechanisms targeting HER2/neu-positive tumour cells](https://pmc.ncbi.nlm.nih.gov/articles/PMC3017872/) | Table 1, **trastuzumab IgG1 against HER2** column, and kinetic-assay methods: alternative intact-antibody context. |
| S7 | [FDA, Herceptin Hylecta label, revision June 2024](https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/761106s010lbl.pdf) | Section 11, printed p. 16 / PDF page 17: approximate molecular weight of the trastuzumab component only. No Hylecta administration or absorption parameters are transferred. |

The PMC HTML route for S2 encountered an access challenge; the publisher article and full PDF provided the parameter table and context. An unavailable access route is not evidence that a paper or parameter is unavailable.

## 3. Primary hypothesis and comparison

Question: would tripling the modeled elimination half-life maintain occupancy longer than a tenfold affinity improvement?

| Scenario ID | Intervention | Derived changes | Held constant |
| --- | --- | --- | --- |
| `baseline` | Starting configuration below | None | All baseline settings |
| `half_life_x3` | Elimination half-life multiplied by 3 | Clearance divided by 3 at fixed volume | Dose events, volume, binding rates, exposure assumption, initial state, horizon |
| `affinity_x10` | Dissociation equilibrium constant divided by 10 | Dissociation rate divided by 10 at fixed association rate | Dose events, PK, exposure assumption, initial state, horizon |

The two interventions are hypothetical design changes, not measured properties of engineered products. No independence between PK and affinity is asserted biologically; it is an experimental control assumption. Improving affinity through a faster association rate would define a different scenario and can give different transient behavior.

**Primary administration: a single-infusion washout experiment.** Start one 8 mg/kg infusion at time zero and stop its input after 1.5 hours. Give no subsequent doses. Use a chosen body mass of 66 kg and an observation window of 180 days (4320 hours). The dose amount and infusion duration reference the first-dose quantities in S1; stopping after that dose and observing for 180 days are experimental design assumptions, not a complete clinical regimen.

**Secondary configuration: repeated infusion.** For schedule controls and accumulation, specify 8 mg/kg at time zero over 1.5 hours, followed by 6 mg/kg at days 21, 42, and 63 over 0.5 hours, with an 84-day horizon. These amount/interval quantities reference S1; the finite event list and horizon are experiment choices. Saturated, overlapping occupancy curves are a valid outcome. This secondary configuration does not replace the primary washout comparison to manufacture a preferred answer.

S1 describes IV infusion, excludes IV push/bolus for that product, and distinguishes subcutaneous products. The ordinary drug preset therefore offers infusion only. Idealized bolus is a separately identified hypothetical/custom input; other routes require their own supported input model. [S1, section 2.3](https://www.gene.com/download/pdf/herceptin_prescribing.pdf)

## 4. Parameter and assumption inventory

All entries below have been reviewed for identity, units, and traceability. `reviewed` means this technical evidence audit was performed; it is not independent expert or clinical validation. A reported model/assay estimate retains its original type and context.

### 4.1 PK and administration

| Parameter | Original evidence or chosen value | Canonical value | Provenance and use decision |
| --- | --- | --- | --- |
| Drug form | Intact trastuzumab, humanized IgG1 kappa; HER2 extracellular target | Named profile | `reported`, S1; exclude antibody–drug conjugates and route-specific combination products from automatic substitution |
| Molecular weight | Approximately 148 kDa for trastuzumab | 148000 g/mol | `reported`, S7; rounded conversion constant for intact antibody, not the PDB assembly mass |
| Volume V | S2 central volume Vc = 2.62 L for non-AGC population | 2.62 L | `reported`, population model estimate; **using Vc as the sole volume is an assumed reduction** |
| Clearance CL | S2 linear elimination component = 0.127 L/day at reference covariates | 0.005291666667 L/hour | `reported`, population model estimate; **using this component alone is an assumed reduction** |
| Elimination rate ke | CL / V | 0.002019720102 hour^-1 | `calculated` from the selected reduced-model inputs |
| Effective elimination half-life | ln(2) V / CL | 343.1897222 hours, about 14.29957176 days | `calculated`; not a reported clinical terminal half-life |
| Body mass | Chosen example mass | 66 kg | `assumed` experimental input; not a patient record |
| Primary infusion | 8 mg/kg at time zero, over 90 minutes | 528 mg; about 3567.567568 nmol; duration 1.5 hours | Dose/duration reference S1; absolute amount is `calculated`; single-dose-only design is `assumed` |
| Dosing interval | None for primary; 21 days for secondary | Null for single infusion; 504 hours for repeated schedule | Explicit schedule choice; never synthesize repeat events from a missing interval |
| Primary horizon | Chosen experiment duration | 4320 hours | `assumed` design input |
| Initial central amount | Drug-free initial state | 0 nmol | `assumed`; no undocumented steady-state initialization |

S2 fitted a two-compartment model with parallel linear and nonlinear elimination. Reference context includes breast cancer, 66 kg, SGOT 24 IU/L, albumin 4 g/dL, and no liver metastases. The MVP drops distribution and nonlinear elimination instead of reproducing that fit. Its late washout is particularly conditional. [S2, Table 1 and reference-patient description](https://link.springer.com/content/pdf/10.1007/s00280-018-3728-z.pdf)

Changing body mass changes the mg/kg-to-mg conversion only in this MVP. It does not invoke a patient covariate model. Likewise, choosing the volume and linear clearance components does not import the source's fitted variability, prediction intervals, or clinical validation.

The source values and their interpretation must be separate fields: preserve `original_parameter = Vc` and `original_parameter = linear_clearance_component`, with an explicit model-reduction assumption linking them to the MVP. Do not relabel the copied clearance as measured total human clearance. Do not substitute a published multicomponent terminal half-life while leaving this CL/V pair unchanged.

### 4.2 Binding and target-site exposure

| Parameter | Original evidence or chosen value | Canonical value | Provenance and use decision |
| --- | --- | --- | --- |
| Association rate kon | 62.3 × 10^4 M^-1 s^-1 | 2.2428 nM^-1 hour^-1 | `reported` assay-fit estimate, S3 Table 3, intact trastuzumab row |
| Dissociation rate koff | 8.16 × 10^-5 s^-1 | 0.29376 hour^-1 | `reported` assay-fit estimate, same S3 row |
| Reported KD | 0.131 nM | Preserved as reported evidence | `reported`, S3; a reference rather than a third independent input |
| Model KD | koff / kon | About 0.1309791332 nM | `calculated`; use unrounded ratio in computation |
| Exposure factor alpha | Chosen equal-exposure mapping | 1, dimensionless | `assumed`, not a measured free fraction or tumor penetration coefficient |
| Initial occupancy | Initially unoccupied sites | 0 | `assumed`; instantaneous equilibrium is not imposed |
| Occupancy threshold q | Chosen analytical threshold | 0.90 | `assumed`; editable and not a demonstrated therapeutic threshold |
| Target abundance | No numerical value needed for the occupancy-fraction equation | Not an input to this model | Negligible depletion and fixed-site assumptions; no inferred absolute complex count |

S3 used intact antibody against immobilized recombinant human ErbB2/Fc, with SPR at 25°C in HBS-EP, pH 7.4. The authors fitted an effective 1:1 Langmuir model; Table 3 summarizes rates across assay conditions. These are apparent assay kinetics. Transfer to living tissue or 37°C is not validated, and temperature is not an adjustable MVP parameter. [S3, Table 3 and Methods 4.11](https://pmc.ncbi.nlm.nih.gov/articles/PMC4848947/)

### 4.3 Derived alternative parameters

| Scenario | CL (L/day) | Effective elimination half-life (days) | kon (nM^-1 hour^-1) | koff (hour^-1) | Model KD (nM) |
| --- | --- | --- | --- | --- | --- |
| `baseline` | 0.127 | 14.29957176 | 2.2428 | 0.29376 | 0.1309791332 |
| `half_life_x3` | 0.04233333333 | 42.89871527 | 2.2428 | 0.29376 | 0.1309791332 |
| `affinity_x10` | 0.127 | 14.29957176 | 2.2428 | 0.029376 | 0.01309791332 |

These are arithmetic transformations of the chosen inputs, not numerical trajectory results. No claim about the winning intervention is made in 0A.

## 5. Governing equations and assumptions

Model identifier reserved for implementation: `one_compartment_effective_binding_v1`. This identifier does not mean an implementation currently exists.

Let A be central drug amount (nmol), V volume (L), R input rate (nmol/hour), Cc central concentration (nM), Cs available target-site concentration (nM), and theta occupied fraction.

$$
\frac{dA}{dt}=R(t)-k_eA,\qquad C_c=A/V,\qquad k_e=CL/V=\ln(2)/t_{1/2}
$$

$$
C_s=\alpha C_c,\qquad
\frac{d\theta}{dt}=k_{\mathrm{on}}C_s(1-\theta)-k_{\mathrm{off}}\theta,
\qquad K_D=k_{\mathrm{off}}/k_{\mathrm{on}}
$$

R is the sum of active finite-infusion rates. For an event with amount D, start s, and positive duration d, its contribution is D/d on [s, s+d) and zero elsewhere. Adjacent event boundaries must not double-count input. Reject overlapping events within a single generated infusion course in the initial interface; explicitly supplied concurrent infusions can wait for a later model revision. Include an infusion already in progress at the horizon only through the portion actually delivered. Results and AUC include the endpoint T, but a new event exactly at T does not contribute within [0,T].

For a separately enabled hypothetical bolus of amount D, apply A(s+)=A(s-)+D and leave theta continuous. Never approximate that event with an infusion of zero duration, interpolate concentration across its jump, or label it as the ordinary trastuzumab administration preset.

The binding equation follows mass action for independent effective sites: unoccupied fraction is 1-theta and occupied fraction is theta. The drug reservoir is externally driven by PK; association does not subtract A and dissociation does not add A. This approximation intentionally omits drug depletion by binding, target-mediated clearance, receptor turnover, internalization, rebinding geography, spatial transport, Fc-mediated effects, bivalent avidity, and competition.

Alpha is an instantaneous prescribed mapping, not a transport equation. The primary alpha=1 means every modeled effective site sees the central concentration. Neither Cc nor Cs is a measured free tumor concentration. Serum measurements in the PK source do not establish that mapping. If target-site exposure or depletion is the scientific question, this model cannot answer it mechanistically.

For constant R within a segment beginning at t0, exact PK propagation is:

$$
A(t)=A(t_0)e^{-k_e\Delta t}+\frac{R}{k_e}(1-e^{-k_e\Delta t}).
$$

The custom no-elimination boundary ke=0 uses A(t)=A(t0)+R delta_t. Set it explicitly; do not serialize an infinite half-life as an ordinary JSON number.

## 6. Units and linked parameter rules

| Quantity | Canonical unit |
| --- | --- |
| Time, half-life, infusion duration, interval | hour |
| Amount | nmol |
| Concentration and KD | nM = nmol/L |
| Molecular weight | g/mol |
| Volume | L |
| Clearance | L/hour |
| kon | nM^-1 hour^-1 |
| koff and ke | hour^-1 |
| Occupancy and alpha | Dimensionless |

Conversions to verify in Phase 1:

- D[nmol] = D[mg] × 10^6 / MW[g/mol]. For mg/kg, calculate mg from explicit body mass first.
- kon[nM^-1 hour^-1] = kon[M^-1 s^-1] × 3.6 × 10^-6.
- koff[hour^-1] = koff[s^-1] × 3600.
- CL[L/hour] = CL[L/day] / 24.
- C[nM] = C[mg/L] × 10^6 / MW[g/mol]. One microgram/mL equals one mg/L.

At fixed V, half-life edits derive CL and CL edits derive half-life. Volume edits hold CL fixed by default and therefore derive half-life; make that dependency visible. The half-life intervention overrides CL deliberately at the same V. At fixed kon, KD edits derive koff. Editing either kinetic rate derives KD. The server is authoritative, returns resolved parameters, and rejects incompatible independent values rather than silently selecting a winner. User overrides keep a derivation trail back to the preset.

Require finite values, MW>0, V>0, positive infusion duration and horizon, nonnegative administered amount and exposure factor, initial occupancy in [0,1], and a threshold strictly between 0 and 1. Ordinary profile kinetics and elimination rates are positive. Exact zero-rate limits belong to explicitly named custom/test cases. Do not compute KD when kon=0; irreversible binding with koff=0 must not be advertised as a measured zero-KD drug.

## 7. Numerical contract and endpoints for Phase 1

Use exact piecewise PK as the driving concentration and solve the occupancy ODE adaptively. Radau is the initial stiff-solver choice. Start with rtol=1e-6 and occupancy atol=1e-9, then confirm convergence across the supported parameter envelope. Grid resolution for display must not set integration precision. Split at all input boundaries, retain exact boundaries in output, and include adequate early-time sampling. Domain violations beyond numerical tolerance or failed integrations produce errors, not plausible-looking clipped curves.

Required metrics over the same explicit [0,T] in all scenarios:

- Central concentration AUC, nM·hour.
- Occupancy AUC, fraction·hour; an optional normalized mean occupancy is AUC/T.
- Endpoint occupancy, fraction or percent with an explicit unit.
- Total time theta>=q inside [0,T], calculated from threshold crossings and boundary intervals.
- First upward crossing and first subsequent downward crossing when identifiable. Define post-rise retention as the time between them, not the first moment below q: theta starts at zero.

Represent threshold outcomes explicitly: `never_reached`, `crossed_within_window`, `still_above_at_horizon`, or `ambiguous_without_more_resolution`. The numerical implementation must refine crossings rather than infer them from a sparse plot grid. Repeated dosing may have multiple above-threshold intervals; report total duration and interval list rather than imply one uninterrupted retention period. No ranking is justified when the requested endpoint is censored for both alternatives.

All model output is deterministic at fixed normalized configuration, model version, and solver settings within declared numerical tolerances. Parameter uncertainty is not implemented in this model. Do not display a confidence band, probability of success, or significant difference without an explicit supported uncertainty analysis.

## 8. Conflicts and rejected substitutions

| Candidate | Audit observation | Decision |
| --- | --- | --- |
| S3 matched intact-antibody pair | Complete rates and assay methods; KD ratio consistent with reported rounding | Select as the primary apparent-kinetics set, retaining assay limitations |
| S6 alternative intact IgG1 pair | kon=(7.3 ± 3.5) × 10^5 M^-1 s^-1 and koff=(1.8 ± 0.9) × 10^-5 s^-1, SPR at 24°C | Preserve as a separate context; do not pool or mix with S3. Calculated ratio is about 0.02466 nM. [S6](https://pmc.ncbi.nlm.nih.gov/articles/PMC3017872/) |
| S5 Fab pair | kon=7 × 10^5 M^-1 s^-1 and koff=4 × 10^-4 s^-1 at 30°C; reported KD=0.5 nM | Separate fragment/assay context. Rounded rates imply about 0.5714 nM; preserve both. Not the intact-antibody default. [S5](https://pmc.ncbi.nlm.nih.gov/articles/PMC3081289/) |
| Published clinical terminal half-life | A terminal phase in a multicomponent model is not generally ln(2) Vc / linear CL | Do not use as an additional independent default alongside the selected CL/V |
| Affinity from functional potency | IC50, EC50, association equilibrium constants, and dissociation constants have different meanings | Reject direct substitution and check units, assay target, and symbol definitions |
| PDB assembly mass | Structure contains a complex and antibody fragment | Reject as molecular weight of administered intact trastuzumab |
| Better-looking curve separation | Saturation and horizon censoring may hide differences | Report the outcome; any exploratory change of exposure or horizon is visible and applied consistently |

These disagreements establish contextual variation, not measurement error or proof that one paper is correct. Source selection is based on complete matched inputs and an explicit application context, not on choosing an attractive result.

## 9. Experimental structure specification

Use **1N8Z: trastuzumab Fab bound to the HER2 extracellular domain**. The record reports X-ray diffraction at 2.52 Å and author-assigned biological assembly 1. Entity mapping: chain A is Fab light chain, B Fab heavy chain, and C HER2/ERBB2 extracellular domain. This is a fragment complex, not a full IgG, full-length membrane receptor, or trajectory. [S4](https://rcsb.org/structure/1N8Z)

Implement the viewer later using verified author/entity mapping from the actual asset, since mmCIF author and label chain identifiers can differ. Cache the source file and metadata in Phase 4. Preserve original coordinates and residue identifiers; missing coordinates are not reconstructed by the LLM. Cartoon, surface, chain selection, and a chosen 5 Å interface-neighborhood selection are display operations. The distance cutoff is a visualization convention, not a measured affinity or binding-energy calculation. Glycans, water, and other nonpolymer entities must not be mislabeled as the drug.

Dose, half-life, and hypothetical affinity changes never deform or replace this geometry. Use an external text badge for scenario occupancy. A separate population schematic follows numerical results; its drawn targets are not a measured receptor count.

## 10. Missing evidence, limitations, and follow-up

| Gap | Consequence for this preset | Useful follow-up |
| --- | --- | --- |
| Free, accessible target-site concentration over time | Alpha remains assumed; no measured tumor occupancy claim | Measure or supply exposure in the intended compartment |
| In-context binding kinetics and effective-site behavior | SPR estimates remain conditional; no temperature conversion | Obtain compatible cell-based association/dissociation measurements |
| Calibration of the reduced PK model | No clinical concentration-fit or tail-accuracy claim | Validate against a concentration dataset or implement a reviewed richer model later |
| Receptor turnover, depletion, and internalization | Cannot answer target-mediated disposition questions | Measure these processes before selecting an extended model |
| Real engineered products with changed half-life/affinity | Interventions are controlled mathematical changes | Measure both PK and binding after engineering; assess coupled changes |
| Reliable population uncertainty for the combined model | No probabilistic conclusions | Specify compatible uncertainty distributions and dependencies before analysis |

These limitations were anticipated by the roadmap. They do not justify adding advanced PK or expanding drug support during 0A.

## 11. Completion review and handoff

- Required inputs: all mapped to a reported source, a derivation, or an explicit assumption; no critical unclassified input remains.
- Source verification: primary PK table and covariate context, intact-antibody binding row/methods, dose/infusion reference, molecular weight, and structure mapping inspected.
- Arithmetic checked independently: mass-to-molar conversion, canonical kinetic units, KD ratio, CL/V half-life, and both intervention transformations.
- Scenario fairness: same amount, schedule, V, alpha, initial state, threshold, and horizon across the three primary scenarios.
- Scientific boundary: primary profile is `conditional`; no fitted tumor occupancy or clinical regimen claim.
- Implementation status: no simulator, application scaffolding, API implementation, or dependency installation performed in 0A. Numerical and browser tests are future work.

**Plan assessment: Keep the plan.** Selecting intact-antibody evidence and defining the experiment details are within 0A. Existing approximation, exposure, saturation, and unsupported-drug provisions cover the findings. No material risk requires a roadmap change and no verified capacity supports scope expansion.

Next proposed chunk: **0B — Schemas and service skeleton**. It should encode provenance versus applicability, the conditional preset, explicit dosing events, linked derivations, support outcomes, and threshold-censoring states. Model ID and numeric examples here are specifications, not deployed features. Stop for the user's green light before 0B.
