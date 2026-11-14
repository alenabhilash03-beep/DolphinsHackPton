"""Background job persistence/capacity plus slider-to-agent result registration."""
from threading import Event
from time import monotonic,sleep
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.research.agent_jobs import AgentQueue
from app.research.preparation_store import PreparationStore,StalePreparation
from app.schemas.generalized_agent import AgentTurn
from app.config import Settings
from app.main import create_app
from app.research.preparation import PreparationService
from app.research.demo import load_demo


def wait(queue,key):
    deadline=monotonic()+2
    while monotonic()<deadline:
        job=queue.read(key)
        if job.status in {'completed','failed'}: return job
        sleep(.005)
    raise AssertionError('Job did not finish')

class FakeService:
    def __init__(self,tmp_path,gate=None,error=None):
        self.preparation=SimpleNamespace(store=PreparationStore(tmp_path/'jobs.sqlite3'))
        self.gate=gate;self.error=error
    def run(self,request,edit=False,on_progress=None,**kwargs):
        on_progress('Tool requested: fake_scientific_tool')
        on_progress('Preparation saved: prep-synthetic')
        if self.gate: self.gate.wait(2)
        if self.error: raise self.error
        return AgentTurn(turn_id='turn-synthetic',status='needs_inputs',original_text='SYNTHETIC queue check',questions=['Supply missing kinetics.'])


def test_job_records_factual_progress_and_turn_without_blocking_submission(tmp_path):
    gate=Event();queue=AgentQueue(FakeService(tmp_path,gate))
    try:
        submitted=queue.submit(None)
        assert submitted.status=='queued'
        gate.set();job=wait(queue,submitted.job_id)
        assert job.status=='completed' and job.turn.result is None
        assert job.preparation_id=='prep-synthetic'
        assert job.events[0]=='Tool requested: fake_scientific_tool'
    finally: gate.set();queue.close()


def test_only_two_jobs_can_run_and_failures_are_sanitized(tmp_path):
    gate=Event();queue=AgentQueue(FakeService(tmp_path,gate,error=RuntimeError('sensitive provider payload')))
    try:
        first=queue.submit(None);second=queue.submit(None)
        with pytest.raises(RuntimeError,match='busy'): queue.submit(None)
        gate.set()
        failed=wait(queue,first.job_id)
        assert failed.status=='failed' and failed.error_code=='unavailable'
        assert 'sensitive' not in failed.model_dump_json()
        assert wait(queue,second.job_id).status=='failed'
    finally:gate.set();queue.close()


def test_restart_preserves_finished_jobs_and_marks_inflight_interrupted(tmp_path):
    service=FakeService(tmp_path);queue=AgentQueue(service)
    job=queue.submit(None);finished=wait(queue,job.job_id)
    queue.close()
    inflight=finished.model_copy(update={'job_id':'interrupted-fixture','status':'running','turn':None,'owner_pid':99999999})
    queue.save(inflight)
    restarted=AgentQueue(service)
    try:
        assert restarted.read(job.job_id)==finished
        assert restarted.read(inflight.job_id).error_code=='interrupted'
        with pytest.raises(KeyError):restarted.read('unknown')
    finally: restarted.close()


def test_stale_edit_job_does_not_claim_success(tmp_path):
    queue=AgentQueue(FakeService(tmp_path,error=StalePreparation('stale')))
    try:
        job=wait(queue,queue.submit(None,edit=True).job_id)
        assert job.error_code=='stale' and job.turn is None
    finally:queue.close()


def test_direct_simulation_and_controls_register_editable_agent_results(tmp_path):
    prep=PreparationService(store=PreparationStore(tmp_path/'prep.sqlite3'))
    api=create_app(Settings(_env_file=None),preparation_service=prep)
    demo=load_demo()
    with TestClient(api) as client:
        simulated=client.post('/api/simulations',json={'experiment':demo.experiment.model_dump(mode='json'),'client_revision':0,'output_points':100})
        assert simulated.status_code==200
        assert api.state.generalized_agent.turns.result(simulated.json()['result_id'])[0].configuration_hash==simulated.json()['configuration_hash']
        changed=client.post('/api/simulations/adjust',json={'experiment':demo.experiment.model_dump(mode='json'),'scenario_id':None,'field':'duration_h','value':2880.,'client_revision':1,'output_points':100})
        assert changed.status_code==200
        result,child=api.state.generalized_agent.turns.result(changed.json()['result_id'])
        assert result.client_revision==1 and child is None


def test_another_app_import_does_not_interrupt_a_live_local_job(tmp_path):
    gate=Event();service=FakeService(tmp_path,gate);first=AgentQueue(service)
    job=first.submit(None)
    second=AgentQueue(service)
    try:
        assert second.read(job.job_id).status in {'queued','running'}
        gate.set();assert wait(first,job.job_id).status=='completed'
    finally:gate.set();first.close();second.close()
