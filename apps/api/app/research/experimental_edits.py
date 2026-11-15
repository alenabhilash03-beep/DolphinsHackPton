"""Conservative whole-request edit grammar, applied through existing numerical controls.

Text is parsed completely into structured operations or refused; nothing is applied from a partly
understood request. Server-derived proposals supply the same operations directly.
"""
import re
from uuid import uuid4
from app.schemas.contracts import ControlAdjustment, ExperimentConfig
from app.schemas.experiment_proposals import EditOperation
from app.simulation.controls import adjust_experiment
from app.research.preparation_store import StalePreparation

UNSUPPORTED = ('Clarify the complete edit. Supported forms: double/halve/triple dose, set dose/half-life/affinity with units, '
    'dosing interval, occupancy threshold, fixed-kon affinity comparison, or comparison duration. No instruction was applied.')


def parse_edit(config, text: str, selected_scenario_id: str | None = None):
    """Return ('operations', [EditOperation]) or ('affinity_alternatives', [factors]). The whole text must match."""
    text = text.strip().casefold().rstrip('.?!')
    duration = re.fullmatch(r'run this comparison for (\d+(?:\.\d+)?) (days?|hours?)', text)
    if duration:
        return 'operations', [EditOperation(field='duration_h', value=float(duration[1]) * (24 if duration[2].startswith('day') else 1))]
    threshold = re.fullmatch(r'set the occupancy threshold to (\d+(?:\.\d+)?)\s?(%?)', text)
    if threshold:
        value = float(threshold[1]) / (100 if threshold[2] else 1)
        if not 0 < value < 1: raise ValueError('Choose an occupancy threshold between 0% and 100%')
        return 'operations', [EditOperation(field='occupancy_threshold', value=value)]
    compare = re.fullmatch(r'compare (twofold|\d+(?:\.\d+)?fold) and (fivefold|\d+(?:\.\d+)?fold) affinity improvement at fixed association rate', text)
    if compare:
        factors = [float(word[:-4]) if word not in {'twofold','fivefold'} else {'twofold':2.,'fivefold':5.}[word] for word in compare.groups()]
        if any(f <= 0 for f in factors) or factors[0] == factors[1]: raise ValueError('Choose two distinct positive affinity factors')
        return 'affinity_alternatives', factors
    dose = re.fullmatch(r'(double|triple|halve) the dose in (.+)', text)
    interval = re.fullmatch(r'use (?:a |an )?(\d+(?:\.\d+)?)[- ](day|hour) dosing interval in (.+)', text)
    absolute = re.fullmatch(r'set (dose|half-life|affinity) to (\d+(?:\.\d+)?) (mg|hours?|days?|nm) in (.+)', text)
    phrase = dose[2] if dose else interval[3] if interval else absolute[4] if absolute else None
    if phrase is None: raise ValueError(UNSUPPORTED)
    if phrase in {'that alternative','the selected alternative'}:
        matches = [s for s in config.scenarios[1:] if s.scenario_id == selected_scenario_id]
    elif phrase in {'the affinity alternative','affinity alternative'}:
        matches = [s for s in config.scenarios[1:] if 'affinity' in s.scenario_id or 'affinity' in s.label.casefold()]
    else:
        matches = [s for s in config.scenarios[1:] if phrase in {s.scenario_id.casefold(),s.label.casefold()}]
    if len(matches) != 1: raise ValueError('Specify exactly one alternative scenario; baseline is protected')
    scenario = matches[0]
    if dose:
        amounts = {event.amount_mg for event in scenario.administration}
        if len(amounts) != 1: raise ValueError('Loading and maintenance doses differ; specify an absolute dose per infusion')
        return 'operations', [EditOperation(field='dose_mg', scenario_id=scenario.scenario_id,
            value=next(iter(amounts)) * {'double':2,'triple':3,'halve':0.5}[dose[1]])]
    if interval:
        return 'operations', [EditOperation(field='dosing_interval_h', scenario_id=scenario.scenario_id,
            value=float(interval[1]) * (24 if interval[2]=='day' else 1))]
    field = {'dose':'dose_mg','half-life':'pk.elimination_half_life_h','affinity':'binding.affinity_nM'}[absolute[1]]
    allowed = {'dose':{'mg'},'half-life':{'hour','hours','day','days'},'affinity':{'nm'}}
    if absolute[3] not in allowed[absolute[1]]: raise ValueError('Unit does not match the requested parameter')
    return 'operations', [EditOperation(field=field, scenario_id=scenario.scenario_id,
        value=float(absolute[2]) * (24 if absolute[3].startswith('day') else 1))]


def apply_operations(experiment, operations, revision: int, store):
    """Apply validated control operations in order. Unlisted parameters and the baseline are untouched."""
    changes = []
    for operation in operations:
        experiment = adjust_experiment(ControlAdjustment(experiment=experiment, scenario_id=operation.scenario_id, field=operation.field,
            value=float(operation.value), client_revision=revision), preparation_store=store)
        changes.append(f'{operation.scenario_id or "comparison"}: {operation.field} = {operation.value:g}')
    return experiment, changes


def apply_edit(base, request, store):
    if (base.result_id != request.base_result_id or base.configuration.experiment_id != request.base_experiment_id
            or base.configuration_hash != request.base_configuration_sha256):
        raise StalePreparation('Edit base identifiers/hash do not match the stored result')
    if request.client_revision <= base.client_revision:
        raise StalePreparation('Client revision must advance the stored result')
    exp = base.configuration.model_copy(deep=True)
    proposal_id = getattr(request, 'proposal_id', None)
    if proposal_id:
        # "Run this experiment": the server re-derives the proposal from the stored base; text is only its label.
        from app.research.proposals import find, operations
        kind, payload = 'operations', operations(find(base, proposal_id))
    else:
        kind, payload = parse_edit(exp, request.text, request.selected_scenario_id)
    if kind == 'affinity_alternatives':
        baseline = exp.scenarios[0]
        exp.scenarios = [baseline] + [baseline.model_copy(deep=True, update={'scenario_id':f'affinity-{i}', 'label':f'Affinity improvement ×{f:g}', 'intervention':'custom'}) for i,f in enumerate(payload)]
        if exp.mode == 'research_derived':
            # Clone unchanged, already validated baseline values before applying explicit control edits.
            store.register_control_configuration(base.configuration, ExperimentConfig.model_validate(exp.model_dump()))
        payload = [EditOperation(field='binding.affinity_nM', scenario_id=f'affinity-{i}', value=baseline.binding.affinity_nM/factor) for i,factor in enumerate(payload)]
    exp, changes = apply_operations(exp, payload, request.client_revision, store)
    exp.experiment_id = 'edit-' + uuid4().hex
    exp = ExperimentConfig.model_validate(exp.model_dump())
    if exp.mode == 'research_derived': store.register_control_configuration(base.configuration, exp)
    return exp, changes
