"""Server-owned generalized research and result revision contracts."""
from typing import Annotated, Literal
from pydantic import Field, model_validator
from app.schemas.contracts import Contract, SimulationResult, Interpretation
from app.schemas.execution import ExecutionEvent, RunID
from app.schemas.experiment_preparation import PreparationRequest, Text, Digest
from app.schemas.preparation_workflow import PreparationUpdate, PreparationRecord

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

class AgentDecision(Contract):
    status: Literal['completed', 'needs_inputs', 'unsupported']

class AgentTurn(Contract):
    turn_id: str
    status: Literal['completed', 'needs_inputs', 'unsupported', 'unavailable']
    original_text: str
    preparation: PreparationRecord | None = None
    result: SimulationResult | None = None
    interpretation: Interpretation | None = None
    questions: list[str] = Field(default_factory=list)
    applied_changes: list[str] = Field(default_factory=list)
    parent_result_id: str | None = None
    tool_calls: list[str] = Field(default_factory=list)
    execution_run_id: RunID | None = None
    execution_events: Annotated[list[ExecutionEvent], Field(max_length=128)] = Field(default_factory=list)
    trace_id: str | None = None
    trace_status: str = 'not_collected'
