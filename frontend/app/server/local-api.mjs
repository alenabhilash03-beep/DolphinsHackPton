import {mkdir,readFile,writeFile,rename,stat,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import apiPaths from './scientific-api-paths.json';
const dir=path.join(process.cwd(),'.local-preview');
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const patterns=Object.entries(apiPaths).map(([route,methods])=>({pattern:new RegExp('^'+route.split('/').map(part=>part.startsWith('{')?'[A-Za-z0-9_.-]{1,100}':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$'),methods}));
let writeQueue=Promise.resolve();
function serialize(operation){const next=writeQueue.then(operation,operation);writeQueue=next.catch(()=>{});return next;}
const revision=text=>createHash('sha256').update(text).digest('hex');
async function stored(){try{const raw=await readFile(path.join(dir,'workspace.json'),'utf8');return {data:JSON.parse(raw),etag:revision(raw)}}catch(error){if(error.code==='ENOENT')return {data:null,etag:null};throw error;}}
function sameOrigin(request){const origin=request.headers.get('origin');if(!origin)return false;try{return [new URL(request.url).host,request.headers.get('host'),request.headers.get('x-forwarded-host')].includes(new URL(origin).host);}catch{return false;}}
export async function localApi(request){
 if(process.env.HYPOTHESIM_LOCAL_PREVIEW!=='1')return json({detail:'Local preview is disabled.'},404);
 const url=new URL(request.url),route=url.pathname,method=request.method;
 if(!['GET','HEAD'].includes(method)&&!sameOrigin(request))return json({detail:'Invalid request origin.'},403);
 if(route==='/api/me'&&method==='GET')return json({id:'local-preview',name:'Local Researcher',local_preview:true});
 if(route==='/api/local/configure'&&method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({detail:'JSON is required.'},415);
  if(Number(request.headers.get('content-length'))>2048)return json({detail:'Invalid key length.'},413);
  let data;try{data=await request.json()}catch{return json({detail:'Invalid request.'},400)}
  const key=typeof data.key==='string'?data.key.trim():'';if(key.length<16||key.length>512||/[\r\n\s]/.test(key))return json({detail:'Enter a valid NVIDIA API key.'},422);
  await mkdir(dir,{recursive:true});const temporary=path.join(dir,randomUUID()+'.tmp');await writeFile(temporary,'NVIDIA_API_KEY='+JSON.stringify(key)+'\n',{mode:0o600});await rename(temporary,path.join(dir,'provider.env'));
  return json({saved:true,restarting:true});
 }
 if(route==='/api/workspace'){
  if(method==='GET')return json(await stored());
  if(method==='PUT')return serialize(async()=>{const raw=await request.text();if(raw.length>1_500_000)return json({error:'Workspace is too large.'},413);let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid workspace.'},400)};if(!body.data||!['papers','notes','experiments'].every(key=>Array.isArray(body.data[key])))return json({error:'Invalid workspace.'},400);const current=await stored();if(current.etag!==(body.etag||null))return json({error:'This workspace changed in another tab. Reload before saving.'},409);await mkdir(dir,{recursive:true});const text=JSON.stringify(body.data);await writeFile(path.join(dir,'workspace.json'),text,{mode:0o600});return json({etag:revision(text)});});
 }
 if(route==='/api/search'&&method==='GET'){
  const query=url.searchParams.get('q')?.trim();if(!query||query.length<3)return json({error:'Enter at least three characters.'},400);
  try{const remote=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');remote.searchParams.set('query',query.slice(0,300));remote.searchParams.set('format','json');remote.searchParams.set('pageSize','12');const r=await fetch(remote,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const data=await r.json();return json({total:data.hitCount,results:(data.resultList?.result||[]).map(p=>({title:p.title,authors:p.authorString||'',year:p.pubYear||'',doi:p.doi||'',url:p.doi?'https://doi.org/'+p.doi:'https://europepmc.org/article/'+p.source+'/'+p.id,source:'Europe PMC'}))});}catch{return json({error:'Literature search is unavailable. Please retry.'},503);}
 }
 if(route.startsWith('/api/files/')){
  const id=route.slice('/api/files/'.length);if(!/^[a-f0-9-]{36}$/.test(id))return json({error:'Invalid file identifier.'},400);const file=path.join(dir,id+'.pdf');
  if(method==='POST'){const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>10*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return json({error:'Choose a PDF smaller than 10 MB.'},400);await mkdir(dir,{recursive:true});await writeFile(file,bytes,{mode:0o600});return json({id});}
  if(method==='GET'){try{return new Response(await readFile(file),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}})}catch{return json({error:'Paper not found.'},404)}}
  if(method==='DELETE'){try{await unlink(file)}catch{}return json({deleted:true});}
 }
 if(!patterns.some(rule=>rule.pattern.test(route)&&rule.methods.includes(method.toLowerCase())))return json({detail:'Not found.'},404);
 const base=process.env.API_BASE_URL||'http://127.0.0.1:8011';if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))return json({detail:'Local scientific service is not configured.'},503);
 let body;if(method==='POST'){body=await request.text();if(body.length>1_000_000)return json({detail:'Scientific request is too large.'},413);try{JSON.parse(body)}catch{return json({detail:'JSON is required.'},400)}}
 try{const upstream=await fetch(base+route+url.search,{method,headers:{'Content-Type':'application/json','Accept':route.endsWith('/events')?'text/event-stream':'application/json'},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(route.endsWith('/events')?240000:30000)});const headers={'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store'};if(upstream.headers.has('retry-after'))headers['Retry-After']=upstream.headers.get('retry-after');return new Response(upstream.body,{status:upstream.status,headers});}catch{return json({detail:'The local scientific service is unavailable. The last accepted result is preserved.'},503);}
}
