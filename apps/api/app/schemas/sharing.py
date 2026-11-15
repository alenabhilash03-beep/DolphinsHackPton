"""Shared experiments (5C.2): immutable snapshots of one user's investigation, readable by signed-in users."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract, Identifier, SimulationResult
from app.schemas.investigation import Origin, ScenarioOutcome

StepID = Annotated[str, Field(pattern=r'^S[1-9][0-9]?$')]
ShareID = Annotated[str, Field(pattern=r'^shr-[a-f0-9]{32}$')]
Short = Annotated[str, Field(max_length=700)]

DISCLAIMER = ('Conditional model predictions from a reduced exposure and binding model. Target occupancy does not '
              'establish efficacy, safety or an appropriate treatment regimen.')


class ShareOwner(Contract):
    name: Annotated[str, Field(max_length=120)]
    avatar_url: Annotated[str, Field(max_length=500)] | None = None


class SharedStep(Contract):
    step_id: StepID
    parent_step_id: StepID | None = None
    origin: Origin
    created_at: datetime | None = None
    title: Short
    changes: Annotated[list[Short], Field(max_length=8)] = Field(default_factory=list)
    duration_h: float
    occupancy_threshold: float
    outcomes: Annotated[list[ScenarioOutcome], Field(max_length=3)]
    verdict: Literal['supported', 'not_supported', 'mixed', 'undetermined'] | None = None
    finding: Short | None = None
    papers: Annotated[list[Short], Field(max_length=4)] = Field(default_factory=list)
    paper_count: Annotated[int, Field(ge=0)] = 0
    structure_pdb_id: Annotated[str, Field(max_length=4)] | None = None
    is_shared_result: bool = False


class SummaryPoint(Contract):
    text: Annotated[str, Field(min_length=1, max_length=400)]
    step_ids: Annotated[list[StepID], Field(min_length=1, max_length=8)]


class AISummary(Contract):
    status: Literal['grounded', 'unavailable', 'rejected']
    headline: Annotated[str, Field(max_length=240)] | None = None
    headline_step_ids: Annotated[list[StepID], Field(max_length=8)] = Field(default_factory=list)
    points: Annotated[list[SummaryPoint], Field(max_length=5)] = Field(default_factory=list)
    notes: Annotated[list[Short], Field(max_length=6)] = Field(default_factory=list)


class SharedAnswer(Contract):
    verdict: Literal['supported', 'not_supported', 'mixed', 'undetermined']
    statement: Short
    step_id: StepID


class SharedExperiment(Contract):
    share_id: ShareID
    created_at: datetime
    owner: ShareOwner
    is_owner: bool = False
    title: Annotated[str, Field(min_length=1, max_length=160)]
    note: Annotated[str, Field(max_length=1000)] | None = None
    question: Short
    drug: Annotated[str, Field(max_length=200)]
    target: Annotated[str, Field(max_length=200)]
    steps: Annotated[list[SharedStep], Field(min_length=1, max_length=80)]
    shared_step_id: StepID
    log_summary: Annotated[list[Short], Field(max_length=82)]
    ai_summary: AISummary
    answer: SharedAnswer | None = None
    result: SimulationResult
    disclaimer: str = DISCLAIMER


class ShareRequest(Contract):
    result_id: Identifier
    title: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    # The author's question as shown in the workspace; used only when no agent research step records one.
    question: Annotated[str, Field(max_length=700)] | None = None
    note: Annotated[str, Field(max_length=1000)] | None = None


class ShareListItem(Contract):
    share_id: ShareID
    created_at: datetime
    owner: ShareOwner
    is_owner: bool = False
    title: str
    question: Short
    drug: str
    target: str
    step_count: int
    headline: str | None = None
    verdict: str | None = None


class ShareList(Contract):
    items: list[ShareListItem]


SHARING_CONTRACTS = [SharedExperiment, ShareRequest, ShareList]
