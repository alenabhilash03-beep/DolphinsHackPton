"""Authoritative tool telemetry, projected from validated state rather than tool arguments."""
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4
from requests.exceptions import Timeout as ProviderTimeout
from app.schemas.execution import (CandidatePreview, ExecutionEvent, ExecutionSummary, ExperimentSnapshot,
    ParameterSnapshot, ScheduleSnapshot, SolverReceipt, MetricSnapshot, SourceReference, StructureEventSummary)
from app.simulation.service import _canonical_hash

STAGES = {
    'search_hypothesis_evidence':'literature', 'retrieve_evidence_source':'literature',
    'extract_cited_parameters':'extraction', 'configure_prepared_experiment':'configuration',
    'prepare_reviewed_comparison':'configuration', 'simulate_current_comparison':'simulation',
    'interpret_current_result':'interpretation', 'synthesize_grounded_answer':'interpretation',
    'inspect_verified_structure':'structure', 'measure_structure_residue':'structure',
    'read_current_experiment':'editing',
    'apply_requested_edit':'editing',
}
FIELDS = {
    'pk.volume_L':'L','pk.clearance_L_h':'L/h','pk.elimination_half_life_h':'h',
    'binding.association_nM_inv_h_inv':'nM^-1 h^-1','binding.dissociation_h_inv':'h^-1',
    'binding.affinity_nM':'nM','molecular_weight_g_mol':'g/mol','body_mass_kg':'kg',
    'exposure_factor':'1','initial_amount_nmol':'nmol','initial_occupancy':'1','dosing_interval_h':'h',
}

def utcnow(): return datetime.now(timezone.utc)

def error_code(exc):
    from app.research.preparation_store import StalePreparation
    return 'timeout' if isinstance(exc,(TimeoutError,ProviderTimeout)) else 'stale' if isinstance(exc,StalePreparation) else 'validation' if isinstance(exc,(ValueError,KeyError)) else 'unavailable'

def parameter(config, scenario, path, value, unit, comparison='none', reference=None, exists=False):
    by_id={item.evidence_id:item for item in config.evidence}
    item=by_id.get(scenario.parameter_evidence.get(path)) if scenario else None
    sources=set()
    visited=set()
    def collect(entry):
        if entry.evidence_id in visited: return
        visited.add(entry.evidence_id)
        sources.update(entry.source_ids)
        for parent in entry.parent_ids: collect(by_id[parent])
    if item: collect(item)
    source_ids=sorted(sources)
    numeric=value is not None and reference is not None
    return ParameterSnapshot(scenario_id=scenario.scenario_id if scenario else None,
        parameter=path,value=value,unit=unit,provenance=item.provenance if item else 'design_input',
        review_status=item.review_status if item else 'not_reviewed',evidence_id=item.evidence_id if item else None,
        source_ids=source_ids[:3],source_ids_truncated=len(source_ids)>3,comparison=comparison,
        reference_value=reference,delta=value-reference if numeric else None,
        change='not_compared' if comparison=='none' else 'added' if not exists else 'unchanged' if value==reference else 'changed')

def snapshot(config, previous=None):
    baseline=config.scenarios[0]
    previous_by_id={s.scenario_id:s for s in previous.scenarios} if previous else {}
    parameters=[]
    for path,unit in [('duration_h','h'),('occupancy_threshold','1')]:
        parameters.append(parameter(config,None,path,getattr(config,path),unit,
            'previous_result' if previous else 'none',getattr(previous,path) if previous else None,bool(previous)))
    schedules=[]
    for scenario in config.scenarios:
        reference=previous_by_id.get(scenario.scenario_id)
        comparison='previous_result' if reference else 'baseline' if scenario!=baseline else 'none'
        reference=reference or (baseline if comparison=='baseline' else None)
        for path,unit in FIELDS.items():
            def value(obj):
                for part in path.split('.'): obj=getattr(obj,part)
                return obj
            parameters.append(parameter(config,scenario,path,value(scenario),unit,comparison,
                value(reference) if reference else None,reference is not None))
        schedule=ScheduleSnapshot(scenario_id=scenario.scenario_id,intervention=scenario.intervention,
            administration=scenario.administration,comparison=comparison,
            reference_administration=reference.administration if reference else None,
            changed=scenario.administration!=reference.administration if reference else None)
        for index,event in enumerate(scenario.administration):
            ref=reference.administration[index] if reference and index<len(reference.administration) else None
            for field,unit in [('start_h','h'),('amount_mg','mg'),('duration_h','h')]:
                if not hasattr(event,field): continue
                # amount_mg is represented in canonical mg; the schedule carries kind and full timing.
                schedule.parameter_evidence.append(parameter(config,scenario,f'administration.{index}.{field}',getattr(event,field),
                    'mg' if field=='amount_mg' else unit,comparison,getattr(ref,field,None),ref is not None and hasattr(ref,field)))
        schedules.append(schedule)
    return ExperimentSnapshot(experiment_id=config.experiment_id,configuration_sha256=_canonical_hash(config.model_dump(mode="json")),
        reference_configuration_sha256=_canonical_hash(previous.model_dump(mode="json")) if previous else None,
        duration_h=config.duration_h,occupancy_threshold=config.occupancy_threshold,parameters=parameters,schedules=schedules)

def receipt(result):
    return SolverReceipt(result_id=result.result_id,experiment_id=result.configuration.experiment_id,
        configuration_sha256=result.configuration_hash,client_revision=result.client_revision,
        model_version=result.model_version,solver_version=result.solver_version,
        output_point_count=result.diagnostics.output_point_count,
        metrics=[MetricSnapshot(scenario_id=s.scenario_id,endpoint_occupancy=s.metrics.endpoint_occupancy,
            occupancy_auc_h=s.metrics.occupancy_auc_h,concentration_auc_nM_h=s.metrics.concentration_auc_nM_h,
            threshold_status=s.metrics.threshold.status,total_time_above_h=s.metrics.threshold.total_time_above_h) for s in result.scenarios])

class ExecutionLedger:
    def __init__(self, run_id=None, callback=None, events=()):
        self.run_id=run_id or 'run-'+uuid4().hex
        self.callback=callback
        self.events=list(events)
        self.active={}
        self.snapshots=set()
        self.documents={}

    def emit(self,kind,state,*,name=None,call_id=None,elapsed=None,summary=None,notify=True):
        if len(self.events)>=128: raise RuntimeError('Execution ledger limit exceeded')
        event=ExecutionEvent(event_id='evt-'+uuid4().hex,run_id=self.run_id,sequence=len(self.events)+1,
            kind=kind,tool_name=name,tool_call_id=call_id,stage=STAGES.get(name,'preparation') if name else 'run',
            state=state,timestamp=utcnow(),elapsed_ms=elapsed,summary=summary)
        self.events.append(event)
        if notify and self.callback: self.callback(event.model_copy(deep=True))
        return event

    def start(self,name=None):
        call_id='exec-'+uuid4().hex if name else None
        self.emit('tool' if name else 'run','started',name=name,call_id=call_id)
        self.active[call_id]=(name,monotonic())
        return call_id

    def finish(self,call_id,state,summary,notify=True):
        name,started=self.active.pop(call_id)
        return self.emit('tool' if name else 'run',state,name=name,call_id=call_id,
            elapsed=max(0,(monotonic()-started)*1000),summary=summary,notify=notify)

    def interrupted(self):
        """Close only actions that were actually started before the owning process exited."""
        pending={}
        for event in self.events:
            key=event.tool_call_id
            if event.state=='started': pending[key]=event
            else: pending.pop(key,None)
        for key,event in sorted(pending.items(),key=lambda pair:pair[1].kind=='run'):
            self.emit(event.kind,'interrupted',name=event.tool_name,call_id=key,
                elapsed=max(0,(utcnow()-event.timestamp).total_seconds()*1000),
                summary=ExecutionSummary(outcome='interrupted',error_code='interrupted'))

    def tool_summary(self,name,output,scientific,base=None):
        # Only explicitly selected, typed fields enter browser-facing execution metadata.
        outcome=output.get('status') if isinstance(output,dict) else None
        if outcome in {'rejected','needs_inputs','unsupported','unavailable'}:
            return ExecutionSummary(outcome=outcome,error_code='validation' if outcome=='rejected' else 'unavailable' if outcome=='unavailable' else None)
        summary=ExecutionSummary(outcome='no_values' if outcome=='no_values' else 'completed')
        record=scientific['record']
        if name in {'start_experiment_preparation','read_experiment_preparation','update_experiment_preparation'} and record:
            summary.preparation_id=record.preparation.preparation_id
            summary.preparation_state=record.preparation.state
            summary.missing_input_count=len(record.preparation.missing_inputs)
            sources=record.preparation.sources
            summary.source_count=len(sources)
            summary.sources=[SourceReference(source_id=s.source_id,snapshot_sha256=s.snapshot_sha256,
                content_kind=s.content_kind,retrieval_status=s.retrieval_status) for s in sources[:20]]
            summary.sources_truncated=len(sources)>20
        elif name=='search_hypothesis_evidence':
            handles=list(output.get('source_handles',{}))
            summary.source_count=len(handles)
            summary.sources=[SourceReference(source_handle=h) for h in handles[:20]]
            summary.sources_truncated=len(handles)>20
        elif name=='retrieve_evidence_source':
            doc=output.get('document')
            if doc:
                src=doc['source']
                summary.source_count=1
                summary.sources=[SourceReference(source_id=src['source_id'],document_id=doc['document_id'],
                    snapshot_sha256=src.get('snapshot_sha256'),content_kind=src['content_kind'],retrieval_status=src['retrieval_status'],
                    title=(src.get('title') or '')[:200] or None)]
                self.documents[doc['document_id']]=summary.sources[0]
        elif name=='extract_cited_parameters':
            summary.candidate_count=len(output.get('parameters',[]))
            summary.candidates=[CandidatePreview(parameter=str(item['parameter'])[:80],value=float(item['original_value']),
                unit=str(item.get('original_unit') or '')[:40]) for item in output.get('parameters',[])[:8]
                if isinstance(item.get('original_value'),(int,float))]
            ref=self.documents.get(output['document_id'])
            summary.sources=[ref] if ref else []
        if name in {'prepare_reviewed_comparison','configure_prepared_experiment','apply_requested_edit'} and scientific['config']:
            config=scientific['config']
            key=_canonical_hash(config.model_dump(mode="json"))
            if key not in self.snapshots:
                summary.experiment=snapshot(config,base.configuration if base else None)
                self.snapshots.add(key)
        if name=='synthesize_grounded_answer': summary.source_count=output.get('source_count')
        if name in {'inspect_verified_structure','measure_structure_residue'} and scientific.get('structure'):
            # Identifiers only; coordinates and distances stay in the turn's structure record.
            inspection=scientific['structure']
            provenance=inspection.metadata.provenance if inspection.metadata else None
            summary.structure=StructureEventSummary(available=inspection.status=='available',
                pdb_id=provenance.pdb_id if provenance else None,coordinate_sha256=provenance.coordinate_sha256 if provenance else None,
                interface_residue_pair_count=inspection.interface_residue_pair_count,
                measurement_ids=output.get('measurement_ids',[])[:12])
        if name in {'simulate_current_comparison','interpret_current_result','synthesize_grounded_answer'} and scientific['result']:
            result=scientific['result']
            config=scientific['config']
            if config is None or result.configuration!=config or result.configuration_hash!=_canonical_hash(config.model_dump(mode='json')):
                raise ValueError('Numerical receipt does not match the configured experiment')
            summary.result=receipt(result)
        return summary
