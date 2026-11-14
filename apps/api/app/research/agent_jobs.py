"""Small local background queue; persisted factual tool attempts and recoverable polling."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from threading import BoundedSemaphore, Lock
from uuid import uuid4
from typing import Annotated, Literal
from pydantic import Field
from app.schemas.contracts import Contract
from app.schemas.generalized_agent import AgentTurn, AgentResearchRequest, AgentEditRequest
from app.research.preparation_store import StalePreparation
from app.schemas.execution import ExecutionEvent, RunID
from app.research.execution_ledger import ExecutionLedger, error_code

class AgentJob(Contract):
    job_id: str
    status: Literal['queued','running','completed','failed']
    mode: Literal['research','edit']
    events: list[str] = Field(default_factory=list)
    execution_run_id: RunID | None = None
    execution_events: Annotated[list[ExecutionEvent], Field(max_length=128)] = Field(default_factory=list)
    turn: AgentTurn | None = None
    preparation_id: str | None = None
    research_request: AgentResearchRequest | None = None
    edit_text: str | None = None
    owner_pid: int | None = None
    error_code: str | None = None
    error_message: str | None = None
    updated_at: str

class AgentQueue:
    def __init__(self, service):
        self.service=service
        self.store=service.preparation.store
        self.pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='generalized-agent')
        self.slots=BoundedSemaphore(2)
        self.lock=Lock()
        with self.store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS agent_jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            rows=db.execute('SELECT id,payload FROM agent_jobs').fetchall()
            for key,raw in rows:
                job=AgentJob.model_validate_json(raw)
                alive=True
                if job.owner_pid:
                    try: os.kill(job.owner_pid,0)
                    except ProcessLookupError: alive=False
                    except PermissionError: pass
                if job.status in {'queued','running'} and not alive:
                    if job.execution_run_id:
                        recovery=ExecutionLedger(run_id=job.execution_run_id,events=job.execution_events)
                        recovery.interrupted()
                        job.execution_events=recovery.events
                    job.updated_at=datetime.now(timezone.utc).isoformat()
                    job.status='failed'; job.error_code='interrupted'; job.error_message='The local research process restarted. Reload its preparation before resuming.'
                    db.execute('UPDATE agent_jobs SET payload=? WHERE id=?',(job.model_dump_json(),key))

    def read(self,key):
        with self.store.connect() as db:
            row=db.execute('SELECT payload FROM agent_jobs WHERE id=?',(key,)).fetchone()
        if not row: raise KeyError('Unknown agent job')
        return AgentJob.model_validate_json(row[0])

    def save(self,job):
        job.updated_at=datetime.now(timezone.utc).isoformat()
        with self.store.connect() as db:
            db.execute('INSERT OR REPLACE INTO agent_jobs VALUES (?,?)',(job.job_id,job.model_dump_json()))

    def submit(self,request,edit=False):
        if not self.slots.acquire(blocking=False): raise RuntimeError('Both local research slots are busy')
        job=AgentJob(job_id=uuid4().hex,execution_run_id='run-'+uuid4().hex,status='queued',mode='edit' if edit else 'research',updated_at=datetime.now(timezone.utc).isoformat(),preparation_id=getattr(request,"preparation_id",None),owner_pid=os.getpid(),research_request=None if edit else request,edit_text=getattr(request,"text",None) if edit else None)
        try:
            self.save(job)
            self.pool.submit(self._run,job.job_id,request,edit)
        except Exception:
            self.slots.release(); raise
        return job

    def _run(self,key,request,edit):
        job=self.read(key)
        def progress(message):
            with self.lock:
                job.events.append(message)
                if message.startswith('Preparation saved: '): job.preparation_id=message.removeprefix('Preparation saved: ')
                self.save(job)
        def execution_progress(event):
            with self.lock:
                if event.run_id != job.execution_run_id or event.sequence != len(job.execution_events)+1:
                    raise ValueError('Execution ledger run/sequence mismatch')
                job.execution_events.append(event.model_copy(deep=True))
                self.save(job)
        try:
            job.status='running'; self.save(job)
            job.turn=self.service.run(request,edit=edit,on_progress=progress,on_execution=execution_progress,execution_run_id=job.execution_run_id)
            job.status='completed'; progress('Turn saved; scientific status: '+job.turn.status)
        except Exception as exc:
            job.status='failed'
            job.error_code=error_code(exc)
            job.error_message='The experiment changed; use the latest result or preparation.' if job.error_code=='stale' else 'Research could not finish. Existing curves are preserved; reload the preparation before retrying.'
            if job.error_code=='timeout':
                job.error_message='The AI provider or research time limit was reached. No new result was accepted; existing curves are preserved. Reload the saved preparation before retrying.'
            self.save(job)
        finally: self.slots.release()

    def close(self):
        self.pool.shutdown(wait=False,cancel_futures=True)
