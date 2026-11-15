import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {watch} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),state=path.join(root,'.local-preview');await mkdir(state,{recursive:true});
const engine=process.env.SCIENTIFIC_ENGINE_DIR||path.resolve(root,'..');
const python=process.env.SCIENTIFIC_PYTHON||path.join(engine,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
let webPort=process.env.PORT||'3000';const argv=process.argv.slice(2);for(let i=0;i<argv.length;i++)if(['--port','-p'].includes(argv[i]))webPort=argv[i+1];
const apiPort=process.env.SCIENTIFIC_API_PORT||'8011',base='http://127.0.0.1:'+apiPort;
let api,web,closing=false,restartTimer,restarting=false;
async function startApi(){
 const env={...process.env,PYTHONPATH:path.join(engine,'apps/api'),RESEARCH_DB_PATH:path.join(state,'research.sqlite3'),PREPARATION_DB_PATH:path.join(state,'preparations.sqlite3')};
 try{const file=await readFile(path.join(state,'provider.env'),'utf8');const line=file.split('\n').find(line=>line.startsWith('NVIDIA_API_KEY='));if(line)env.NVIDIA_API_KEY=JSON.parse(line.slice('NVIDIA_API_KEY='.length));}catch{}
 api=spawn(python,['-m','uvicorn','app.main:app','--host','127.0.0.1','--port',apiPort,'--no-access-log'],{cwd:engine,env,stdio:['ignore','inherit','inherit']});
 api.on('error',()=>console.error('The scientific service could not start.'));
 for(let attempt=0;attempt<60;attempt++){try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 throw Error('Scientific service readiness timed out.');
}
async function restartApi(){if(restarting||closing)return;restarting=true;try{if(api&&!api.killed){const stopped=new Promise(resolve=>api.once('exit',resolve));api.kill('SIGTERM');await stopped;}await startApi();console.log('Scientific service restarted; provider configuration updated.');}catch{console.error('Could not restart the scientific service.');}finally{restarting=false}}
await startApi();
const watcher=watch(state,(_,name)=>{if(name==='provider.env'){clearTimeout(restartTimer);restartTimer=setTimeout(()=>void restartApi(),300);}});
web=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname',process.env.PREVIEW_HOST||'127.0.0.1','--port',webPort],{cwd:root,env:{...process.env,HYPOTHESIM_LOCAL_PREVIEW:'1',API_BASE_URL:base,SCIENTIFIC_ENGINE_DIR:engine},stdio:'inherit'});
web.on('exit',()=>stop());
function stop(){if(closing)return;closing=true;watcher.close();clearTimeout(restartTimer);web?.kill('SIGTERM');api?.kill('SIGTERM');setTimeout(()=>process.exit(),500).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('Local preview only. The published site is unchanged.');
