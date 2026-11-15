"""Coordinate measurements on verified deposited structures. Geometry only: no energies, affinities or rates."""
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract
from app.schemas.experiment_preparation import Digest

PdbID = Annotated[str, Field(pattern=r'^[0-9][A-Za-z0-9]{3}$')]
Chain = Annotated[str, Field(pattern=r'^[A-Za-z0-9]$')]
UnavailableReason = Literal['unknown_structure', 'asset_unavailable', 'asset_integrity_failed', 'asset_unparseable',
    'residue_reported_unresolved', 'residue_absent_cause_unknown', 'not_a_binding_partner', 'same_binding_partner',
    'different_crystal_copy']
SCOPE_LIMIT = ('Heavy-atom distances in deposited coordinates. They do not establish hydrogen bonds, binding energy, '
    'affinity, kinetic rates, mutation effects or clinical outcomes.')


class ResidueSelector(Contract):
    """Author identifiers exactly as deposited; never renumbered."""
    chain: Chain
    residue_number: Annotated[int, Field(ge=-9999, le=99999)]
    insertion_code: Annotated[str, Field(pattern=r'^[A-Za-z]?$')] = ''


class ResidueIdentity(ResidueSelector):
    residue_name: Annotated[str, Field(min_length=1, max_length=3)]
    role: Literal['drug', 'target']
    resolved_heavy_atoms: Annotated[int, Field(ge=1)]


class AtomIdentity(Contract):
    serial: int
    name: Annotated[str, Field(min_length=1, max_length=4)]
    element: Annotated[str, Field(min_length=1, max_length=2)]


class ContactMeasurement(Contract):
    drug_residue: ResidueIdentity
    drug_atom: AtomIdentity
    target_residue: ResidueIdentity
    target_atom: AtomIdentity
    distance_angstrom: Annotated[float, Field(ge=0)]
    within_cutoff: bool


class StructureEntity(Contract):
    role: Literal['drug', 'target']
    kind: Literal['protein', 'ligand']
    chains: list[Chain]
    molecule: str
    fragment: str | None = None
    organism_scientific: str | None = None
    ligand_code: str | None = None
    resolved_heavy_atoms: Annotated[int, Field(ge=0)]


class StructureProvenance(Contract):
    pdb_id: PdbID
    coordinate_sha256: Digest
    source_url: str
    cutoff_rule: str
    scope: str
    limitation: str = SCOPE_LIMIT


class StructureMetadata(Contract):
    status: Literal['available', 'unavailable']
    reason: UnavailableReason | None = None
    detail: str | None = None
    provenance: StructureProvenance | None = None
    title: str | None = None
    experimental_method: str | None = None
    resolution_angstrom: float | None = None
    deposition_date: str | None = None
    entities: list[StructureEntity] = Field(default_factory=list)
    same_crystal_copy_only: bool | None = None
    reported_unresolved_residues: Annotated[int, Field(ge=0)] | None = None
    alternate_conformers: Literal['none_present'] | None = None
    excluded_from_contacts: list[str] = Field(default_factory=list)


class InterfaceContacts(Contract):
    status: Literal['available', 'unavailable']
    reason: UnavailableReason | None = None
    detail: str | None = None
    provenance: StructureProvenance | None = None
    cutoff_angstrom: float | None = None
    residue_pair_count: Annotated[int, Field(ge=0)] | None = None
    truncated: bool = False
    contacts: Annotated[list[ContactMeasurement], Field(max_length=100)] = Field(default_factory=list)


class ResidueDistance(Contract):
    """One selected residue against a named counterpart, or its nearest binding-partner residues."""
    status: Literal['measured', 'unavailable']
    reason: UnavailableReason | None = None
    detail: str | None = None
    provenance: StructureProvenance | None = None
    selected: ResidueSelector | None = None
    counterpart: ResidueSelector | None = None
    cutoff_angstrom: float | None = None
    measurements: Annotated[list[ContactMeasurement], Field(max_length=20)] = Field(default_factory=list)


STRUCTURE_CONTRACTS = [StructureMetadata, InterfaceContacts, ResidueDistance]
