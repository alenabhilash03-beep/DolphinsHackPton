"""Follow-up experiments derived from solver facts of one stored result.

Every proposal is deterministic: a stated solver observation, the question it would test, and exact
control changes. No language model writes them and no parameter outside the listed changes moves.
"""
from hashlib import sha256
import json

from app.research.synthesis import plain
from app.schemas.experiment_proposals import EditOperation, ExperimentProposal, ProposedChange
from app.simulation.registry import MAX_HORIZON_H

LABELS = {'duration_h': 'Observation window', 'occupancy_threshold': 'Occupancy threshold', 'dose_mg': 'Dose per infusion'}
STRICTER = (0.95, 0.99)


def _display(field: str, value: float | None) -> str:
    if value is None:
        return 'not set'
    if field == 'duration_h':
        return f'{plain(value)} h ({plain(value / 24)} days)'
    if field == 'occupancy_threshold':
        return f'{plain(value)} ({plain(value * 100)}%)'
    return f'{plain(value)} mg'


def _in_sentence(name: str) -> str:
    """A scenario name used mid-sentence: "Threefold longer half-life" → "threefold longer half-life"; acronyms keep case."""
    return name[:1].lower() + name[1:] if name[:1].isupper() and not name[1:2].isupper() else name


def _edit_name(scenario, alternatives) -> str:
    """The readable label when the edit parser resolves it to exactly this scenario; otherwise the stable ID."""
    label = scenario.label.strip()
    key = label.casefold()
    unique = sum(key in {item.scenario_id.casefold(), item.label.casefold()} for item in alternatives) == 1
    reserved = key in {'that alternative', 'the selected alternative', 'the affinity alternative', 'affinity alternative'}
    return label if label and unique and not reserved and label == label.rstrip('.?!') else scenario.scenario_id


def operations(proposal: ExperimentProposal) -> list[EditOperation]:
    return [EditOperation(field=change.field, scenario_id=change.scenario_id, value=change.to_value) for change in proposal.changes]


def propose(result) -> list[ExperimentProposal]:
    """At most four proposals, most informative first. Preconditions mirror the control validators."""
    config = result.configuration
    labels = {item.scenario_id: item.label for item in config.scenarios}
    status = {series.scenario_id: series.metrics.threshold.status for series in result.scenarios}
    alternatives = [item for item in config.scenarios[1:] if item.intervention != 'baseline']
    proposals = []

    def add(kind, title, observation, rationale, question, edit_text, field, to_value, from_value, scenario=None):
        change = ProposedChange(field=field, parameter=LABELS[field], scenario_id=scenario.scenario_id if scenario else None,
            scenario_label=scenario.label if scenario else None, unit={'duration_h': 'h', 'occupancy_threshold': '1', 'dose_mg': 'mg'}[field],
            from_value=from_value, to_value=to_value, from_display=_display(field, from_value), to_display=_display(field, to_value))
        identity = json.dumps([result.result_id, result.configuration_hash, field, change.scenario_id, to_value], sort_keys=True)
        proposals.append(ExperimentProposal(proposal_id='prop-' + sha256(identity.encode()).hexdigest()[:16], kind=kind, title=title,
            observation=observation, rationale=rationale, question_tested=question, base_result_id=result.result_id,
            base_experiment_id=config.experiment_id, base_configuration_sha256=result.configuration_hash,
            base_client_revision=result.client_revision, changes=[change], edit_text=edit_text))

    censored = [key for key in status if status[key] == 'still_above_at_horizon']
    names = '; '.join(labels[key] for key in censored)
    window = min(config.duration_h * 2, MAX_HORIZON_H)
    if censored and window > config.duration_h:
        add('extend_window', f'Extend the observation window to {plain(window / 24)} days',
            f'Still above the {plain(config.occupancy_threshold * 100)}% threshold when the {plain(config.duration_h / 24)}-day window ends: {names}.'[:500],
            'Time above threshold is cut off by the window for these scenarios, so their durations cannot be compared yet.',
            'When does each scenario fall below the threshold, and which stays above it longer?',
            f'Run this comparison for {plain(window / 24)} days', 'duration_h', float(window), config.duration_h)
    stricter = next((value for value in STRICTER if value > config.occupancy_threshold + 1e-9), None)
    if len(censored) >= 2 and stricter is not None:
        add('stricter_threshold', f'Raise the occupancy threshold to {plain(stricter * 100)}%',
            f'{len(censored)} scenarios stay above the {plain(config.occupancy_threshold * 100)}% threshold for the whole window: {names}.'[:500],
            'A stricter analytical threshold can separate scenarios that the current one does not distinguish. The curves themselves do not change.',
            f'Do the scenarios still all stay above {plain(stricter * 100)}% occupancy, or do they separate?',
            f'Set the occupancy threshold to {plain(stricter * 100)}%', 'occupancy_threshold', stricter, config.occupancy_threshold)

    def single_dose(scenario):
        """A relative dose change is defined only for infusion schedules with one common amount."""
        amounts = {event.amount_mg for event in scenario.administration}
        return next(iter(amounts)) if len(amounts) == 1 and all(event.kind == 'infusion' for event in scenario.administration) else None

    # single_dose is None or a positive amount here: doubling or halving zero would change nothing.
    low = next((item for item in alternatives if status[item.scenario_id] == 'never_reached' and single_dose(item)), None)
    if low:
        dose = single_dose(low)
        add('double_dose', f'Double the dose in {_in_sentence(low.label)}'[:500],
            f'{low.label} never reaches the {plain(config.occupancy_threshold * 100)}% occupancy threshold in this window.'[:500],
            'Doubling the administered amount tests whether exposure, rather than binding, limits occupancy in this scenario.',
            'Does a doubled dose bring this scenario above the occupancy threshold?',
            f'Double the dose in {_in_sentence(_edit_name(low, config.scenarios[1:]))}', 'dose_mg', dose * 2, dose, low)
    high = next((item for item in alternatives if status[item.scenario_id] == 'still_above_at_horizon' and single_dose(item)), None)
    if high:
        dose = single_dose(high)
        add('halve_dose', f'Halve the dose in {_in_sentence(high.label)}'[:500],
            f'{high.label} stays above the {plain(config.occupancy_threshold * 100)}% occupancy threshold for the whole window.'[:500],
            'Halving the administered amount tests how much margin this scenario has before occupancy drops below the threshold.',
            'Does this scenario still stay above the threshold at half the dose?',
            f'Halve the dose in {_in_sentence(_edit_name(high, config.scenarios[1:]))}', 'dose_mg', dose / 2, dose, high)
    return proposals[:4]


def find(result, proposal_id: str) -> ExperimentProposal:
    """Re-derive the proposal from the stored result; a client never supplies the changes themselves."""
    proposal = next((item for item in propose(result) if item.proposal_id == proposal_id), None)
    if proposal is None:
        raise ValueError('This proposal does not belong to the current result. Reload the proposals for the displayed result.')
    return proposal
