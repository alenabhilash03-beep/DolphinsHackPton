"""Deterministic preparation and configuration in implemented equations; no LLM calls."""
from datetime import datetime, timezone
import json
import re
from math import isclose, log
from uuid import uuid4

from app.config import ROOT, Settings
from app.research.drug_identity import DrugAssessmentService
from app.research.parameter_extraction import _contains_number, _contains_unit, _scalar_passage
from app.research.preparation_store import PreparationStore, StalePreparation, canonical_hash
from app.research.preparation_units import normalize_parameter
from app.research.source_documents import SourceDocumentService
from app.schemas.contracts import (
    Assumption, BindingParameters, EvidenceSource, ExperimentConfig, MODEL_ID, PKParameters,
    ParameterEvidence, ParsedHypothesis, ScenarioConfig, SupportAssessment,
)
from app.schemas.drug_support import DrugAssessmentRequest
from app.schemas.experiment_preparation import (
    MissingPreparationInput, PreparationCheck, PreparationParameter,
    ResearchPreparation, validate_preparation_transition,
)
from app.schemas.preparation_workflow import (
    ConfiguredPreparation, CreatePreparation, PreparationRecord, PreparationUpdate, PreparationVersion,
)
from app.simulation.capabilities import get_preparation_requirements
from app.simulation.registry import validate_model_scope

REQUIREMENTS = get_preparation_requirements(MODEL_ID)
UNITS = REQUIREMENTS.required_parameters
PK_FIELDS = ['pk.volume_L', 'pk.clearance_L_h', 'pk.elimination_half_life_h']
BINDING_FIELDS = ['binding.association_nM_inv_h_inv', 'binding.dissociation_h_inv', 'binding.affinity_nM']


def default_preparation_store() -> PreparationStore:
    config = Settings()
    return PreparationStore(config.preparation_db_path or ROOT / 'work/preparations.sqlite3')


def _norm(value: str | None) -> str:
    return ' '.join((value or '').casefold().split())


def _mention(phrase: str, text: str) -> bool:
    return bool(phrase and re.search(r'(?<!\w)' + re.escape(_norm(phrase)) + r'(?!\w)', _norm(text)))


def _route(value: str | None) -> str:
    key = _norm(value).replace('_', ' ').replace('-', ' ')
    return {'iv infusion':'iv_infusion', 'intravenous infusion':'iv_infusion',
            'iv bolus':'hypothetical_iv_bolus', 'hypothetical iv bolus':'hypothetical_iv_bolus',
            'intravenous bolus':'hypothetical_iv_bolus'}.get(key, key)


def evidence_digest(record: PreparationRecord) -> str:
    # Canonical scientific inputs and outputs, excluding mutable workflow presentation.
    prep = record.preparation
    return canonical_hash({
        'request':prep.request.model_dump(mode='json'), 'drug_identifier':prep.resolved_drug_identifier,
        'target_identifier':prep.resolved_target_identifier, 'identity_status':record.identity_status,
        'identity_form':record.identity_molecular_form, 'identity_rationale':record.identity_rationale,
        'identity_assessment':record.identity_assessment.model_dump(mode='json') if record.identity_assessment else None,
        'scope':record.scope.model_dump(mode='json') if record.scope else None,
        'design':record.design.model_dump(mode='json') if record.design else None,
        'sources':[item.model_dump(mode='json') for item in prep.sources],
        'parameters':[item.model_dump(mode='json') for item in prep.parameters],
        'selections':prep.selected_parameters, 'input_selections':record.input_selections,
        'model_id':prep.model_id,
    })


class PreparationService:
    def __init__(self, store: PreparationStore | None = None, documents: SourceDocumentService | None = None,
                 assessment: DrugAssessmentService | None = None):
        self.store = store or default_preparation_store()
        self.documents = documents or SourceDocumentService(cache_dir=ROOT / 'work/evidence-snapshots')
        self.assessment = assessment or DrugAssessmentService()

    def _identify(self, record: PreparationRecord):
        request = record.preparation.request
        result = self.assessment.assess(DrugAssessmentRequest(
            drug_name=request.drug_name, target=request.target, molecular_form=request.molecular_form,
            route=request.route, endpoint=request.endpoint, original_hypothesis=request.original_hypothesis))
        record.identity_assessment = result
        record.identity_status = result.identity_status
        record.identity_retrieval_status = result.retrieval_status
        identity = result.resolved_identity
        record.identity_aliases = [request.drug_name]
        record.identity_molecular_form = None
        record.preparation.resolved_drug_identifier = None
        record.preparation.resolved_target_identifier = request.target
        if identity:
            record.preparation.resolved_drug_identifier = identity.identifiers.get('chembl_id')
            record.identity_aliases.extend([identity.canonical_name, *identity.aliases])
            record.identity_molecular_form = identity.molecular_form
        # 7A profile eligibility does not gate this generic implemented-model path.
        # No registry PK/binding values are copied into a new preparation.

    def create(self, creation: CreatePreparation) -> PreparationRecord:
        now = datetime.now(timezone.utc)
        record = PreparationRecord(created_at=now, updated_at=now, identity_status='unavailable', identity_retrieval_status='unavailable',
            preparation=ResearchPreparation(preparation_id='prep-' + uuid4().hex, revision=0,
                request=creation.request, state='researching', path='research_derived', model_id=MODEL_ID,
                evidence_sha256='0'*64, reasons=['Preparing structured model inputs; no research has run.'],
                limitations=list(REQUIREMENTS.limitations)))
        self._identify(record)
        result = self._evaluate(record)
        self.store.save(result)
        return result

    def _documents(self, ids: list[str]):
        snapshots = []
        replay = SourceDocumentService(cache_dir=self.documents.cache_dir)
        for key in ids:
            try:
                document = self.documents.get(key)
            except ValueError:
                document = replay.restore(key)
            snapshots.append(document)
        return snapshots

    def _validate_reported(self, item: PreparationParameter, snapshots):
        sources = {doc.source.source_id: doc for doc in snapshots}
        if item.value != item.original_value or item.unit != item.original_unit:
            raise ValueError('Submit original source values and units; only the server performs normalization')
        scalar_supported = False
        publications = set()
        for passage in item.passages:
            document = sources.get(passage.source_id)
            segments = {s.locator:s.text for s in document.segments} if document else {}
            if passage.locator not in segments or passage.supporting_passage not in segments[passage.locator]:
                raise ValueError('Reported parameter must cite a verified server snapshot and exact passage')
            scalar_supported = scalar_supported or (_contains_number(passage.supporting_passage,item.original_value) and _contains_unit(passage.supporting_passage,item.original_unit) and _scalar_passage(passage.supporting_passage))
            publications.add(next((f'{kind}:{document.source.identifiers[kind]}' for kind in ('pmid','doi','pmcid') if document.source.identifiers.get(kind)),str(document.source.url)))
        if not scalar_supported:
            raise ValueError('Reported scalar number/unit not found in a verified passage; bounds and ranges are not scalar inputs')
        if len(publications)>1:
            raise ValueError('Reported value and context must belong to the same publication; cross-source transfer requires an explicit assumption')
        # Context is source data, not a caller-asserted applicability flag.
        text = ' '.join(p.supporting_passage for p in item.passages)
        for key in ('species','molecular_form','experimental_system','assay_conditions','formulation','route','exposure_compartment'):
            value = getattr(item.context, key)
            exact_context = bool(value and re.search(r'(?<!\w)' + re.escape(' '.join(value.split())) + r'(?!\w)', ' '.join(text.split())))
            matches = _mention(value,text) if key in {'species','molecular_form'} else exact_context
            if value and not matches:
                raise ValueError(f'Reported {key} is not supported by the cited passage')

    def revise(self, preparation_id: str, update: PreparationUpdate) -> PreparationRecord:
        before = self.store.read(preparation_id)
        prep = before.preparation
        if (prep.revision, prep.evidence_sha256) != (update.base_revision, update.base_evidence_sha256):
            raise StalePreparation('Preparation changed; reload before applying this update')
        record = before.model_copy(deep=True)
        record.updated_at = datetime.now(timezone.utc)
        if update.scope:
            record.scope = update.scope
        if update.design:
            record.design = update.design
        pending = {item.input_id for item in prep.missing_inputs}
        for key, answer in update.answers.items():
            if key not in pending or key not in {'drug_name','molecular_form','target','route','identity_retry'}:
                raise ValueError('Text answers must match an outstanding identity/target/route question; supply typed parameters for numbers')
            if key != 'identity_retry':
                record.preparation.request = record.preparation.request.model_copy(update={key:answer})
        if set(update.answers) & {'drug_name','molecular_form','identity_retry'}:
            self._identify(record)
        record.preparation.resolved_target_identifier = record.preparation.request.target
        if update.declare_hypothetical_identity:
            if record.identity_status not in {'unavailable','ambiguous','not_found','researcher_declared'}:
                raise ValueError('An identified drug must retain its resolved identity')
            record.identity_status = 'researcher_declared'
            record.identity_retrieval_status = 'researcher_declared'
            record.identity_rationale = update.identity_rationale
            record.preparation.resolved_drug_identifier = 'user:' + canonical_hash(_norm(record.preparation.request.drug_name))[:24]
            record.identity_molecular_form = record.scope.molecular_form if record.scope else record.preparation.request.molecular_form
        record.document_ids = list(dict.fromkeys([*record.document_ids, *update.document_ids]))
        if len(record.document_ids) > 20:
            raise ValueError('Preparation snapshot limit reached')
        snapshots = self._documents(record.document_ids)
        inputs = {item.parameter_id:item for item in record.input_parameters}
        for incoming in update.parameters:
            item = incoming.model_copy(deep=True)
            if item.parameter not in UNITS or item.provenance == 'calculated':
                raise ValueError('Only original reported values or explicit researcher assumptions are accepted; calculations run server-side')
            item.applicability = 'candidate'
            if item.value != item.original_value or item.unit != item.original_unit:
                raise ValueError('Submit one original value/unit pair; normalization is performed by the server')
            if item.provenance == 'reported':
                self._validate_reported(item, snapshots)
            elif item.passages:
                documents={doc.source.source_id:doc for doc in snapshots}
                for passage in item.passages:
                    document=documents.get(passage.source_id)
                    if document is None or not any(segment.locator==passage.locator and passage.supporting_passage in segment.text for segment in document.segments):
                        raise ValueError('Assumption citations must also match an exact server snapshot passage')
            if item.parameter_id in inputs and inputs[item.parameter_id] != item:
                raise ValueError('Parameter records are immutable; use a new ID for an override')
            inputs[item.parameter_id] = item
        if len(inputs) > 100:
            raise ValueError('Preparation parameter limit reached')
        if record.identity_status == 'researcher_declared' and any(item.provenance != 'researcher_assumed' for item in inputs.values()):
            raise ValueError('Unverified hypothetical identities require explicitly assumed parameters, not asserted drug measurements')
        record.input_parameters = list(inputs.values())
        for field, key in update.selected_parameters.items():
            if field not in UNITS or (key is not None and (key not in inputs or inputs[key].parameter != field)):
                raise ValueError('Selection must reference an existing candidate for the same model field')
            record.input_selections[field] = key
        data = record.preparation.model_dump(mode='python')
        data.update(state='researching', revision=prep.revision+1, checks=[], missing_inputs=[],
            sources=[doc.source for doc in snapshots], parameters=record.input_parameters,
            selected_parameters={k:v for k,v in record.input_selections.items() if v is not None},
            assumptions=[], reasons=['Revalidating updated structured evidence and experiment inputs.'])
        record.preparation = ResearchPreparation.model_validate(data)
        record.preparation.evidence_sha256 = evidence_digest(record)
        validate_preparation_transition(prep, record.preparation)
        final = self._evaluate(record.model_copy(deep=True))
        final.preparation.revision += 1
        validate_preparation_transition(record.preparation, final.preparation)
        self.store.save_chain([record, final], prep.revision, prep.evidence_sha256)
        return final

    def _evaluate(self, record: PreparationRecord) -> PreparationRecord:
        prep = record.preparation
        missing = {}
        failures = []
        checks = {}
        def issue(key, parameter, reason, resolution='provide_value_or_assumption'):
            missing[key] = MissingPreparationInput(input_id=key, parameter=parameter, reason=reason,
                expected_unit=UNITS.get(parameter), question=reason, permitted_resolution=resolution)
        def check(name, outcome, reason):
            checks[name] = PreparationCheck(check=name, outcome=outcome, reasons=[reason])
        req = prep.request
        if (req.route and req.route not in REQUIREMENTS.routes and _norm(req.route) not in {'iv','intravenous','bloodstream'}) or req.endpoint not in REQUIREMENTS.endpoints:
            prep.state = 'unsupported'
            prep.reasons = ['Requested route or endpoint has no applicable implemented model.']
            prep.missing_inputs = []
            prep.checks = []
            prep.evidence_sha256 = evidence_digest(record)
            return record
        if not prep.resolved_drug_identifier:
            prep.state = 'source_unavailable' if record.identity_status == 'unavailable' else 'identity_clarification'
            key = 'identity_retry' if record.identity_status == 'unavailable' else 'drug_name'
            issue(key, 'drug identity', 'Supply an unambiguous name/form or explicitly declare a hypothetical identity.', 'clarify_identity')
            prep.missing_inputs = list(missing.values())
            prep.reasons = ['No unambiguous database identity; no scientific identity was inferred.']
            prep.evidence_sha256 = evidence_digest(record)
            return record
        check('identity','conditional','Drug identity resolved or explicitly researcher-declared; target remains scientist-declared, not database-validated.')
        if not req.target:
            issue('target','target identity','Name the target for this conditional model.', 'clarify_identity')
        if not req.route or req.route not in REQUIREMENTS.routes:
            issue('route','administration route','Specify IV infusion or explicit hypothetical IV bolus.', 'clarify_scope')
        scope = record.scope
        if scope is None:
            issue('scope','model scope','Declare molecular form, species, binding/PK regimes, competition and target compartment.', 'clarify_scope')
        elif (scope.binding_regime in {'irreversible','cooperative'} or scope.pk_regime == 'other' or scope.competition == 'requires_explicit_model'):
            prep.state='unsupported'
            prep.reasons=['Requested binding, PK or competition mechanism requires an unimplemented model.']
            prep.missing_inputs=[]
            prep.checks=[]
            prep.evidence_sha256=evidence_digest(record)
            return record
        elif scope.binding_regime == 'unknown' or scope.pk_regime == 'unknown' or scope.competition == 'unknown':
            issue('scope','model scope','Clarify PK/binding regime and competition; unknown mechanism does not confer model suitability.', 'clarify_scope')
        if scope and record.identity_status=='researcher_declared' and record.identity_molecular_form is None:
            record.identity_molecular_form=scope.molecular_form
        if scope and _norm(scope.molecular_form) != _norm(record.identity_molecular_form):
            issue('molecular_form','molecular form','Declared form does not match the resolved identity; clarify the identity/form.', 'clarify_identity')
        if not record.design:
            issue('design','administration and duration','Provide the administration schedule, duration and experimental design rationale.', 'clarify_scope')
        elif record.design.duration_h > REQUIREMENTS.maximum_duration_h or any(event.start_h > record.design.duration_h for event in record.design.administration):
            failures.append('Design exceeds the model horizon or includes a dose outside the observation window.')
        if record.design and req.route in REQUIREMENTS.routes:
            expected_kind='infusion' if req.route=='iv_infusion' else 'hypothetical_bolus'
            if any(event.kind!=expected_kind for event in record.design.administration):
                failures.append('Administration events conflict with the explicitly declared route.')
        original = {item.parameter_id:item.model_copy(deep=True) for item in record.input_parameters}
        working = dict(original)
        selected = {}
        chosen_raw = {}
        snapshots = {doc.source.source_id:doc for doc in self._documents(record.document_ids)}
        for field, unit in UNITS.items():
            choices = [item for item in original.values() if item.parameter == field]
            key = record.input_selections.get(field)
            if key is None and field not in record.input_selections and len(choices) == 1:
                key = choices[0].parameter_id
            if not key:
                if len(choices) > 1 and field not in record.input_selections:
                    issue('select:'+field, field, 'Competing measurements require an explicit candidate selection or assumption override.')
                continue
            item = working[key]
            chosen_raw[field] = key
            try:
                value, factor = normalize_parameter(item.original_value, item.original_unit, unit)
            except ValueError as exc:
                issue('unit:'+field, field, str(exc)); continue
            if value < 0 or value == 0 and field != 'exposure_factor':
                failures.append(f'{field} is outside the implemented positive-parameter domain.'); continue
            ctx = item.context
            if ctx.drug_identifier != prep.resolved_drug_identifier or ctx.target_identifier not in {None,req.target}:
                issue('context:'+field,field,'Selected candidate identity conflicts with the resolved drug or declared target.'); continue
            if scope:
                if item.provenance == 'researcher_assumed':
                    for name, default in [('species',scope.species),('molecular_form',scope.molecular_form)]:
                        if getattr(ctx,name) is None:
                            setattr(ctx,name,default)
                            ctx.applicability_notes.append(f'{name} supplied by the explicitly declared hypothetical scope.')
                if _norm(ctx.molecular_form) != _norm(scope.molecular_form):
                    issue('context:'+field,field,'Candidate molecular form is missing or incompatible; retrieve matching evidence or supply an explicit assumption.'); continue
                if field != 'molecular_weight_g_mol' and _norm(ctx.species) != _norm(scope.species):
                    issue('context:'+field,field,'Candidate species is missing or conflicts with the declared experiment.'); continue
                if field in BINDING_FIELDS:
                    if ctx.target_identifier != req.target:
                        issue('context:'+field,field,'Binding evidence must identify the declared target.'); continue
                    if item.provenance == 'reported' and (not ctx.experimental_system or not ctx.assay_conditions):
                        issue('context:'+field,field,'Reported binding requires explicit experimental system and assay conditions.'); continue
                    if item.provenance == 'reported' and any('ic50' in _norm(p.supporting_passage) for p in item.passages):
                        issue('context:'+field,field,'IC50-containing evidence needs separate parameter-meaning review; it cannot automatically become KD or a kinetic rate.'); continue
                if field in PK_FIELDS and item.provenance == 'reported':
                    if not ctx.experimental_system or _route(ctx.route) not in REQUIREMENTS.routes:
                        issue('context:'+field,field,'Reported PK requires a population/system and explicit IV context; oral apparent CL/F or V/F cannot be transferred.'); continue
                    if any('cl/f' in _norm(p.supporting_passage) or 'v/f' in _norm(p.supporting_passage) for p in item.passages):
                        issue('context:'+field,field,'Apparent oral parameters are not central IV distribution/clearance values.'); continue
                if field == 'exposure_factor':
                    if ctx.exposure_compartment is None and item.provenance == 'researcher_assumed':
                        ctx.exposure_compartment=scope.target_compartment
                        ctx.applicability_notes.append('Target compartment supplied by the explicit hypothetical scope.')
                    if _norm(ctx.exposure_compartment) != scope.target_compartment:
                        issue('context:'+field,field,'Exposure factor requires an explicit matching target compartment; IV input does not establish intracellular exposure.'); continue
            if item.provenance == 'reported':
                qualifiers=r'(?:mesylate|hydrochloride|sulfate|sulphate|phosphate|acetate|maleate|tartrate|hydrate)'
                form_pattern=r'(?<!\w)' + re.escape(_norm(record.identity_molecular_form)) + r'\s+' + qualifiers + r'(?!\w)'
                if record.identity_molecular_form and any(re.search(form_pattern,_norm(p.supporting_passage)) for p in item.passages):
                    issue('context:'+field,field,'Source names a distinct salt/form beyond the resolved identity; no parent/salt transfer is inferred.'); continue
                texts = [' '.join(s.text for s in snapshots[p.source_id].segments) for p in item.passages]
                if not any(_mention(alias,text) for alias in record.identity_aliases if len(alias)>=3 for text in texts):
                    issue('identity:'+field,field,'Source snapshot does not mention the requested drug identity/alias.'); continue
                if field in BINDING_FIELDS and not any(_mention(req.target,text) for text in texts):
                    issue('context:'+field,field,'Binding source does not mention the declared target; source identity labels alone are insufficient.'); continue
            item.applicability='conditional'
            if factor != 1 or item.original_unit != unit:
                normalized = PreparationParameter(parameter_id='norm-'+canonical_hash([key,unit,factor])[:24],
                    parameter=field,value=value,unit=unit,original_value=value,original_unit=unit,
                    normalization=f'Server unit conversion: input * {factor!r}',provenance='calculated',
                    parent_ids=[key],formula=f'input * {factor!r}',context=ctx.model_copy(deep=True),applicability='conditional')
                working[normalized.parameter_id]=normalized
                selected[field]=normalized.parameter_id
            else:
                selected[field]=key
        def derive(field, parents, value, formula):
            item = PreparationParameter(parameter_id='derive-'+canonical_hash([field,parents,value])[:24],
                parameter=field,value=value,unit=UNITS[field],original_value=value,original_unit=UNITS[field],
                normalization='Server-calculated linked model parameter',provenance='calculated',
                parent_ids=[selected[parent] for parent in parents],formula=formula,
                context=working[selected[parents[0]]].context.model_copy(deep=True),applicability='conditional')
            working[item.parameter_id]=item
            selected[field]=item.parameter_id
        def value(field):
            return working[selected[field]].value
        if all(field in selected for field in PK_FIELDS[:2]) and PK_FIELDS[2] not in selected and 'select:'+PK_FIELDS[2] not in missing:
            derive(PK_FIELDS[2],PK_FIELDS[:2],log(2)*value(PK_FIELDS[0])/value(PK_FIELDS[1]),'ln(2) * volume / clearance')
        elif PK_FIELDS[0] in selected and PK_FIELDS[2] in selected and PK_FIELDS[1] not in selected and 'select:'+PK_FIELDS[1] not in missing:
            derive(PK_FIELDS[1],[PK_FIELDS[0],PK_FIELDS[2]],log(2)*value(PK_FIELDS[0])/value(PK_FIELDS[2]),'ln(2) * volume / half_life')
        if all(field in selected for field in BINDING_FIELDS[:2]) and BINDING_FIELDS[2] not in selected and 'select:'+BINDING_FIELDS[2] not in missing:
            derive(BINDING_FIELDS[2],BINDING_FIELDS[:2],value(BINDING_FIELDS[1])/value(BINDING_FIELDS[0]),'koff / kon')
        for fields, label in [(PK_FIELDS,'PK population'),(BINDING_FIELDS,'binding assay')]:
            reported = [original[chosen_raw[field]] for field in fields if field in selected
                and field in chosen_raw and original[chosen_raw[field]].provenance == 'reported']
            def publication_key(item):
                keys=[]
                for passage in item.passages:
                    source=snapshots[passage.source_id].source
                    key=next((f'{kind}:{source.identifiers[kind]}' for kind in ('pmid','doi','pmcid') if source.identifiers.get(kind)),str(source.url))
                    keys.append(key)
                return tuple(sorted(set(keys)))
            contexts = {(item.context.species,item.context.molecular_form,item.context.experimental_system,item.context.assay_conditions,publication_key(item)) for item in reported}
            if len(contexts) > 1:
                failures.append(f'Selected {label} evidence has incompatible contexts; numerical agreement alone is insufficient.')
        if all(field in selected for field in PK_FIELDS):
            if not isclose(value(PK_FIELDS[2]), log(2)*value(PK_FIELDS[0])/value(PK_FIELDS[1]), rel_tol=1e-6):
                failures.append('PK parameters violate half_life = ln(2) * volume / clearance.')
        if all(field in selected for field in BINDING_FIELDS):
            if not isclose(value(BINDING_FIELDS[2]),value(BINDING_FIELDS[1])/value(BINDING_FIELDS[0]),rel_tol=1e-6):
                failures.append('Binding parameters violate KD = koff / kon; KD alone cannot invent kinetic rates.')
        for field in UNITS:
            if field not in selected and not any(item.parameter==field for item in missing.values()):
                issue('parameter:'+field,field,'Provide compatible source evidence or an explicit hypothetical value with units and rationale.')
        prep.path = 'research_derived' if not selected or any(original[key].provenance=='reported' for field,key in chosen_raw.items() if field in selected) else 'researcher_specified'
        prep.parameters=list(working.values())
        prep.selected_parameters=selected
        prep.assumptions=[scope.rationale] if scope else []
        if record.identity_rationale:
            prep.assumptions.append('Researcher-declared hypothetical identity: '+record.identity_rationale)
        if record.design:
            prep.assumptions.append(record.design.rationale)
            prep.assumptions.append(f'Explicit initial conditions: {record.design.initial_amount_nmol} nmol and occupancy {record.design.initial_occupancy}.')
        prep.assumptions.extend(item.rationale for item in record.input_parameters if item.provenance=='researcher_assumed' and item.rationale)
        prep.assumptions.append('Prescribed target-site exposure, fixed nondepleting sites and conditional assay-to-model transfer; no calibrated clinical efficacy, intracellular transport or explicit competition model.')
        for name, reason in {
            'provenance':'Cited values checked against server snapshots; assumptions retain researcher provenance.',
            'units':'Selected parameters use explicit server conversion rules; unsupported units require clarification.',
            'parameter_domains':'Positive finite model inputs and bounded design required.',
            'binding_consistency':'Kinetic pair required; KD is derived or checked, never used alone to invent rates.',
            'pk_consistency':'Linear-effective half-life/clearance relationship checked.',
            'assay_compatibility':'Species/form/target/context checked; hypothetical composites remain assumptions.',
            'route':'Only explicit IV infusion or hypothetical IV bolus implemented.',
            'exposure':'Target compartment/factor explicitly supplied; no plasma-to-cell inference.',
            'endpoint':'Target occupancy only; no clinical effect prediction.',
        }.items():
            check(name,'not_checked' if missing or failures else 'conditional',reason)
        prep.missing_inputs=list(missing.values())
        prep.checks=list(checks.values())
        prep.state='failed_validation' if failures else ('needs_inputs' if missing else 'ready_for_configuration')
        prep.reasons=failures or (['Missing/ambiguous structured inputs; no experiment configured.'] if missing else ['Conditional model configuration can be constructed from these structured inputs; not independently scientifically validated.'])
        prep.limitations=[*REQUIREMENTS.limitations,'Natural-language hypothesis is preserved but not parsed by this service; this configures one structured baseline only.',
            'Readiness checks do not establish biological validity, efficacy, safety or expert review. Target identity is scientist-declared.']
        if record.identity_retrieval_status=='cached_degraded':
            prep.limitations.append('Drug identity uses a cached database record; no fresh identity lookup was confirmed. Original identity retrieval metadata is retained.')
        if record.identity_status=='researcher_declared':
            prep.limitations.append('Drug identity is explicitly researcher-declared and has no verified database identity.')
        if any(source.retrieval_status=='cached' for source in prep.sources):
            prep.limitations.append('Some parameter passages use cached source snapshots; original retrieval times are retained.')
        prep.evidence_sha256=evidence_digest(record)
        # Apply cross-record contract checks after deterministic evaluation, never trust caller flags.
        record=PreparationRecord.model_validate(record.model_dump(mode='python'))
        if record.preparation.state=='ready_for_configuration':
            try:
                candidate=self._build_configuration(record)
                validate_model_scope(candidate)
            except ValueError as exc:
                data=record.preparation.model_dump(mode='python')
                data.update(state='failed_validation',reasons=[f'Configuration validation failed: {exc}'])
                for check_result in data['checks']:
                    if check_result['check']=='parameter_domains':
                        check_result.update(outcome='fail',reasons=[str(exc)])
                record.preparation=ResearchPreparation.model_validate(data)
        return record

    def configure(self, preparation_id: str, version: PreparationVersion) -> ConfiguredPreparation:
        record=self.store.read(preparation_id)
        prep=record.preparation
        if (prep.revision,prep.evidence_sha256)!=(version.base_revision,version.base_evidence_sha256):
            raise StalePreparation('Preparation changed; reload before configuration')
        if evidence_digest(record)!=prep.evidence_sha256 or prep.state!='ready_for_configuration':
            raise ValueError('Preparation is not ready for configuration')
        # Re-check snapshot integrity and all stored inputs; do not trust cached checks/state alone.
        snapshots=self._documents(record.document_ids)
        expected={source.source_id:source.snapshot_sha256 for source in prep.sources}
        for document in snapshots:
            versions={document.source.snapshot_sha256,document.original_snapshot_sha256}
            if not expected.get(document.source.source_id) or expected[document.source.source_id] not in versions:
                raise ValueError('Source snapshot version changed; create a new evidence revision before configuration')
        for item in record.input_parameters:
            if item.provenance=='reported':
                self._validate_reported(item,snapshots)
        checked=self._evaluate(record.model_copy(deep=True))
        if checked.preparation.state!='ready_for_configuration' or evidence_digest(checked)!=prep.evidence_sha256:
            raise ValueError('Preparation no longer passes applicability validation')
        experiment=self._build_configuration(record)
        validate_model_scope(experiment)
        digest=self.store.register_configuration(record,experiment)
        return ConfiguredPreparation(original_hypothesis=prep.request.original_hypothesis,preparation_id=preparation_id,preparation_revision=prep.revision,
            evidence_sha256=prep.evidence_sha256,configuration_sha256=digest,experiment=experiment,
            classification='conditional_researcher_specified' if prep.path=='researcher_specified' else 'conditional_research_derived')

    def _build_configuration(self, record: PreparationRecord) -> ExperimentConfig:
        prep=record.preparation
        design=record.design
        if not design:
            raise ValueError('Experiment design required')
        evidence=[]
        for item in prep.parameters:
            context={key:str(value) for key,value in item.context.model_dump(mode='json').items() if value is not None}
            context.update(preparation_id=prep.preparation_id,preparation_revision=str(prep.revision),evidence_sha256=prep.evidence_sha256,
                source_passages=json.dumps([p.model_dump(mode='json') for p in item.passages],sort_keys=True),
                source_snapshots=json.dumps({source.source_id:{'sha256':source.snapshot_sha256,'retrieval_status':source.retrieval_status,'retrieved_at':source.retrieved_at.isoformat()}
                    for source in prep.sources if source.source_id in {passage.source_id for passage in item.passages}},sort_keys=True))
            evidence.append(ParameterEvidence(evidence_id=item.parameter_id,parameter=item.parameter,value=item.value,unit=item.unit,
                original_value=item.original_value,original_unit=item.original_unit,normalization=item.normalization,
                provenance='user_supplied' if item.provenance=='researcher_assumed' else item.provenance,
                estimate_type='design_input' if item.provenance=='researcher_assumed' else ('derivation' if item.provenance=='calculated' else 'source_reported'),
                review_status='candidate', applicability='conditional_transfer' if item.applicability=='conditional' else 'not_applicable', source_ids=list(dict.fromkeys(p.source_id for p in item.passages)),
                locator=json.dumps([p.model_dump(mode='json') for p in item.passages]) if item.passages else None,
                parent_ids=item.parent_ids,formula=item.formula,rationale=item.rationale,entered_at=item.entered_at,context=context))
        refs=dict(prep.selected_parameters)
        for index,event in enumerate(design.administration):
            key=f'design-dose-{index}'
            evidence.append(ParameterEvidence(evidence_id=key,parameter='dose',value=event.amount_mg,unit='mg',
                original_value=event.amount_mg,original_unit='mg',normalization='Structured experiment design in mg',
                provenance='user_supplied',estimate_type='design_input',review_status='candidate',applicability='conditional_transfer',
                rationale=design.rationale,entered_at=record.updated_at))
            refs[f'administration.{index}.amount_mg']=key
        values={field:next(item.value for item in prep.parameters if item.parameter_id==key) for field,key in prep.selected_parameters.items()}
        assumptions=[Assumption(assumption_id=f'assumption-{index}',description=text) for index,text in enumerate(prep.assumptions)]
        scenario=ScenarioConfig(scenario_id='baseline',label='Conditional structured baseline',intervention='baseline',
            pk=PKParameters(**{key.split('.')[1]:values[key] for key in PK_FIELDS}),
            binding=BindingParameters(**{key.split('.')[1]:values[key] for key in BINDING_FIELDS}),
            molecular_weight_g_mol=values['molecular_weight_g_mol'],body_mass_kg=values['body_mass_kg'],exposure_factor=values['exposure_factor'],
            initial_amount_nmol=design.initial_amount_nmol,initial_occupancy=design.initial_occupancy,
            administration=design.administration,assumption_ids=[item.assumption_id for item in assumptions],parameter_evidence=refs)
        return ExperimentConfig(experiment_id=f'{prep.preparation_id}-r{prep.revision}',title='Conditional baseline from structured evidence and assumptions',
            mode='research_derived',support=SupportAssessment(status='conditional',reasons=prep.reasons),
            drug=prep.request.drug_name,target=prep.request.target or '',
            hypothesis=ParsedHypothesis(drug=prep.request.drug_name,target=prep.request.target,interventions=['structured_baseline'],
                predicted_outcome='Conditional target occupancy from explicit structured model inputs; original hypothesis not parsed.'),
            duration_h=design.duration_h,occupancy_threshold=design.occupancy_threshold,assumptions=assumptions,
            sources=[EvidenceSource(source_id=source.source_id,title=source.title,url=source.url,retrieved_on=source.retrieved_at.date(),
                source_kind='product_label' if source.content_kind=='product_label' else ('database_record' if source.content_kind=='database_record' else 'primary_study'),
                version=source.snapshot_sha256,identifiers=source.identifiers) for source in prep.sources],
            evidence=evidence,scenarios=[scenario],limitations=prep.limitations)
