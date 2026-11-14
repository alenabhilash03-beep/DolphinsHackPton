"""Developer-only UI acceptance backend: synthetic evidence, actual agent graph and solver.

Run on 8101 and point a separate Next server at it. No hosted provider calls.
Numerical tool calls are deliberately held for 8 seconds to inspect running/reload UI.
Supported edit examples exercise a recoverable rejected tool; a 121-day edit then
raises a synthetic provider error after the real solver returns. Missing-rate research
uses the explicitly synthetic Compound X / Target Y fixtures. Never use as a live demo.
"""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from time import sleep

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'apps/api'),str(ROOT/'apps/api/tests')]
from pydantic import PrivateAttr
from langchain_core.messages import AIMessage,HumanMessage
from test_generalized_agent import DrivingModel,research_service,SETTINGS
from app.main import create_app
import app.simulation.service as simulation

class AcceptanceModel(DrivingModel):
    _injected: bool=PrivateAttr(default=False)
    def _generate(self,messages,**kwargs):
        context=json.loads(next(m.content for m in messages if isinstance(m,HumanMessage)))
        request=context['request']
        self.mode='edit' if context['mode']=='edit' else 'research'
        if self.mode=='research':self.request=request['request']
        if self.mode=='edit' and not self._injected:
            self._injected=True
            return self._message('simulate_current_comparison',{})
        if self.mode=='edit' and '121 days' in request['text'] and self._step==3:
            raise RuntimeError('Synthetic acceptance provider failure after solver completion')
        if self.mode=='edit' and 'Make it better' in request['text'] and self._step>=2:
            return self._message('AgentDecision',{'status':'needs_inputs'})
        return super()._generate(messages,**kwargs)

    def _message(self,name,args):
        from langchain_core.outputs import ChatGeneration,ChatResult
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content='',tool_calls=[
            {'name':name,'args':args,'id':'ui-check-'+name}]))])

def main():
    import uvicorn
    with TemporaryDirectory(prefix='hypothesim-8a2-ui-') as directory:
        source,_=research_service(Path(directory),missing=True)
        api=create_app(SETTINGS,preparation_service=source.preparation)
        agent=api.state.generalized_agent
        agent.extractor=source.extractor
        agent._model=lambda:AcceptanceModel()
        original=simulation.run_simulation
        def held(*args,**kwargs):
            sleep(8)
            return original(*args,**kwargs)
        simulation.run_simulation=held
        print('SYNTHETIC UI ACCEPTANCE ONLY · no live provider · port 8101',flush=True)
        uvicorn.run(api,host='127.0.0.1',port=8101,log_level='warning')
if __name__=='__main__':main()
