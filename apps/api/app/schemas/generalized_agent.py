"""Server-owned generalized research and result revision contracts."""
from typing import Annotated, Literal
from pydantic import Field, model_validator
from app.schemas.contracts import Contract, SimulationResult, Interpretation
from app.schemas.execution import ExecutionEvent, RunID
from app.schemas.experiment_preparation import PreparationRequest, Text, Digest
from app.schemas.preparation_workflow import PreparationUpdate, PreparationRecord
from app.schemas.experiment_preparation import PreparationSource
from app.schemas.evidence_extraction import ParameterExtractionResult
from app.schemas.synthesis import ScientificSynthesis, require_current, require_measured
from app.schemas.structure_analysis import StructureInspection
from app.schemas.experiment_proposals import ExperimentProposal, ProposalID

class ResearchPaperReview(Contract):
    """Actual inspected snapshot and extraction, independent of simulation input selection."""
    document_id: str
    source: PreparationSource
    inspected_locators: list[str]
    extraction: ParameterExtractionResult
    use_in_simulation: Literal['not_selected', 'reviewed_reference_separate', 'see_parameter_lineage']

class AgentResearchRequest(Contract):
    request: PreparationRequest
    preparation_id: str | None = None
    researcher_update: PreparationUpdate | None = None
    structured_baseline: bool = False
    client_revision: Annotated[int, Field(ge=0)] = 0

    @model_validator(mode='after')
    def continuation(self):
        if self.researcher_update and not self.preparation_id:
            raise ValueError('Researcher answers require an existing preparation')
        return self

class AgentEditRequest(Contract):
    base_result_id: str
    base_experiment_id: str
    base_configuration_sha256: Digest
    client_revision: Annotated[int, Field(gt=0)]
    selected_scenario_id: str | None = None
    text: Text
    # Set by "Run this experiment": the server re-derives this proposal from the stored base and applies exactly it.
    proposal_id: ProposalID | None = None
    # Explicitly continue from a result that already has a newer experiment. Starts a new branch; nothing is overwritten.
    branch: bool = False

class AgentDecision(Contract):
    status: Literal['completed', 'needs_inputs', 'unsupported']

class AgentTurn(Contract):
    turn_id: str
    status: Literal['completed', 'needs_inputs', 'unsupported', 'unavailable']
    original_text: str
    preparation: PreparationRecord | None = None
    result: SimulationResult | None = None
    interpretation: Interpretation | None = None
    synthesis: ScientificSynthesis | None = None
    structure: StructureInspection | None = None
    # The server-derived proposal this turn's result came from, when it was started with "Run this experiment".
    applied_proposal: ExperimentProposal | None = None
    research_papers: list[ResearchPaperReview] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    applied_changes: list[str] = Field(default_factory=list)
    parent_result_id: str | None = None
    tool_calls: list[str] = Field(default_factory=list)
    execution_run_id: RunID | None = None
    execution_events: Annotated[list[ExecutionEvent], Field(max_length=128)] = Field(default_factory=list)
    trace_id: str | None = None
    trace_status: str = 'not_collected'

    @model_validator(mode='after')
    def synthesis_matches_this_turn(self):
        if self.synthesis is not None:
            require_current(self.synthesis, self.result)
            require_measured(self.synthesis, self.structure)
            inspected = {paper.document_id for paper in self.research_papers}
            if any(item.extraction_status != 'not_attempted' and item.document_id not in inspected
                    for item in self.synthesis.source_access):
                raise ValueError('Synthesis cites a source review that is not part of this turn')
        return self
