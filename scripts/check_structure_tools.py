"""Live pinned free Nemotron check that the 8C.1 structure tools are agent-callable.

The model only chooses tools and arguments. Every identifier and distance in the report is read from
the tool results, not from model prose. This is not yet part of the research agent (8C.2).
"""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'apps/api'))
from langchain.agents import create_agent
from langchain_core.messages import ToolMessage
from app.agent.structure_tools import build_structure_tools
from app.config import Settings

PROMPT='''You inspect verified experimental structures with tools only. Never state a distance, residue or
structure fact from memory. First find the verified structure for the drug and target. If none exists, say
so and stop. Otherwise list the two closest interface contacts, then measure the distance between the two
residues of the closest contact with measure_residue_distance, copying chain and residue_number exactly.'''


def main():
    from langchain_nvidia_ai_endpoints import ChatNVIDIA
    settings=Settings()
    if not settings.nvidia_api_key: print(json.dumps({'status':'failed','reason':'NVIDIA credentials unavailable'})); return 1
    model=ChatNVIDIA(model=settings.hypothesim_llm_model,api_key=settings.nvidia_api_key.get_secret_value(),temperature=0,timeout=45,
        max_completion_tokens=4096,usage_telemetry_enabled=False)
    report={'model':settings.hypothesim_llm_model,'cases':{}};failed=False
    for name,question,expected in [
        ('trastuzumab_her2','Drug: trastuzumab. Target: HER2.',['find_verified_structure','list_interface_contacts','measure_residue_distance']),
        ('unknown_pair','Drug: cetuximab. Target: EGFR.',['find_verified_structure'])]:
        try:
            state=create_agent(model,tools=build_structure_tools(),system_prompt=PROMPT).invoke({'messages':[{'role':'user','content':question}]},config={'recursion_limit':16})
        except Exception as exc:
            report['cases'][name]={'passed':False,'error':type(exc).__name__};failed=True;continue
        outputs=[(m.name,json.loads(m.content)) for m in state['messages'] if isinstance(m,ToolMessage)]
        calls=[tool for tool,_ in outputs]
        case={'tool_calls':calls,'statuses':[out.get('status') for _,out in outputs]}
        if name=='unknown_pair':
            ok=calls==expected and outputs[0][1]['reason']=='unknown_structure'
        else:
            listed=next((out for tool,out in outputs if tool=='list_interface_contacts'),None)
            measured=next((out for tool,out in reversed(outputs) if tool=='measure_residue_distance' and out.get('status')=='measured'),None)
            ok=bool(calls[:1]==expected[:1] and listed and measured and set(expected)<=set(calls)
                and measured['measurements'][0]['distance_angstrom']==listed['contacts'][0]['distance_angstrom'])
            if listed and measured:
                closest=measured['measurements'][0]
                case.update(pdb_id=listed['provenance']['pdb_id'],coordinate_sha256=listed['provenance']['coordinate_sha256'],
                    closest_pair=f"{closest['drug_residue']['residue_name']} {closest['drug_residue']['chain']}:{closest['drug_residue']['residue_number']} {closest['drug_atom']['name']} / "
                        f"{closest['target_residue']['residue_name']} {closest['target_residue']['chain']}:{closest['target_residue']['residue_number']} {closest['target_atom']['name']}",
                    distance_angstrom=closest['distance_angstrom'])
        case['passed']=ok;failed=failed or not ok;report['cases'][name]=case
    report['status']='failed' if failed else 'passed'
    (ROOT/'work').mkdir(exist_ok=True);(ROOT/'work'/'structure-tools-check.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));return 1 if failed else 0

if __name__=='__main__': raise SystemExit(main())
