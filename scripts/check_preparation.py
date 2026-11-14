"""Exercise the full preparation toolkit with explicit synthetic assumptions; no LLM calls."""
import argparse
from datetime import datetime, timezone
import json
from math import exp
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'apps/api'))
from app.agent.preparation_tools import build_preparation_research_toolkit
from app.research.preparation import PreparationService


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-identity',action='store_true',help='Allow public identity lookup for a drug without a local reviewed identity.')
    parser.add_argument('--drug',default='Herceptin')
    parser.add_argument('--target',default='HER2')
    args=parser.parse_args()
    if not args.live_identity and args.drug!='Herceptin':
        parser.error('Use --live-identity to permit arbitrary-name identity lookup, or keep the local Herceptin identity.')
    service=PreparationService()
    tools={item.name:item for item in build_preparation_research_toolkit(service)}
    calls=[]
    def call(name,body):
        calls.append(name)
        return tools[name].invoke(body)
    creation={'drug_name':args.drug,'target':args.target,'route':'iv_infusion',
        'original_hypothesis':'SYNTHETIC SOFTWARE ACCEPTANCE ONLY: examine assumed dissociation with zero free drug. No drug-specific biological prediction.'}
    record=call('start_experiment_preparation',{'request':creation})
    prep=record['preparation']
    if not prep['resolved_drug_identifier'] or not record['identity_molecular_form']:
        print(json.dumps({'status':'unavailable','identity_status':record['identity_status'],'solver_called':False}))
        return 1
    rationale='Explicit synthetic software-test input supplied by Codex; not a literature value, expert review or clinical recommendation.'
    now=datetime.now(timezone.utc).isoformat()
    inputs=[('pk.volume_L',2.,'L'),('pk.clearance_L_h',.1,'L/hour'),
        ('binding.association_nM_inv_h_inv',.01,'nM^-1 hour^-1'),('binding.dissociation_h_inv',.1,'hour^-1'),
        ('molecular_weight_g_mol',1000.,'g/mol'),('body_mass_kg',70.,'kg'),('exposure_factor',1.,'1')]
    parameters=[{'parameter_id':f'check-{index}','parameter':field,'value':value,'unit':unit,
        'original_value':value,'original_unit':unit,'normalization':'Explicit synthetic test input',
        'provenance':'researcher_assumed','rationale':rationale,'entered_at':now,
        'context':{'drug_identifier':prep['resolved_drug_identifier'],'target_identifier':args.target,
            'molecular_form':record['identity_molecular_form'],'species':'human','exposure_compartment':'extracellular',
            'applicability_notes':['Hypothetical cell-free target; not physiological intracellular exposure.']}}
        for index,(field,value,unit) in enumerate(inputs)]
    record=call('update_experiment_preparation',{'preparation_id':prep['preparation_id'],'update':{
        'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256'],'parameters':parameters,
        'scope':{'molecular_form':record['identity_molecular_form'],'species':'human','target_compartment':'extracellular',
            'binding_regime':'reversible_1_to_1','pk_regime':'linear_effective','competition':'absent_assumed',
            'rationale':'Synthetic nondepleting cell-free target without competition, coupled to an assumed effective PK reservoir. No claim of intracellular/clinical applicability.'},
        'design':{'duration_h':24.,'administration':[{'kind':'infusion','start_h':0.,'duration_h':1.,'amount_mg':0.}],
            'initial_occupancy':.5,'rationale':rationale}}})
    prep=record['preparation']
    if prep['state']!='ready_for_configuration':
        print(json.dumps({'status':'blocked','state':prep['state'],'reasons':prep['reasons'],'solver_called':False}))
        return 1
    configured=call('configure_prepared_experiment',{'preparation_id':prep['preparation_id'],'version':{
        'base_revision':prep['revision'],'base_evidence_sha256':prep['evidence_sha256']}})
    result=call('simulate_prepared_experiment',{'request':{'experiment':configured['experiment'],'client_revision':0,'output_points':100}})
    expected=.5*exp(-.1*24)
    assert abs(result['scenarios'][0]['occupancy'][-1]-expected)<1e-5
    assert all(item['review_status']=='candidate' for item in configured['experiment']['evidence'])
    output=ROOT/'work/preparation-check.json'
    output.write_text(json.dumps({'origin':'synthetic_software_acceptance_not_scientific_evidence',
        'preparation':record,'configured':configured,'result':result},indent=2)+'\n')
    print(json.dumps({'status':'passed','drug':args.drug,'identity_status':record['identity_status'],
        'identity_retrieval_status':record['identity_retrieval_status'],'classification':configured['classification'],
        'tools':calls,'analytical_reference_matches':True,'live_llm_called':False,'output':str(output)}))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
