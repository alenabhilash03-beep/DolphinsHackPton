"""MVP demo mode: the two judged requests replay recorded live agent runs; everything else stays live."""
import json

import pytest

from app.agent.demo_replay import DemoReplay, load, normalize
from app.agent.generalized import GeneralizedAgentService
from app.config import Settings
from app.research.agent_jobs import AgentQueue
from app.research.demo import load_demo
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore
from app.schemas.generalized_agent import AgentEditRequest, AgentResearchRequest

Q1 = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"
SETTINGS = Settings(_env_file=None, langsmith_tracing=False, nvidia_api_key=None, langsmith_api_key=None,
                    demo_replay=True, demo_replay_research_s=0, demo_replay_edit_s=0)


def service(tmp_path, settings=SETTINGS):
    return GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path / 'p.sqlite3')), settings)


def research(text=Q1, **overrides):
    return AgentResearchRequest(request={'drug_name': 'trastuzumab', 'target': 'HER2', 'route': 'iv_infusion',
        'original_hypothesis': text, **overrides})


def follow_up(base, text='Run this comparison for 120 days', **extra):
    return AgentEditRequest(base_result_id=base.result_id, base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash, client_revision=base.client_revision + 1, text=text, **extra)


def test_replay_files_are_complete_recorded_runs():
    replays = {r.name: r for r in load()}
    assert set(replays) == {'q1-trastuzumab', 'q2-120-days'}
    q1, q2 = replays['q1-trastuzumab'], replays['q2-120-days']
    for r in (q1, q2):
        assert r.turn.status == 'completed' and r.turn.result and r.turn.synthesis.status == 'grounded'
        assert r.recorded_run_id.startswith('run-') and r.steps and all(s['end_s'] >= s['start_s'] for s in r.steps)
    # Q1 is the audited comparison and its result is the same deterministic ID as "Load reference".
    assert q1.turn.result.result_id == load_demo().result.result_id
    assert [s['tool'] for s in q1.steps][:2] == ['start_experiment_preparation', 'search_hypothesis_evidence']
    assert {'extract_cited_parameters', 'prepare_reviewed_comparison', 'simulate_current_comparison',
            'inspect_verified_structure', 'synthesize_grounded_answer'} <= {s['tool'] for s in q1.steps}
    assert q2.match['base_result_id'] == q1.turn.result.result_id
    assert q2.turn.result.configuration.duration_h == 2880 and q2.turn.applied_changes


def test_matching_is_exact_but_tolerates_typography():
    replay = DemoReplay()
    assert replay.match(research(), edit=False).name == 'q1-trastuzumab'
    assert replay.match(research(Q1.replace("'", '’') + '  '), edit=False).name == 'q1-trastuzumab'
    assert replay.match(research(Q1, route=None), edit=False).name == 'q1-trastuzumab'
    assert normalize('Run this comparison for 120 days.') == normalize('run this comparison for 120 days')
    assert replay.match(research(Q1.replace('tenfold', 'fivefold')), edit=False) is None
    assert replay.match(research(Q1, target='EGFR'), edit=False) is None
    assert replay.match(AgentResearchRequest(request={'drug_name': 'trastuzumab', 'target': 'HER2', 'route': 'iv_infusion',
        'original_hypothesis': Q1}, structured_baseline=True), edit=False) is None
    base = load_demo().result
    assert replay.match(follow_up(base), edit=True).name == 'q2-120-days'
    assert replay.match(follow_up(base, 'Run this comparison for 90 days'), edit=True) is None


def test_research_replay_emits_recorded_steps_and_stores_the_result(tmp_path):
    agent = service(tmp_path)
    events = []
    turn = agent.run(research(), on_execution=events.append)
    q1 = next(r for r in load() if r.name == 'q1-trastuzumab')
    assert turn.status == 'completed' and turn.trace_status == 'recorded_replay' and turn.trace_id == q1.recorded_run_id
    assert turn.result.result_id == q1.turn.result.result_id and turn.synthesis.status == 'grounded'
    tools = [e.tool_name for e in events if e.kind == 'tool' and e.state != 'started']
    assert tools == [s['tool'] for s in q1.steps]
    assert events[0].kind == 'run' and events[-1].kind == 'run' and events[-1].state == 'succeeded'
    assert [e.sequence for e in events] == list(range(1, len(events) + 1))
    assert agent.turns.read(turn.turn_id).result.result_id == turn.result.result_id
    assert agent.turns.history(turn.result.result_id).entries


@pytest.mark.parametrize('start', ['research', 'load_reference'])
def test_follow_up_replays_after_research_or_reference_and_can_be_rehearsed(tmp_path, start):
    agent = service(tmp_path)
    base = agent.run(research()).result if start == 'research' else load_demo().result
    first = agent.run(follow_up(base), edit=True)
    again = agent.run(follow_up(base), edit=True)   # a rehearsal already used the follow-up slot
    for turn in (first, again):
        assert turn.status == 'completed' and turn.parent_result_id == base.result_id and turn.trace_status == 'recorded_replay'
        assert turn.result.configuration.duration_h == 2880
    history = agent.turns.history(first.result.result_id)
    assert len(history.entries) >= 2 and (history.question == Q1 or start == "load_reference")


def test_other_requests_still_use_the_live_agent(tmp_path):
    agent = service(tmp_path)
    with pytest.raises(RuntimeError, match='NVIDIA credentials unavailable'):
        agent.run(research(Q1.replace('tenfold', 'fivefold')))
    off = service(tmp_path / 'off', SETTINGS.model_copy(update={'demo_replay': False}))
    assert off.replay is None


def test_replay_runs_through_the_job_queue_like_a_live_run(tmp_path):
    agent = service(tmp_path)
    queue = AgentQueue(agent)
    job = queue.submit(research())
    queue.pool.shutdown(wait=True)
    job = queue.read(job.job_id)
    assert job.status == 'completed' and job.turn.result and job.turn.synthesis.status == 'grounded'
    assert any('Replaying recorded agent run' in message for message in job.events)
    assert json.loads(job.model_dump_json())['execution_events'][-1]['state'] == 'succeeded'


def test_replayed_events_carry_the_recorded_paper_titles_and_values():
    from app.agent.demo_replay import enrich, load
    replay = next(r for r in load() if r.kind == 'research')
    retrieved = [enrich(s, replay.turn) for s in replay.steps if s['tool'] == 'retrieve_evidence_source']
    assert all(s.sources[0].title for s in retrieved)
    extracted = [enrich(s, replay.turn) for s in replay.steps if s['tool'] == 'extract_cited_parameters' and s['state'] == 'succeeded']
    values = {(c.parameter, c.value, c.unit) for s in extracted for c in s.candidates}
    assert ('pk.clearance_L_h', 0.127, 'L/day') in values and ('pk.volume_L', 2.62, 'L') in values
    assert all(len(s.candidates) == s.candidate_count for s in extracted)
