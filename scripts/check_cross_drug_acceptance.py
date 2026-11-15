"""8E.2 reproducible offline matrix: synthetic providers/data, real agent, APIs, solver and stores.

No live scientific data claim, hosted LLM request or API key is needed.
"""
import json
from pathlib import Path
import subprocess
import sys
from xml.etree import ElementTree
ROOT=Path(__file__).resolve().parents[1]

def main():
    output=ROOT/'work/8E.2';output.mkdir(parents=True,exist_ok=True)
    result=subprocess.run([sys.executable,'-m','pytest','apps/api/tests/test_cross_drug_acceptance.py',
        '--junitxml='+str(output/'matrix-junit.xml')],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (output/'matrix.log').write_text(result.stdout)
    xml=ElementTree.parse(output/'matrix-junit.xml')
    cases=[{'name':case.attrib['name'],'status':'failed' if case.find('failure') is not None or case.find('error') is not None
        else 'skipped' if case.find('skipped') is not None else 'passed'} for case in xml.findall('.//testcase')]
    report={'verification_kind':'8E.2 offline cross-drug integration acceptance',
        'external_dependencies':'Synthetic identities/literature/extraction and scripted agent/synthesizer; no real-drug measurement claims.',
        'actual_components':['LangChain graph','FastAPI background jobs','preparation/assumption validation','SciPy solver',
            'citation/quantity validation','verified primary coordinates','result/history store','read-only real-drug audits'],
        'tests':cases,'passed':sum(c['status']=='passed' for c in cases),'failed':sum(c['status']=='failed' for c in cases)}
    (output/'offline-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return result.returncode
if __name__=='__main__':raise SystemExit(main())
