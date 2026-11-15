"""Deposited heavy-atom geometry, matching apps/web/lib/structure-geometry.ts rule for rule.

No docking, dynamics, reconstruction or energetic inference. Parity with the viewer is proven by
data/structures/geometry-parity.json, which both the frontend and backend test suites check.
"""
from dataclasses import dataclass
from math import isfinite
import re

import numpy as np
from scipy.spatial import cKDTree

REMARK_465 = re.compile(r'^REMARK 465\s+(?:\d+\s+)?([A-Z0-9]{3})\s+([A-Za-z0-9])\s+(-?\d+)([A-Za-z]?)\s*$')


@dataclass(frozen=True)
class Atom:
    serial: int
    chain: str
    resi: int
    icode: str
    resn: str
    name: str
    element: str
    protein: bool
    x: float
    y: float
    z: float

    @property
    def residue(self) -> tuple[str, int, str, str]:
        return (self.chain, self.resi, self.icode, self.resn)


@dataclass(frozen=True)
class Model:
    atoms: tuple[Atom, ...]
    unresolved: tuple[tuple[str, int, str, str], ...]


@dataclass(frozen=True)
class Partners:
    """Which deposited atoms are the drug and which the target, and whether copies may mix."""
    drug_chains: frozenset[str]
    target_chains: frozenset[str]
    ligand_code: str | None = None
    same_copy_only: bool = False

    def role(self, atom: Atom) -> str | None:
        if self.ligand_code is None:
            if not atom.protein:
                return None  # waters and glycans are not binding partners
            return 'target' if atom.chain in self.target_chains else 'drug' if atom.chain in self.drug_chains else None
        if atom.chain not in self.target_chains:
            return None
        return 'target' if atom.protein else 'drug' if atom.resn == self.ligand_code else None

    def pair(self, a: Atom, b: Atom) -> bool:
        left, right = self.role(a), self.role(b)
        return bool(left and right and left != right and (not self.same_copy_only or a.chain == b.chain))


def parse(pdb: str) -> Model:
    """First deposited model; finite heavy-atom coordinates only; ambiguity fails closed."""
    atoms, unresolved, seen, started = [], [], set(), False
    for line in pdb.splitlines():
        if line.startswith('REMARK 465'):
            match = REMARK_465.match(line)
            if match:
                unresolved.append((match[2], int(match[3]), match[4], match[1]))
        if line.startswith('MODEL '):
            if started:
                break
            started = True
        if line.startswith('ENDMDL'):
            break
        protein = line.startswith('ATOM  ')
        if not protein and not line.startswith('HETATM'):
            continue
        element = line[76:78].strip().upper()
        if not element:
            raise ValueError('Atom element metadata missing; heavy-atom contacts cannot be verified.')
        if element in {'H', 'D'}:
            continue
        if line[16:17].strip():
            raise ValueError('Alternate conformers require explicit handling before inspection; none are mixed automatically.')

        def number(start, end):
            field = line[start:end].strip()
            try:
                value = float(field)
            except ValueError:
                value = float('nan')
            if not field or not isfinite(value):
                raise ValueError('Invalid deposited coordinate record.')
            return value

        serial, resi = number(6, 11), number(22, 26)
        if serial != int(serial) or resi != int(resi) or serial in seen:
            raise ValueError('Ambiguous deposited atom identifiers.')
        seen.add(serial)
        atoms.append(Atom(int(serial), line[21], int(resi), line[26:27].strip(), line[17:20].strip(), line[12:16].strip(),
            element, protein, number(30, 38), number(38, 46), number(46, 54)))
    if not atoms:
        raise ValueError('No deposited heavy-atom coordinates found.')
    return Model(tuple(atoms), tuple(unresolved))


def separation(a: Atom, b: Atom) -> float:
    return float(np.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2))


def _key(residue) -> str:
    chain, resi, icode, resn = residue
    return f'{chain}:{resi}{icode}:{resn}'


def interface_contacts(model: Model, partners: Partners, cutoff: float = 4.0) -> list[tuple[Atom, Atom, float]]:
    """Closest drug/target heavy-atom pair for every residue pair within the cutoff, drug atom first."""
    if not isfinite(cutoff) or cutoff <= 0 or cutoff > 10:
        raise ValueError('Choose a geometric cutoff above zero and at most 10 Å.')
    drug = [atom for atom in model.atoms if partners.role(atom) == 'drug']
    target = [atom for atom in model.atoms if partners.role(atom) == 'target']
    if not drug or not target:
        return []
    tree = cKDTree(np.array([(atom.x, atom.y, atom.z) for atom in target]))
    best = {}
    # Query slightly wide, then apply the exact inclusive cutoff so boundary pairs match the viewer.
    for a, neighbours in zip(drug, tree.query_ball_point(np.array([(atom.x, atom.y, atom.z) for atom in drug]), cutoff + 1e-6)):
        for index in neighbours:
            b = target[index]
            if not partners.pair(a, b):
                continue
            distance = separation(a, b)
            if distance > cutoff:
                continue
            key = (a.residue, b.residue)
            if key not in best or distance < best[key][2]:
                best[key] = (a, b, distance)
    return sorted(best.values(), key=lambda item: (item[2], _key(item[0].residue), _key(item[1].residue)))


def residue_contacts(model: Model, partners: Partners, selected: tuple[str, int, str, str]) -> list[tuple[Atom, Atom, float]]:
    """Closest heavy-atom pair to every counterpart residue of the selected residue, selected atom first."""
    own = [atom for atom in model.atoms if atom.residue == selected]
    best = {}
    for a in own:
        for b in model.atoms:
            if partners.pair(a, b):
                distance = separation(a, b)
                if b.residue not in best or distance < best[b.residue][2]:
                    best[b.residue] = (a, b, distance)
    return sorted(best.values(), key=lambda item: (item[2], _key(item[1].residue)))
