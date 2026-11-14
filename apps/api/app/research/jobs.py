"""SQLite-backed, single-process research jobs with factual progress events."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from threading import Lock
from typing import Callable, Literal
from uuid import uuid4

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from pydantic import BaseModel, Field

from app.agent.workflow import ResearchOutcome, run_research, scope_request
from app.config import ROOT, Settings
from app.research.registry import load_curated_profile
from app.schemas.contracts import ExperimentConfig, HypothesisRequest, Interpretation, ParsedHypothesis, SimulationResult, SupportAssessment

JobStatus = Literal["queued", "running", "completed", "unsupported", "failed"]
PINNED_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b"


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
            # Threads do not survive a server restart. Keep the persisted state truthful.
            rows = db.execute("SELECT job_id, payload FROM research_jobs WHERE status IN ('queued', 'running')").fetchall()
            for row in rows:
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
            db.execute("INSERT INTO research_jobs VALUES (?, ?, ?, ?, ?)",
                       (job.job_id, job.status, job.model_dump_json(), now, now))
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
            data.update(changes, updated_at=_stamp())
            validated = ResearchJob.model_validate(data)
            db.execute("UPDATE research_jobs SET status=?, payload=?, updated_at=? WHERE job_id=?",
                       (validated.status, validated.model_dump_json(), validated.updated_at, job_id))
            self._event(db, job_id, kind, message)


ResearchRunner = Callable[[HypothesisRequest, Callable[[str, str], None]], ResearchOutcome]


class ResearchJobService:
    def __init__(self, settings: Settings, store: ResearchJobStore | None = None,
                 runner: ResearchRunner | None = None):
        self.settings = settings
        self.store = store or ResearchJobStore(ROOT / "data" / "research-jobs.db")
        self.runner = runner or self._run_live
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="hypothesim-research")

    def _run_live(self, request: HypothesisRequest, progress: Callable[[str, str], None]) -> ResearchOutcome:
        blocked = scope_request(request)
        if blocked:
            return ResearchOutcome(support=blocked)
        key = self.settings.nvidia_api_key.get_secret_value() if self.settings.nvidia_api_key else ""
        if not key:
            raise RuntimeError("NVIDIA_API_KEY is not configured")
        if self.settings.hypothesim_llm_model != PINNED_MODEL:
            raise RuntimeError("The configured AI model has not been audited for this workflow")
        model = ChatNVIDIA(model=PINNED_MODEL, api_key=key, max_completion_tokens=8192,
                           temperature=0, timeout=90, usage_telemetry_enabled=False)
        return run_research(request, model, settings=self.settings, on_progress=progress)

    def submit(self, request: HypothesisRequest) -> ResearchJob:
        if request.previous_experiment_id and request.previous_experiment_id != load_curated_profile().experiment.experiment_id:
            raise ValueError("Previous experiment is not registered for this research workflow")
        job = self.store.create(request)
        self.executor.submit(self._execute, job.job_id, request)
        return job

    def _execute(self, job_id: str, request: HypothesisRequest) -> None:
        try:
            self.store.update(job_id, "running", "Research agent started", status="running")
            outcome = self.runner(request, lambda kind, message: self.store.update(job_id, kind, message))
            if outcome.result is not None and (outcome.experiment is None or outcome.interpretation is None or
                outcome.result.configuration.experiment_id != outcome.experiment.experiment_id or
                outcome.interpretation.result_id != outcome.result.result_id or
                outcome.interpretation.experiment_id != outcome.experiment.experiment_id):
                raise ValueError("Research outcome is not linked to its validated experiment and result")
            common = dict(support=outcome.support, parsed=outcome.parsed, experiment=outcome.experiment,
                          result=outcome.result, interpretation=outcome.interpretation,
                          retrieval_status=outcome.retrieval_status, tool_calls=outcome.tool_calls,
                          trace_status=outcome.trace_status, trace_id=outcome.trace_id)
            if outcome.result is None:
                self.store.update(job_id, "unsupported", "The requested hypothesis is outside the reviewed model scope",
                                  status="unsupported", **common)
            else:
                self.store.update(job_id, "completed", "Validated experiment and simulation are ready",
                                  status="completed", **common)
        except Exception as exc:
            # Do not persist provider payloads or credentials in a browser-facing job.
            code = "credentials_missing" if isinstance(exc, RuntimeError) and "not configured" in str(exc) else "research_failed"
            message = "The AI provider is not configured. Direct simulation remains available." if code == "credentials_missing" else "Research could not be completed. Direct simulation remains available; retry the hypothesis."
            self.store.update(job_id, "failed", message, status="failed", error_code=code, error_message=message)
