# Guided molecular inspection — 7E

The structure section now provides a four-stop guided tour and a coordinate inspection sidebar for the two verified cached complexes: trastuzumab Fab–HER2 (1N8Z) and imatinib–mouse c-Abl kinase domain (1IEP). This viewer illustrates deposited experimental geometry, independently of the simulation clock, dose and assumed affinity.

## Try it

Open `http://127.0.0.1:3002/preview/plots#structure`.

1. **Start guided tour**: overview → binding partners → interface → coordinate pair. The camera transitions for 600 ms; tour stops auto-advance every 5.5 seconds. Pause, Previous/Next, camera controls, chain visibility and direct canvas interaction interrupt automatic touring.
2. **Reduce camera motion**: camera framing is immediate and automatic progression stops. The operating-system reduced-motion preference is honored automatically. Use Next to advance manually.
3. **Inspect closest interface pair**, or click a protein residue in the canvas. The selected residue appears in orange; its measured counterpart appears cyan when a distance is selected. Nearby context becomes translucent so the selected geometry is visible.
4. Inspect an author chain/residue number, with optional insertion code. For 1N8Z, B:103 and C:593 form the closest displayed Fab–target pair. C:102 is depositor-reported unresolved; C:99999 simply has no resolved coordinates and no reason is invented.
5. Click a counterpart distance to highlight its closest atom pair and annotate the distance in Å. The sidebar retains full computed values rounded to three decimals; rounding does not represent experimental precision.
6. For 1IEP, **Inspect imatinib ligand** selects STI A:201 (37 resolved heavy atoms). The nearest listed protein residue is ILE A:360. Contacts are restricted to the same deposited crystal copy; copy A cannot acquire contacts from copy B.

The sidebar and tour are keyboard-operable using native controls. Canvas rotation/zoom remains available. On narrow screens the sidebar stacks below the canvas; the desktop sidebar scrolls internally to keep the model usable.

## What the numbers mean

`structure-geometry.ts` parses the first deposited PDB coordinate model. Only finite, explicitly supplied heavy-atom coordinates are accepted. Residue identity includes author chain, signed residue number and insertion code. Duplicate atom serials and alternate atom conformers fail closed rather than being silently mixed. Both cached assets have blank alternate-location fields.

The interface cutoff is **4 Å**, computed from Euclidean heavy-atom distances. Each reported residue-pair distance is the minimum over its eligible atom pairs. A spatial bucket search identifies complete interfaces; a bounded per-selected-residue scan lists the nearest counterparts. Interface highlighting is a geometric cutoff; nearest-neighbor listings can also include entries outside that cutoff, which are explicitly labeled.

For 1N8Z only Fab chains A/B ↔ HER2 chain C count as binding partners; Fab light/heavy-chain contacts are excluded from this list. For 1IEP only STI ↔ kinase in the same chain copy counts. Waters, glycans and hydrogens are excluded. Crystal symmetry mates and new biological assemblies are not generated.

Reported unresolved residues come from depositor **REMARK 465** entries. A missing coordinate without such an entry is labeled absent/outside-construct/unresolved with the cause left unknown. No atoms or side chains are reconstructed, and an existing residue is not assumed atomically complete merely because some atoms are present.

Distances do **not** establish hydrogen bonds, binding energy, affinity, kinetic rates, mutation effects or clinical outcomes. Bulk published PK/binding parameters are never attributed to a clicked residue. 1IEP remains a related **mouse** kinase-domain reference, not a human BCR-ABL intracellular model.

## Integrity and architecture

Before rendering, Web Crypto verifies the PDB bytes against pinned SHA-256 values. A wrong or unavailable asset disables inspection and leaves scientific plots usable. The geometry parser, pair searches and sidebar do not call an LLM or numerical PK simulator. Camera movement interpolates only view translation/zoom, preserving rotation; manual interruption cancels the pending animation frame. Styles, surfaces, labels and distance lines do not edit deposited coordinates.

The molecular viewer receives only the supported structure kind, not dose, affinity, simulation result or timeline props. Structure changes remount its isolated viewer. Unknown drug–target pairs retain the existing honest unavailable-structure state.

Sources are the cached official coordinate files and their deposition pages: [RCSB 1N8Z](https://www.rcsb.org/structure/1N8Z), [RCSB 1IEP](https://www.rcsb.org/structure/1IEP). No new molecular model or drug profile was introduced.

## Verification

Run `npm run test:workspace --workspace apps/web`, `npm run typecheck` and `npm run build`. The new geometry checks verify:

- audited asset hashes, deposited counts and imatinib ligand identity;
- real interface pairs and closest distances;
- spatial bucket results against independent brute force at cutoff boundaries;
- exclusion of water/glycans and cross-copy imatinib contacts;
- unresolved residues, insertion codes and absent/invalid identifiers;
- rejection of ambiguous conformers, duplicate serials and missing coordinates;
- first-model handling and immutable coordinate arrays.

A separate NumPy scan of the raw PDB columns independently reproduced closest pairs: 1N8Z GLY B:103 O ↔ LYS C:593 NZ, 2.416987174 Å; 1IEP STI A:201 N51 ↔ ILE A:360 O, 2.668499578 Å. These are coordinate calculations, not independently measured binding interactions. Browser checks are recorded in the 7E review.
