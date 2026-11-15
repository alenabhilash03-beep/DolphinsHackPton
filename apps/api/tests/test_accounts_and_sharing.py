"""5C.2: signed-in users, per-user workspaces and community sharing with a grounded AI summary."""
import json

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthError, Authenticator
from app.config import Settings
from app.main import create_app
from app.research.demo import load_demo
from app.research.sharing import build_steps, log_summary, summarize, validate_summary
from app.schemas.investigation import HistoryEntry, InvestigationHistory, ScenarioOutcome

USERS = {'token-alice-0123456789abcdef': {'id': 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user_metadata': {'full_name': 'Alice Ng'}},
         'token-bob-0123456789abcdefgh': {'id': 'b2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'user_metadata': {'name': 'Bob Ruiz'}}}
ALICE = {'Authorization': 'Bearer token-alice-0123456789abcdef'}
BOB = {'Authorization': 'Bearer token-bob-0123456789abcdefgh'}


def lookup(token):
    if token not in USERS: raise AuthError('invalid')
    return USERS[token]


@pytest.fixture
def hosted(tmp_path):
    settings = Settings(_env_file=None, auth_mode='supabase', supabase_url='https://example.supabase.co',
                        supabase_anon_key='anon', workspaces_dir=tmp_path / 'ws', preparation_db_path=tmp_path / 'local.sqlite3')
    api = create_app(settings)
    api.state.authenticator = Authenticator('supabase', lookup)
    return api


def simulate(client, headers=None):
    demo = load_demo()
    return client.post('/api/simulations', json={'experiment': demo.experiment.model_dump(mode='json'), 'client_revision': 0,
                                                  'output_points': 100}, headers=headers or {})


def test_local_mode_needs_no_sign_in(tmp_path):
    client = TestClient(create_app(Settings(_env_file=None, workspaces_dir=tmp_path / 'ws', preparation_db_path=tmp_path / 'p.sqlite3')))
    assert client.get('/api/auth/me').json()['signed_in'] is True
    result = simulate(client).json()
    assert client.get(f"/api/agent/results/{result['result_id']}").status_code == 200


def test_agent_and_preparations_require_sign_in_but_simulation_and_demo_do_not(hosted):
    client = TestClient(hosted)
    assert client.get('/api/auth/me').json() == {'signed_in': False, 'auth_mode': 'supabase', 'name': None, 'avatar_url': None}
    assert simulate(client).status_code == 200
    assert client.get('/api/demo').status_code == 200
    for method, path in [('post', '/api/agent/jobs/research'), ('get', '/api/agent/jobs/' + 'a' * 32), ('get', '/api/agent/results/x'),
                         ('get', '/api/preparations/prep-' + 'a' * 32), ('get', '/api/shares'), ('post', '/api/shares')]:
        response = getattr(client, method)(path, **({'json': {}} if method == 'post' else {}))
        assert response.status_code == 401, path
    assert client.get('/api/shares', headers={'Authorization': 'Bearer not-a-real-token-0000000'}).status_code == 401
    assert client.get('/api/auth/me', headers=ALICE).json()['name'] == 'Alice Ng'


def test_each_user_has_separate_results_and_history(hosted):
    client = TestClient(hosted)
    alice = simulate(client, ALICE).json()
    assert client.get(f"/api/agent/results/{alice['result_id']}", headers=ALICE).status_code == 200
    # Same configuration, same deterministic result ID, but Bob cannot read Alice's stored result.
    assert client.get(f"/api/agent/results/{alice['result_id']}", headers=BOB).status_code == 404
    assert client.get(f"/api/agent/investigations/{alice['result_id']}", headers=BOB).status_code == 404
    bob = simulate(client, BOB).json()
    assert bob['result_id'] == alice['result_id']
    assert client.get(f"/api/agent/investigations/{bob['result_id']}", headers=BOB).status_code == 200
    users = hosted.state.workspaces._users
    assert len(users) == 2 and len({id(ws.agent.turns.store) for ws in users.values()}) == 2


def test_share_feed_read_only_view_and_owner_only_delete(hosted):
    client = TestClient(hosted)
    result = simulate(client, ALICE).json()
    hosted.state.share_summarizer = lambda messages: {
        'headline': 'Tripling half-life gave 99.82% endpoint occupancy versus 62.9% at baseline.', 'headline_step_ids': ['S1'],
        'points': [{'text': 'The baseline reached 62.9% endpoint occupancy at 180 days.', 'step_ids': ['S1']},
                   {'text': 'This proves the drug cures patients with 77% certainty.', 'step_ids': ['S1']}]}
    shared = client.post('/api/shares', json={'result_id': result['result_id'], 'title': 'Half-life vs affinity', 'note': 'First pass'}, headers=ALICE)
    assert shared.status_code == 201
    share = shared.json()
    assert share['is_owner'] and share['owner'] == {'name': 'Alice Ng', 'avatar_url': None}
    assert share['ai_summary']['status'] == 'grounded'
    assert [p['text'] for p in share['ai_summary']['points']] == ['The baseline reached 62.9% endpoint occupancy at 180 days.']
    assert share['log_summary'][0].startswith('1 step') and share['steps'][0]['is_shared_result']
    assert 'email' not in json.dumps(share)
    # Bob can browse and open it read-only, but not remove it.
    feed = client.get('/api/shares', headers=BOB).json()['items']
    assert [(item['title'], item['is_owner'], item['step_count']) for item in feed] == [('Half-life vs affinity', False, 1)]
    opened = client.get(f"/api/shares/{share['share_id']}", headers=BOB).json()
    assert opened['is_owner'] is False and opened['result']['result_id'] == result['result_id']
    assert client.delete(f"/api/shares/{share['share_id']}", headers=BOB).status_code == 403
    assert client.delete(f"/api/shares/{share['share_id']}", headers=ALICE).status_code == 204
    assert client.get('/api/shares', headers=BOB).json()['items'] == []
    # Bob cannot share Alice's result: it is not in his workspace.
    assert client.post('/api/shares', json={'result_id': result['result_id']}, headers=BOB).status_code == 404


def steps():
    outcome = lambda sid, label, occ, status, above: ScenarioOutcome(scenario_id=sid, label=label, endpoint_occupancy=occ,
                                                                     threshold_status=status, total_time_above_h=above)
    common = dict(drug='trastuzumab', target='HER2', experiment_id='exp-1', configuration_sha256='0' * 64, client_revision=0, duration_h=4320.0)
    first = HistoryEntry(result_id='sim-1', origin='research', depth=0, title='Would tripling half-life beat tenfold affinity?',
        occupancy_threshold=0.9, outcomes=[outcome('baseline', 'Baseline', 0.629, 'crossed_within_window', 3492.6),
                                           outcome('half_life_x3', 'Threefold longer half-life', 0.9982, 'still_above_at_horizon', 4320.0)],
        verdict='mixed', **common)
    second = HistoryEntry(result_id='sim-2', parent_result_id='sim-1', origin='proposal', depth=1, title='Raise the occupancy threshold to 95%',
        changes=['Occupancy threshold: 0.9 → 0.95'], occupancy_threshold=0.95,
        outcomes=[outcome('half_life_x3', 'Threefold longer half-life', 0.9982, 'still_above_at_horizon', 4320.0),
                  outcome('affinity_x10', 'Tenfold stronger affinity', 0.9444, 'crossed_within_window', 4100.0)], **common)
    return build_steps(InvestigationHistory(root_result_id='sim-1', requested_result_id='sim-2', entries=[first, second]), 'sim-2')


def test_summary_rejects_uncited_numbers_unknown_steps_and_clinical_claims():
    s = steps()
    good, errors = validate_summary({'headline': 'At a 95% threshold only the half-life alternative stayed above it for 180 days.',
        'headline_step_ids': ['S2'], 'points': [{'text': 'S1 found 99.82% versus 62.9% endpoint occupancy.', 'step_ids': ['S1']}]}, s)
    assert good and not errors and good.headline_step_ids == ['S2']
    bad, errors = validate_summary({'headline': 'Affinity improved occupancy by 41%.', 'headline_step_ids': ['S2'],
        'points': [{'text': 'Half-life is safe in patients.', 'step_ids': ['S1']}, {'text': 'Something happened.', 'step_ids': ['S9']}]}, s)
    assert bad is None
    assert any('41' in e for e in errors) and any('clinical' in e for e in errors) and any('S9' in e for e in errors)


def test_summary_retries_with_feedback_and_reports_unavailable_or_rejected():
    s = steps()
    seen = []
    def scripted(messages):
        payload = json.loads(messages[1]['content'])
        seen.append(payload['validation_errors_from_previous_attempt'])
        if len(seen) == 1: return {'headline': 'Occupancy was 50%.', 'headline_step_ids': ['S1'], 'points': []}
        return {'headline': 'The half-life alternative stayed above 95% for 180 days.', 'headline_step_ids': ['S2'], 'points': []}
    summary = summarize(s, 'Question?', scripted)
    assert summary.status == 'grounded' and len(seen) == 2 and seen[1]
    assert summarize(s, 'Question?', None).status == 'unavailable'
    assert summarize(s, 'Question?', lambda m: {'headline': 'It is 12345.', 'headline_step_ids': ['S1']}).status == 'rejected'
    def broken(messages): raise TimeoutError('provider down with secret-key-123')
    down = summarize(s, 'Question?', broken)
    assert down.status == 'unavailable' and 'secret' not in json.dumps(down.model_dump())


def test_log_summary_lists_every_step_with_changes_and_outcomes():
    lines = log_summary(steps())
    assert lines[0] == '2 steps: 1 × agent research, 1 × follow-up experiment'
    assert lines[2].startswith('S2 · Follow-up experiment: Raise the occupancy threshold to 95% — changed Occupancy threshold: 0.9 → 0.95')
    assert 'Tenfold stronger affinity: 94.44% endpoint occupancy, falls below threshold in window' in lines[2]


def test_share_records_the_path_to_the_result_even_in_a_large_tree(hosted):
    # Live finding: a tree with more than 80 steps excluded the shared result from the history window.
    client = TestClient(hosted)
    base = simulate(client, ALICE).json()
    experiment = load_demo().experiment.model_dump(mode='json')
    last = None
    for i in range(85):  # many direct edits branching from the same base, as repeated slider releases do
        last = client.post('/api/simulations/adjust', headers=ALICE, json={'experiment': experiment, 'scenario_id': 'half_life_x3',
            'field': 'dose_mg', 'value': 300.0 + i, 'client_revision': i + 1, 'output_points': 100}).json()
    assert client.get(f"/api/agent/investigations/{last['result_id']}", headers=ALICE).json()['truncated'] is True
    share = client.post('/api/shares', json={'result_id': last['result_id']}, headers=ALICE).json()
    assert [step['origin'] for step in share['steps']] == ['direct_simulation', 'direct_control']
    assert share['steps'][-1]['is_shared_result'] and share['steps'][0]['step_id'] == 'S1'
    assert base['result_id'] != last['result_id']
