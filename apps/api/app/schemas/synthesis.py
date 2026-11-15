"""Grounded scientific answer contracts.

A synthesis separates three kinds of statement and never merges them:
paper findings (cited to retrieved passages), conditional simulation predictions (bound to
solver fields of one accepted result) and hypotheses needing experimental validation.
Model-authored proposals carry no authority; the server validates and assembles the public record.
"""
from math import isclose
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas.contracts import Contract, Identifier, SimulationResult
from app.schemas.experiment_preparation import Digest
from app.schemas.structure_analysis import StructureInspection, StructureMeasurement

Statement = Annotated[str, Field(min_length=1, max_length=700)]
FindingID = Annotated[str, Field(pattern=r'^F[0-9]{1,2}$')]
SolverMetric = Literal['endpoint_occupancy', 'occupancy_auc_h', 'concentration_auc_nM_h',
    'threshold_status', 'total_time_above_h']
Verdict = Literal['supported', 'not_supported', 'mixed', 'undetermined']
Stance = Literal['supports', 'contradicts', 'context']
ExperimentKind = Literal['measurement', 'simulation_change', 'literature_review']
Addresses = Literal['missing_evidence', 'disagreement', 'model_assumption', 'prediction_validation']
ContentKind = Literal['full_text', 'abstract', 'database_record', 'product_label']
METRIC_UNITS = {'endpoint_occupancy': 'fraction', 'occupancy_auc_h': 'h', 'concentration_auc_nM_h': 'nM*h',
    'threshold_status': 'status', 'total_time_above_h': 'h'}


# --- Untrusted model output -------------------------------------------------------------------

class CitationProposal(Contract):
    document_id: Annotated[str, Field(max_length=64)]
    locator: Identifier
    quote: Annotated[str, Field(min_length=1, max_length=600)]


class MetricReference(Contract):
    scenario_id: Identifier
    metric: SolverMetric


class FindingProposal(Contract):
    finding_id: FindingID
    statement: Statement
    stance: Stance
    citations: Annotated[list[CitationProposal], Field(min_length=1, max_length=3)]


class AnswerProposal(Contract):
    verdict: Verdict
    statement: Statement
    finding_ids: Annotated[list[FindingID], Field(max_length=8)] = Field(default_factory=list)
    metric_refs: Annotated[list[MetricReference], Field(max_length=9)] = Field(default_factory=list)


class DisagreementProposal(Contract):
    statement: Statement
    finding_ids: Annotated[list[FindingID], Field(min_length=2, max_length=6)]


class MissingEvidenceProposal(Contract):
    statement: Statement
    parameter: Identifier | None = None


class ImplicationProposal(Contract):
    statement: Statement
    metric_refs: Annotated[list[MetricReference], Field(min_length=1, max_length=9)]


class StructuralContextProposal(Contract):
    statement: Statement
    measurement_ids: Annotated[list[Annotated[str, Field(pattern=r'^M[0-9]{1,2}$')]], Field(min_length=1, max_length=6)]


class NextExperimentProposal(Contract):
    kind: ExperimentKind
    proposal: Statement
    rationale: Statement
    addresses: Addresses


class SynthesisProposal(Contract):
    """What the language model may propose. Every reference is checked before anything is shown."""
    result_id: Identifier | None = None
    answer: AnswerProposal
    evidence_findings: Annotated[list[FindingProposal], Field(max_length=8)] = Field(default_factory=list)
    disagreements: Annotated[list[DisagreementProposal], Field(max_length=4)] = Field(default_factory=list)
    missing_evidence: Annotated[list[MissingEvidenceProposal], Field(max_length=6)] = Field(default_factory=list)
    simulation_implications: Annotated[list[ImplicationProposal], Field(max_length=6)] = Field(default_factory=list)
    limitations: Annotated[list[Statement], Field(max_length=6)] = Field(default_factory=list)
    next_experiments: Annotated[list[NextExperimentProposal], Field(max_length=5)] = Field(default_factory=list)
    structural_context: Annotated[list[StructuralContextProposal], Field(max_length=3)] = Field(default_factory=list)


# --- Server-assembled public record -----------------------------------------------------------

class SynthesisCitation(Contract):
    document_id: str
    source_id: Identifier
    locator: Identifier
    quote: Annotated[str, Field(min_length=1, max_length=600)]
    content_kind: ContentKind


class SolverQuantity(Contract):
    """One solver field of one accepted result; the value is copied by the server, never by the model."""
    result_id: Identifier
    scenario_id: Identifier
    metric: SolverMetric
    value: float | None = None
    status: str | None = None
    unit: Literal['fraction', 'h', 'nM*h', 'status']
    display: Annotated[str, Field(min_length=1, max_length=120)]

    @model_validator(mode='after')
    def one_kind_of_value(self) -> Self:
        if (self.metric == 'threshold_status') != (self.value is None) or (self.value is None) == (self.status is None):
            raise ValueError('A solver quantity is either a number or a threshold status')
        if self.unit != METRIC_UNITS[self.metric]:
            raise ValueError('Solver quantity unit does not match its metric')
        return self


class EvidenceFinding(Contract):
    claim_kind: Literal['paper_finding'] = 'paper_finding'
    finding_id: FindingID
    statement: Statement
    stance: Stance
    citations: Annotated[list[SynthesisCitation], Field(min_length=1, max_length=3)]
    abstract_only: bool


class SimulationImplication(Contract):
    claim_kind: Literal['conditional_simulation_prediction'] = 'conditional_simulation_prediction'
    statement: Statement
    quantities: Annotated[list[SolverQuantity], Field(min_length=1, max_length=9)]


class StructuralObservation(Contract):
    """Geometric context from deposited coordinates. It never decides a verdict."""
    claim_kind: Literal['structural_observation'] = 'structural_observation'
    statement: Statement
    measurements: Annotated[list[StructureMeasurement], Field(min_length=1, max_length=6)]


class NextExperiment(Contract):
    claim_kind: Literal['hypothesis_needing_validation'] = 'hypothesis_needing_validation'
    kind: ExperimentKind
    proposal: Statement
    rationale: Statement
    addresses: Addresses


class EvidenceDisagreement(Contract):
    origin: Literal['synthesis', 'extraction_conflict']
    statement: Statement
    finding_ids: list[FindingID] = Field(default_factory=list)
    parameter_ids: list[Identifier] = Field(default_factory=list)

    @model_validator(mode='after')
    def two_sides(self) -> Self:
        if len(set(self.finding_ids)) + len(set(self.parameter_ids)) < 2:
            raise ValueError('A disagreement needs at least two referenced findings or candidates')
        return self


class MissingEvidence(Contract):
    origin: Literal['synthesis', 'extraction', 'preparation']
    statement: Statement
    parameter: Identifier | None = None


class SourceAccess(Contract):
    document_id: str
    source_id: Identifier
    title: Annotated[str, Field(max_length=500)]
    content_kind: ContentKind
    retrieval_status: Literal['live', 'cached', 'unavailable']
    extraction_status: Literal['candidates', 'no_values', 'unavailable', 'rejected', 'not_attempted']
    passages_supplied: Annotated[int, Field(ge=0)]
    limitation: Statement | None = None


class SynthesisAnswer(Contract):
    verdict: Verdict
    statement: Statement
    basis: Literal['paper_evidence', 'conditional_simulation', 'paper_evidence_and_conditional_simulation', 'none']
    finding_ids: list[FindingID] = Field(default_factory=list)
    quantities: list[SolverQuantity] = Field(default_factory=list)

    @model_validator(mode='after')
    def basis_matches_references(self) -> Self:
        expected = ('paper_evidence_and_conditional_simulation' if self.finding_ids and self.quantities else
            'paper_evidence' if self.finding_ids else 'conditional_simulation' if self.quantities else 'none')
        if self.basis != expected:
            raise ValueError('Answer basis must describe its actual references')
        if self.verdict != 'undetermined' and expected == 'none':
            raise ValueError('A determined answer must reference a paper finding or a solver field')
        return self


class ScientificSynthesis(Contract):
    schema_version: Literal['1.0'] = '1.0'
    status: Literal['grounded', 'unavailable', 'rejected']
    basis: Literal['research_and_simulation', 'research_only', 'simulation_only', 'none']
    original_text: Annotated[str, Field(min_length=1, max_length=12000)]
    result_id: Identifier | None = None
    experiment_id: Identifier | None = None
    configuration_sha256: Digest | None = None
    client_revision: Annotated[int, Field(ge=0)] | None = None
    answer: SynthesisAnswer | None = None
    evidence_findings: Annotated[list[EvidenceFinding], Field(max_length=8)] = Field(default_factory=list)
    disagreements: Annotated[list[EvidenceDisagreement], Field(max_length=12)] = Field(default_factory=list)
    missing_evidence: Annotated[list[MissingEvidence], Field(max_length=40)] = Field(default_factory=list)
    simulation_implications: Annotated[list[SimulationImplication], Field(max_length=6)] = Field(default_factory=list)
    limitations: Annotated[list[Statement], Field(max_length=40)] = Field(default_factory=list)
    next_experiments: Annotated[list[NextExperiment], Field(max_length=5)] = Field(default_factory=list)
    source_access: Annotated[list[SourceAccess], Field(max_length=6)] = Field(default_factory=list)
    structural_context: Annotated[list[StructuralObservation], Field(max_length=3)] = Field(default_factory=list)
    # Server-written: whether a verified structure exists and what coordinates cannot decide.
    structure_note: Statement | None = None
    notes: Annotated[list[Statement], Field(max_length=12)] = Field(default_factory=list)

    def quantities(self) -> list[SolverQuantity]:
        return [*(self.answer.quantities if self.answer else []),
            *(q for item in self.simulation_implications for q in item.quantities)]

    @model_validator(mode='after')
    def internally_consistent(self) -> Self:
        linkage = [self.result_id, self.experiment_id, self.configuration_sha256, self.client_revision]
        if any(item is None for item in linkage) and any(item is not None for item in linkage):
            raise ValueError('Result linkage must be complete or absent')
        if any(q.result_id != self.result_id for q in self.quantities()):
            raise ValueError('Solver quantities must belong to the linked result')
        if (self.basis in {'research_and_simulation', 'simulation_only'}) != (self.result_id is not None):
            raise ValueError('Synthesis basis disagrees with its result linkage')
        if (self.basis in {'research_and_simulation', 'research_only'}) != bool(self.source_access):
            raise ValueError('Synthesis basis disagrees with its inspected sources')
        ids = [item.finding_id for item in self.evidence_findings]
        if len(set(ids)) != len(ids):
            raise ValueError('Finding identifiers must be unique')
        referenced = {key for item in self.disagreements for key in item.finding_ids}
        referenced.update(self.answer.finding_ids if self.answer else [])
        if not referenced <= set(ids):
            raise ValueError('A statement references a nonexistent finding')
        documents = {item.document_id: item for item in self.source_access}
        for finding in self.evidence_findings:
            for citation in finding.citations:
                source = documents.get(citation.document_id)
                if source is None or source.source_id != citation.source_id or source.content_kind != citation.content_kind:
                    raise ValueError('A citation references a source that was not inspected')
        if self.status == 'grounded':
            if self.answer is None or self.basis == 'none':
                raise ValueError('A grounded synthesis requires an answer and a basis')
        elif (self.answer or self.evidence_findings or self.simulation_implications or self.next_experiments or self.structural_context
                or any(item.origin == 'synthesis' for item in [*self.disagreements, *self.missing_evidence])):
            raise ValueError('An unavailable or rejected synthesis cannot carry model-authored content')
        return self


def solver_field(result: SimulationResult, scenario_id: str, metric: str):
    """The single authoritative mapping from a metric name to a solver field."""
    series = next((item for item in result.scenarios if item.scenario_id == scenario_id), None)
    if series is None:
        raise ValueError('Unknown scenario in solver reference')
    metrics = series.metrics
    return {'endpoint_occupancy': metrics.endpoint_occupancy, 'occupancy_auc_h': metrics.occupancy_auc_h,
        'concentration_auc_nM_h': metrics.concentration_auc_nM_h, 'threshold_status': metrics.threshold.status,
        'total_time_above_h': metrics.threshold.total_time_above_h}[metric]


def require_current(synthesis: ScientificSynthesis, result: SimulationResult | None) -> None:
    """Reject a synthesis that is stale for, or foreign to, the supplied numerical result."""
    if result is None:
        if synthesis.result_id is not None:
            raise ValueError('Synthesis references a numerical result that is not part of this turn')
        return
    if (synthesis.result_id != result.result_id or synthesis.experiment_id != result.configuration.experiment_id
            or synthesis.configuration_sha256 != result.configuration_hash
            or synthesis.client_revision != result.client_revision):
        raise ValueError('Synthesis is stale: it does not reference the current numerical result')
    for quantity in synthesis.quantities():
        actual = solver_field(result, quantity.scenario_id, quantity.metric)
        if quantity.metric == 'threshold_status':
            matches = quantity.status == actual
        else:
            matches = quantity.value is not None and isclose(quantity.value, actual, rel_tol=0, abs_tol=0)
        if not matches:
            raise ValueError('Synthesis quantity does not equal its solver field')


def require_measured(synthesis: ScientificSynthesis, structure: StructureInspection | None) -> None:
    """Every coordinate value cited by the answer must be a measurement the agent obtained in the same turn."""
    measured = {item.measurement_id: item for item in structure.measurements} if structure else {}
    for observation in synthesis.structural_context:
        for item in observation.measurements:
            if measured.get(item.measurement_id) != item:
                raise ValueError('Synthesis cites a structural measurement that was not made in this turn')


SYNTHESIS_CONTRACTS = [ScientificSynthesis, SynthesisProposal]
