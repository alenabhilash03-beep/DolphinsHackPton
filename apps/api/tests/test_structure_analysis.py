"""8C.1 structure analysis: verified assets, viewer parity and honest unavailable outcomes."""
import json
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient

from app.agent.structure_tools import build_structure_tools
from app.config import ROOT
from app.schemas.structure_analysis import ResidueSelector as Residue
from app.structures.geometry import Partners, interface_contacts, parse, residue_contacts
from app.structures.service import ASSETS, ASSET_ROOT, StructureService, resolve

PARITY = json.loads((ROOT / 'data/structures/geometry-parity.json').read_text())
SERVICE = StructureService()


def key(residue):
    return f'{residue.chain}:{residue.residue_number}{residue.insertion_code}:{residue.residue_name}'


def rows(measurements, selected_role='drug'):
    """Fixture row order: selected (or drug) residue first, then its counterpart."""
    out = []
    for m in measurements:
        first, second = ((m.drug_residue, m.drug_atom), (m.target_residue, m.target_atom))
        if selected_role == 'target':
            first, second = second, first
        out.append([key(first[0]), first[1].name, first[1].serial, key(second[0]), second[1].name, second[1].serial, m.distance_angstrom])
    return out


def same(actual, expected):
    assert [row[:6] for row in actual] == [row[:6] for row in expected]
    assert all(abs(a[6] - e[6]) < 1e-9 for a, e in zip(actual, expected))


@pytest.mark.parametrize('pdb_id,pairs,distance,drug,target', [
    ('1N8Z', 32, 2.4169871741488387, ('B', 103, 'GLY', 'O'), ('C', 593, 'LYS', 'NZ')),
    ('1IEP', 45, 2.668499578414803, ('A', 201, 'STI', 'N51'), ('A', 360, 'ILE', 'O')),
])
def test_reference_distances_and_complete_interface_match_the_viewer(pdb_id, pairs, distance, drug, target):
    expected = PARITY['structures'][pdb_id]
    assert expected['sha256'] == ASSETS[pdb_id].sha256 == sha256((ASSET_ROOT / f'{pdb_id}.pdb').read_bytes()).hexdigest()
    result = SERVICE.interface(pdb_id, 100)
    assert result.status == 'available' and result.residue_pair_count == pairs == len(expected['interface']) and not result.truncated
    same(rows(result.contacts), expected['interface'])
    closest = result.contacts[0]
    assert abs(closest.distance_angstrom - distance) < 1e-12
    assert (closest.drug_residue.chain, closest.drug_residue.residue_number, closest.drug_residue.residue_name, closest.drug_atom.name) == drug
    assert (closest.target_residue.chain, closest.target_residue.residue_number, closest.target_residue.residue_name, closest.target_atom.name) == target
    assert all(c.within_cutoff and c.distance_angstrom <= 4 for c in result.contacts)
    assert result.provenance.coordinate_sha256 == ASSETS[pdb_id].sha256 and '4 Å' in result.provenance.cutoff_rule
    assert 'do not establish' in result.provenance.limitation
    limited = SERVICE.interface(pdb_id, 3)
    assert limited.truncated and len(limited.contacts) == 3 and limited.residue_pair_count == pairs


@pytest.mark.parametrize('pdb_id', ['1N8Z', '1IEP'])
def test_selected_residue_neighbours_match_the_inspection_sidebar(pdb_id):
    for residue_key, expected in PARITY['structures'][pdb_id]['neighbours'].items():
        chain, number, _ = residue_key.split(':')
        result = SERVICE.distance(pdb_id, Residue(chain=chain, residue_number=int(number)), limit=8)
        assert result.status == 'measured'
        role = 'drug' if key(result.measurements[0].drug_residue) == residue_key else 'target'
        same(rows(result.measurements, role), expected)
        # A named counterpart returns exactly the pair the sidebar would highlight.
        other = expected[0][3].split(':')
        named = SERVICE.distance(pdb_id, Residue(chain=chain, residue_number=int(number)), Residue(chain=other[0], residue_number=int(other[1])))
        assert len(named.measurements) == 1 and abs(named.measurements[0].distance_angstrom - expected[0][6]) < 1e-9
    # Nearest-neighbour listings may extend beyond the cutoff and say so.
    chain, number, _ = next(iter(PARITY['structures'][pdb_id]['neighbours'])).split(':')
    far = SERVICE.distance(pdb_id, Residue(chain=chain, residue_number=int(number)), limit=20)
    assert all(m.within_cutoff == (m.distance_angstrom <= 4) for m in far.measurements)
    # A single antibody residue has few close neighbours; the imatinib ligand has more than twenty within the cutoff.
    assert any(not m.within_cutoff for m in far.measurements) == (pdb_id == '1N8Z')


def test_metadata_reports_deposition_species_construct_and_entities():
    her2 = SERVICE.metadata('1n8z')
    assert her2.status == 'available' and her2.provenance.pdb_id == '1N8Z' and her2.resolution_angstrom == 2.52
    assert her2.experimental_method == 'X-RAY DIFFRACTION' and 'HER2' in her2.title
    assert [(e.role, e.kind, e.chains) for e in her2.entities] == [('drug', 'protein', ['A']), ('drug', 'protein', ['B']), ('target', 'protein', ['C'])]
    target = her2.entities[-1]
    assert target.fragment == 'EXTRACELLULAR DOMAIN' and target.organism_scientific == 'HOMO SAPIENS'
    assert sum(e.resolved_heavy_atoms for e in her2.entities) <= PARITY['structures']['1N8Z']['heavy_atoms']
    assert her2.reported_unresolved_residues == PARITY['structures']['1N8Z']['reported_unresolved'] and not her2.same_crystal_copy_only
    abl = SERVICE.metadata('1IEP')
    ligand, kinase = abl.entities
    assert (ligand.kind, ligand.ligand_code, ligand.resolved_heavy_atoms) == ('ligand', 'STI', 74)
    assert kinase.organism_scientific == 'MUS MUSCULUS' and kinase.fragment == 'KINASE DOMAIN' and abl.same_crystal_copy_only
    assert 'mouse' in abl.provenance.scope and 'not human BCR-ABL' in abl.provenance.scope
    assert abl.alternate_conformers == 'none_present'


def test_unresolved_absent_and_non_partner_residues_are_unavailable_with_the_reason():
    def reason(pdb_id, *selectors):
        result = SERVICE.distance(pdb_id, *selectors)
        assert result.status == 'unavailable' and not result.measurements and result.provenance is not None
        return result.reason
    assert reason('1N8Z', Residue(chain='C', residue_number=102)) == 'residue_reported_unresolved'
    assert reason('1N8Z', Residue(chain='C', residue_number=99999)) == 'residue_absent_cause_unknown'
    assert reason('1N8Z', Residue(chain='B', residue_number=103), Residue(chain='C', residue_number=102)) == 'residue_reported_unresolved'
    assert reason('1N8Z', Residue(chain='B', residue_number=103), Residue(chain='Z', residue_number=1)) == 'residue_absent_cause_unknown'
    water = next(a for a in parse((ASSET_ROOT / '1N8Z.pdb').read_text()).atoms if a.resn == 'HOH')
    assert reason('1N8Z', Residue(chain=water.chain, residue_number=water.resi)) == 'not_a_binding_partner'


def test_same_entity_and_cross_copy_pairs_are_never_measured():
    light_heavy = SERVICE.distance('1N8Z', Residue(chain='A', residue_number=30), Residue(chain='B', residue_number=103))
    assert (light_heavy.status, light_heavy.reason) == ('unavailable', 'same_binding_partner')
    assert SERVICE.distance('1N8Z', Residue(chain='C', residue_number=593), Residue(chain='C', residue_number=560)).reason == 'same_binding_partner'
    cross = SERVICE.distance('1IEP', Residue(chain='A', residue_number=201), Residue(chain='B', residue_number=360))
    assert (cross.status, cross.reason) == ('unavailable', 'different_crystal_copy')
    # Listing neighbours of the copy-A ligand never reaches copy B, and the interface never pairs copies.
    assert all(m.target_residue.chain == 'A' for m in SERVICE.distance('1IEP', Residue(chain='A', residue_number=201), limit=20).measurements)
    assert all(c.drug_residue.chain == c.target_residue.chain for c in SERVICE.interface('1IEP', 100).contacts)
    assert all(c.drug_residue.chain in 'AB' and c.target_residue.chain == 'C' for c in SERVICE.interface('1N8Z', 100).contacts)


def test_unknown_pairs_and_identifiers_return_unavailable_without_substitution():
    assert resolve('Herceptin', 'ERBB2') == '1N8Z' and resolve(' Imatinib ', 'ABL1') == '1IEP'
    for drug, target in [('imatinib', 'HER2'), ('trastuzumab', 'ABL1'), ('cetuximab', 'EGFR'), ('', '')]:
        assert resolve(drug, target) is None
    for result in (SERVICE.metadata('9XYZ'), SERVICE.interface('9XYZ'), SERVICE.distance('9XYZ', Residue(chain='A', residue_number=1))):
        assert result.status == 'unavailable' and result.reason == 'unknown_structure' and result.provenance is None


def test_altered_or_missing_assets_are_refused_and_verified_results_are_immutable(tmp_path):
    original = (ASSET_ROOT / '1N8Z.pdb').read_bytes()
    (tmp_path / '1N8Z.pdb').write_bytes(original.replace(b'HERCEPTIN', b'HERCEPTIM', 1))
    altered = StructureService(tmp_path)
    for result in (altered.metadata('1N8Z'), altered.interface('1N8Z'), altered.distance('1N8Z', Residue(chain='B', residue_number=103))):
        assert result.status == 'unavailable' and result.reason == 'asset_integrity_failed' and not getattr(result, 'contacts', [])
    assert altered.metadata('1IEP').reason == 'asset_unavailable'
    # A repaired asset is re-verified rather than served from a cached failure.
    (tmp_path / '1N8Z.pdb').write_bytes(original)
    assert altered.interface('1N8Z', 1).status == 'available'
    # Callers cannot change the cached model through a returned measurement.
    first = SERVICE.interface('1N8Z', 1)
    first.contacts[0].distance_angstrom = 99.0
    first.contacts.clear()
    again = SERVICE.interface('1N8Z', 1)
    assert abs(again.contacts[0].distance_angstrom - 2.4169871741488387) < 1e-12
    model = SERVICE._open('1N8Z')[1]
    with pytest.raises(AttributeError): model.atoms[0].x = 0.0
    assert isinstance(model.atoms, tuple)


def test_parser_fails_closed_on_alternate_conformers_and_ambiguous_records():
    line = next(l for l in (ASSET_ROOT / '1N8Z.pdb').read_text().splitlines() if l.startswith('ATOM  '))
    with pytest.raises(ValueError, match='conformers'): parse(line[:16] + 'A' + line[17:])
    with pytest.raises(ValueError, match='coordinate'): parse(line[:30] + ' ' * 8 + line[38:])
    with pytest.raises(ValueError, match='identifiers'): parse(line + '\n' + line)
    with pytest.raises(ValueError, match='element'): parse(line[:76] + '  ' + line[78:])
    with pytest.raises(ValueError, match='No deposited'): parse('HEADER only')
    hydrogen = line[:6] + '99999' + line[11:76] + ' H' + line[78:]
    assert len(parse(line + '\n' + hydrogen).atoms) == 1
    second_model = 'MODEL        1\n' + line + '\nENDMDL\nMODEL        2\n' + line[:6] + '88888' + line[11:] + '\nENDMDL'
    assert len(parse(second_model).atoms) == 1


def test_cutoff_boundary_is_inclusive_and_matches_brute_force():
    def atom(serial, chain, resi, x):
        return f'ATOM  {serial:5d}  CA  GLY {chain}{resi:4d}    {x:8.3f}{0:8.3f}{0:8.3f}  1.00 20.00           C  '
    model = parse('\n'.join([atom(1, 'A', 1, -4), atom(2, 'A', 1, -2), atom(3, 'C', 2, 2), atom(4, 'C', 3, 3), atom(5, 'C', 4, 100)]))
    partners = Partners(frozenset('AB'), frozenset('C'))
    found = interface_contacts(model, partners)
    assert [(a.serial, b.serial, d) for a, b, d in found] == [(2, 3, 4.0)]
    assert residue_contacts(model, partners, model.atoms[0].residue)[0][2] == 4.0
    for cutoff in (0, -1, 11, float('nan')):
        with pytest.raises(ValueError): interface_contacts(model, partners, cutoff)


def test_tools_and_api_expose_the_same_measurements():
    find, contacts, measure = build_structure_tools(SERVICE)
    assert [t.name for t in (find, contacts, measure)] == ['find_verified_structure', 'list_interface_contacts', 'measure_residue_distance']
    found = find.invoke({'drug_name': 'trastuzumab', 'target': 'HER2'})
    assert found['status'] == 'available' and found['provenance']['pdb_id'] == '1N8Z'
    missing = find.invoke({'drug_name': 'cetuximab', 'target': 'EGFR'})
    assert missing == {'status': 'unavailable', 'reason': 'unknown_structure', 'detail': missing['detail']} and 'unaffected' in missing['detail']
    listed = contacts.invoke({'pdb_id': '1N8Z', 'limit': 2})
    assert listed['residue_pair_count'] == 32 and len(listed['contacts']) == 2 and len(json.dumps(listed)) < 3000
    measured = measure.invoke({'pdb_id': '1N8Z', 'residue': {'chain': 'B', 'residue_number': 103}, 'counterpart': {'chain': 'C', 'residue_number': 593}})
    assert measured['measurements'][0]['distance_angstrom'] == listed['contacts'][0]['distance_angstrom']
    assert measure.invoke({'pdb_id': '1N8Z', 'residue': {'chain': 'C', 'residue_number': 102}})['reason'] == 'residue_reported_unresolved'
    with pytest.raises(Exception): contacts.invoke({'pdb_id': '1N8Z', 'limit': 1000})
    from app.main import app
    client = TestClient(app)
    assert client.get('/api/structures', params={'drug': 'imatinib', 'target': 'ABL1'}).json()['provenance']['pdb_id'] == '1IEP'
    assert client.get('/api/structures', params={'drug': 'aspirin', 'target': 'COX1'}).json()['reason'] == 'unknown_structure'
    served = client.get('/api/structures/1N8Z/interface', params={'limit': 2}).json()
    assert served['truncated'] and [c['distance_angstrom'] for c in served['contacts']] == [c['distance_angstrom'] for c in listed['contacts']]
    api = client.post('/api/structures/1N8Z/distance', json={'residue': {'chain': 'B', 'residue_number': 103}, 'counterpart': {'chain': 'C', 'residue_number': 593}}).json()
    assert api['measurements'][0]['distance_angstrom'] == measured['measurements'][0]['distance_angstrom']
    assert client.get('/api/structures/1N8Z/interface', params={'limit': 0}).status_code == 422
    assert client.post('/api/structures/1N8Z/distance', json={'residue': {'chain': 'BB', 'residue_number': 103}}).status_code == 422
