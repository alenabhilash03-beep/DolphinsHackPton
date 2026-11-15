"""Typed follow-up experiments. A proposal is a server-derived, exact set of control changes to one stored result."""
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.contracts import Contract, Identifier
from app.schemas.experiment_preparation import Digest

ControlField = Literal['dose_mg', 'dosing_interval_h', 'pk.volume_L', 'pk.clearance_L_h', 'pk.elimination_half_life_h',
    'binding.association_nM_inv_h_inv', 'binding.dissociation_h_inv', 'binding.affinity_nM', 'exposure_factor',
    'duration_h', 'occupancy_threshold']
ProposalID = Annotated[str, Field(pattern=r'^prop-[a-f0-9]{16}$')]
Sentence = Annotated[str, Field(min_length=1, max_length=500)]


class EditOperation(Contract):
    """One validated control change in the canonical model unit. Global fields omit scenario_id."""
    field: ControlField
    scenario_id: Identifier | None = None
    value: Annotated[float, Field(strict=True)]


class ProposedChange(Contract):
    field: ControlField
    parameter: Annotated[str, Field(max_length=80)]
    scenario_id: Identifier | None = None
    scenario_label: Annotated[str, Field(max_length=200)] | None = None
    unit: Annotated[str, Field(max_length=20)]
    from_value: float | None
    to_value: float
    from_display: Annotated[str, Field(max_length=80)]
    to_display: Annotated[str, Field(max_length=80)]


class ExperimentProposal(Contract):
    proposal_id: ProposalID
    kind: Literal['extend_window', 'stricter_threshold', 'double_dose', 'halve_dose']
    title: Sentence
    observation: Sentence
    rationale: Sentence
    question_tested: Sentence
    base_result_id: Identifier
    base_experiment_id: Identifier
    base_configuration_sha256: Digest
    base_client_revision: Annotated[int, Field(ge=0)]
    changes: Annotated[list[ProposedChange], Field(min_length=1, max_length=3)]
    # The same change in the supported edit language; submitting this text gives the identical experiment.
    edit_text: Sentence
    scope_note: Sentence = 'Changed values are hypothetical design inputs. Unlisted parameters and the baseline scenario are unchanged.'


class ProposalSet(Contract):
    base_result_id: Identifier
    status: Literal['available', 'superseded']
    proposals: Annotated[list[ExperimentProposal], Field(max_length=6)] = Field(default_factory=list)
    note: Sentence | None = None


PROPOSAL_CONTRACTS = [ExperimentProposal, ProposalSet]
