"""Coordinate measurements on verified deposited structures. Geometry only: no energies, affinities or rates."""
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

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


class StructureMeasurement(Contract):
    """One coordinate measurement the agent obtained in a turn; the ID is how an answer cites it."""
    measurement_id: Annotated[str, Field(pattern=r'^M[0-9]{1,2}$')]
    kind: Literal['interface_contact', 'residue_distance']
    contact: ContactMeasurement


class StructureInspection(Contract):
    """What the agent's structure tools returned in one research turn."""
    status: Literal['available', 'unavailable']
    reason: UnavailableReason | None = None
    detail: str | None = None
    metadata: StructureMetadata | None = None
    interface_residue_pair_count: Annotated[int, Field(ge=0)] | None = None
    measurements: Annotated[list[StructureMeasurement], Field(max_length=12)] = Field(default_factory=list)
    not_measured: Annotated[list[Annotated[str, Field(max_length=400)]], Field(max_length=6)] = Field(default_factory=list)

    @model_validator(mode='after')
    def consistent(self) -> Self:
        available = self.status == 'available'
        if available != (self.metadata is not None and self.metadata.status == 'available'):
            raise ValueError('An available inspection requires verified structure metadata')
        if not available and (self.measurements or self.reason is None):
            raise ValueError('An unavailable inspection has a reason and no measurements')
        ids = [item.measurement_id for item in self.measurements]
        if len(set(ids)) != len(ids):
            raise ValueError('Measurement identifiers must be unique')
        return self


STRUCTURE_CONTRACTS = [StructureMetadata, InterfaceContacts, ResidueDistance, StructureInspection]
