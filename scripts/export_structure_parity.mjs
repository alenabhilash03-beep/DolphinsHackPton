// Writes the viewer's own geometry output for both verified structures.
// The frontend and backend test suites each compare themselves to this file, proving parity.
// Run: node --experimental-strip-types scripts/export_structure_parity.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { STRUCTURES, parseCoordinates, interfaceContacts, residueContacts, residueKey } from '../apps/web/lib/structure-geometry.ts';

export function parityFixture() {
  const row = c => [residueKey(c.a), c.a.atom, c.a.serial, residueKey(c.b), c.b.atom, c.b.serial, c.distance];
  const structures = {};
  for (const [kind, profile] of Object.entries(STRUCTURES)) {
    const model = parseCoordinates(readFileSync(new URL(`../apps/web/public/structures/${profile.id}.pdb`, import.meta.url)).toString());
    const pairs = interfaceContacts(model.atoms, kind);
    structures[profile.id] = { kind, sha256: profile.sha256, heavy_atoms: model.atoms.length, reported_unresolved: model.unresolved.length,
      cutoff_angstrom: 4, interface: pairs.map(row),
      // Nearest counterparts of both residues of the closest pair, as the inspection sidebar lists them.
      neighbours: Object.fromEntries([pairs[0].a, pairs[0].b].map(atom => [residueKey(atom), residueContacts(model.atoms, atom, kind).slice(0, 8).map(row)])) };
  }
  return { generated_by: 'apps/web/lib/structure-geometry.ts via scripts/export_structure_parity.mjs',
    columns: ['selected_or_drug_residue', 'atom', 'serial', 'counterpart_residue', 'atom', 'serial', 'distance_angstrom'], structures };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(new URL('../data/structures/geometry-parity.json', import.meta.url), JSON.stringify(parityFixture(), null, 1) + '\n');
  console.log('Wrote data/structures/geometry-parity.json');
}
