"""8E.1 source-audit acceptance; actual assay math, no clinical profile promotion."""
from math import exp,log
import json
import pytest
from fastapi.testclient import TestClient
from app.agent.reference_audit_tool import read_reference_audit
from app.config import Settings
from app.main import create_app
from app.research.reference_audits import ROOT,load_reference_audit
from app.research.preparation_units import normalize_parameter
from app.schemas.contracts import BindingParameters
from app.simulation.pk import PKSegment,PKTrajectory
from app.simulation.solver import solve_binding


def test_cetuximab_audit_preserves_source_access_and_explicit_block():
    audit=load_reference_audit('Erbitux')
    assert audit.drug=='cetuximab' and audit.target=='EGFR'
    assert not audit.runnable and not audit.scientific_profile_enabled
    assert audit.explicit_hypothetical_preparation_available
    assert len(audit.sources)==5 and len(audit.facts)==27
    assert all(f.review_status=='candidate' for f in audit.facts)
    sources={s.source_id:s for s in audit.sources}
    assert sources['FDA2021'].content_sha256=='e1d2aa18cf10857dd80ece720df2c69e770feb2a25279eba15a3f0aed1349a44'
    assert sources['KIN2022'].content_sha256 is None
    assert 'not verified' in sources['KIN2022'].access_note
    assert 'not claimed latest' in sources['FDA2021'].access_note


def test_antibody_audit_does_not_fabricate_a_small_molecule_or_viewer_asset():
    audit=load_reference_audit('cetuximab')
    assert audit.structure is None and 'Fab' in audit.structure_note
    assert 'NAG' in audit.structure_note
    assert audit.follow_up_candidate is None
    from app.research.reference_audits import ReferenceAudit
    data=audit.model_dump(mode='json');data['structure_note']=None
    with pytest.raises(ValueError,match='explain its structure scope'):ReferenceAudit.model_validate(data)
    assert load_reference_audit('imatinib').structure.pdb_id=='1IEP'
    from app.structures.service import resolve
    assert resolve('cetuximab','EGFR') is None


@pytest.mark.parametrize('prefix',['fab','fc'])
def test_each_assay_pair_keeps_units_and_matches_analytical_occupancy(prefix):
    facts={f.fact_id:f for f in load_reference_audit('cetuximab').facts}
    if prefix=='fc':
        with pytest.raises(ValueError,match='approved conversion'):
            normalize_parameter(facts['fc_kon'].value,facts['fc_kon'].unit,'nM^-1 hour^-1')
        assert 'CONDITIONAL' in facts['fc_kon_h'].formula
        kon=facts['fc_kon'].value*3.6e-6  # Explicit dimensional assumption; not a verified conversion.
    else:
        kon,_=normalize_parameter(facts[prefix+'_kon'].value,facts[prefix+'_kon'].unit,'nM^-1 hour^-1')
    koff,_=normalize_parameter(facts[prefix+'_koff'].value,facts[prefix+'_koff'].unit,'hour^-1')
    kd=koff/kon
    assert kon==pytest.approx(facts[prefix+'_kon_h'].value)
    assert koff==pytest.approx(facts[prefix+'_koff_h'].value)
    assert kd==pytest.approx(facts[prefix+'_kd_ratio'].value)
    c=5.;duration=2.
    result=solve_binding(PKTrajectory(duration,1.,1.,(PKSegment(0.,duration,c,c),),c),
        BindingParameters(association_nM_inv_h_inv=kon,dissociation_h_inv=koff,affinity_nM=kd),1.)
    assert result.endpoint_occupancy==pytest.approx(c/(c+kd)*(1-exp(-(kon*c+koff)*duration)),rel=2e-6)


def test_assay_disagreement_and_regulatory_summaries_are_not_merged():
    f={f.fact_id:f for f in load_reference_audit('cetuximab').facts}
    assert f['fab_kd_ratio'].value==pytest.approx(.7692307692307693)
    assert f['fc_kd_ratio'].value==pytest.approx(.43392857142857144)
    assert f['fc_kd_mean'].value==.4 and f['fc_kd_sd'].value==.28
    assert f['fab_kon'].context!=f['fc_kon'].context
    assert f['eu_ratio_half'].value==pytest.approx(log(2)*2.9/.022)
    assert f['us_half_mean'].value==112.
    assert f['eu_ratio_half'].value!=112.
    for key,canonical in [('eu_v','L'),('eu_cl','L/hour')]:
        with pytest.raises(ValueError,match='approved conversion'):
            normalize_parameter(f[key].value,f[key].unit,canonical)


def test_api_and_read_only_tool_expose_audit_without_solver_authority():
    assert read_reference_audit.invoke({'drug':'Erbitux'})['audit']['runnable'] is False
    with TestClient(create_app(Settings(_env_file=None))) as c:
        response=c.get('/api/research/audits/cetuximab')
        assert response.status_code==200 and response.json()['structure'] is None
        assert c.post('/api/simulations',json=response.json()).status_code==422
        assert c.get('/api/research/audits/an-unfamiliar-name').status_code==404
    catalog=json.loads((ROOT/'data/drugs/catalog.json').read_text())
    assert not any('cetuximab' in json.dumps(p).lower() for p in catalog['profiles'])
