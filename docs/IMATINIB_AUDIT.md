# Imatinib–Abl reference audit — 7B.4

Technical source audit dated 2026-11-14, not independent expert or clinical validation. Outcome: **evidence block for a default clinical PK → intracellular Abl occupancy profile**. No new reviewed preset was added. This is the blocked-candidate branch anticipated by the roadmap, not a restriction on arbitrary-drug preparation.

## Evidence and model applicability

The [2014 P-EIM study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4188269/) supplies paired rates for immobilized Abl: kon = 2.2×10⁴ M⁻¹ s⁻¹ and koff = 7.4×10⁻⁴ s⁻¹. In simulator units these are 0.0792 nM⁻¹ h⁻¹ and 2.664 h⁻¹. Their ratio gives KD = 33.636 nM, close to the table's rounded 34 nM, whereas the running text reports 21 nM. Both reported affinities remain separate candidates; neither is silently substituted. Accessible methods do not adequately establish protein species/construct for transfer to a human intracellular model. A constant-concentration numerical check of this rate pair matches the analytical one-step solution; this verifies mathematics, not clinical applicability.

The [2020 isotope PK study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7351863/) examines six GIST patients receiving oral parent drug and a 100 µg IV imatinib-d8 microdose. Its isotope IV estimates include clearance 7.6 L/h, volume 462 L and terminal half-life 45.5 h; these are not a matched parent-drug central-compartment parameter set. The ratio of aggregate volume/clearance gives about 42.14 h, which need not equal the mean reported terminal half-life. Oral apparent clearance/volume cannot be treated as IV clearance/volume. No values from these columns are selected as defaults.

[Peng 2004](https://pubmed.ncbi.nlm.nih.gov/14747424/) documents experimental IV infusion in healthy subjects, so “IV imatinib has never been studied” would be incorrect. Its inspected abstract is insufficient to initialize the required compatible PK and intracellular binding model.

[The 2020 multistep kinetics paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7431045/) distinguishes physical binding from induced-fit transitions. The package preserves indexed table candidates with an explicit full-text access limitation and metadata-only checksum. Step-specific rates cannot initialize an overall one-step binding profile. No source access barrier was bypassed.

The [FDA label](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/021588s067lbl.pdf) describes oral dosing and the mesylate salt (589.7 g/mol). [RCSB STI](https://www.rcsb.org/ligand/STI) identifies the bound parent ligand (493.603 g/mol). Salt and parent masses cannot be interchanged in molar dose conversion. Plasma protein binding alone does not establish free intracellular target-site exposure or ATP competition.

Missing inputs include a compatible exposure/PK definition, a justified effective binding model and matched assay/construct context. Explicit researcher assumptions can still enter the generic hypothetical preparation path, subject to its existing checks and conditional labels. No transport, ATP-competition or multistep model was implemented here.

## Verified experimental structure

[PDB 1IEP](https://www.rcsb.org/structure/1IEP) is a 2.1 Å X-ray structure of **mouse c-Abl kinase domain**, UniProt P00520, with imatinib. Protein chains A/B are separate crystallographic copies; each has a 37-heavy-atom STI ligand (A:201 and B:202). This is a related structural reference, not a human BCR-ABL cellular model.

Official coordinates are cached at `apps/web/public/structures/1IEP.pdb`, with minimal official metadata in `data/structures/1IEP.metadata.json`. Loading verifies the SHA-256, species/identity metadata, ligand identity, chain/ligand counts and finite coordinates. Geometry never changes with simulation parameters. Selecting this asset in the workspace remains a 7D integration task; its presence does not enable a simulation.

## Interfaces and repeatable checks

- `GET /api/research/audits/imatinib` returns the versioned audit, candidate facts, blockers, missing inputs and verified structure metadata. Unknown names return 404 without disabling independent research/preparation.
- `read_reference_audit` is a read-only LangChain tool available for later 7C orchestration. It neither runs the solver nor promotes evidence.
- The audit JSON is not an `ExperimentConfig`; submitting it to the simulation API fails validation.
- Run `.venv/bin/python scripts/check_reference_audit.py` for offline manifest/coordinate checks and `.venv/bin/python -m pytest apps/api/tests/test_reference_audits.py apps/api/tests/test_preparation_workflow.py` for numerical and preparation guards.

The package in `data/drugs/audits/imatinib-abl-v1.json` records source identifiers, inspected-source checksums, locators, context, calculated lineage and the decision for each fact. All facts retain candidate status. Raw article/PDF snapshots remain ignored local files; the repository contains extracted facts and source links, not full articles.

## Reference selection follow-up

Cetuximab–EGFR is the proposed replacement reference candidate, based on preliminary leads: [paired SPR measurements](https://www.nature.com/articles/s41467-022-32159-6), [IV label](https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/125084s279lbl.pdf), and [structure 1YY9](https://www.rcsb.org/structure/1YY9). Nonlinear PK, construct identity and Fc/avidity effects still require a separate audit. No cetuximab profile is claimed or implemented. Continue with the planned 7B.5 generalization acceptance; an additional real-drug audit requires its own agreed scope.
