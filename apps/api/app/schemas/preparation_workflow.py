"""Typed requests for server-owned preparation; callers cannot submit readiness checks."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import Field, StringConstraints, model_validator
from app.schemas.drug_support import DrugAssessmentResponse
from app.schemas.contracts import Contract, DoseEvent, ExperimentConfig, Identifier, Positive, Fraction
from app.schemas.experiment_preparation import Digest, PreparationParameter, PreparationRequest, ResearchPreparation, Text


class PreparationScope(Contract):
    molecular_form: Identifier
    species: Identifier
    target_compartment: Literal['extracellular', 'intracellular', 'other']
    binding_regime: Literal['reversible_1_to_1', 'irreversible', 'cooperative', 'unknown']
    pk_regime: Literal['linear_effective', 'other', 'unknown']
    competition: Literal['absent_assumed', 'effective_assay_rates', 'requires_explicit_model', 'unknown']
    rationale: Text


class PreparationDesign(Contract):
    duration_h: Positive
    administration: Annotated[list[DoseEvent], Field(min_length=1, max_length=64)]
    initial_amount_nmol: Annotated[float, Field(ge=0, strict=True)] = 0
    initial_occupancy: Fraction = 0
    occupancy_threshold: Annotated[float, Field(gt=0, lt=1)] = 0.9
    rationale: Text


class CreatePreparation(Contract):
    request: PreparationRequest


class PreparationUpdate(Contract):
    base_revision: Annotated[int, Field(ge=0)]
    base_evidence_sha256: Digest
    document_ids: Annotated[list[str], Field(max_length=20)] = Field(default_factory=list)
    parameters: Annotated[list[PreparationParameter], Field(max_length=100)] = Field(default_factory=list)
    selected_parameters: dict[str, Identifier | None] = Field(default_factory=dict)
    scope: PreparationScope | None = None
    design: PreparationDesign | None = None
    # Only outstanding identity/target/route questions accept textual answers.
    # Numerical answers must carry typed values/units and explicit assumption provenance.
    declare_hypothetical_identity: Literal[True] | None = None
    identity_rationale: Text | None = None
    answers: dict[str, Text] = Field(default_factory=dict)

    @model_validator(mode='after')
    def nonempty(self):
        if not (self.parameters or self.selected_parameters or self.scope or self.design or self.answers or self.document_ids or self.declare_hypothetical_identity):
            raise ValueError('Preparation update must supply evidence, design, scope or clarification')
        if self.declare_hypothetical_identity and not self.identity_rationale:
            raise ValueError('Hypothetical identity requires an explicit researcher rationale')
        return self


class PreparationRecord(Contract):
    preparation: ResearchPreparation
    created_at: datetime
    updated_at: datetime
    identity_rationale: Text | None = None
    scope: PreparationScope | None = None
    design: PreparationDesign | None = None
    document_ids: list[str] = Field(default_factory=list)
    identity_assessment: DrugAssessmentResponse | None = None
    identity_status: str
    identity_retrieval_status: str
    identity_aliases: list[str] = Field(default_factory=list)
    identity_molecular_form: str | None = None
    # Normalized/derived selections are generated from these immutable inputs.
    input_parameters: list[PreparationParameter] = Field(default_factory=list)
    input_selections: dict[str, Identifier | None] = Field(default_factory=dict)


class PreparationVersion(Contract):
    base_revision: Annotated[int, Field(ge=0)]
    base_evidence_sha256: Digest


class ConfiguredPreparation(Contract):
    original_hypothesis: Annotated[str, StringConstraints(strip_whitespace=False), Field(min_length=1, max_length=12000)]
    preparation_id: Identifier
    preparation_revision: Annotated[int, Field(ge=0)]
    evidence_sha256: Digest
    configuration_sha256: Digest
    experiment: ExperimentConfig
    classification: Literal['conditional_research_derived', 'conditional_researcher_specified'] = 'conditional_research_derived'
    hypothesis_parsed: Literal[False] = False


WORKFLOW_CONTRACTS = [CreatePreparation, PreparationUpdate, PreparationRecord, PreparationVersion, ConfiguredPreparation]
