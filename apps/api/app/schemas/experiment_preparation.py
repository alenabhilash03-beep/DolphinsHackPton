"""Future agent/tool preparation records. These contracts grant no solver authorization."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, HttpUrl, StringConstraints, field_validator, model_validator

from app.schemas.contracts import Contract, Identifier

Text = Annotated[str, Field(min_length=1, max_length=12000)]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
PreparationState = Literal[
    "identity_clarification", "researching", "needs_inputs", "unsupported",
    "source_unavailable", "failed_validation", "ready_for_configuration",
]


class PreparationRequest(Contract):
    drug_name: Annotated[str, Field(min_length=1, max_length=200)]
    original_hypothesis: Annotated[str, StringConstraints(strip_whitespace=False), Field(min_length=1, max_length=12000)]
    target: Identifier | None = None
    molecular_form: Identifier | None = None
    route: Identifier | None = None
    endpoint: Identifier = "target_occupancy"

    @field_validator("original_hypothesis")
    @classmethod
    def nonblank_hypothesis(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Hypothesis must not be blank")
        return value


class EvidenceContext(Contract):
    """None means unknown, never an inferred biological match."""
    drug_identifier: Identifier
    target_identifier: Identifier | None = None
    molecular_form: Identifier | None = None
    species: Identifier | None = None
    experimental_system: Text | None = None
    formulation: Text | None = None
    route: Identifier | None = None
    assay_conditions: Text | None = None
    exposure_compartment: Text | None = None
    applicability_notes: Annotated[list[Text], Field(min_length=1)]


class PreparationSource(Contract):
    source_id: Identifier
    url: HttpUrl
    title: Text
    retrieved_at: datetime
    retrieval_status: Literal["live", "cached", "unavailable"]
    content_kind: Literal["full_text", "abstract", "database_record", "product_label"]
    snapshot_sha256: Digest | None = None
    identifiers: dict[str, str] = Field(default_factory=dict)

    @field_validator("retrieved_at")
    @classmethod
    def aware_time(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("Retrieval time must include a timezone")
        return value


class SourcePassage(Contract):
    source_id: Identifier
    locator: Text
    supporting_passage: Text


class PreparationParameter(Contract):
    parameter_id: Identifier
    parameter: Identifier
    value: Annotated[float, Field(strict=True)]
    unit: Identifier
    original_value: Annotated[float, Field(strict=True)]
    original_unit: Identifier
    normalization: Text
    provenance: Literal["reported", "calculated", "researcher_assumed"]
    passages: list[SourcePassage] = Field(default_factory=list)
    parent_ids: list[Identifier] = Field(default_factory=list)
    formula: Text | None = None
    rationale: Text | None = None
    entered_at: datetime | None = None
    context: EvidenceContext
    applicability: Literal["candidate", "compatible", "conditional", "incompatible"] = "candidate"

    @model_validator(mode="after")
    def provenance_requirements(self):
        if self.provenance == "reported" and not self.passages:
            raise ValueError("Reported values require accessible source passages")
        if self.provenance == "calculated" and (not self.parent_ids or not self.formula):
            raise ValueError("Calculated values require input IDs and a formula")
        if self.provenance != "calculated" and (self.parent_ids or self.formula):
            raise ValueError("Only calculations carry derivation inputs and formula")
        if self.provenance == "researcher_assumed" and (not self.rationale or not self.entered_at):
            raise ValueError("Researcher assumptions require rationale and entry time")
        if self.entered_at and self.entered_at.utcoffset() is None:
            raise ValueError("Entry time must include a timezone")
        return self


class MissingPreparationInput(Contract):
    input_id: Identifier
    parameter: Identifier
    reason: Text
    expected_unit: Identifier | None = None
    question: Text
    permitted_resolution: Literal["clarify_identity", "retrieve_evidence", "provide_value_or_assumption", "clarify_scope"]


class PreparationAnswers(Contract):
    preparation_id: Identifier
    base_revision: Annotated[int, Field(ge=0)]
    base_evidence_sha256: Digest
    # The service must bind each answer to its outstanding input and revalidate scope.
    answers: Annotated[dict[str, Text], Field(min_length=1)]
    parameters: list[PreparationParameter] = Field(default_factory=list)


class PreparationCheck(Contract):
    check: Literal["identity", "provenance", "units", "parameter_domains", "binding_consistency",
                   "pk_consistency", "assay_compatibility", "route", "exposure", "endpoint"]
    outcome: Literal["pass", "conditional", "fail", "not_checked"]
    reasons: Annotated[list[Text], Field(min_length=1)]


REQUIRED_CHECKS = {"identity", "provenance", "units", "parameter_domains", "binding_consistency",
                   "pk_consistency", "assay_compatibility", "route", "exposure", "endpoint"}


class ResearchPreparation(Contract):
    schema_version: Literal["1.0"] = "1.0"
    preparation_id: Identifier
    revision: Annotated[int, Field(ge=0)]
    parent_preparation_id: Identifier | None = None
    base_experiment_id: Identifier | None = None
    base_configuration_sha256: Digest | None = None
    request: PreparationRequest
    state: PreparationState
    path: Literal["reviewed_preset", "research_derived", "researcher_specified"]
    profile_id: Identifier | None = None
    profile_version: Identifier | None = None
    resolved_drug_identifier: Identifier | None = None
    resolved_target_identifier: Identifier | None = None
    model_id: Identifier | None = None
    sources: list[PreparationSource] = Field(default_factory=list)
    parameters: list[PreparationParameter] = Field(default_factory=list)
    selected_parameters: dict[str, Identifier] = Field(default_factory=dict)
    evidence_sha256: Digest
    checks: list[PreparationCheck] = Field(default_factory=list)
    missing_inputs: list[MissingPreparationInput] = Field(default_factory=list)
    assumptions: list[Text] = Field(default_factory=list)
    reasons: Annotated[list[Text], Field(min_length=1)]
    limitations: Annotated[list[Text], Field(min_length=1)]
    runnable: Literal[False] = False
    configuration_required: Literal[True] = True

    @model_validator(mode="after")
    def integrity(self):
        def index(items, attribute):
            result = {getattr(item, attribute): item for item in items}
            if len(result) != len(items):
                raise ValueError(f"Duplicate {attribute}")
            return result
        sources = index(self.sources, "source_id")
        parameters = index(self.parameters, "parameter_id")
        checks = index(self.checks, "check")
        index(self.missing_inputs, "input_id")
        if self.path == "reviewed_preset" and not (self.profile_id and self.profile_version):
            raise ValueError("Reviewed preset requires profile identity and version")
        if self.path != "reviewed_preset" and (self.profile_id or self.profile_version):
            raise ValueError("Research-derived records cannot claim reviewed profile status")
        if bool(self.base_experiment_id) != bool(self.base_configuration_sha256):
            raise ValueError("Base experiment identity and configuration hash must appear together")
        for item in self.parameters:
            for passage in item.passages:
                source = sources.get(passage.source_id)
                if source is None or source.retrieval_status == "unavailable":
                    raise ValueError("Parameter passage requires an available source record")
            if not set(item.parent_ids) <= parameters.keys():
                raise ValueError("Unknown derivation input")
        visited = set()
        def visit(key, ancestors):
            if key in ancestors:
                raise ValueError("Cyclic parameter derivation")
            if key in visited:
                return
            for parent in parameters[key].parent_ids:
                visit(parent, ancestors | {key})
            visited.add(key)
        for key in parameters:
            visit(key, set())
        for field, key in self.selected_parameters.items():
            if key not in parameters or parameters[key].parameter != field:
                raise ValueError("Selection must reference evidence for that parameter")
        if self.state == "needs_inputs" and not self.missing_inputs:
            raise ValueError("Needs-inputs state must specify actionable missing inputs")
        if self.state == "ready_for_configuration":
            from app.simulation.capabilities import get_preparation_requirements
            requirements = get_preparation_requirements(self.model_id)
            if not self.resolved_drug_identifier or not self.resolved_target_identifier or self.missing_inputs:
                raise ValueError("Ready preparation requires resolved identities and no missing inputs")
            if not self.request.route or self.request.route not in requirements.routes or self.request.endpoint not in requirements.endpoints:
                raise ValueError("Ready preparation requires an explicit supported route and endpoint")
            if set(checks) != REQUIRED_CHECKS or any(c.outcome not in {"pass", "conditional"} for c in self.checks):
                raise ValueError("Ready preparation requires every applicability check")
            if not set(requirements.required_parameters) <= self.selected_parameters.keys():
                raise ValueError("Ready preparation lacks mandatory parameter evidence")
            # Validate every selected derivation ancestor, not just the displayed result.
            def usable(key, seen):
                if key in seen:
                    return
                seen.add(key)
                item = parameters[key]
                if item.applicability not in {"compatible", "conditional"}:
                    raise ValueError("Selected evidence and its parents must be applicable")
                if item.context.drug_identifier != self.resolved_drug_identifier:
                    raise ValueError("Selected evidence must match the resolved drug identity")
                if item.context.target_identifier not in {None, self.resolved_target_identifier}:
                    raise ValueError("Selected evidence target conflicts with the resolved target")
                for parent in item.parent_ids:
                    usable(parent, seen)
            seen = set()
            for field, key in self.selected_parameters.items():
                usable(key, seen)
                item = parameters[key]
                required_unit = requirements.required_parameters.get(field)
                if required_unit and item.unit != required_unit:
                    raise ValueError("Ready parameter has a noncanonical unit")
            if not self.assumptions:
                raise ValueError("Conditional preparation must state its model/exposure assumptions")
        return self


# This is a service contract helper, not persistence or an HTTP workflow implementation.
_TRANSITIONS = {
    "identity_clarification": {"researching", "source_unavailable", "unsupported"},
    "researching": {"identity_clarification", "needs_inputs", "unsupported", "source_unavailable", "failed_validation", "ready_for_configuration"},
    "needs_inputs": {"identity_clarification", "researching", "failed_validation"},
    "source_unavailable": {"researching"},
    "failed_validation": {"researching", "needs_inputs", "unsupported"},
    "ready_for_configuration": {"researching"},
    "unsupported": {"researching"},
}


def validate_preparation_transition(previous: ResearchPreparation, current: ResearchPreparation) -> None:
    if previous.preparation_id != current.preparation_id or current.revision != previous.revision + 1:
        raise ValueError("Preparation updates require matching identity and next revision")
    if current.state != previous.state and current.state not in _TRANSITIONS[previous.state]:
        raise ValueError("Invalid preparation state transition; revalidation is required")
    if current.request != previous.request and current.state != "researching":
        raise ValueError("Changed request requires research and revalidation")
    if current.state == previous.state == "ready_for_configuration" and current.model_dump(exclude={"revision"}) != previous.model_dump(exclude={"revision"}):
        raise ValueError("Changed ready preparation must return to research for revalidation")


PREPARATION_CONTRACTS = [PreparationRequest, PreparationAnswers, ResearchPreparation]
