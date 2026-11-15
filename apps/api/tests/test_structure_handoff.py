"""8C.2: the research agent inspects verified structures and the answer cites coordinate measurements."""
import json

import pytest
from pydantic import ValidationError
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.research.demo import load_demo
from app.research.synthesis import Grounding, synthesize
from app.schemas.generalized_agent import AgentEditRequest, AgentResearchRequest, AgentTurn
from app.schemas.structure_analysis import StructureInspection, StructureMeasurement
from app.structures.service import StructureService
from test_generalized_agent import PRIMARY_REQUEST, DrivingModel, ReviewedResearchModel, SETTINGS, research_service
from test_grounded_synthesis import scripted_synthesizer

CLOSEST = 'GLY B:103 lies 2.417 Å from LYS C:593 at the antibody–receptor interface.'


def inspection(limit=5):
    service = StructureService()
    contacts = service.interface('1N8Z', limit)
    return StructureInspection(status='available', metadata=service.metadata('1N8Z'), interface_residue_pair_count=contacts.residue_pair_count,
        measurements=[StructureMeasurement(measurement_id=f'M{i}', kind='interface_contact', contact=c) for i, c in enumerate(contacts.contacts, 1)])


def with_structure(seen, statement=CLOSEST, ids=('M1',)):
    base = scripted_synthesizer(seen)
    def synthesizer(messages):
        data = base(messages)
        if seen[-1]['structure'] and seen[-1]['structure']['status'] == 'available':
            data['structural_context'] = [{'statement': statement, 'measurement_ids': list(ids)}]
        return data
    return synthesizer


def events(turn, name):
    return [e for e in turn.execution_events if e.tool_name == name and e.state != 'started']


def test_reviewed_research_inspects_the_structure_and_the_answer_cites_agent_measurements(tmp_path):
    agent, _ = research_service(tmp_path)
    agent.model = ReviewedResearchModel()
    seen = []
    agent.synthesizer = with_structure(seen)
    turn = agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    structure = turn.structure
    assert turn.status == 'completed' and structure.status == 'available'
    assert structure.metadata.provenance.pdb_id == '1N8Z' and structure.interface_residue_pair_count == 32
    assert [m.measurement_id for m in structure.measurements] == ['M1', 'M2', 'M3', 'M4', 'M5']
    closest = structure.measurements[0].contact
    assert (closest.drug_residue.chain, closest.drug_residue.residue_number, closest.target_residue.chain, closest.target_residue.residue_number) == ('B', 103, 'C', 593)
    assert abs(closest.distance_angstrom - 2.4169871741488387) < 1e-12
    order = turn.tool_calls
    assert order.index('interpret_current_result') < order.index('inspect_verified_structure') < order.index('synthesize_grounded_answer')
    # The model received display strings for these measurements, and its statement is bound to the same record.
    shown = seen[0]['structure']
    assert shown['pdb_id'] == '1N8Z' and shown['measurements'][0] == {'measurement_id': 'M1', 'drug_residue': 'GLY B:103', 'drug_atom': 'O',
        'target_residue': 'LYS C:593', 'target_atom': 'NZ', 'distance': '2.417 Å', 'within_4_angstrom': True}
    observation = turn.synthesis.structural_context[0]
    assert observation.claim_kind == 'structural_observation' and observation.statement == CLOSEST
    assert observation.measurements == [structure.measurements[0]]
    assert '1N8Z' in turn.synthesis.structure_note and 'do not decide' in turn.synthesis.structure_note
    # The ledger links the tool event to the structure and its measurement IDs, without coordinates.
    event = events(turn, 'inspect_verified_structure')[0]
    assert event.stage == 'structure' and event.state == 'succeeded'
    assert event.summary.structure.model_dump() == {'available': True, 'pdb_id': '1N8Z',
        'coordinate_sha256': structure.metadata.provenance.coordinate_sha256, 'interface_residue_pair_count': 32,
        'measurement_ids': ['M1', 'M2', 'M3', 'M4', 'M5']}
    assert 'distance' not in event.model_dump_json()
    assert agent.turns.read(turn.turn_id) == turn


def test_agent_requested_residue_measurements_are_bounded_deduplicated_and_honest(tmp_path):
    captured = {}
    class Measuring(ReviewedResearchModel):
        def _generate(self, messages, **kwargs):
            outputs = [(m.name, json.loads(m.content)) for m in messages if isinstance(m, ToolMessage)]
            measured = [out for name, out in outputs if name == 'measure_structure_residue']
            if any(name == 'inspect_verified_structure' for name, _ in outputs) and len(measured) < 3:
                args = [{'residue': {'chain': 'C', 'residue_number': 593}}, {'residue': {'chain': 'C', 'residue_number': 102}},
                    {'residue': {'chain': 'B', 'residue_number': 50}}][len(measured)]
                captured[len(measured)] = None
                return ChatResult(generations=[ChatGeneration(message=AIMessage(content='', tool_calls=[
                    {'name': 'measure_structure_residue', 'args': args, 'id': f'measure-{len(measured)}'}]))])
            for index, out in enumerate(measured): captured[index] = out
            return super()._generate(messages, **kwargs)
    agent, _ = research_service(tmp_path)
    agent.model = Measuring()
    agent.synthesizer = with_structure([])
    turn = agent.run(AgentResearchRequest(request=PRIMARY_REQUEST))
    assert turn.status == 'completed'
    # LYS C:593's nearest partner is the already listed closest contact, so M1 is reused rather than duplicated.
    assert captured[0]['status'] == 'measured' and captured[0]['measurement_ids'][0] == 'M1' and len(captured[0]['measurement_ids']) == 3
    added = [m for m in turn.structure.measurements if m.kind == 'residue_distance']
    assert added and all(m.contact.target_residue.residue_number == 593 for m in added)
    assert len({m.measurement_id for m in turn.structure.measurements}) == len(turn.structure.measurements)
    # A depositor-reported unresolved residue is not measured, and the reason is kept.
    assert captured[1]['status'] == 'not_measured' and captured[1]['reason'] == 'residue_reported_unresolved'
    assert any('REMARK 465' in note for note in turn.structure.not_measured)
    # The third request exceeds the per-turn budget and is rejected without a measurement.
    assert captured[2]['status'] == 'rejected'
    states = [e.state for e in events(turn, 'measure_structure_residue')]
    assert states == ['succeeded', 'succeeded', 'rejected']
    assert events(turn, 'measure_structure_residue')[1].summary.structure.measurement_ids == []


@pytest.mark.parametrize('missing', [False, True])
def test_no_verified_structure_is_stated_and_leaves_research_and_simulation_usable(tmp_path, missing):
    agent, req = research_service(tmp_path, missing)
    seen = []
    agent.synthesizer = with_structure(seen)
    turn = agent.run(AgentResearchRequest(request=req, structured_baseline=True))
    assert turn.status == ('needs_inputs' if missing else 'completed') and (turn.result is None) == missing
    assert turn.structure.status == 'unavailable' and turn.structure.reason == 'unknown_structure' and not turn.structure.measurements
    assert seen[0]['structure'] == {'status': 'unavailable', 'detail': turn.structure.detail}
    assert turn.synthesis.status == 'grounded' and not turn.synthesis.structural_context
    assert 'No verified experimental structure is available for Compound X and Target Y' in turn.synthesis.structure_note
    event = events(turn, 'inspect_verified_structure')[0]
    assert event.state == 'succeeded' and event.summary.structure.available is False and event.summary.structure.pdb_id is None
    assert 'measure_structure_residue' not in turn.tool_calls


def test_edits_do_not_inspect_structures(tmp_path):
    from app.agent.generalized import GeneralizedAgentService
    from app.research.preparation import PreparationService
    from app.research.preparation_store import PreparationStore
    from test_research_agent import ScriptedModel
    base = load_demo().result
    def request(revision, result):
        return AgentEditRequest(base_result_id=result.result_id, base_experiment_id=result.configuration.experiment_id,
            base_configuration_sha256=result.configuration_hash, client_revision=revision, text='Run this comparison for 120 days')
    agent = GeneralizedAgentService(PreparationService(store=PreparationStore(tmp_path / 'p.sqlite3')), SETTINGS, DrivingModel(mode='edit'),
        synthesizer=scripted_synthesizer([]))
    agent.turns.seed(base)
    turn = agent.run(request(1, base), edit=True)
    assert turn.status == 'completed' and turn.structure is None and turn.synthesis.structure_note is None
    assert 'inspect_verified_structure' not in turn.tool_calls
    offered = []
    class Inspect(ScriptedModel):
        def bind_tools(self, tools, **kwargs):
            offered.extend(t.name for t in tools if hasattr(t, 'name')); return self
    agent.model = Inspect(responses=[AIMessage(content='', tool_calls=[{'name': name, 'args': {}, 'id': str(i)}]) for i, name in enumerate(
        ['read_current_experiment', 'apply_requested_edit', 'simulate_current_comparison', 'interpret_current_result', 'synthesize_grounded_answer'])]
        + [AIMessage(content='', tool_calls=[{'name': 'AgentDecision', 'args': {'status': 'completed'}, 'id': 'done'}])])
    agent.run(request(2, turn.result), edit=True)
    assert 'inspect_verified_structure' not in offered and 'measure_structure_residue' not in offered


def grounded(structure, statement=CLOSEST, ids=('M1',)):
    g = Grounding(text='Would a longer half-life keep occupancy longer?', drug='trastuzumab', target='HER2', mode='research', documents=[],
        reviews={}, result=load_demo().result, record=None, lineage=None, structure=structure)
    proposal = {'result_id': g.result.result_id, 'answer': {'verdict': 'undetermined', 'statement': 'The simulation gives conditional predictions.'},
        'structural_context': [{'statement': statement, 'measurement_ids': list(ids)}]}
    seen = []
    def synthesizer(messages):
        seen.append(json.loads(messages[-1]['content'])); return proposal
    return synthesize(g, synthesizer), seen, g


def test_structural_statements_must_cite_real_measurements_with_their_exact_values():
    structure = inspection()
    accepted, _, _ = grounded(structure)
    assert accepted.status == 'grounded' and accepted.structural_context[0].measurements == [structure.measurements[0]]
    two, _, _ = grounded(structure, 'GLY B:103 and ARG B:50 both lie within 4 Å of the receptor, among 32 interface residue pairs.', ('M1', 'M2'))
    assert two.status == 'grounded' and len(two.structural_context[0].measurements) == 2
    for statement, ids, phrase in [
        (CLOSEST, ('M9',), 'not made'),                                                     # nonexistent measurement
        ('GLY B:103 lies 2.4 Å from LYS C:593.', ('M1',), 'unsupported numbers 2.4'),        # rounded distance
        ('GLY B:104 lies 2.417 Å from LYS C:593.', ('M1',), 'unsupported numbers 104'),     # wrong residue number
        ('ARG B:50 lies 2.417 Å from the receptor.', ('M2',), 'unsupported numbers 2.417'), # another pair's distance
        ('GLY B:103 forms a hydrogen bond with LYS C:593.', ('M1',), 'does not establish hydrogen bond'),
        ('The close contact at GLY B:103 explains the high affinity.', ('M1',), 'does not establish affinity'),
        ('A mutation at LYS C:593 would weaken binding.', ('M1',), 'does not establish mutation'),
        ('GLY B:103 contact keeps occupancy high.', ('M1',), 'does not establish occupancy'),
    ]:
        rejected, seen, _ = grounded(structure, statement, ids)
        # The statement is never shown: the proposal is rejected, or just this item is omitted and noted.
        assert not rejected.structural_context and (rejected.status == 'rejected' or any('omitted' in n for n in rejected.notes)), statement
        assert phrase in ' '.join(seen[1]['previous_validation_errors']), statement
        # The server-written note about the structure survives a rejected proposal.
        assert '1N8Z' in rejected.structure_note


def test_structural_context_is_impossible_without_an_inspected_available_structure():
    unavailable = StructureInspection(status='unavailable', reason='unknown_structure', detail='No verified cached drug–target structure exists for this pair.')
    for structure in (None, unavailable):
        rejected, seen, _ = grounded(structure)
        assert not rejected.structural_context and 'no verified structure was inspected' in seen[1]['previous_validation_errors'][0]
    assert grounded(None, ids=('M1',))[0].structure_note is None
    assert 'No verified experimental structure' in grounded(unavailable)[0].structure_note
    with pytest.raises(ValidationError, match='reason and no measurements'):
        StructureInspection(status='unavailable', reason='unknown_structure', measurements=inspection(1).measurements)
    with pytest.raises(ValidationError, match='verified structure metadata'):
        StructureInspection(status='available')


def test_a_turn_cannot_pair_an_answer_with_measurements_it_did_not_make():
    structure = inspection()
    accepted, _, g = grounded(structure)
    turn = dict(turn_id='turn-x', status='completed', original_text='q', result=g.result, synthesis=accepted)
    AgentTurn(**turn, structure=structure)
    with pytest.raises(ValidationError, match='not made in this turn'): AgentTurn(**turn)
    with pytest.raises(ValidationError, match='not made in this turn'): AgentTurn(**turn, structure=inspection(1).model_copy(update={'measurements': []}))
    altered = structure.model_copy(deep=True)
    altered.measurements[0].contact.distance_angstrom = 1.0
    with pytest.raises(ValidationError, match='not made in this turn'): AgentTurn(**turn, structure=altered)
    data = accepted.model_dump(mode='json')
    data['status'] = 'unavailable'; data['answer'] = None
    from app.schemas.synthesis import ScientificSynthesis
    with pytest.raises(ValidationError, match='cannot carry model-authored content'): ScientificSynthesis.model_validate(data)
