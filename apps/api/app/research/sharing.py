"""Share an investigation with the community (5C.2).

A share is an immutable snapshot of one user's investigation log (every stored step, its changes and
solver outcomes), the shared result and its cited answer, a deterministic log summary and an AI summary.
Every AI statement must cite log steps, and every number in it must appear in a cited step, as in the
grounded answer: anything else is rejected rather than shown.
"""
from __future__ import annotations

import json
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from uuid import uuid4

from pydantic import BaseModel, Field

from app.auth import User
from app.research.synthesis import plain
from app.schemas.investigation import InvestigationHistory
from app.schemas.sharing import (AISummary, SharedAnswer, SharedExperiment, SharedStep, ShareList, ShareListItem,
                                 ShareOwner, ShareRequest, SummaryPoint)

ORIGIN_LABEL = {'research': 'Agent research', 'agent_edit': 'Change in words', 'proposal': 'Follow-up experiment',
                'direct_control': 'Direct parameter edit', 'direct_simulation': 'Direct simulation', 'saved_demo': 'Saved demo'}
STATUS_LABEL = {'never_reached': 'never reaches threshold', 'crossed_within_window': 'falls below threshold in window',
                'still_above_at_horizon': 'above threshold at end of window',
                'ambiguous_without_more_resolution': 'threshold crossing unresolved'}
CLINICAL = re.compile(r'\b(cures?|cured|efficacious|clinically (superior|better)|safe (for|in) patients|'
                      r'recommended dos(e|ing)|should be (given|administered|prescribed))\b', re.I)
NUMBER = re.compile(r'(?<![A-Za-z])\d+(?:\.\d+)?')
STEP_TOKEN = re.compile(r'\bS[1-9][0-9]?\b')

SYSTEM_PROMPT = '''You summarize one scientist's investigation log for other researchers browsing a community feed.
Use only the supplied steps. Each step has an id (S1, S2, ...), what was done, what changed and the solver outcomes.
Return a one-sentence headline and up to five short points: the question, what was tried, what the model predicted
and what remains open. Cite the step ids each sentence rests on. Copy every number exactly from a cited step; do not
compute new numbers. These are conditional model predictions: never claim efficacy, safety, cures or dosing advice.'''


class SummaryProposal(BaseModel):
    """Untrusted model output for the shared-experiment summary."""
    headline: str = Field(max_length=240)
    headline_step_ids: list[str] = Field(default_factory=list, max_length=8)
    points: list[dict] = Field(default_factory=list, max_length=5)


class LangChainSummarizer:
    def __init__(self, model):
        self.runnable = model.bind_tools([SummaryProposal], tool_choice=SummaryProposal.__name__)

    def __call__(self, messages: list[dict]) -> dict:
        response = self.runnable.invoke(messages)
        calls = getattr(response, 'tool_calls', [])
        if len(calls) != 1 or calls[0].get('name') != SummaryProposal.__name__:
            raise ValueError('Summarizer must return one summary data call')
        return calls[0]['args']


def configured_summarizer(settings) -> LangChainSummarizer:
    from app.llm import StreamingChatNVIDIA as ChatNVIDIA
    if not settings.nvidia_api_key or not settings.nvidia_api_key.get_secret_value():
        raise RuntimeError('NVIDIA credentials are not configured')
    model = ChatNVIDIA(model=settings.hypothesim_llm_model, api_key=settings.nvidia_api_key.get_secret_value(),
        temperature=0, max_completion_tokens=2048, timeout=40, usage_telemetry_enabled=False,
        model_kwargs={'chat_template_kwargs': {'enable_thinking': False}})
    return LangChainSummarizer(model)


# --- Snapshot -------------------------------------------------------------------------------------------

def outcome_line(outcome) -> str:
    return f'{outcome.label}: {plain(outcome.endpoint_occupancy * 100)}% endpoint occupancy, {STATUS_LABEL[outcome.threshold_status]}'


def build_steps(history, shared_result_id: str) -> list[SharedStep]:
    ids = {entry.result_id: f'S{index + 1}' for index, entry in enumerate(history.entries[:80])}
    return [SharedStep(step_id=ids[entry.result_id], parent_step_id=ids.get(entry.parent_result_id), origin=entry.origin,
        created_at=entry.created_at, title=entry.title, changes=entry.changes, duration_h=entry.duration_h,
        occupancy_threshold=entry.occupancy_threshold, outcomes=entry.outcomes, verdict=entry.verdict, finding=entry.finding,
        papers=entry.papers, paper_count=entry.paper_count, structure_pdb_id=entry.structure_pdb_id,
        is_shared_result=entry.result_id == shared_result_id) for entry in history.entries[:80]]


def log_summary(steps: list[SharedStep]) -> list[str]:
    counts: dict[str, int] = {}
    for step in steps: counts[ORIGIN_LABEL[step.origin]] = counts.get(ORIGIN_LABEL[step.origin], 0) + 1
    lines = [f'{len(steps)} step{"s" if len(steps) != 1 else ""}: ' + ', '.join(f'{n} × {label.lower()}' for label, n in counts.items())]
    for step in steps:
        line = f'{step.step_id} · {ORIGIN_LABEL[step.origin]}: {step.title}'
        if step.changes: line += ' — changed ' + '; '.join(step.changes)
        line += f' (threshold {plain(step.occupancy_threshold * 100)}%, {plain(step.duration_h / 24)} days). '
        line += '; '.join(outcome_line(o) for o in step.outcomes)
        lines.append(line[:700])
    return lines


def step_payload(step: SharedStep) -> dict:
    return {'step_id': step.step_id, 'follows': step.parent_step_id, 'kind': ORIGIN_LABEL[step.origin], 'title': step.title,
        'changes': step.changes, 'occupancy_threshold_percent': plain(step.occupancy_threshold * 100),
        'window_days': plain(step.duration_h / 24),
        'outcomes': [{'scenario': o.label, 'endpoint_occupancy_percent': plain(o.endpoint_occupancy * 100),
                      'threshold': STATUS_LABEL[o.threshold_status], 'days_above_threshold': plain(o.total_time_above_h / 24),
                      'hours_above_threshold': plain(o.total_time_above_h)} for o in step.outcomes],
        'answer_verdict': step.verdict, 'answer': step.finding, 'papers': step.papers, 'structure': step.structure_pdb_id}


def allowed_numbers(steps: list[SharedStep]) -> list[float]:
    values: list[float] = list(range(0, 11)) + [len(steps)]
    for step in steps:
        text = json.dumps(step_payload(step))
        values += [float(n) for n in NUMBER.findall(STEP_TOKEN.sub(' ', text))]
        for o in step.outcomes:
            values += [o.endpoint_occupancy * 100, o.total_time_above_h, o.total_time_above_h / 24]
        values += [step.occupancy_threshold * 100, step.duration_h, step.duration_h / 24]
    return values


def validate_summary(data: dict, steps: list[SharedStep]) -> tuple[AISummary | None, list[str]]:
    by_id = {step.step_id: step for step in steps}
    errors: list[str] = []
    def check(text: str, cited: list[str], label: str) -> bool:
        ok = True
        unknown = [s for s in cited if s not in by_id]
        if not cited or unknown:
            errors.append(f'{label}: cite one or more existing step ids' + (f' (unknown {unknown})' if unknown else '')); return False
        if CLINICAL.search(text):
            errors.append(f'{label}: remove clinical, safety or dosing claims'); ok = False
        allowed = allowed_numbers([by_id[s] for s in cited])
        for raw in NUMBER.findall(STEP_TOKEN.sub(' ', text)):
            value = float(raw)
            if not any(abs(value - a) <= max(0.051, abs(a) * 0.0006) for a in allowed):
                errors.append(f'{label}: the number {raw} does not appear in the cited steps {cited}'); ok = False
        return ok
    headline = str(data.get('headline') or '').strip()
    head_ids = [str(s) for s in data.get('headline_step_ids') or []]
    head_ok = bool(headline) and check(headline, head_ids, 'headline')
    points = []
    for index, raw in enumerate((data.get('points') or [])[:5]):
        text = str((raw or {}).get('text') or '').strip()[:400]
        cited = [str(s) for s in (raw or {}).get('step_ids') or []][:8]
        if text and check(text, cited, f'points[{index}]'):
            points.append(SummaryPoint(text=text, step_ids=cited))
    if not head_ok and not points: return None, errors
    summary = AISummary(status='grounded', headline=headline[:240] if head_ok else None,
                        headline_step_ids=head_ids if head_ok else [], points=points)
    return summary, errors


def summarize(steps: list[SharedStep], question: str, summarizer: Callable[[list[dict]], dict] | None,
              attempts: int = 2) -> AISummary:
    if summarizer is None:
        return AISummary(status='unavailable', notes=['No AI summary model is configured; the log summary is shown.'])
    errors: list[str] = []
    best: tuple[AISummary, list[str]] | None = None
    for _ in range(attempts):
        payload = {'question': question, 'steps': [step_payload(s) for s in steps[-24:]],
                   'validation_errors_from_previous_attempt': errors[:10]}
        try:
            data = summarizer([{'role': 'system', 'content': SYSTEM_PROMPT},
                               {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}])
        except Exception:  # provider errors may echo request details; never copy them
            return AISummary(status='unavailable', notes=['The AI summary model was unavailable; the log summary is shown.'])
        summary, errors = validate_summary(data if isinstance(data, dict) else {}, steps)
        if summary and not errors: return summary
        if summary and (best is None or len(errors) < len(best[1])): best = (summary, errors)
    if best:
        omitted = best[0].model_copy(update={'notes': ['Statements that failed grounding checks were omitted; everything shown cites the log.']})
        return omitted
    return AISummary(status='rejected', notes=['The proposed AI summary failed grounding checks and was not published.'])


def lineage_history(turns, result_id: str) -> InvestigationHistory:
    """The path from the original question to the shared result: how the author got there.

    Whole trees include every slider release and abandoned branch (and are capped at 80 entries, which can
    exclude the shared result), so a share records the shared result's ancestors only.
    """
    chain, root = turns.lineage(result_id, limit=64)
    if not chain or chain[-1]['id'] != result_id: raise KeyError('Unknown agent result')
    entries = [turns.entry(meta, depth, 0) for depth, meta in enumerate(chain)]
    question = None
    for entry in entries:
        if entry.origin == 'research' and entry.turn_id:
            try: question = turns.read(entry.turn_id).original_text[:700]; break
            except KeyError: pass
    return InvestigationHistory(root_result_id=chain[0]['id'], requested_result_id=result_id, question=question, entries=entries)


def build_share(request: ShareRequest, user: User, agent, summarizer) -> SharedExperiment:
    """Snapshot the requesting user's own investigation; agent is that user's workspace service."""
    history = lineage_history(agent.turns, request.result_id)   # KeyError when the user has no such result
    result, _ = agent.turns.result(request.result_id)
    steps = build_steps(history, request.result_id)
    shared = next(step for step in steps if step.is_shared_result)
    entry = next(e for e in history.entries if e.result_id == request.result_id)
    answer = None
    if entry.turn_id:
        try:
            turn = agent.turns.read(entry.turn_id)
            synthesis = turn.synthesis
            if synthesis and synthesis.answer and synthesis.result_id == request.result_id:
                answer = SharedAnswer(verdict=synthesis.answer.verdict, statement=synthesis.answer.statement[:700], step_id=shared.step_id)
        except KeyError:
            pass
    question = history.question or (request.question or '').strip() or f'Simulation of {result.configuration.drug} → {result.configuration.target}'
    title = (request.title or question)[:160]
    return SharedExperiment(share_id='shr-' + uuid4().hex, created_at=datetime.now(timezone.utc),
        owner=ShareOwner(name=user.name, avatar_url=user.avatar_url), title=title,
        note=(request.note or None), question=question[:700], drug=result.configuration.drug, target=result.configuration.target,
        steps=steps, shared_step_id=shared.step_id, log_summary=log_summary(steps),
        ai_summary=summarize(steps, question, summarizer), answer=answer, result=result)


# --- Store ----------------------------------------------------------------------------------------------

class ShareStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at TEXT NOT NULL, '
                       'payload TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS shares_created ON shares (created_at)')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        db.execute('PRAGMA journal_mode=WAL')
        return closing(db)

    def save(self, share: SharedExperiment, owner_id: str):
        with self.connect() as db:
            db.execute('INSERT INTO shares VALUES (?,?,?,?)', (share.share_id, owner_id, share.created_at.isoformat(), share.model_dump_json()))

    def read(self, share_id: str, viewer_id: str | None) -> SharedExperiment:
        with self.connect() as db:
            row = db.execute('SELECT owner_id,payload FROM shares WHERE id=?', (share_id,)).fetchone()
        if row is None: raise KeyError('Unknown shared experiment')
        return SharedExperiment.model_validate_json(row[1]).model_copy(update={'is_owner': row[0] == viewer_id})

    def list(self, viewer_id: str | None, limit: int = 60) -> ShareList:
        with self.connect() as db:
            rows = db.execute('SELECT owner_id,payload FROM shares ORDER BY created_at DESC LIMIT ?', (limit,)).fetchall()
        items = []
        for owner_id, raw in rows:
            share = SharedExperiment.model_validate_json(raw)
            items.append(ShareListItem(share_id=share.share_id, created_at=share.created_at, owner=share.owner,
                is_owner=owner_id == viewer_id, title=share.title, question=share.question, drug=share.drug, target=share.target,
                step_count=len(share.steps), headline=share.ai_summary.headline, verdict=share.answer.verdict if share.answer else None))
        return ShareList(items=items)

    def delete(self, share_id: str, owner_id: str):
        with self.connect() as db:
            row = db.execute('SELECT owner_id FROM shares WHERE id=?', (share_id,)).fetchone()
            if row is None: raise KeyError('Unknown shared experiment')
            if row[0] != owner_id: raise PermissionError('Only the owner can remove a shared experiment')
            db.execute('DELETE FROM shares WHERE id=?', (share_id,))
