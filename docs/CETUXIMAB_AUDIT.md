# Cetuximab–EGFR reference audit — 8E.1

Outcome: **evidence block for an automatic clinical PK-to-cell-surface occupancy preset**. This is a technical source audit, not independent scientific or clinical validation. It does not rule out conditional cetuximab experiments using supported equations and explicit researcher assumptions. No second default drug profile is enabled.

## Sources and findings

The versioned package is `data/drugs/audits/cetuximab-egfr-v1.json`: five sources and 27 candidate facts. Each fact has its source/locator, original or calculated units, assay context and selection decision. All retain candidate status. Calculated facts identify their parents and formulas.

- **Regulatory PK.** The [September 2021 FDA label](https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/125084s279lbl.pdf), section 12.3, describes nonlinear exposure and dose-dependent clearance, plus BSA-normalized distribution volume and a population half-life summary. Its exact PDF bytes were downloaded and hashed; this is an explicitly historical label, not a claim about the latest US prescribing information. The inspected [EMA product information](https://www.ema.europa.eu/en/documents/product-information/erbitux-epar-product-information_en.pdf), section 5.2, supplies mean volume 2.9 L/m² and clearance 0.022 L/h/m². Its web-rendered PDF was inspected, but local byte access failed, so it has no asserted content checksum. The ratio ln(2) × 2.9 / 0.022 gives about 91.37 hours: a calculation from aggregate means, not a measured individual half-life. Neither a BSA nor a constant-clearance dose domain is silently selected.
- **Fab assay.** [Donaldson et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3808661/), Results, “Meditope Occupancy Does Not Interfere with Antigen Binding,” reports cetuximab Fab binding to tethered EGFR domain III without meditope: kon 2.6×10⁶ M⁻¹ s⁻¹, koff 2.0×10⁻³ s⁻¹ and KD 0.76 nM. Unit conversion gives 9.36 nM⁻¹ h⁻¹ and 7.2 h⁻¹; their ratio is about 0.76923 nM. The reported rounded affinity remains separate. These are Fab/isolated-domain measurements, not measured intact-IgG cell-surface occupancy. PMC text was inspected; a local XML snapshot was unavailable.
- **Intact-antibody/fusion-protein lead.** Indexed results from [Zhuang et al. 2022](https://www.nature.com/articles/s41467-022-32159-6), Fig. 4d/e, report parent cetuximab with WT-EGFR-ECD-Fc, including rate magnitudes 1.68×10⁵ and 7.29×10⁻⁵ s⁻¹, and KD mean 0.40 nM with SD 0.28 nM. Direct article/methods/supplement retrieval failed. The index renders the association unit as “Ms⁻¹”; its inverse-molar exponent is not verified. The original typography is retained. Canonical kon and KD-ratio calculations are explicitly conditional on the conventional inverse-molar interpretation, not accepted measured-unit conversions. Mutant-antibody rates are not transferred to parent cetuximab. The fit, immobilization and avidity context needs inspection before selection.
- **Structure lead.** [RCSB 1YY9](https://www.rcsb.org/structure/1YY9) describes human EGFR extracellular domain with chimeric cetuximab Fab; current entry metadata lists X-ray resolution 2.60 Å. That metadata was inspected. No new pinned coordinate asset or viewer/agent structure registration is claimed. NAG glycans must never be labeled as the therapeutic ligand. Geometry availability would not resolve the PK/binding applicability gaps.

## Support decision

A conditional, effective assay model may be useful. The inspected evidence does not justify presenting it as a general clinical default whose dose slider reproduces nonlinear PK and whose central concentration establishes cell-surface exposure.

Before configuration, a researcher must declare the intended molecular form and experimental system; choose a matched binding pair; supply BSA and schedule or explicit absolute design inputs; justify a constant-clearance domain or request an unsupported nonlinear model; and specify exposure, competition and fixed-site/turnover assumptions. Existing preparation validators remain authoritative. No new nonlinear PK, receptor internalization, avidity or tissue-distribution model was implemented.

Conflicting or different-context measurements are not averaged. Regulatory ranges remain endpoints, never invented point estimates. A measured mean KD is not replaced by the ratio of mean rates. Intact-IgG PK is not automatically assigned to Fab.

## API, tools and software verification

- `GET /api/research/audits/cetuximab` (also `Erbitux`) exposes this read-only audit. Unknown names still have independent research/preparation support.
- The existing `read_reference_audit` LangChain tool can return it; neither that tool nor audit presence grants simulation authority. No new live generalized-agent research run is claimed by this chunk.
- `ReferenceAudit.structure` is now optional, with a mandatory explanatory note when absent. The previous imatinib asset/hash checks remain intact. This avoids inventing a small-molecule ligand record for an antibody audit.
- `.venv/bin/python scripts/check_reference_audit.py --drug cetuximab` checks the package offline. It explicitly reports that no coordinate asset is attached.
- `test_cetuximab_audit.py` checks source/access labels, no default promotion, the API/tool, canonical and conditional unit math, cross-assay separation, BSA-unit refusal and numerical agreement with the analytical constant-bath occupancy solution. These mathematical checks are not clinical PK validation.

## Cutoff and next step

Do not add another speculative drug audit during 8E.1. A future cetuximab enablement review can inspect the complete SPR methods and establish a bounded PK/assay/exposure scope. For this roadmap, proceed to **8E.2**, demonstrating the reviewed primary, this honest blocked outcome, unfamiliar-drug research and explicitly hypothetical preparation. A second preset is not a substitute for generalization acceptance.
