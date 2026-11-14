"""Identity and scientific eligibility contracts; assessment never contains a runnable experiment."""
from datetime import date, datetime
from typing import Annotated, Literal
import unicodedata
from pydantic import Field, HttpUrl, StringConstraints, field_validator, model_validator
from app.schemas.contracts import Contract, Identifier, SupportAssessment

class DrugAssessmentRequest(Contract):
    drug_name: Annotated[str, Field(min_length=1, max_length=200)]
    target: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    molecular_form: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    route: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    endpoint: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    original_hypothesis: Annotated[str, StringConstraints(strip_whitespace=False), Field(min_length=1, max_length=12000)] | None = None

    @field_validator("drug_name")
    @classmethod
    def bounded_normalized_name(cls, value):
        if len(unicodedata.normalize("NFKC", value)) > 200:
            raise ValueError("Normalized drug name exceeds the lookup limit")
        return value

class DrugIdentity(Contract):
    canonical_name: str
    identifiers: dict[str, str]
    aliases: list[str]
    molecular_form: str | None = None
    molecule_type: str | None = None
    parent_identifier: str | None = None
    provenance: Literal["reviewed_registry", "database_candidate"]
    source_url: HttpUrl
    retrieved_at: datetime | None = None
    identity_checked_on: date | None = None
    form_scope: str

class ModelCapability(Contract):
    model_id: Identifier
    supported_routes: list[str]
    supported_endpoints: list[str]
    adjustable_fields: list[str]
    maximum_duration_h: float
    maximum_events_per_scenario: int
    limitations: list[str]

class DrugAssessmentResponse(Contract):
    request: DrugAssessmentRequest
    identity_status: Literal["reviewed_identity", "candidate_identity", "ambiguous", "not_found", "unavailable"]
    retrieval_status: Literal["reviewed_registry", "live", "cached_degraded", "unavailable"]
    resolved_identity: DrugIdentity | None = None
    candidates: Annotated[list[DrugIdentity], Field(max_length=5)] = Field(default_factory=list)
    profile_id: Identifier | None = None
    profile_version: str | None = None
    resolved_target: str | None = None
    target_identifiers: dict[str, str] = Field(default_factory=dict)
    model_eligible: bool = False
    support: SupportAssessment
    capabilities: list[ModelCapability] = Field(default_factory=list)
    defaults_applied: dict[str, str] = Field(default_factory=dict)
    ambiguities: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    assessed_scope: Literal["structured_identity_target_form_route_endpoint"] = "structured_identity_target_form_route_endpoint"
    hypothesis_parsed: Literal[False] = False
    configuration_required: Literal[True] = True
    runnable: Literal[False] = False

    @model_validator(mode="after")
    def scientific_approval(self):
        if self.identity_status == "reviewed_identity" and (not self.resolved_identity or
            self.resolved_identity.provenance != "reviewed_registry" or
            self.resolved_identity.identifiers.get("profile_id") != self.profile_id or not self.profile_version):
            raise ValueError("Reviewed identity must be linked to its registered profile and version")
        if self.model_eligible and (self.identity_status != "reviewed_identity" or not self.profile_id or not self.profile_version or
                                    not self.capabilities or self.support.status not in ("supported", "conditional")):
            raise ValueError("Model eligibility requires a reviewed identity, profile, capabilities and applicable scope")
        if self.identity_status == "candidate_identity" and (self.model_eligible or self.profile_id or self.profile_version or self.capabilities or
            not self.resolved_identity or self.resolved_identity.provenance != "database_candidate"):
            raise ValueError("Database candidates cannot acquire reviewed model capabilities")
        if self.identity_status in ("ambiguous", "not_found", "unavailable") and self.resolved_identity is not None:
            raise ValueError("Unresolved assessments cannot contain a resolved identity")
        return self
