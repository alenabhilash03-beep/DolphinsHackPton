"""Conservative whole-request edit grammar, applied through existing numerical controls."""
import re
from uuid import uuid4
from app.schemas.contracts import ControlAdjustment, ExperimentConfig
from app.simulation.controls import adjust_experiment
from app.research.preparation_store import StalePreparation


def apply_edit(base, request, store):
    if (base.result_id != request.base_result_id or base.configuration.experiment_id != request.base_experiment_id
            or base.configuration_hash != request.base_configuration_sha256):
        raise StalePreparation('Edit base identifiers/hash do not match the stored result')
    if request.client_revision <= base.client_revision:
        raise StalePreparation('Client revision must advance the stored result')
    exp = base.configuration.model_copy(deep=True)
    text = request.text.strip().casefold().rstrip('.?!')
    changes = []
    def adjust(field, value, scenario=None):
        nonlocal exp
        exp = adjust_experiment(ControlAdjustment(experiment=exp, scenario_id=scenario, field=field,
            value=float(value), client_revision=request.client_revision), preparation_store=store)
        changes.append(f'{scenario or "comparison"}: {field} = {value:g}')
    duration = re.fullmatch(r'run this comparison for (\d+(?:\.\d+)?) (days?|hours?)', text)
    compare = re.fullmatch(r'compare (twofold|\d+(?:\.\d+)?fold) and (fivefold|\d+(?:\.\d+)?fold) affinity improvement at fixed association rate', text)
    if duration:
        adjust('duration_h', float(duration[1]) * (24 if duration[2].startswith('day') else 1))
    elif compare:
        factors = [float(word[:-4]) if word not in {'twofold','fivefold'} else {'twofold':2.,'fivefold':5.}[word] for word in compare.groups()]
        if any(f <= 0 for f in factors) or factors[0] == factors[1]: raise ValueError('Choose two distinct positive affinity factors')
        baseline = exp.scenarios[0]
        exp.scenarios = [baseline] + [baseline.model_copy(deep=True, update={'scenario_id':f'affinity-{i}', 'label':f'Affinity improvement ×{f:g}', 'intervention':'custom'}) for i,f in enumerate(factors)]
        if exp.mode == 'research_derived':
            # Clone unchanged, already validated baseline values before applying explicit control edits.
            store.register_control_configuration(base.configuration, ExperimentConfig.model_validate(exp.model_dump()))
        for i,factor in enumerate(factors): adjust('binding.affinity_nM', baseline.binding.affinity_nM/factor, f'affinity-{i}')
    else:
        dose = re.fullmatch(r'(double|triple) the dose in (.+)', text)
        interval = re.fullmatch(r'use (?:a |an )?(\d+(?:\.\d+)?)[- ](day|hour) dosing interval in (.+)', text)
        absolute = re.fullmatch(r'set (dose|half-life|affinity) to (\d+(?:\.\d+)?) (mg|hours?|days?|nm) in (.+)', text)
        phrase = dose[2] if dose else interval[3] if interval else absolute[4] if absolute else None
        if phrase is None: raise ValueError('Clarify the complete edit. Supported forms: double/triple dose, set dose/half-life/affinity with units, dosing interval, fixed-kon affinity comparison, or comparison duration. No instruction was applied.')
        if phrase in {'that alternative','the selected alternative'}:
            matches = [s for s in exp.scenarios[1:] if s.scenario_id == request.selected_scenario_id]
        elif phrase in {'the affinity alternative','affinity alternative'}:
            matches = [s for s in exp.scenarios[1:] if 'affinity' in s.scenario_id or 'affinity' in s.label.casefold()]
        else:
            matches = [s for s in exp.scenarios[1:] if phrase in {s.scenario_id.casefold(),s.label.casefold()}]
        if len(matches) != 1: raise ValueError('Specify exactly one alternative scenario; baseline is protected')
        scenario = matches[0]
        if dose:
            amounts = {event.amount_mg for event in scenario.administration}
            if len(amounts) != 1: raise ValueError('Loading and maintenance doses differ; specify an absolute dose per infusion')
            adjust('dose_mg', next(iter(amounts)) * (2 if dose[1]=='double' else 3), scenario.scenario_id)
        elif interval: adjust('dosing_interval_h', float(interval[1]) * (24 if interval[2]=='day' else 1), scenario.scenario_id)
        else:
            field = {'dose':'dose_mg','half-life':'pk.elimination_half_life_h','affinity':'binding.affinity_nM'}[absolute[1]]
            allowed = {'dose':{'mg'},'half-life':{'hour','hours','day','days'},'affinity':{'nm'}}
            if absolute[3] not in allowed[absolute[1]]: raise ValueError('Unit does not match the requested parameter')
            adjust(field, float(absolute[2]) * (24 if absolute[3].startswith('day') else 1), scenario.scenario_id)
    exp.experiment_id = 'edit-' + uuid4().hex
    exp = ExperimentConfig.model_validate(exp.model_dump())
    if exp.mode == 'research_derived': store.register_control_configuration(base.configuration, exp)
    return exp, changes
