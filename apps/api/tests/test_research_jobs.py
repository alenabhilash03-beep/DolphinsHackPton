"""Research API handoff, persistence, event replay, and safe failure behavior."""

from pathlib import Path
import time

from fastapi.testclient import TestClient

from app.agent.workflow import ResearchOutcome
from app.config import Settings
from app.main import create_app
from app.research.jobs import ResearchJobService, ResearchJobStore
from app.research.registry import load_curated_profile
from app.schemas.contracts import Interpretation, SimulationRequest
from app.simulation.service import run_simulation

PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"


def setup(tmp_path: Path, runner=None):
    settings = Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None, langsmith_tracing=False)
    service = ResearchJobService(settings, ResearchJobStore(tmp_path / "jobs.db"), runner)
    return TestClient(create_app(settings, job_service=service)), service


def finish(client: TestClient, job_id: str):
    for _ in range(100):
        body = client.get(f"/api/research/jobs/{job_id}").json()
        if body["status"] in ("completed", "unsupported", "failed"):
            return body
        time.sleep(0.02)
    raise AssertionError("Job did not finish")


def fake_runner(request, progress):
    profile = load_curated_profile()
    progress("profile", "Reviewed profile loaded")
    progress("literature", "Exact literature identities verified")
    result = run_simulation(SimulationRequest(experiment=profile.experiment, client_revision=0, output_points=100))
    progress("simulation", "Deterministic comparison completed")
    interpretation = Interpretation(experiment_id=profile.experiment.experiment_id, result_id=result.result_id,
                                    client_revision=0, claims=["Model result"], evidence_ids=["volume"],
                                    assumptions=[], limitations=[], follow_up_experiments=[])
    return ResearchOutcome(support=profile.experiment.support, experiment=profile.experiment,
                           result=result, interpretation=interpretation, retrieval_status="live",
                           tool_calls=["read_reviewed_profile", "verify_primary_literature", "simulate_reviewed_comparison"],
                           trace_status="local_collected")


def test_job_result_event_replay_and_simulator_handoff(tmp_path):
    client, service = setup(tmp_path, fake_runner)
    created = client.post("/api/research/jobs", json={"text": PRIMARY})
    assert created.status_code == 202
    job_id = created.json()["job_id"]
    completed = finish(client, job_id)
    assert completed["status"] == "completed"
    assert completed["result"]["result_id"] == completed["interpretation"]["result_id"]
    assert completed["result"]["configuration"]["experiment_id"] == completed["experiment"]["experiment_id"]
    stream = client.get(f"/api/research/jobs/{job_id}/events")
    assert stream.status_code == 200 and stream.headers["content-type"].startswith("text/event-stream")
    assert "Reviewed profile loaded" in stream.text and "Deterministic comparison completed" in stream.text
    assert "Validated experiment and simulation are ready" in stream.text
    events = service.store.events(job_id)
    replay = client.get(f"/api/research/jobs/{job_id}/events", headers={"Last-Event-ID": str(events[-2].event_id)})
    assert f"id: {events[-1].event_id}" in replay.text
    assert f"id: {events[0].event_id}" not in replay.text
    direct = client.post("/api/simulations", json={"experiment": completed["experiment"], "client_revision": 1, "output_points": 100})
    assert direct.status_code == 200 and direct.json()["client_revision"] == 1
    assert client.get(f"/api/research/jobs/{job_id}").json()["status"] == "completed"
    assert ResearchJobStore(tmp_path / "jobs.db").get(job_id).status == "completed"


def test_unsupported_request_avoids_provider_and_preserves_direct_simulation(tmp_path, experiment_data):
    client, _ = setup(tmp_path)
    created = client.post("/api/research/jobs", json={"text": "What happens when imatinib binds Abl?", "drug": "imatinib"})
    blocked = finish(client, created.json()["job_id"])
    assert blocked["status"] == "unsupported" and blocked["support"]["status"] == "unsupported"
    assert blocked["result"] is None and blocked["trace_id"] is None
    assert client.post("/api/simulations", json={"experiment": experiment_data, "client_revision": 0, "output_points": 100}).status_code == 200
    unrelated = client.post("/api/research/jobs", json={"text": PRIMARY, "previous_experiment_id": "unrelated-experiment"})
    assert unrelated.status_code == 422


def test_provider_failure_is_sanitized_and_job_is_recoverable(tmp_path, experiment_data):
    def failed_runner(request, progress):
        raise RuntimeError("provider payload with secret")

    client, _ = setup(tmp_path, failed_runner)
    created = client.post("/api/research/jobs", json={"text": PRIMARY})
    failed = finish(client, created.json()["job_id"])
    assert failed["status"] == "failed" and failed["error_code"] == "research_failed"
    assert "secret" not in str(failed)
    assert client.post("/api/simulations", json={"experiment": experiment_data, "client_revision": 0, "output_points": 100}).status_code == 200
    assert client.get("/api/research/jobs/not-an-id").status_code == 404


def test_restart_marks_interrupted_work_instead_of_stranding_it(tmp_path):
    store = ResearchJobStore(tmp_path / "jobs.db")
    from app.schemas.contracts import HypothesisRequest
    job = store.create(HypothesisRequest(text=PRIMARY))
    store.update(job.job_id, "running", "Research agent started", status="running")
    with store._connect() as db:
        db.execute("UPDATE research_jobs SET owner_pid=? WHERE job_id=?", (999999999, job.job_id))
    restarted = ResearchJobStore(tmp_path / "jobs.db")
    assert restarted.get(job.job_id).status == "failed"
    assert restarted.get(job.job_id).error_code == "interrupted"
    assert restarted.events(job.job_id)[-1].kind == "failed"


def test_opening_store_does_not_interrupt_live_work(tmp_path):
    from app.schemas.contracts import HypothesisRequest
    store = ResearchJobStore(tmp_path / "jobs.db")
    job = store.create(HypothesisRequest(text=PRIMARY))
    assert ResearchJobStore(tmp_path / "jobs.db").get(job.job_id).status == "queued"


def test_deadline_stops_child_and_terminal_status_cannot_be_overwritten(tmp_path):
    import sys
    from app.schemas.contracts import HypothesisRequest
    from app.research.jobs import _process_alive
    settings = Settings(_env_file=None, research_timeout_s=.5, nvidia_api_key=None, langsmith_api_key=None)
    command = [sys.executable, "-c", "import sys,time,os,json;sys.stdin.readline();print(json.dumps({'type':'progress','kind':'worker','message':str(os.getpid())}),flush=True);time.sleep(10)"]
    service = ResearchJobService(settings, ResearchJobStore(tmp_path / "jobs.db"), worker_command=command)
    client = TestClient(create_app(settings, job_service=service))
    started = time.monotonic()
    job = service.submit(HypothesisRequest(text=PRIMARY))
    failed = finish(client, job.job_id)
    assert failed["error_code"] == "research_timeout" and time.monotonic() - started < 3
    pid = int(next(event.message for event in service.store.events(job.job_id) if event.kind == "worker"))
    assert not _process_alive(pid)
    service.store.update(job.job_id, "completed", "Late result", status="completed")
    assert service.store.get(job.job_id).status == "failed"
    service.close()


def test_full_queue_returns_429_without_breaking_simulator(tmp_path, experiment_data):
    from threading import Event
    gate = Event()
    def held_runner(request, progress):
        gate.wait(timeout=2)
        return fake_runner(request, progress)
    settings = Settings(_env_file=None, research_max_jobs=1, nvidia_api_key=None, langsmith_api_key=None)
    service = ResearchJobService(settings, ResearchJobStore(tmp_path / "jobs.db"), held_runner)
    client = TestClient(create_app(settings, job_service=service))
    try:
        assert client.post("/api/research/jobs", json={"text":PRIMARY}).status_code == 202
        response = client.post("/api/research/jobs", json={"text":PRIMARY})
        assert response.status_code == 429 and response.headers["retry-after"] == "3"
        assert client.post("/api/simulations", json={"experiment":experiment_data,"client_revision":0,"output_points":100}).status_code == 200
    finally:
        gate.set(); service.close()


def test_worker_guard_stops_process_after_supervisor_loss():
    import subprocess
    import sys
    result = subprocess.run([sys.executable, "-c", "from app.research.worker import guard_supervisor;import time;guard_supervisor(999999999,10);time.sleep(4)"],
                            capture_output=True, timeout=6)
    assert result.returncode == 2
