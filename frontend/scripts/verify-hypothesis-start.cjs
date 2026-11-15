const assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),Module=require('node:module'),swc=require('next/dist/build/swc'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://127.0.0.1:3011/workspace'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,devicePixelRatio:1,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event});
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.requestAnimationFrame=callback=>setTimeout(callback,0);global.cancelAnimationFrame=clearTimeout;global.ResizeObserver=class{observe(){}disconnect(){}};global.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});window.matchMedia=global.matchMedia;HTMLElement.prototype.scrollIntoView=()=>{};
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,name)=>name in target?target[name]:()=>{}});dom.window.HTMLCanvasElement.prototype.getContext=()=>ctx;

// Synthetic transport fixtures test UI state; they are never included in production routes.
const snapshot=JSON.parse(readFileSync('public/demo/trastuzumab-demo.json','utf8'));
const requests=[];let nextJob=null,postError=false,deferredPost=null;
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
global.fetch=async(path,options={})=>{
 const route=new URL(String(path),'http://localhost').pathname;
 requests.push({route,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
 if(route==='/api/health')return response({service:'hypothesim-api',simulation_available:true,ai_credentials_configured:true});
 if(route.startsWith('/api/agent/jobs/')&&options.method==='POST'){
  if(postError)return response({detail:'Provider temporarily unavailable.'},502);
  if(deferredPost)return deferredPost;
  return response({job_id:'b'.repeat(32),mode:'research',status:'queued'});
 }
 if(route==='/api/agent/jobs/'+'b'.repeat(32))return response(nextJob??{job_id:'b'.repeat(32),mode:'research',status:'running'});
 if(route==='/api/drugs/support')return response({});
 if(route.startsWith('/demo/')||route.startsWith('/api/simulations/'))throw Error('Unexpected automatic data request: '+route);
 return response({},404);
};
function completedJob(){
 const result=snapshot.result,config=result.configuration,run='run-'+'c'.repeat(32),events=[];
 const receipt={result_id:result.result_id,experiment_id:config.experiment_id,configuration_sha256:result.configuration_hash,client_revision:result.client_revision,metrics:[]};
 const configReceipt={experiment_id:config.experiment_id,configuration_sha256:result.configuration_hash,parameters:[],schedules:[]};
 const add=(kind,state,tool_name=null,stage='run',summary=null,tool_call_id=null)=>events.push({event_id:'fixture-event-'+events.length,run_id:run,sequence:events.length+1,kind,state,tool_name,stage,summary,tool_call_id,timestamp:'2026-11-15T12:00:00Z',elapsed_ms:1});
 add('run','started');
 for(const [tool,stage,summary,id] of [['configure_prepared_experiment','configuration',{experiment:configReceipt},'config'],['simulate_current_comparison','simulation',{result:receipt},'solver'],['interpret_current_result','interpretation',{result:receipt},'interpret']]){
  add('tool','started',tool,stage,null,id);add('tool','succeeded',tool,stage,summary,id);
 }
 add('run','succeeded');
 return {job_id:'b'.repeat(32),mode:'research',status:'completed',execution_run_id:run,execution_events:events,turn:{status:'completed',result,interpretation:snapshot.interpretation,research_papers:[],execution_run_id:run,execution_events:events}};
}
async function main(){await swc.loadBindings();const originalJS=require.extensions['.js'];const compile=(module,filename)=>module._compile(swc.transformSync(readFileSync(filename,'utf8'),{filename,jsc:{target:'es2022',parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}}).code,filename);require.extensions['.jsx']=compile;require.extensions['.js']=(module,filename)=>filename.includes('/app/science/')?compile(module,filename):originalJS(module,filename);
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),originalLoad=Module._load;Module._load=function(request){if(request==='next/dynamic')return ()=>props=>React.createElement('div',{'data-test-chart':'Plotly','data-traces':props.data?.length});if(request==='next/script')return ()=>null;return originalLoad.apply(this,arguments)};

 const ScientificExperiment=require('../app/scientific-experiment.jsx').default,root=createRoot(document.getElementById('root'));
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const render=key=>act(async()=>root.render(React.createElement(ScientificExperiment,{key,intent:{mode:'research',nonce:key}})));
 const setValue=async(el,value)=>act(async()=>{const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const hypothesis="Would slower antibody dissociation preserve occupancy after washout?";
 async function fill(){await setValue(document.getElementById('scientific-hypothesis'),hypothesis);await setValue(document.querySelector('input[placeholder="Drug name"]'),'trastuzumab');await setValue(document.querySelector('input[placeholder="Target name"]'),'HER2');}
 const submit=()=>act(async()=>document.querySelector('#agent-panel-research form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 const plots=()=>document.querySelectorAll('[data-test-chart]').length;
 await render(1);await fill();assert.equal(document.querySelector('#agent-panel-research .primary-button').disabled,false);
 await submit();await act(async()=>delay(50));
 const submitted=requests.find(r=>r.method==='POST');
 assert.equal(submitted.route,'/api/agent/jobs/research');assert.equal(submitted.body.request.original_hypothesis,hypothesis);assert.equal(submitted.body.request.drug_name,'trastuzumab');assert.equal(submitted.body.structured_baseline,false);
 assert.equal(plots(),0,'Queued/running research never uses example curves');assert.ok(document.querySelector('.research-waiting'));
 nextJob=completedJob();
 for(let i=0;i<30&&!plots();i++)await act(async()=>delay(100));
 assert.equal(plots(),2,'Only a linked, accepted agent result opens the plot workspace');
 assert.ok(document.querySelector('.study-context').textContent.includes('Simulation result'));
 assert.equal(document.getElementById('agent-panel-edit').hidden,false,'The accepted result is ready for iterative edits');
 await setValue(document.getElementById('experiment-edit'),'Double the dose in the selected alternative');
 await act(async()=>document.getElementById('revise').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 const editRequest=requests.find(r=>r.route==='/api/agent/jobs/edits'&&r.method==='POST');assert.ok(editRequest);assert.equal(editRequest.body.base_result_id,snapshot.result.result_id);assert.equal(editRequest.body.base_configuration_sha256,snapshot.result.configuration_hash);
 await render(2);assert.equal(plots(),0);assert.equal(document.getElementById('scientific-hypothesis').value,'');assert.equal(document.querySelector('.science-export'),null);
 nextJob={job_id:'b'.repeat(32),mode:'research',status:'completed',turn:{status:'needs_inputs',questions:['Which species should the experiment use?'],result:null,interpretation:null}};
 await fill();await submit();await act(async()=>delay(50));assert.equal(plots(),0,'A missing-input response has no substituted result');assert.ok(document.querySelector('.agent-continuation').textContent.includes('Which species'));
 await render(3);postError=true;await fill();await submit();assert.equal(plots(),0);assert.ok(document.querySelector('[role=alert]').textContent.includes('Provider temporarily unavailable'));
 await render(4);postError=false;let resolvePost;deferredPost=new Promise(resolve=>{resolvePost=resolve});await fill();await submit();
 await render(5);resolvePost(response({job_id:'b'.repeat(32),mode:'research',status:'queued'}));await act(async()=>delay(50));
 assert.equal(document.getElementById('scientific-hypothesis').value,'','A late response cannot restore the abandoned experiment');assert.equal(plots(),0);assert.equal(document.querySelector('.agent-activity'),null);
 assert.equal(requests.filter(r=>r.route.startsWith('/demo/')||r.route.startsWith('/api/simulations/')).length,0);
 await act(async()=>root.unmount());Module._load=originalLoad;require.extensions['.js']=originalJS;
 console.log('Passed: blank draft → exact hypothesis request → running with no curves → verified result → linked iterative edit; repeated New clears state; missing inputs, provider failure and late responses never load an example. Agent transport uses explicit test fixtures.');
}
main().catch(error=>{console.error(error);process.exit(1)});
