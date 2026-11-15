"""8D.2: investigation history, reopening, explicit branching and bounded context for follow-ups."""
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.agent.generalized import GeneralizedAgentService
from app.main import create_app
from app.research import agent_turn_store
from app.research.agent_turn_store import AgentTurnStore
from app.research.demo import load_demo
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore, StalePreparation
from app.schemas.generalized_agent import AgentEditRequest, AgentResearchRequest
from test_generalized_agent import PRIMARY_REQUEST, DrivingModel, ReviewedResearchModel, SETTINGS, research_service
from test_grounded_synthesis import scripted_synthesizer

QUESTION = PRIMARY_REQUEST['original_hypothesis']


@pytest.fixture
def lab(tmp_path):
    """The real API over one store: synthetic literature, scripted agent and synthesizer, real solver."""
    source, _ = research_service(tmp_path)
    app = create_app(SETTINGS, preparation_service=source.preparation)
    agent = app.state.generalized_agent
    agent.extractor = source.extractor
    seen = []
    agent.synthesizer = scripted_synthesizer(seen)
    with TestClient(app) as client:
        yield client, agent, seen, tmp_path


def research(agent):
    agent.model = ReviewedResearchModel()
    return agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))


def edit(agent, base, text, **fields):
    agent.model = DrivingModel(mode='edit')
    return agent.run(AgentEditRequest(base_result_id=base.result_id, base_experiment_id=base.configuration.experiment_id,
        base_configuration_sha256=base.configuration_hash, client_revision=base.client_revision + 1, text=text, **fields), edit=True)


def slider(client, base, field, value, scenario=None):
    response = client.post('/api/simulations/adjust', json={'experiment': base.configuration.model_dump(mode='json'), 'scenario_id': scenario,
        'field': field, 'value': value, 'client_revision': base.client_revision + 1, 'output_points': 600})
    assert response.status_code == 200
    from app.schemas.contracts import SimulationResult
    return SimulationResult.model_validate(response.json())


def history(client, result_id):
    response = client.get(f'/api/agent/investigations/{result_id}')
    assert response.status_code == 200
    return response.json()


def test_research_run_direct_edit_agent_follow_up_then_reopen_and_continue(lab):
    client, agent, seen, _ = lab
    first = research(agent).result
    direct = slider(client, first, 'dose_mg', 600.0, 'affinity_x10')
    follow = edit(agent, direct, 'Set the occupancy threshold to 95%')
    assert follow.status == 'completed' and follow.parent_result_id == direct.result_id

    # The follow-up answers the original research question, with bounded background and no time series.
    payload = seen[-1]
    assert payload['hypothesis_data']['text'] == QUESTION and payload['hypothesis_data']['request_kind'] == 'follow_up'
    assert payload['hypothesis_data']['change_applied'] == 'Set the occupancy threshold to 95%'
    assert [step['kind'] for step in payload['earlier_steps']] == ['research', 'direct_control']
    assert payload['earlier_steps'][1]['step'] == 'Dose per infusion set to 600 mg in Tenfold stronger affinity through slower dissociation'
    assert all(len(step['outcomes']) == 3 and len(json.dumps(step)) < 1500 for step in payload['earlier_steps'])
    assert 'time_h' not in json.dumps(payload) and len(json.dumps(payload)) < 12000
    assert any('Answer the original question' in rule for rule in payload['server_rules_for_this_answer'])
    assert follow.synthesis.original_text == QUESTION and follow.original_text == 'Set the occupancy threshold to 95%'
    assert follow.synthesis.answer.verdict == 'mixed'   # a follow-up may answer the question; a bare edit may not

    # Reopen the first result exactly as stored, then continue from it.
    reopened = client.get(f'/api/agent/results/{first.result_id}').json()
    # (The reviewed comparison has the same result ID as the pre-stored saved demo, so the store's copy is authoritative.)
    assert reopened['result'] == json.loads(agent.turns.result(first.result_id)[0].model_dump_json())
    assert reopened['result']['result_id'] == first.result_id and reopened['result']['configuration_hash'] == first.configuration_hash
    assert reopened['origin'] == 'research' and reopened['child_count'] == 1
    assert client.get(f"/api/agent/turns/{reopened['turn_id']}").json()['synthesis']['result_id'] == first.result_id
    second_line = edit(agent, first, 'Run this comparison for 120 days')
    assert second_line.status == 'completed' and second_line.parent_result_id == first.result_id

    tree = history(client, follow.result.result_id)
    assert tree == {**history(client, first.result_id), 'requested_result_id': follow.result.result_id}
    assert tree['root_result_id'] == first.result_id and tree['question'] == QUESTION and not tree['truncated']
    rows = [(e['result_id'], e['parent_result_id'], e['origin'], e['depth'], e['child_count']) for e in tree['entries']]
    assert rows == [(first.result_id, None, 'research', 0, 2), (direct.result_id, first.result_id, 'direct_control', 1, 1),
        (follow.result.result_id, direct.result_id, 'agent_edit', 2, 0), (second_line.result.result_id, first.result_id, 'agent_edit', 1, 0)]
    root, control, answered, _ = tree['entries']
    assert root['title'] == QUESTION and root['paper_count'] == 1 and root['papers'] == ['Synthetic full agent evidence']
    assert root['structure_pdb_id'] == '1N8Z' and root['verdict'] == 'mixed' and root['finding']
    assert control['title'].startswith('Dose per infusion set to 600 mg in Tenfold stronger affinity') and control['turn_id'] is None and control['finding'] is None
    assert answered['title'] == 'Set the occupancy threshold to 95%' and answered['changes'] == ['comparison: occupancy_threshold = 0.95']
    assert answered['occupancy_threshold'] == 0.95 and len(answered['outcomes']) == 3
    assert 'time_h' not in json.dumps(tree) and 'occupancy"' not in json.dumps(tree).replace('endpoint_occupancy"', '')


def test_continuing_from_a_result_with_a_newer_experiment_needs_an_explicit_branch(lab):
    client, agent, _, _ = lab
    first = research(agent).result
    line = edit(agent, first, 'Run this comparison for 120 days')
    stored_before = client.get(f'/api/agent/results/{first.result_id}').json()
    # Without saying so, a second experiment from the same result is treated as stale (two tabs, late request).
    with pytest.raises(StalePreparation): edit(agent, first, 'Set the occupancy threshold to 95%')
    response = client.post('/api/agent/edits', json={'base_result_id': first.result_id, 'base_experiment_id': first.configuration.experiment_id,
        'base_configuration_sha256': first.configuration_hash, 'client_revision': 1, 'text': 'Set the occupancy threshold to 95%'})
    assert response.status_code == 409
    proposals = client.get(f'/api/agent/results/{first.result_id}/proposals').json()
    assert proposals['status'] == 'superseded' and proposals['proposals'] and 'new branch' in proposals['note']
    # An explicit branch starts a second line. Nothing stored earlier changes.
    branch = edit(agent, first, 'Set the occupancy threshold to 95%', branch=True)
    another = edit(agent, first, proposals['proposals'][0]['edit_text'], branch=True, proposal_id=proposals['proposals'][0]['proposal_id'])
    assert branch.status == another.status == 'completed' and another.applied_proposal.title == proposals['proposals'][0]['title']
    assert {e['result_id']: e['origin'] for e in history(client, first.result_id)['entries'][1:]} == {
        line.result.result_id: 'agent_edit', branch.result.result_id: 'agent_edit', another.result.result_id: 'proposal'}
    after = client.get(f'/api/agent/results/{first.result_id}').json()
    assert after['result'] == stored_before['result'] and after['turn_id'] == stored_before['turn_id'] and after['child_count'] == 3
    assert agent.turns.result(first.result_id)[1] == line.result.result_id   # the first follow-up stays the default head
    flags = {e['result_id']: e['has_follow_up_experiment'] for e in history(client, first.result_id)['entries']}
    assert flags[first.result_id] and not flags[line.result.result_id] and not flags[branch.result.result_id]
    # Branch does not relax anything else: a wrong hash or a non-advancing revision is still refused.
    agent.model = DrivingModel(mode='edit')
    with pytest.raises(StalePreparation):
        agent.run(AgentEditRequest(base_result_id=first.result_id, base_experiment_id=first.configuration.experiment_id,
            base_configuration_sha256='0' * 64, client_revision=1, text='Run this comparison for 90 days', branch=True), edit=True)


def test_history_survives_a_restart_and_reads_older_databases(lab, tmp_path):
    client, agent, _, _ = lab
    first = research(agent).result
    follow = edit(agent, first, 'Run this comparison for 120 days')
    before = history(client, follow.result.result_id)
    restarted = GeneralizedAgentService(PreparationService(store=PreparationStore(agent.preparation.store.path)), SETTINGS)
    assert json.loads(restarted.turns.history(follow.result.result_id).model_dump_json()) == before
    assert restarted.investigation_context(follow.result.result_id)[1] == QUESTION
    # A database written before history existed gains the columns; its results appear as plain simulations.
    path = tmp_path / 'legacy.sqlite3'
    demo = load_demo().result
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE agent_turns (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
        db.execute('CREATE TABLE agent_results (id TEXT PRIMARY KEY, payload TEXT NOT NULL, child TEXT)')
        db.execute('INSERT INTO agent_results VALUES (?,?,NULL)', (demo.result_id, demo.model_dump_json()))
    legacy = AgentTurnStore(PreparationStore(path)).history(demo.result_id)
    assert [(e.origin, e.title, e.parent_result_id) for e in legacy.entries] == [('direct_simulation', 'Simulation', None)]
    assert legacy.question is None


def test_edits_without_a_research_question_stay_plain_edits_and_history_is_bounded(lab, monkeypatch):
    client, agent, seen, _ = lab
    demo = load_demo().result
    turn = edit(agent, demo, 'Run this comparison for 120 days')
    assert seen[-1]['hypothesis_data'] == {'text': 'Run this comparison for 120 days', 'drug': demo.configuration.drug,
        'target': demo.configuration.target, 'request_kind': 'edit', 'change_applied': None}
    assert [step['kind'] for step in seen[-1]['earlier_steps']] == ['saved_demo']
    assert turn.synthesis.answer.verdict == 'undetermined' and history(client, demo.result_id)['question'] is None
    assert history(client, demo.result_id)['entries'][0]['title'].startswith('Saved reviewed demo')
    # Long chains: context keeps the last six steps, and an oversized tree is cut with a flag.
    current = turn.result
    for days in range(121, 128):
        current = slider(client, current, 'duration_h', days * 24.0)
    steps, question = agent.investigation_context(current.result_id)
    assert len(steps) == 6 and question is None and steps[-1]['step'] == 'Observation window set to 3048 h'
    monkeypatch.setattr(agent_turn_store, 'MAX_ENTRIES', 3)
    cut = history(client, current.result_id)
    assert cut['truncated'] and len(cut['entries']) == 3
    assert client.get('/api/agent/investigations/sim-unknown').status_code == 404
    assert client.get('/api/agent/results/sim-unknown').status_code == 404


def test_a_direct_edit_is_linked_to_the_result_whose_configuration_was_edited(lab):
    client, agent, _, _ = lab
    demo = load_demo().result
    a = slider(client, demo, 'dose_mg', 600.0, 'affinity_x10')
    b = slider(client, a, 'duration_h', 2880.0)
    cleared = slider(client, demo, 'occupancy_threshold', 0.8)
    entries = {e['result_id']: e for e in history(client, b.result_id)['entries']}
    assert entries[a.result_id]['parent_result_id'] == demo.result_id and entries[b.result_id]['parent_result_id'] == a.result_id
    assert entries[cleared.result_id]['parent_result_id'] == demo.result_id and entries[demo.result_id]['child_count'] == 2
    assert entries[b.result_id]['title'] == 'Observation window set to 2880 h' and entries[b.result_id]['depth'] == 2
    # Earlier entries are never rewritten by later ones.
    assert entries[a.result_id] == {e['result_id']: e for e in history(client, a.result_id)['entries']}[a.result_id]
    # Direct edits never consume the single agent follow-up of their parent.
    assert edit(agent, demo, 'Run this comparison for 120 days').status == 'completed'
