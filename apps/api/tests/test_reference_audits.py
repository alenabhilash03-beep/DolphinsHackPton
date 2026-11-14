import copy
import json
from math import exp,log
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from app.agent.reference_audit_tool import read_reference_audit
from app.config import Settings
from app.main import create_app
from app.research.reference_audits import ROOT,load_reference_audit,verify_structure
from app.research.preparation_units import normalize_parameter
from app.schemas.contracts import BindingParameters
from app.simulation.pk import PKSegment,PKTrajectory
from app.simulation.solver import solve_binding


def test_reference_is_explicitly_blocked_and_not_a_drug_allowlist():
    audit=load_reference_audit('CHEMBL941')
    assert audit.status=='evidence_block'
    assert audit.runnable is False and audit.scientific_profile_enabled is False
    assert audit.explicit_hypothetical_preparation_available is True
    assert all(item.review_status=='candidate' for item in audit.facts)
    with pytest.raises(KeyError):load_reference_audit('some-other-drug')
    assert read_reference_audit.invoke({'drug':'some-other-drug'})['audit_available'] is False
    assert read_reference_audit.invoke({'drug':'imatinib'})['audit']['runnable'] is False


def test_real_rate_pair_conversions_and_conflicting_affinities_are_preserved():
    facts={fact.fact_id:fact for fact in load_reference_audit('imatinib').facts}
    kon,_=normalize_parameter(facts['peim_kon'].value,facts['peim_kon'].unit,'nM^-1 hour^-1')
    koff,_=normalize_parameter(facts['peim_koff'].value,facts['peim_koff'].unit,'hour^-1')
    assert kon==pytest.approx(.0792)
    assert koff==pytest.approx(2.664)
    assert koff/kon==pytest.approx(facts['peim_kd_ratio'].value)
    assert facts['peim_kd_table'].value==34.
    assert facts['peim_kd_text'].value==21.
    assert abs(koff/kon-34.)<.5
    assert abs(koff/kon-21.)>10.


def test_assay_rate_numerical_reference_matches_constant_bath_solution():
    # Numerical check only: no clinical PK or biological model endorsement.
    facts={fact.fact_id:fact for fact in load_reference_audit('imatinib').facts}
    kon=facts['peim_kon_h'].value;koff=facts['peim_koff_h'].value
    concentration=200.;horizon=.25
    binding=BindingParameters(association_nM_inv_h_inv=kon,dissociation_h_inv=koff,affinity_nM=koff/kon)
    # Balanced reservoir input/clearance clamps concentration exactly.
    pk=PKTrajectory(horizon,1.,1.,(PKSegment(0.,horizon,concentration,concentration),),concentration)
    result=solve_binding(pk,binding,1.)
    expected=concentration/(concentration+koff/kon)*(1-exp(-(kon*concentration+koff)*horizon))
    assert result.endpoint_occupancy==pytest.approx(expected,rel=2e-6)


def test_step_specific_rates_and_isotope_pk_are_not_defaults():
    facts={fact.fact_id:fact for fact in load_reference_audit('imatinib').facts}
    assert facts['physical_kd'].value==25000.
    assert facts['physical_koff'].decision=='step_specific'
    assert facts['induced_rev'].decision=='step_specific'
    assert facts['d8_v'].decision=='not_selected'
    assert facts['d8_ratio_half'].value==pytest.approx(log(2)*462/7.6)
    assert facts['d8_half'].value==45.5
    assert facts['parent_mw'].value!=facts['salt_mw'].value


def test_experimental_structure_identifies_mouse_domain_and_parent_ligand():
    audit=load_reference_audit('imatinib')
    structure=audit.structure
    assert structure.target_species=='Mus musculus'
    assert structure.target_uniprot_id=='P00520'
    assert structure.ligand_comp_id=='STI'
    assert structure.ligand_instances=={'A:201':37,'B:202':37}
    metadata=json.loads((ROOT/'data/structures/1IEP.metadata.json').read_text())
    data=(ROOT/'apps/web/public/structures/1IEP.pdb').read_bytes()
    verify_structure(structure,data,metadata)
    with pytest.raises(ValueError,match='checksum'):verify_structure(structure,data+b'\n',metadata)
    wrong=structure.model_copy(update={'target_taxonomy_id':9606})
    with pytest.raises(ValueError,match='species'):verify_structure(wrong,data,metadata)
    wrong=structure.model_copy(update={'ligand_comp_id':'SO4'})
    with pytest.raises(ValueError,match='ligand'):verify_structure(wrong,data,metadata)


def test_audit_api_cannot_be_used_as_a_simulation_request():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response=client.get('/api/research/audits/imatinib')
        assert response.status_code==200
        assert response.json()['scientific_profile_enabled'] is False
        assert client.get('/api/research/audits/unknown-name').status_code==404
        assert client.post('/api/simulations',json=response.json()).status_code==422


def test_catalog_does_not_promote_the_blocked_reference():
    catalog=json.loads((ROOT/'data/drugs/catalog.json').read_text())
    assert not any(profile['chembl_id']=='CHEMBL941' for profile in catalog['profiles'])
