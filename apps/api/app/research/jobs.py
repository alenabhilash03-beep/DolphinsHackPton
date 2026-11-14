"""SQLite-backed, single-process research jobs with factual progress events."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from queue import Empty, Queue
import sqlite3
import subprocess
import sys
from threading import BoundedSemaphore, Event, Lock, Thread
from time import monotonic
from typing import Callable, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, TypeAdapter

from app.agent.workflow import ResearchOutcome
from app.config import ROOT, Settings
from app.research.registry import load_curated_profile
from app.research.europe_pmc import LiteratureSearch
from app.schemas.contracts import ExperimentConfig, HypothesisRequest, Interpretation, ParsedHypothesis, SimulationResult, SupportAssessment

JobStatus = Literal["queued", "running", "completed", "unsupported", "failed"]
PINNED_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b"
TERMINAL = {"completed", "unsupported", "failed"}


class ResearchCapacityError(RuntimeError):
    pass


def _process_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


class ResearchEvent(BaseModel):
    event_id: int
    job_id: str
    kind: str
    message: str
    created_at: str


class ResearchJob(BaseModel):
    job_id: str
    status: JobStatus
    request: HypothesisRequest
    previous_experiment_id: str | None = None
    support: SupportAssessment | None = None
    parsed: ParsedHypothesis | None = None
    experiment: ExperimentConfig | None = None
    result: SimulationResult | None = None
    interpretation: Interpretation | None = None
    retrieval_status: str = "not_attempted"
    tool_calls: list[str] = Field(default_factory=list)
    trace_status: str = "not_attempted"
    trace_id: str | None = None
    literature_search: LiteratureSearch | None = None
    related_search_status: str = "not_attempted"
    error_code: str | None = None
    error_message: str | None = None
    created_at: str
    updated_at: str


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResearchJobStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS research_jobs (
                    job_id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS research_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
                    kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS research_events_job ON research_events(job_id, event_id);
            """)
            columns = {row["name"] for row in db.execute("PRAGMA table_info(research_jobs)")}
            if "owner_pid" not in columns:
                db.execute("ALTER TABLE research_jobs ADD COLUMN owner_pid INTEGER")
            rows = db.execute("SELECT job_id, payload, owner_pid FROM research_jobs WHERE status IN ('queued', 'running')").fetchall()
            for row in rows:
                # Importing the app for contracts/tests must not interrupt a live server.
                if _process_alive(row["owner_pid"]):
                    continue
                data = json.loads(row["payload"])
                data.update(status="failed", error_code="interrupted", error_message="Research was interrupted by a server restart. Please submit again.", updated_at=_stamp())
                db.execute("UPDATE research_jobs SET status='failed', payload=?, updated_at=? WHERE job_id=?",
                           (json.dumps(data), data["updated_at"], row["job_id"]))
                db.execute("INSERT INTO research_events(job_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
                           (row["job_id"], "failed", data["error_message"], data["updated_at"]))

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _event(self, db, job_id: str, kind: str, message: str) -> None:
        db.execute("INSERT INTO research_events(job_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
                   (job_id, kind, message, _stamp()))

    def create(self, request: HypothesisRequest) -> ResearchJob:
        now = _stamp()
        job = ResearchJob(job_id=uuid4().hex, status="queued", request=request,
                          previous_experiment_id=request.previous_experiment_id, created_at=now, updated_at=now)
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO research_jobs(job_id,status,payload,created_at,updated_at,owner_pid) VALUES (?, ?, ?, ?, ?, ?)",
                       (job.job_id, job.status, job.model_dump_json(), now, now, os.getpid()))
            self._event(db, job.job_id, "queued", "Research request accepted")
        return job

    def get(self, job_id: str) -> ResearchJob | None:
        if len(job_id) != 32 or any(char not in "0123456789abcdef" for char in job_id):
            return None
        with self._lock, self._connect() as db:
            row = db.execute("SELECT payload FROM research_jobs WHERE job_id=?", (job_id,)).fetchone()
        return ResearchJob.model_validate_json(row["payload"]) if row else None

    def events(self, job_id: str, after: int = 0) -> list[ResearchEvent]:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT * FROM research_events WHERE job_id=? AND event_id>? ORDER BY event_id", (job_id, after)).fetchall()
        return [ResearchEvent(**dict(row)) for row in rows]

    def update(self, job_id: str, kind: str, message: str, **changes) -> None:
        with self._lock, self._connect() as db:
            row = db.execute("SELECT payload FROM research_jobs WHERE job_id=?", (job_id,)).fetchone()
            if row is None:
                raise KeyError(job_id)
            data = json.loads(row["payload"])
            if data["status"] in TERMINAL:
                return
            data.update(changes, updated_at=_stamp())
            validated = ResearchJob.model_validate(data)
            db.execute("UPDATE research_jobs SET status=?, payload=?, updated_at=? WHERE job_id=?",
                       (validated.status, validated.model_dump_json(), validated.updated_at, job_id))
            self._event(db, job_id, kind, message)


ResearchRunner = Callable[[HypothesisRequest, Callable[[str, str], None]], ResearchOutcome]


class ResearchJobService:
    def __init__(self, settings: Settings, store: ResearchJobStore | None = None,
                 runner: ResearchRunner | None = None, worker_command: list[str] | None = None):
        self.settings = settings
        self.store = store or ResearchJobStore(settings.research_db_path or ROOT / "data" / "research-jobs.db")
        self.runner = runner
        self.worker_command = worker_command or [sys.executable, "-m", "app.research.worker"]
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="hypothesim-research")
        self.capacity = BoundedSemaphore(settings.research_max_jobs)
        self.closed = Event()

    def _run_worker(self, request: HypothesisRequest, progress: Callable[[str, str], None], deadline: float) -> ResearchOutcome:
        settings = self.settings.model_dump(mode="json", exclude={"nvidia_api_key", "langsmith_api_key"})
        for name in ("nvidia_api_key", "langsmith_api_key"):
            key = getattr(self.settings, name)
            settings[name] = key.get_secret_value() if key else None
        env = dict(os.environ)
        env["PYTHONPATH"] = str(ROOT / "apps/api")
        child = subprocess.Popen(self.worker_command, cwd=ROOT, env=env, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        messages: Queue = Queue()
        def read_output():
            try:
                while line := child.stdout.readline(1_000_001):
                    if len(line) > 1_000_000:
                        break
                    try:
                        messages.put(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            finally:
                messages.put({"type": "eof"})
        reader = Thread(target=read_output, daemon=True)
        reader.start()
        try:
            # Credentials travel through a pipe, never command arguments or browser state.
            child.stdin.write(json.dumps({"request": request.model_dump(mode="json"), "settings": settings, "supervisor_pid": os.getpid(),
                                          "remaining_s": max(.01, deadline - monotonic())}) + "\n")
            child.stdin.close()
            while True:
                if self.closed.is_set():
                    raise InterruptedError("Research service stopped")
                remaining = deadline - monotonic()
                if remaining <= 0:
                    raise TimeoutError("Research deadline exceeded")
                try:
                    message = messages.get(timeout=min(.25, remaining))
                except Empty:
                    continue
                if message.get("type") == "progress":
                    progress(message["kind"], message["message"])
                elif message.get("type") == "outcome":
                    return TypeAdapter(ResearchOutcome).validate_python(message["outcome"])
                elif message.get("type") == "error":
                    if message.get("code") == "credentials_missing":
                        raise RuntimeError("AI provider not configured")
                    raise RuntimeError("Research worker failed")
                elif message.get("type") == "eof":
                    raise RuntimeError("Research worker ended without a validated result")
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait(timeout=2)
            reader.join(timeout=1)
            child.stdout.close()

    def close(self) -> None:
        self.closed.set()
        self.executor.shutdown(wait=True)

    def submit(self, request: HypothesisRequest) -> ResearchJob:
        if request.previous_experiment_id and request.previous_experiment_id != load_curated_profile().experiment.experiment_id:
            raise ValueError("Previous experiment is not registered for this research workflow")
        if self.closed.is_set() or not self.capacity.acquire(blocking=False):
            raise ResearchCapacityError("Research capacity is full. Retry shortly; direct simulation remains available.")
        try:
            job = self.store.create(request)
            self.executor.submit(self._execute, job.job_id, request, monotonic() + self.settings.research_timeout_s)
        except Exception:
            self.capacity.release()
            raise
        return job

    def _execute(self, job_id: str, request: HypothesisRequest, deadline: float) -> None:
        try:
            if self.closed.is_set():
                raise InterruptedError("Research service stopped")
            if monotonic() >= deadline:
                raise TimeoutError("Research expired in queue")
            self.store.update(job_id, "running", "Research agent started", status="running")
            progress = lambda kind, message: self.store.update(job_id, kind, message)
            outcome = self.runner(request, progress) if self.runner else self._run_worker(request, progress, deadline)
            if outcome.result is not None and (outcome.experiment is None or outcome.interpretation is None or
                outcome.result.configuration.experiment_id != outcome.experiment.experiment_id or
                outcome.interpretation.result_id != outcome.result.result_id or
                outcome.interpretation.experiment_id != outcome.experiment.experiment_id):
                raise ValueError("Research outcome is not linked to its validated experiment and result")
            common = dict(support=outcome.support, parsed=outcome.parsed, experiment=outcome.experiment,
                          result=outcome.result, interpretation=outcome.interpretation,
                          retrieval_status=outcome.retrieval_status, tool_calls=outcome.tool_calls,
                          trace_status=outcome.trace_status, trace_id=outcome.trace_id)
            common.update(literature_search=outcome.literature_search, related_search_status=outcome.related_search_status)
            if outcome.result is None:
                self.store.update(job_id, "unsupported", "The requested hypothesis is outside the reviewed model scope",
                                  status="unsupported", **common)
            else:
                self.store.update(job_id, "completed", "Validated experiment and simulation are ready",
                                  status="completed", **common)
        except Exception as exc:
            # Do not persist provider payloads or credentials in a browser-facing job.
            code = "research_timeout" if isinstance(exc, TimeoutError) else "interrupted" if isinstance(exc, InterruptedError) else "credentials_missing" if isinstance(exc, RuntimeError) and "not configured" in str(exc) else "research_failed"
            message = {"credentials_missing": "The AI provider is not configured. Load the saved demo or use direct simulation.",
                       "research_timeout": "Research reached its time limit and was stopped. Load the saved demo or retry research.",
                       "interrupted": "Research was interrupted by server shutdown. Please retry."}.get(code,
                       "Research could not be completed. Load the saved demo or retry; direct simulation remains available.")
            self.store.update(job_id, "failed", message, status="failed", error_code=code, error_message=message)
        finally:
            self.capacity.release()
