"""Bounded source snapshots and candidate-only extraction contracts."""
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract, Identifier
from app.schemas.experiment_preparation import Digest, PreparationParameter, PreparationSource, Text
from app.research.europe_pmc import LiteratureSearch


class EvidenceSegment(Contract):
    locator: Identifier
    text: Annotated[str, Field(min_length=1, max_length=2000)]


class EvidenceSnapshot(Contract):
    document_id: Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]
    source: PreparationSource
    segments: Annotated[list[EvidenceSegment], Field(min_length=1, max_length=32)]
    warnings: list[str] = Field(default_factory=list)


class EvidenceSearchResult(Contract):
    status: Literal["live", "unavailable"]
    search: LiteratureSearch | None = None
    source_handles: dict[str, str] = Field(default_factory=dict)
    reasons: list[str] = Field(default_factory=list)


class SourceRetrievalResult(Contract):
    status: Literal["retrieved", "unavailable", "rejected"]
    document: EvidenceSnapshot | None = None
    next_start_block: Annotated[int, Field(ge=0)] | None = None
    reasons: list[str] = Field(default_factory=list)


class ParameterProposal(Contract):
    """LLM output has no authority to declare review, applicability or model readiness."""
    parameter: Identifier
    value: Annotated[float, Field(strict=True)]
    unit: Identifier
    locator: Identifier
    supporting_passage: Annotated[str, Field(min_length=1, max_length=600)]
    relation: Literal["exact", "approximate", "bound_or_range", "uncertain"]
    molecular_form: Identifier | None = None
    species: Identifier | None = None
    formulation: Text | None = None
    route: Identifier | None = None
    exposure_compartment: Text | None = None
    drug_name_in_source: Text | None = None
    target_in_source: Text | None = None
    experimental_system: Text | None = None
    assay_conditions: Text | None = None


class ExtractionProposalBatch(Contract):
    parameters: Annotated[list[ParameterProposal], Field(max_length=20)]
    notes: Annotated[list[Text], Field(max_length=20)]


class CandidateConflict(Contract):
    parameter: Identifier
    parameter_ids: list[Identifier]
    reason: str


class ParameterExtractionResult(Contract):
    status: Literal["candidates", "no_values", "unavailable", "rejected"]
    document_id: str
    snapshot_sha256: Digest | None = None
    parameters: list[PreparationParameter] = Field(default_factory=list)
    conflicts: list[CandidateConflict] = Field(default_factory=list)
    missing_parameters: list[str] = Field(default_factory=list)
    rejected_candidates: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    runnable: Literal[False] = False


EVIDENCE_EXTRACTION_CONTRACTS = [EvidenceSearchResult, SourceRetrievalResult, ParameterExtractionResult]
