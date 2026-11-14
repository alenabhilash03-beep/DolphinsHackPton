from datetime import date, datetime
from math import isclose, isfinite, log
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

Positive = Annotated[float, Field(gt=0, strict=True)]
Nonnegative = Annotated[float, Field(ge=0, strict=True)]
Fraction = Annotated[float, Field(ge=0, le=1, strict=True)]
Identifier = Annotated[str, Field(min_length=1, max_length=120)]
SupportStatus = Literal["supported", "conditional", "needs_parameters", "unsupported"]
MODEL_ID = "one_compartment_effective_binding_v1"


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class Assumption(Contract):
    assumption_id: Identifier
    description: Annotated[str, Field(min_length=1)]


class EvidenceSource(Contract):
    source_id: Identifier
    title: Annotated[str, Field(min_length=1)]
    url: HttpUrl
    retrieved_on: date
    source_kind: Literal["primary_study", "product_label", "structure_record"]
    version: str | None = None
    identifiers: dict[str, str] = Field(default_factory=dict)


class ParameterEvidence(Contract):
    evidence_id: Identifier
    parameter: Annotated[str, Field(min_length=1)]
    value: Annotated[float, Field(strict=True)]
    unit: Annotated[str, Field(min_length=1)]
    original_value: Annotated[float, Field(strict=True)]
    original_unit: Annotated[str, Field(min_length=1)]
    normalization: str
    provenance: Literal["reported", "calculated", "assumed", "user_supplied"]
    estimate_type: Literal["population_model_fit", "assay_fit", "approximate_property", "derivation", "design_input"]
    review_status: Literal["candidate", "reviewed", "rejected"]
    applicability: Literal["direct", "conditional_transfer", "not_applicable"]
    source_ids: list[Identifier] = Field(default_factory=list)
    locator: str | None = None
    parent_ids: list[Identifier] = Field(default_factory=list)
    formula: str | None = None
    rationale: str | None = None
    context: dict[str, str] = Field(default_factory=dict)
    reviewed_on: date | None = None
    reviewer: str | None = None
    entered_at: datetime | None = None

    @model_validator(mode="after")
    def provenance_requirements(self) -> Self:
        if self.provenance == "reported" and (not self.source_ids or not self.locator):
            raise ValueError("Reported evidence requires sources and a locator")
        if self.provenance == "calculated" and (not self.parent_ids or not self.formula):
            raise ValueError("Calculated evidence requires parents and a formula")
        if self.provenance == "assumed" and not self.rationale:
            raise ValueError("Assumptions require a rationale")
        if self.provenance == "user_supplied" and (not self.entered_at or not self.rationale):
            raise ValueError("User-supplied values require entry time and rationale")
        if self.review_status == "reviewed" and (not self.reviewed_on or not self.reviewer):
            raise ValueError("Reviewed evidence requires a reviewer and date")
        return self


class SupportAssessment(Contract):
    status: SupportStatus
    reasons: Annotated[list[str], Field(min_length=1)]
    missing_parameters: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def missing_inputs(self) -> Self:
        if self.status == "needs_parameters" and not self.missing_parameters:
            raise ValueError("Missing-parameter outcome must name the inputs")
        return self


class PKParameters(Contract):
    volume_L: Positive
    clearance_L_h: Positive
    elimination_half_life_h: Positive

    @model_validator(mode="after")
    def linked_parameters(self) -> Self:
        expected = log(2) * self.volume_L / self.clearance_L_h
        if not isclose(self.elimination_half_life_h, expected, rel_tol=1e-6):
            raise ValueError("Half-life must equal ln(2) * volume / clearance")
        return self


class BindingParameters(Contract):
    association_nM_inv_h_inv: Positive
    dissociation_h_inv: Positive
    affinity_nM: Positive

    @model_validator(mode="after")
    def linked_parameters(self) -> Self:
        expected = self.dissociation_h_inv / self.association_nM_inv_h_inv
        if not isclose(self.affinity_nM, expected, rel_tol=1e-6):
            raise ValueError("KD must equal dissociation / association")
        return self


class InfusionEvent(Contract):
    kind: Literal["infusion"] = "infusion"
    start_h: Nonnegative
    duration_h: Positive
    amount_mg: Nonnegative


class BolusEvent(Contract):
    kind: Literal["hypothetical_bolus"]
    start_h: Nonnegative
    amount_mg: Nonnegative


DoseEvent = Annotated[InfusionEvent | BolusEvent, Field(discriminator="kind")]


class ScenarioConfig(Contract):
    scenario_id: Identifier
    label: Annotated[str, Field(min_length=1)]
    model_id: Literal["one_compartment_effective_binding_v1"] = MODEL_ID
    intervention: Literal["baseline", "half_life_x3", "affinity_x10", "custom"]
    pk: PKParameters
    binding: BindingParameters
    molecular_weight_g_mol: Positive
    body_mass_kg: Positive
    exposure_factor: Nonnegative
    initial_amount_nmol: Nonnegative = 0
    initial_occupancy: Fraction = 0
    dosing_interval_h: Positive | None = None
    administration: Annotated[list[DoseEvent], Field(min_length=1, max_length=100)]
    assumption_ids: Annotated[list[Identifier], Field(min_length=1)]
    parameter_evidence: dict[str, Identifier]

    @model_validator(mode="after")
    def schedule_order(self) -> Self:
        previous_end = -1.0
        for event in self.administration:
            if event.start_h < previous_end:
                raise ValueError("Events must be sorted and must not overlap")
            previous_end = event.start_h + (event.duration_h if event.kind == "infusion" else 0)
        if self.dosing_interval_h is not None:
            if len(self.administration) < 2 or any(event.kind != "infusion" for event in self.administration):
                raise ValueError("A dosing interval requires at least two infusion events")
            first_start = self.administration[0].start_h
            if any(not isclose(event.start_h, first_start + index * self.dosing_interval_h, rel_tol=1e-9, abs_tol=1e-9)
                   for index, event in enumerate(self.administration)):
                raise ValueError("Infusion starts must match the declared dosing interval")
        return self


class HypothesisRequest(Contract):
    text: Annotated[str, Field(min_length=1, max_length=12000)]
    drug: str | None = None
    target: str | None = None
    dose_mg_kg: Positive | None = None
    route: Literal["iv_infusion", "hypothetical_iv_bolus", "oral", "subcutaneous", "other"] | None = None
    duration_h: Positive | None = None
    previous_experiment_id: Identifier | None = None


class ParsedHypothesis(Contract):
    drug: str | None
    target: str | None
    interventions: list[str]
    predicted_outcome: str
    ambiguities: list[str] = Field(default_factory=list)
    unsupported_requests: list[str] = Field(default_factory=list)


class ExperimentConfig(Contract):
    schema_version: Literal["1.0"] = "1.0"
    experiment_id: Identifier
    title: str
    mode: Literal["reviewed_preset", "custom"]
    support: SupportAssessment
    drug: str
    target: str
    hypothesis: ParsedHypothesis
    duration_h: Positive
    occupancy_threshold: Annotated[float, Field(gt=0, lt=1)] = 0.9
    assumptions: Annotated[list[Assumption], Field(min_length=1)]
    sources: Annotated[list[EvidenceSource], Field(max_length=100)]
    evidence: Annotated[list[ParameterEvidence], Field(max_length=300)]
    scenarios: Annotated[list[ScenarioConfig], Field(min_length=1, max_length=3)]
    limitations: Annotated[list[str], Field(min_length=1)]

    @model_validator(mode="after")
    def reference_integrity(self) -> Self:
        if self.support.status not in ("supported", "conditional"):
            raise ValueError("A runnable configuration requires supported or conditional scope")
        if self.mode == "custom" and self.support.status != "conditional":
            raise ValueError("Custom experiments must be conditional")
        def unique(items: list[str], label: str) -> set[str]:
            if len(set(items)) != len(items):
                raise ValueError(f"Duplicate {label} identifiers")
            return set(items)
        source_ids = unique([s.source_id for s in self.sources], "source")
        assumption_ids = unique([a.assumption_id for a in self.assumptions], "assumption")
        unique([s.scenario_id for s in self.scenarios], "scenario")
        unique([e.evidence_id for e in self.evidence], "evidence")
        evidence = {e.evidence_id: e for e in self.evidence}
        for item in self.evidence:
            if not set(item.source_ids) <= source_ids:
                raise ValueError("Evidence references an unknown source")
            if not set(item.parent_ids) <= evidence.keys():
                raise ValueError("Calculated evidence references an unknown parent")
        # Reject circular provenance, including indirect cycles.
        visited: set[str] = set()
        def visit(key: str, ancestors: set[str]) -> None:
            if key in ancestors:
                raise ValueError("Evidence derivations must be acyclic")
            if key in visited:
                return
            for parent in evidence[key].parent_ids:
                visit(parent, ancestors | {key})
            visited.add(key)
        for key in evidence:
            visit(key, set())
        inherited: dict[str, tuple[bool, bool]] = {}
        def usable(key: str) -> tuple[bool, bool]:
            if key in inherited:
                return inherited[key]
            item = evidence[key]
            if item.review_status == "rejected" or item.applicability == "not_applicable":
                raise ValueError("Used evidence and derivation parents must be applicable and not rejected")
            parent_user = False
            transferred = item.applicability == "conditional_transfer" or item.provenance in ("assumed", "user_supplied")
            for parent in item.parent_ids:
                parent_conditional, parent_has_user = usable(parent)
                transferred = transferred or parent_conditional
                parent_user = parent_user or parent_has_user
            if item.review_status == "candidate":
                if self.mode != "custom" or item.provenance not in ("user_supplied", "calculated"):
                    raise ValueError("Unreviewed source values cannot be used as scientific parameters")
                if item.provenance == "calculated" and not parent_user:
                    raise ValueError("Candidate derivations require a user-supplied parent")
                transferred = True
            has_user = item.provenance == "user_supplied" or parent_user
            inherited[key] = (transferred, has_user)
            return inherited[key]
        required = {
            "pk.volume_L": "L", "pk.clearance_L_h": "L/hour", "pk.elimination_half_life_h": "hour",
            "binding.association_nM_inv_h_inv": "nM^-1 hour^-1", "binding.dissociation_h_inv": "hour^-1",
            "binding.affinity_nM": "nM", "molecular_weight_g_mol": "g/mol", "body_mass_kg": "kg", "exposure_factor": "1",
        }
        for scenario in self.scenarios:
            if not set(scenario.assumption_ids) <= assumption_ids:
                raise ValueError("Scenario references an unknown assumption")
            if not required.keys() <= scenario.parameter_evidence.keys():
                raise ValueError("Scenario lacks scientific parameter evidence references")
            for path, key in scenario.parameter_evidence.items():
                if key not in evidence:
                    raise ValueError("Scenario references unknown parameter evidence")
                item = evidence[key]
                usable(key)
                expected_unit = required.get(path)
                if path.startswith("administration.") and path.endswith(".amount_mg"):
                    expected_unit = "mg"
                if path == "dosing_interval_h":
                    expected_unit = "hour"
                if expected_unit and item.unit != expected_unit:
                    raise ValueError("Evidence unit must match the canonical parameter unit")
                value = scenario.model_dump()
                try:
                    for part in path.split("."):
                        value = value[int(part)] if isinstance(value, list) else value[part]
                except (KeyError, TypeError, ValueError, IndexError):
                    raise ValueError("Unknown scenario parameter path") from None
                if not isinstance(value, (int, float)) or not isclose(value, item.value, rel_tol=1e-6, abs_tol=1e-12):
                    raise ValueError("Scenario value does not match its evidence record")
            if any(usable(key)[0] for key in scenario.parameter_evidence.values()):
                if self.support.status != "conditional":
                    raise ValueError("Transferred or assumed scientific inputs require conditional scope")
            if scenario.intervention != "baseline" and self.support.status != "conditional":
                raise ValueError("Hypothetical interventions require conditional scope")
        return self


class ExperimentPreparation(Contract):
    support: SupportAssessment
    experiment: ExperimentConfig | None = None

    @model_validator(mode="after")
    def outcome_consistency(self) -> Self:
        runnable = self.support.status in ("supported", "conditional")
        if runnable != (self.experiment is not None):
            raise ValueError("Only runnable outcomes include a configuration")
        if self.experiment and self.experiment.support != self.support:
            raise ValueError("Preparation and experiment support must agree")
        return self


class SimulationRequest(Contract):
    experiment: ExperimentConfig
    client_revision: Annotated[int, Field(ge=0)]
    output_points: Annotated[int, Field(ge=100, le=5000)] = 1000


class ControlAdjustment(Contract):
    experiment: ExperimentConfig
    scenario_id: Identifier | None = None
    field: Literal[
        "dose_mg", "dosing_interval_h", "pk.volume_L", "pk.clearance_L_h",
        "pk.elimination_half_life_h", "binding.association_nM_inv_h_inv",
        "binding.dissociation_h_inv", "binding.affinity_nM", "exposure_factor",
        "duration_h", "occupancy_threshold",
    ]
    value: Annotated[float, Field(strict=True)] | None
    client_revision: Annotated[int, Field(ge=0)]
    output_points: Annotated[int, Field(ge=100, le=5000)] = 1000

    @model_validator(mode="after")
    def target_and_value(self) -> Self:
        global_edit = self.field in ("duration_h", "occupancy_threshold")
        if global_edit != (self.scenario_id is None):
            raise ValueError("Global controls omit scenario_id; scenario controls require it")
        if self.value is None:
            if self.field != "dosing_interval_h":
                raise ValueError("Only the dosing interval can be cleared")
            return self
        if not isfinite(self.value):
            raise ValueError("Control values must be finite")
        if self.field == "occupancy_threshold":
            if not 0 < self.value < 1:
                raise ValueError("Occupancy threshold must be between zero and one")
        elif self.field in ("dose_mg", "exposure_factor"):
            if self.value < 0:
                raise ValueError("Control value must be nonnegative")
        elif self.value <= 0:
            raise ValueError("Control value must be positive")
        return self


class ThresholdOutcome(Contract):
    status: Literal["never_reached", "crossed_within_window", "still_above_at_horizon", "ambiguous_without_more_resolution"]
    total_time_above_h: Nonnegative
    first_upward_crossing_h: Nonnegative | None
    first_subsequent_downward_crossing_h: Nonnegative | None
    above_threshold_intervals_h: list[tuple[Nonnegative, Nonnegative]] = Field(default_factory=list)

    @model_validator(mode="after")
    def interval_consistency(self) -> Self:
        if any(end <= start for start, end in self.above_threshold_intervals_h):
            raise ValueError("Above-threshold intervals must have positive duration")
        if any(b[0] < a[1] for a, b in zip(self.above_threshold_intervals_h, self.above_threshold_intervals_h[1:])):
            raise ValueError("Above-threshold intervals must be ordered and non-overlapping")
        return self


class ScenarioMetrics(Contract):
    concentration_auc_nM_h: Nonnegative
    occupancy_auc_h: Nonnegative
    endpoint_occupancy: Fraction
    threshold: ThresholdOutcome


class ScenarioSeries(Contract):
    scenario_id: Identifier
    central_concentration_nM: list[Nonnegative]
    target_site_concentration_nM: list[Nonnegative]
    occupancy: list[Fraction]
    metrics: ScenarioMetrics


class SimulationDiagnostics(Contract):
    solver_method: Literal["Radau"]
    relative_tolerance: Positive
    absolute_tolerance: Positive
    total_solver_knots: Annotated[int, Field(ge=2)]
    event_boundaries_h: Annotated[list[Nonnegative], Field(min_length=2)]
    output_point_count: Annotated[int, Field(ge=2, le=5000)]


class SimulationResult(Contract):
    result_id: Identifier
    client_revision: Annotated[int, Field(ge=0)]
    configuration_hash: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    model_version: str
    solver_version: str
    configuration: ExperimentConfig
    time_h: Annotated[list[Nonnegative], Field(min_length=2)]
    scenarios: Annotated[list[ScenarioSeries], Field(min_length=1, max_length=3)]
    diagnostics: SimulationDiagnostics
    warnings: list[str]

    @model_validator(mode="after")
    def aligned_series(self) -> Self:
        if any(b <= a for a, b in zip(self.time_h, self.time_h[1:])):
            raise ValueError("Output times must strictly increase")
        if self.time_h[0] != 0 or not isclose(self.time_h[-1], self.configuration.duration_h):
            raise ValueError("Output must span the configured horizon")
        expected = [s.scenario_id for s in self.configuration.scenarios]
        if [s.scenario_id for s in self.scenarios] != expected:
            raise ValueError("Result scenarios must match the configuration")
        if any(len(values) != len(self.time_h) for s in self.scenarios for values in (s.central_concentration_nM, s.target_site_concentration_nM, s.occupancy)):
            raise ValueError("All series must align with the common timeline")
        if self.diagnostics.output_point_count != len(self.time_h):
            raise ValueError("Diagnostic point count must match the common timeline")
        if any(t not in self.time_h for t in self.diagnostics.event_boundaries_h):
            raise ValueError("All event boundaries must appear in the common timeline")
        return self


class Interpretation(Contract):
    experiment_id: Identifier
    result_id: Identifier
    client_revision: Annotated[int, Field(ge=0)]
    claims: list[str]
    evidence_ids: list[Identifier]
    assumptions: list[str]
    limitations: list[str]
    follow_up_experiments: list[str]


class DrugProfile(Contract):
    drug_id: Identifier
    name: str
    molecular_form: str
    targets: list[str]
    supported_model_ids: list[str]
    supported_routes: list[str]
    reviewed_evidence_ids: list[Identifier]
    pdb_ids: list[str]
    limitations: list[str]


class HealthResponse(Contract):
    status: Literal["ok"] = "ok"
    service: Literal["hypothesim-api"] = "hypothesim-api"
    stage: Literal["research"] = "research"
    simulation_available: Literal[True] = True
    research_available: Literal[True] = True
    ai_credentials_configured: bool
    tracing_credentials_configured: bool
    live_ai_verified: Literal[False] = False


class ContractValidation(Contract):
    valid: Literal[True] = True
    experiment_id: str
    support_status: SupportStatus
    scenario_count: int


ALL_CONTRACTS = [HypothesisRequest, ParsedHypothesis, ExperimentPreparation, SimulationRequest, ControlAdjustment,
                 SimulationResult, Interpretation, DrugProfile]
