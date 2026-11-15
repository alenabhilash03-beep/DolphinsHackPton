import {runAnalysis} from './research-analysis.mjs';
self.onmessage=({data:{id,type,p,config}})=>{try{const result=runAnalysis(type,p,config,progress=>self.postMessage({id,progress}));self.postMessage({id,result})}catch(error){self.postMessage({id,error:error.message||'Analysis failed.'})}};
