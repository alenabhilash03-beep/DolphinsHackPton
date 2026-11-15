"""Recorded replays of the two demo questions (MVP demo mode).

The judged demo asks two fixed questions. Live runs depend on the free NVIDIA endpoint, whose speed varies from
3 s to 30 s per model turn, so a run can take anywhere from 80 s to 5 minutes. In demo mode the server answers
exactly these two requests by replaying a real, recorded agent run: the same tool calls and outcomes, the same
papers, extracted values, solver result, structure measurements and cited answer, paced like the recording.

Nothing is invented: every replay file was produced by `scripts/record_demo_replay.py` from a live job, and the
result IDs are the deterministic hashes the solver produces for the same experiment. Replayed turns are marked
`trace_status='recorded_replay'` with the recorded run ID. Any other request runs the live agent.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from app.schemas.execution import CandidatePreview, ExecutionSummary
from app.schemas.generalized_agent import AgentEditRequest, AgentResearchRequest, AgentTurn

REPLAY_DIR = Path(__file__).resolve().parents[4] / 'data/demo/replay'


def normalize(text: str | None) -> str:
    text = (text or '').replace('’', "'").replace('‘', "'").casefold()
    return re.sub(r'\s+', ' ', text).strip().rstrip('.?! ')


@dataclass(frozen=True)
class Replay:
    name: str
    kind: str                 # 'research' or 'edit'
    match: dict
    recorded_run_id: str
    duration_s: float         # recorded wall time of the run
    steps: list               # [{start_s, end_s, tool, state, summary}]
    turn: AgentTurn


def load(directory: Path = REPLAY_DIR) -> list[Replay]:
    replays = []
    for path in sorted(directory.glob('*.json')) if directory.exists() else []:
        raw = json.loads(path.read_text())
        replays.append(Replay(name=raw['name'], kind=raw['kind'], match=raw['match'], recorded_run_id=raw['recorded_run_id'],
            duration_s=float(raw['duration_s']), steps=raw['steps'], turn=AgentTurn.model_validate(raw['turn'])))
    return replays


def enrich(step: dict, turn: AgentTurn) -> ExecutionSummary:
    """Add the paper title and extracted values that live runs now record on each event.

    Recordings predate those optional fields; both come from the same recorded run's papers, matched by document ID.
    """
    summary = ExecutionSummary.model_validate(step['summary'])
    papers = {paper.document_id: paper for paper in turn.research_papers}
    sources = [source.model_copy(update={'title': source.title or (papers[source.document_id].source.title[:200]
               if source.document_id in papers else None)}) for source in summary.sources]
    update = {'sources': sources}
    if step['tool'] == 'extract_cited_parameters' and step['state'] == 'succeeded' and not summary.candidates and sources:
        paper = papers.get(sources[0].document_id)
        if paper:
            update['candidates'] = [CandidatePreview(parameter=item.parameter[:80], value=float(item.original_value), unit=str(item.original_unit)[:40])
                                    for item in paper.extraction.parameters[:summary.candidate_count or 8]]
    return summary.model_copy(update=update)


class DemoReplay:
    """Matches the exact demo requests and replays their recorded runs; returns None for everything else."""

    def __init__(self, replays: list[Replay] | None = None, pace: float = 1.0, sleep=time.sleep):
        self.replays = load() if replays is None else replays
        self.pace = pace          # 1.0 replays at recorded speed; tests use 0
        self.sleep = sleep

    def match(self, request, edit: bool) -> Replay | None:
        for replay in self.replays:
            m = replay.match
            if edit and replay.kind == 'edit' and isinstance(request, AgentEditRequest):
                if (normalize(request.text) == normalize(m['text']) and request.base_result_id == m['base_result_id']
                        and request.proposal_id is None):
                    return replay
            if not edit and replay.kind == 'research' and isinstance(request, AgentResearchRequest):
                r = request.request
                if (request.preparation_id is None and request.researcher_update is None and not request.structured_baseline
                        and normalize(r.original_hypothesis) == normalize(m['original_hypothesis'])
                        and normalize(r.drug_name) == normalize(m['drug_name']) and normalize(r.target) == normalize(m['target'])
                        and (r.route or 'iv_infusion') == m['route']):
                    return replay
        return None

    def run(self, replay: Replay, execution, on_progress=None) -> AgentTurn:
        """Re-emit the recorded tool calls through the live execution ledger at the recorded pace."""
        started = time.monotonic()
        def wait_until(offset_s):
            delay = offset_s * self.pace - (time.monotonic() - started)
            if delay > 0: self.sleep(delay)
        if on_progress: on_progress(f'Replaying recorded agent run {replay.recorded_run_id}')
        for step in replay.steps:
            wait_until(step['start_s'])
            if on_progress: on_progress('Tool requested: ' + step['tool'])
            call_id = execution.start(step['tool'])
            wait_until(step['end_s'])
            summary = enrich(step, replay.turn) if step.get('summary') else None
            execution.finish(call_id, step['state'], summary)
        wait_until(replay.duration_s)
        return replay.turn.model_copy(deep=True, update={
            'turn_id': 'turn-' + uuid4().hex, 'trace_status': 'recorded_replay', 'trace_id': replay.recorded_run_id})
