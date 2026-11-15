"""Investigation history: an immutable tree of stored results with bounded summaries. No time series."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract, Identifier, SimulationResult
from app.schemas.experiment_preparation import Digest

Origin = Literal['research', 'agent_edit', 'proposal', 'direct_control', 'direct_simulation', 'saved_demo']
Line = Annotated[str, Field(max_length=700)]


class ScenarioOutcome(Contract):
    scenario_id: Identifier
    label: Annotated[str, Field(max_length=200)]
    endpoint_occupancy: float
    threshold_status: Literal['never_reached', 'crossed_within_window', 'still_above_at_horizon', 'ambiguous_without_more_resolution']
    total_time_above_h: float


class HistoryEntry(Contract):
    result_id: Identifier
    parent_result_id: Identifier | None = None
    origin: Origin
    created_at: datetime | None = None
    depth: Annotated[int, Field(ge=0)]
    title: Line
    changes: Annotated[list[Line], Field(max_length=8)] = Field(default_factory=list)
    drug: Annotated[str, Field(max_length=200)]
    target: Annotated[str, Field(max_length=200)]
    experiment_id: Identifier
    configuration_sha256: Digest
    client_revision: int
    duration_h: float
    occupancy_threshold: float
    outcomes: Annotated[list[ScenarioOutcome], Field(max_length=3)]
    turn_id: str | None = None
    verdict: Literal['supported', 'not_supported', 'mixed', 'undetermined'] | None = None
    finding: Line | None = None
    papers: Annotated[list[Line], Field(max_length=4)] = Field(default_factory=list)
    paper_count: Annotated[int, Field(ge=0)] = 0
    structure_pdb_id: Annotated[str, Field(max_length=4)] | None = None
    child_count: Annotated[int, Field(ge=0)] = 0
    # True when an agent experiment was already run from this result: another one must be an explicit branch.
    has_follow_up_experiment: bool = False


class InvestigationHistory(Contract):
    root_result_id: Identifier
    requested_result_id: Identifier
    question: Line | None = None
    entries: Annotated[list[HistoryEntry], Field(max_length=80)]
    truncated: bool = False


class StoredResult(Contract):
    """A stored result reopened for display, with the agent turn that produced it when there was one."""
    result: SimulationResult
    turn_id: str | None = None
    origin: Origin
    parent_result_id: Identifier | None = None
    child_count: Annotated[int, Field(ge=0)]


INVESTIGATION_CONTRACTS = [InvestigationHistory, StoredResult]
