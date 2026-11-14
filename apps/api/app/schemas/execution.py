"""Bounded browser-facing execution records; no prompts, arguments or exception text."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import Field, model_validator
from app.schemas.contracts import Contract, Identifier, DoseEvent, Fraction
from app.schemas.experiment_preparation import Digest

RunID = Annotated[str, Field(pattern=r'^run-[a-f0-9]{32}$')]
ShortID = Annotated[str, Field(min_length=1, max_length=120)]

class ParameterSnapshot(Contract):
    scenario_id: Identifier | None = None
    parameter: Annotated[str, Field(max_length=80)]
    value: float | None
    unit: Literal['h','L','L/h','nM^-1 h^-1','h^-1','nM','g/mol','kg','1','nmol','mg']
    provenance: Literal['reported','calculated','assumed','user_supplied','design_input']
    review_status: Literal['candidate','reviewed','rejected','not_reviewed']
    evidence_id: Identifier | None = None
    source_ids: Annotated[list[Identifier], Field(max_length=3)] = Field(default_factory=list)
    source_ids_truncated: bool = False
    comparison: Literal['baseline','previous_result','none'] = 'none'
    reference_value: float | None = None
    delta: float | None = None
    change: Literal['unchanged','changed','added','not_compared'] = 'not_compared'

class ScheduleSnapshot(Contract):
    scenario_id: Identifier
    intervention: Literal['baseline','half_life_x3','affinity_x10','custom']
    administration: Annotated[list[DoseEvent], Field(max_length=100)]
    comparison: Literal['baseline','previous_result','none']
    reference_administration: Annotated[list[DoseEvent], Field(max_length=100)] | None = None
    changed: bool | None = None
    parameter_evidence: Annotated[list[ParameterSnapshot], Field(max_length=300)] = Field(default_factory=list)

class ExperimentSnapshot(Contract):
    experiment_id: Identifier
    configuration_sha256: Digest
    reference_configuration_sha256: Digest | None = None
    duration_h: float
    occupancy_threshold: float
    parameters: Annotated[list[ParameterSnapshot], Field(max_length=48)]
    schedules: Annotated[list[ScheduleSnapshot], Field(max_length=3)]

class MetricSnapshot(Contract):
    scenario_id: Identifier
    endpoint_occupancy: Fraction
    occupancy_auc_h: float
    concentration_auc_nM_h: float
    threshold_status: Literal['never_reached','crossed_within_window','still_above_at_horizon','ambiguous_without_more_resolution']
    total_time_above_h: float

class SolverReceipt(Contract):
    result_id: Identifier
    experiment_id: Identifier
    configuration_sha256: Digest
    client_revision: int
    model_version: Annotated[str, Field(max_length=120)]
    solver_version: Annotated[str, Field(max_length=120)]
    output_point_count: Annotated[int, Field(ge=2, le=5000)]
    metrics: Annotated[list[MetricSnapshot], Field(max_length=3)]

class SourceReference(Contract):
    source_handle: ShortID | None = None
    source_id: ShortID | None = None
    document_id: ShortID | None = None
    snapshot_sha256: Digest | None = None
    content_kind: Literal['full_text','abstract','database_record','product_label'] | None = None
    retrieval_status: Literal['live','cached','unavailable'] | None = None

class ExecutionSummary(Contract):
    outcome: Literal['completed','rejected','needs_inputs','unsupported','unavailable','no_values','failed','interrupted']
    preparation_id: ShortID | None = None
    preparation_state: Annotated[str, Field(max_length=80)] | None = None
    missing_input_count: Annotated[int, Field(ge=0)] | None = None
    source_count: Annotated[int, Field(ge=0)] | None = None
    candidate_count: Annotated[int, Field(ge=0)] | None = None
    sources: Annotated[list[SourceReference], Field(max_length=20)] = Field(default_factory=list)
    sources_truncated: bool = False
    experiment: ExperimentSnapshot | None = None
    result: SolverReceipt | None = None
    error_code: Literal['validation','stale','unavailable','interrupted','timeout'] | None = None

class ExecutionEvent(Contract):
    schema_version: Literal['1.0'] = '1.0'
    event_id: Annotated[str, Field(pattern=r'^evt-[a-f0-9]{32}$')]
    run_id: RunID
    sequence: Annotated[int, Field(ge=1, le=128)]
    kind: Literal['run','tool']
    tool_call_id: Annotated[str, Field(pattern=r'^exec-[a-f0-9]{32}$')] | None = None
    tool_name: Literal['search_hypothesis_evidence','retrieve_evidence_source','extract_cited_parameters',
        'start_experiment_preparation','read_experiment_preparation','update_experiment_preparation',
        'configure_prepared_experiment','prepare_reviewed_comparison','simulate_current_comparison',
        'interpret_current_result','synthesize_grounded_answer','read_current_experiment','apply_requested_edit'] | None = None
    stage: Literal['run','preparation','literature','extraction','configuration','simulation','interpretation','editing']
    state: Literal['started','succeeded','rejected','needs_inputs','unsupported','failed','interrupted']
    timestamp: datetime
    elapsed_ms: Annotated[float, Field(ge=0)] | None = None
    summary: ExecutionSummary | None = None

    @model_validator(mode='after')
    def lifecycle_shape(self):
        if self.timestamp.tzinfo is None: raise ValueError('Execution timestamps require a timezone')
        if self.kind == 'tool' and (not self.tool_call_id or not self.tool_name):
            raise ValueError('Tool records require an execution ID and tool name')
        if self.kind == 'run' and (self.tool_call_id or self.tool_name or self.stage != 'run'):
            raise ValueError('Run records cannot impersonate tools')
        if self.state == 'started':
            if self.summary is not None or self.elapsed_ms is not None: raise ValueError('Started is not a completed action')
        elif self.summary is None or self.elapsed_ms is None:
            raise ValueError('Terminal events require a bounded summary and duration')
        if self.summary:
            allowed = {'succeeded':{'completed','no_values'}, 'failed':{'failed','unavailable'},
                'rejected':{'rejected'}, 'needs_inputs':{'needs_inputs'}, 'unsupported':{'unsupported'},
                'interrupted':{'interrupted'}}
            if self.summary.outcome not in allowed.get(self.state,set()):
                raise ValueError('Execution state and summary outcome disagree')
        return self
