# Structure-analysis tools — 8C.1

The backend can now measure deposited coordinates of the two verified cached complexes: trastuzumab Fab–HER2 (**1N8Z**) and imatinib–mouse c-Abl kinase domain (**1IEP**). The measurements match the molecular viewer. This is structural inspection of experimental geometry. It is not a molecular simulation and it does not use dose, affinity or the PK model.

The tools exist and are tested, but the research agent does not call them yet and the workspace shows nothing new. Both come in 8C.2.

## What it reports

| Capability | Service method | Agent tool | API route |
| --- | --- | --- | --- |
| Structure for a drug/target pair, with metadata | `resolve`, `metadata` | `find_verified_structure` | `GET /api/structures?drug=&target=` |
| Closest drug–target residue pairs within 4 Å | `interface` | `list_interface_contacts` | `GET /api/structures/{pdb_id}/interface?limit=` |
| Distance for a selected residue | `distance` | `measure_residue_distance` | `POST /api/structures/{pdb_id}/distance` |

- **Metadata:** PDB ID, pinned coordinate SHA-256, title, method, resolution and deposition date, and each entity's role (drug or target), chains, molecule, fragment and source organism. These are read from the coordinate file's own header records. It also gives the count of depositor-reported unresolved residues, what is excluded from contacts and whether crystal copies may be mixed.
- **Interface contacts:** every drug–target residue pair whose closest heavy atoms are within 4 Å, closest first. Each has author chain, residue number, insertion code and residue name for both sides, the two atoms (name, serial, element) and the distance in Å. The total pair count is always given; `truncated` says when the list was cut to `limit` (1–100).
- **Residue distance:** for one residue and a named residue of the opposite partner, the single closest heavy-atom pair. Without a counterpart, the nearest binding-partner residues (1–20), each flagged as within or beyond 4 Å.

Every result carries `provenance`: PDB ID, coordinate hash, source URL, the cutoff rule, the structure's scope, and the statement that distances do not establish hydrogen bonds, binding energy, affinity, kinetic rates, mutation effects or clinical outcomes.

## Rules

- **Verified assets only.** A file is used only if its bytes match the pinned SHA-256. A missing or altered file returns `asset_unavailable` or `asset_integrity_failed`. A failure is not cached, so a repaired file is checked again.
- **Unknown pairs return unavailable.** Both drug and target must match a verified complex. A related structure is never substituted.
- **Binding partners.** 1N8Z: Fab chains A and B against HER2 chain C; Fab light–heavy contacts are not interface contacts. 1IEP: ligand STI against the kinase in the same crystal copy only.
- **Refusals with a reason.** `residue_reported_unresolved` (REMARK 465), `residue_absent_cause_unknown`, `not_a_binding_partner` (waters, glycans, other ligands), `same_binding_partner` and `different_crystal_copy`.
- **Geometry.** First deposited model, heavy atoms only, inclusive 4 Å Euclidean cutoff, minimum over each residue pair's atoms. Alternate conformers, duplicate serials, missing elements and invalid coordinates fail closed. No atoms are reconstructed and no symmetry mates are generated.
- **Immutable.** Parsed models are frozen and cached per verified asset; callers receive fresh result objects.

## Parity with the viewer

`app/structures/geometry.py` is a separate Python implementation of the rules in `apps/web/lib/structure-geometry.ts`. Parity is proven, not assumed:

1. `scripts/export_structure_parity.mjs` runs the viewer's own code and writes `data/structures/geometry-parity.json`: all interface pairs of both structures and the nearest counterparts of both residues of each closest pair.
2. A frontend test regenerates that output and requires it to equal the committed file.
3. A backend test requires the Python service to return the same residue and atom identities in the same order, with distances within 1e-9 Å.

After changing either implementation, regenerate the fixture and run both suites:

```sh
node --experimental-strip-types scripts/export_structure_parity.mjs
npm run test:workspace --workspace apps/web
.venv/bin/python -m pytest apps/api/tests/test_structure_analysis.py
```

Reference values: 1N8Z has 32 interface residue pairs, closest GLY B:103 O / LYS C:593 NZ at 2.416987174 Å. 1IEP has 45, closest STI A:201 N51 / ILE A:360 O at 2.668499578 Å.

## Verification

`apps/api/tests/test_structure_analysis.py` covers the reference distances and full interface parity, sidebar-neighbour parity, metadata, unresolved/absent/non-partner residues, same-partner and cross-copy refusals, unknown pairs, altered and missing assets, immutability, parser failures, the inclusive cutoff boundary, and the tools and API routes.

```sh
.venv/bin/python scripts/check_structure_tools.py
```

That script runs the live pinned Nemotron model with only these three tools. It passes when the model finds 1N8Z, lists contacts and measures the closest pair, and stops after an unavailable result for an unknown pair. Outcomes are recorded in `data/research/verification/8C.1-structure-tools.json`.

## Not included

Agent use during research, attaching measurements to the scientific answer, and linking them to viewer focus are 8C.2. There is no docking, dynamics, energy estimate, mutation effect or inference of KD, kon or koff from coordinates.
