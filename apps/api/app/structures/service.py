"""Verified structure assets and bounded coordinate measurements for agent tools and the API.

An asset is used only if its bytes match the pinned SHA-256. Unknown drug/target pairs, failed
integrity checks and unresolved residues return an explicit unavailable outcome, never a guess.
"""
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
import re

from app.config import ROOT
from app.schemas.structure_analysis import (
    AtomIdentity, ContactMeasurement, InterfaceContacts, ResidueDistance, ResidueIdentity, ResidueSelector,
    StructureEntity, StructureMetadata, StructureProvenance,
)
from app.structures.geometry import Model, Partners, interface_contacts, parse, residue_contacts

ASSET_ROOT = ROOT / 'apps/web/public/structures'
CUTOFF = 4.0
CUTOFF_RULE = ('Residue pairs whose closest heavy atoms are within 4 Å (inclusive Euclidean distance) in the first deposited '
    'model. Each reported distance is the minimum over that pair\'s heavy atoms. Hydrogens, waters and glycans are excluded; '
    'no symmetry mates or new assemblies are generated.')


@dataclass(frozen=True)
class Asset:
    pdb_id: str
    sha256: str
    partners: Partners
    drug_names: frozenset[str]
    target_names: frozenset[str]
    scope: str
    excluded: tuple[str, ...]


# The same two verified complexes, names and partner rules as the viewer (structure-geometry.ts, agent-workspace.ts).
ASSETS = {asset.pdb_id: asset for asset in (
    Asset('1N8Z', 'ed934d36503335c6764b08880f9e50933d99eb13b9bf145339cfcaee150eb21e',
        Partners(frozenset('AB'), frozenset('C')),
        frozenset({'trastuzumab', 'herceptin', 'trastuzumab (intact igg1)'}),
        frozenset({'her2', 'erbb2', 'her2/erbb2', 'human her2 extracellular effective sites'}),
        'Antibody Fab fragment and soluble HER2 extracellular domain; not intact-antibody tissue geometry.',
        ('Fab light/heavy-chain contacts', 'waters', 'glycans', 'hydrogens')),
    Asset('1IEP', '577386b4b8bc58a570facba0c8a843386842caef5ed7b60106c685d0f68d4218',
        Partners(frozenset('AB'), frozenset('AB'), ligand_code='STI', same_copy_only=True),
        frozenset({'imatinib', 'chembl941'}), frozenset({'abl', 'abl1', 'abl kinase'}),
        'Two crystallographic copies, A and B, of the mouse c-Abl kinase domain with imatinib (STI); '
        'not human BCR-ABL cellular kinetics or intracellular exposure.',
        ('contacts between crystal copies A and B', 'waters', 'hydrogens')),
)}


def resolve(drug: str, target: str) -> str | None:
    """Map a drug/target pair to a verified structure, or None. Both names must match."""
    name, site = drug.strip().casefold(), target.strip().casefold()
    return next((asset.pdb_id for asset in ASSETS.values() if name in asset.drug_names and site in asset.target_names), None)


class Unavailable(Exception):
    def __init__(self, reason, detail):
        super().__init__(detail)
        self.reason, self.detail = reason, detail


def _header(text: str) -> dict:
    """Deposition facts read from the coordinate file's own header records."""
    records = {}
    for line in text.splitlines():
        if line.startswith(('ATOM  ', 'HETATM')):
            break
        records.setdefault(line[:6].strip(), []).append(line[10:80].rstrip())
    def molecules(name):
        items, current = [], None
        for token in ' '.join(part.strip() for part in records.get(name, [])).split(';'):
            key, _, value = token.strip().partition(':')
            if key == 'MOL_ID':
                current = {}
                items.append(current)
            elif current is not None and value:
                current[key.strip()] = value.strip()
        return items
    resolution = next((float(match[1]) for line in text.splitlines()[:400]
        if (match := re.match(r'^REMARK   2 RESOLUTION\.\s+([0-9.]+) ANGSTROMS', line))), None)
    head = text.splitlines()[0] if text else ''
    return {'title': ' '.join(' '.join(part.split()) for part in records.get('TITLE', [])) or None,
        'method': ' '.join(records.get('EXPDTA', [])).strip() or None, 'resolution': resolution,
        'date': head[50:59].strip() or None, 'compounds': molecules('COMPND'), 'sources': molecules('SOURCE')}


class StructureService:
    """Read-only. Parsed models are immutable and cached per verified asset."""
    def __init__(self, root: Path = ASSET_ROOT):
        self.root = root
        self._load = lru_cache(maxsize=4)(self._read)

    def _read(self, pdb_id: str) -> tuple[Asset, Model, dict]:
        asset = ASSETS.get(pdb_id.upper())
        if asset is None:
            raise Unavailable('unknown_structure', 'No verified cached structure exists for this identifier. Nothing is inferred for it.')
        try:
            data = (self.root / f'{asset.pdb_id}.pdb').read_bytes()
        except OSError as exc:
            raise Unavailable('asset_unavailable', 'The verified coordinate file is not available on this server.') from exc
        if sha256(data).hexdigest() != asset.sha256:
            raise Unavailable('asset_integrity_failed', 'The coordinate file does not match its pinned SHA-256; no measurement is reported.')
        text = data.decode('ascii', errors='replace')
        try:
            return asset, parse(text), _header(text)
        except ValueError as exc:
            raise Unavailable('asset_unparseable', str(exc)) from exc

    def _open(self, pdb_id: str):
        try:
            return self._load(pdb_id.upper())
        except Unavailable:
            self._load.cache_clear()  # never cache a failure: a repaired asset must be re-verified
            raise

    @staticmethod
    def _provenance(asset: Asset) -> StructureProvenance:
        return StructureProvenance(pdb_id=asset.pdb_id, coordinate_sha256=asset.sha256,
            source_url=f'https://www.rcsb.org/structure/{asset.pdb_id}', cutoff_rule=CUTOFF_RULE, scope=asset.scope)

    @staticmethod
    def _measurement(asset: Asset, model: Model, first, second, distance) -> ContactMeasurement:
        drug, target = (first, second) if asset.partners.role(first) == 'drug' else (second, first)
        def residue(atom, role):
            return ResidueIdentity(chain=atom.chain, residue_number=atom.resi, insertion_code=atom.icode, residue_name=atom.resn,
                role=role, resolved_heavy_atoms=sum(item.residue == atom.residue for item in model.atoms))
        def identity(atom):
            return AtomIdentity(serial=atom.serial, name=atom.name, element=atom.element)
        return ContactMeasurement(drug_residue=residue(drug, 'drug'), drug_atom=identity(drug), target_residue=residue(target, 'target'),
            target_atom=identity(target), distance_angstrom=distance, within_cutoff=distance <= CUTOFF)

    def metadata(self, pdb_id: str) -> StructureMetadata:
        try:
            asset, model, header = self._open(pdb_id)
        except Unavailable as exc:
            return StructureMetadata(status='unavailable', reason=exc.reason, detail=exc.detail)
        partners, entities = asset.partners, []
        def describe(chains):
            index = next((i for i, item in enumerate(header['compounds'])
                if set(chains) & {c.strip() for c in item.get('CHAIN', '').split(',')}), None)
            compound = header['compounds'][index] if index is not None else {}
            source = header['sources'][index] if index is not None and index < len(header['sources']) else {}
            return compound, source
        if partners.ligand_code is None:
            for chain in sorted(partners.drug_chains):
                compound, source = describe([chain])
                entities.append(StructureEntity(role='drug', kind='protein', chains=[chain], molecule=compound.get('MOLECULE', 'Unlabelled chain'),
                    fragment=compound.get('FRAGMENT'), organism_scientific=source.get('ORGANISM_SCIENTIFIC'),
                    resolved_heavy_atoms=sum(a.protein and a.chain == chain for a in model.atoms)))
        else:
            chains = sorted(partners.target_chains)
            entities.append(StructureEntity(role='drug', kind='ligand', chains=chains, molecule=f'Ligand {partners.ligand_code}',
                ligand_code=partners.ligand_code, resolved_heavy_atoms=sum(partners.role(a) == 'drug' for a in model.atoms)))
        chains = sorted(partners.target_chains)
        compound, source = describe(chains)
        entities.append(StructureEntity(role='target', kind='protein', chains=chains, molecule=compound.get('MOLECULE', 'Unlabelled chain'),
            fragment=compound.get('FRAGMENT'), organism_scientific=source.get('ORGANISM_SCIENTIFIC'),
            resolved_heavy_atoms=sum(partners.role(a) == 'target' for a in model.atoms)))
        return StructureMetadata(status='available', provenance=self._provenance(asset), title=header['title'],
            experimental_method=header['method'], resolution_angstrom=header['resolution'], deposition_date=header['date'],
            entities=entities, same_crystal_copy_only=partners.same_copy_only, reported_unresolved_residues=len(model.unresolved),
            alternate_conformers='none_present', excluded_from_contacts=list(asset.excluded))

    def interface(self, pdb_id: str, limit: int = 20) -> InterfaceContacts:
        if not 1 <= limit <= 100:
            raise ValueError('Request between 1 and 100 interface residue pairs')
        try:
            asset, model, _ = self._open(pdb_id)
        except Unavailable as exc:
            return InterfaceContacts(status='unavailable', reason=exc.reason, detail=exc.detail)
        pairs = interface_contacts(model, asset.partners, CUTOFF)
        return InterfaceContacts(status='available', provenance=self._provenance(asset), cutoff_angstrom=CUTOFF,
            residue_pair_count=len(pairs), truncated=len(pairs) > limit,
            contacts=[self._measurement(asset, model, a, b, distance) for a, b, distance in pairs[:limit]])

    def distance(self, pdb_id: str, selected: ResidueSelector, counterpart: ResidueSelector | None = None, limit: int = 5) -> ResidueDistance:
        if not 1 <= limit <= 20:
            raise ValueError('Request between 1 and 20 nearest counterpart residues')
        try:
            asset, model, _ = self._open(pdb_id)
        except Unavailable as exc:
            return ResidueDistance(status='unavailable', reason=exc.reason, detail=exc.detail, selected=selected, counterpart=counterpart)
        common = dict(provenance=self._provenance(asset), selected=selected, counterpart=counterpart, cutoff_angstrom=CUTOFF)
        def unavailable(reason, detail):
            return ResidueDistance(status='unavailable', reason=reason, detail=detail, **common)
        def locate(selector):
            """Resolved binding-partner residues at these author identifiers; several only if residue names differ."""
            key = (selector.chain, selector.residue_number, selector.insertion_code.upper())
            found = {atom.residue: asset.partners.role(atom) for atom in model.atoms if atom.residue[:3] == key}
            return key, {residue: role for residue, role in found.items() if role}, bool(found)
        def missing(selector, key, present):
            label = f'{selector.chain}:{selector.residue_number}{selector.insertion_code}'
            if present:
                return unavailable('not_a_binding_partner', f'{label} has coordinates but is not part of the drug or target (for example a water, glycan or other ligand).')
            if any(entry[:3] == key for entry in model.unresolved):
                return unavailable('residue_reported_unresolved', f'{label} is reported unresolved by the depositors (REMARK 465); it has no coordinates to measure.')
            return unavailable('residue_absent_cause_unknown', f'{label} has no resolved coordinates in this structure. The reason is not recorded.')
        key, residues, present = locate(selected)
        if not residues:
            return missing(selected, key, present)
        if counterpart is None:
            found = [item for residue in residues for item in residue_contacts(model, asset.partners, residue)]
            found.sort(key=lambda item: item[2])
            return ResidueDistance(status='measured', **common,
                measurements=[self._measurement(asset, model, a, b, distance) for a, b, distance in found[:limit]])
        other_key, others, other_present = locate(counterpart)
        if not others:
            return missing(counterpart, other_key, other_present)
        if set(residues.values()) == set(others.values()):
            return unavailable('same_binding_partner', 'Both residues belong to the same binding partner. Only drug–target distances are measured.')
        if asset.partners.same_copy_only and selected.chain != counterpart.chain:
            return unavailable('different_crystal_copy', 'These residues are in different crystallographic copies; contacts across copies are not measured.')
        found = [item for residue in residues for item in residue_contacts(model, asset.partners, residue) if item[1].residue in others]
        found.sort(key=lambda item: item[2])
        return ResidueDistance(status='measured', **common,
            measurements=[self._measurement(asset, model, a, b, distance) for a, b, distance in found[:1]])
