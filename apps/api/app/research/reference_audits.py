"""Read-only scientific reference audits, separate from runnable profile eligibility."""
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
from typing import Annotated, Literal
from pydantic import Field, HttpUrl, model_validator
from app.schemas.contracts import Contract, Identifier
from app.research.registry import DATA_ROOT

ROOT=DATA_ROOT.parent


class AuditSource(Contract):
    source_id: Identifier
    url: HttpUrl
    label: str
    identifiers: dict[str,str] = Field(default_factory=dict)
    reviewed_on: date
    content_sha256: Annotated[str,Field(pattern=r'^[a-f0-9]{64}$')] | None = None
    access_note: str


class AuditFact(Contract):
    fact_id: Identifier
    parameter: str
    value: Annotated[float,Field(gt=0,strict=True)]
    unit: str
    provenance: Literal['reported','calculated']
    review_status: Literal['candidate'] = 'candidate'
    source_id: Identifier | None = None
    locator: str
    parent_ids: list[Identifier] = Field(default_factory=list)
    formula: str | None = None
    context: str
    decision: Literal['context_only','assay_only','not_selected','step_specific','identity_only']


class AuditedStructure(Contract):
    pdb_id: Annotated[str,Field(pattern=r'^[0-9A-Z]{4}$')]
    source_url: HttpUrl
    asset_path: str
    sha256: Annotated[str,Field(pattern=r'^[a-f0-9]{64}$')]
    method: str
    resolution_angstrom: Annotated[float,Field(gt=0)]
    target_species: str
    target_taxonomy_id: int
    target_uniprot_id: str
    protein_chains: list[str]
    ligand_comp_id: str
    ligand_formula: str
    ligand_formula_weight_g_mol: Annotated[float,Field(gt=0)]
    ligand_instances: dict[str,int]
    scope: str


class ReferenceAudit(Contract):
    audit_id: Identifier
    version: Annotated[str,Field(pattern=r'^\d+\.\d+\.\d+$')]
    reviewed_on: date
    reviewer: str
    drug: str
    aliases: list[str]
    target: str
    identifiers: dict[str,str]
    status: Literal['evidence_block']
    runnable: Literal[False] = False
    scientific_profile_enabled: Literal[False] = False
    explicit_hypothetical_preparation_available: Literal[True] = True
    sources: list[AuditSource]
    facts: list[AuditFact]
    blockers: Annotated[list[str],Field(min_length=1)]
    missing_inputs: Annotated[list[str],Field(min_length=1)]
    structure: AuditedStructure
    follow_up_candidate: str
    follow_up_sources: list[HttpUrl]
    follow_up_scope: str

    @model_validator(mode='after')
    def references(self):
        source_ids={source.source_id for source in self.sources}
        facts={fact.fact_id:fact for fact in self.facts}
        if len(source_ids)!=len(self.sources) or len(facts)!=len(self.facts):
            raise ValueError('Audit identifiers must be unique')
        for fact in self.facts:
            if fact.provenance=='reported' and fact.source_id not in source_ids:
                raise ValueError('Reported audit facts require a known inspected source')
            if fact.provenance=='calculated' and (not fact.parent_ids or not fact.formula):
                raise ValueError('Calculated audit facts require fixed documented derivations')
            if not set(fact.parent_ids)<=facts.keys():
                raise ValueError('Unknown audit derivation parent')
        def visit(key,parents):
            if key in parents:raise ValueError('Audit derivations must be acyclic')
            for parent in facts[key].parent_ids:visit(parent,parents|{key})
        for key in facts:visit(key,set())
        return self


def load_reference_audit(drug: str, directory: Path | None = None, *, verify_asset: bool = True) -> ReferenceAudit:
    """Audit presence is not a drug allowlist and never grants simulation eligibility."""
    folder=directory or DATA_ROOT/'drugs/audits'
    for path in sorted(folder.glob('*.json')):
        audit=ReferenceAudit.model_validate_json(path.read_text())
        if drug.strip().casefold() not in {name.casefold() for name in [audit.drug,audit.audit_id,*audit.aliases]}:
            continue
        if verify_asset:
            asset=audit.structure.asset_path
            if asset!=f'/structures/{audit.structure.pdb_id}.pdb':
                raise ValueError('Audit structure asset must use its verified PDB identifier')
            data=(ROOT/'apps/web/public'/asset.lstrip('/')).read_bytes()
            metadata=json.loads((DATA_ROOT/'structures'/f'{audit.structure.pdb_id}.metadata.json').read_text())
            try:
                verify_structure(audit.structure,data,metadata)
            except (KeyError, TypeError) as exc:
                raise ValueError("Incomplete audited structure metadata") from exc
        return audit
    raise KeyError('No reference audit for this name; arbitrary-drug preparation remains available')


def verify_structure(structure: AuditedStructure, data: bytes, metadata: dict) -> None:
    """Validate deposited identities/counts; this does not infer affinity or dynamics."""
    from collections import Counter
    from math import isclose, isfinite
    digest=sha256(data).hexdigest()
    if digest!=structure.sha256 or digest!=metadata['coordinate_sha256']:
        raise ValueError('Audited coordinate checksum mismatch')
    if metadata['entry_id']!=structure.pdb_id or metadata['source_taxonomy_id']!=structure.target_taxonomy_id or structure.target_uniprot_id not in metadata['uniprot_ids']:
        raise ValueError('Structure target identity/species mismatch')
    if metadata['ligand']['id']!=structure.ligand_comp_id or metadata['ligand']['formula']!=structure.ligand_formula or not isclose(metadata['ligand']['formula_weight'],structure.ligand_formula_weight_g_mol,rel_tol=1e-8):
        raise ValueError('Structure ligand identity mismatch')
    if structure.resolution_angstrom not in metadata['resolution']:
        raise ValueError('Structure resolution mismatch')
    chains=set()
    ligands=Counter()
    for line in data.decode('ascii').splitlines():
        if line.startswith(('ATOM  ','HETATM')):
            if not all(isfinite(float(line[start:start+8])) for start in (30,38,46)):
                raise ValueError('Nonfinite experimental coordinates')
        if line.startswith('ATOM  '):chains.add(line[21])
        if line.startswith('HETATM') and line[17:20].strip()==structure.ligand_comp_id:
            ligands[f'{line[21]}:{line[22:27].strip()}']+=1
    if chains!=set(structure.protein_chains) or chains!=set(metadata['auth_chains']) or dict(ligands)!=structure.ligand_instances:
        raise ValueError('Structure chain/ligand instances mismatch')
