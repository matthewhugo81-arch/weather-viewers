import Core from 'npm:tesseract.js-core@7.0.0/tesseract-core-lstm.wasm.js';
import {gunzipSync} from 'node:zlib';
import products from './products.json' with {type:'json'};
import {metadata,retain,latestProducts} from './metadata.js';
const origin='https://matthewhugo81-arch.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
const base=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const auth={apikey:key,Authorization:'Bearer '+key};
const now=()=>new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
let engine;
async function getEngine(){
 if(!engine)engine=(async()=>{
  const mod=await Core();const r=await fetch('https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('OCR language unavailable');
  mod.FS.writeFile('eng.traineddata',gunzipSync(new Uint8Array(await r.arrayBuffer())));
  const api=new mod.TessBaseAPI();if(api.Init(null,'eng',1)!==0)throw Error('OCR initialization failed');
  api.SetVariable('tessedit_pageseg_mode','7');return {mod,api};
 })().catch(e=>{engine=null;throw e;});return engine;
}
async function db(path,method='GET',body){
 const r=await fetch(base+'/rest/v1/'+path,{method,headers:{...auth,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok)throw Error(data.message||'Archive unavailable');return data;
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function collect(p){
 if(!await db('rpc/claim_fax_check','POST',{p_product:p.product}))return {product:p.product,skipped:'recent check'};
 try{
  const r=await fetch(p.url+'?faxcheck='+Math.floor(Date.now()/300000),{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'UKMO-FAX-Archive/3.0','Cache-Control':'no-cache'}});
  if(!r.ok)throw Error('Source HTTP '+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes.length<24||bytes.length>5000000||Array.from(bytes.slice(0,8)).join(',')!=='137,80,78,71,13,10,26,10')throw Error('Source is not a PNG');
  const sha=await hash(bytes),id=p.source+':'+p.product+':'+sha;
  const existing=await db('fax_chart_archive?id=eq.'+encodeURIComponent(id)+'&select=chart');
  let chart=existing[0]?.chart;
  if(!chart){
   const v=new DataView(bytes.buffer),width=v.getUint32(16),height=v.getUint32(20);
   const crop={'1076x864':[2,72,362,24],'1179x864':[2,38,397,25],'900x608':[2,3,302,19]}[width+'x'+height];
   if(!crop)throw Error('Unrecognized chart layout '+width+'x'+height);
   const {mod,api}=await getEngine();mod.FS.writeFile('/input',bytes);if(api.SetImageFile(1,0)!==0)throw Error('Cannot read PNG');api.SetRectangle(...crop);api.Recognize(null);
   const header=api.GetUTF8Text().trim(),dates=metadata(header,p.lead_hours);
   if(Date.parse(dates.issue_time)>Date.now()+6*3600000||Date.parse(dates.issue_time)<Date.now()-14*86400000)throw Error('Printed run date outside source window');
   const filename='archive/objects/'+p.source+'/'+sha+'.png';
   const up=await fetch(base+'/storage/v1/object/fax-archive/'+filename,{method:'POST',headers:{...auth,'Content-Type':'image/png','Cache-Control':'max-age=31536000','x-upsert':'true'},body:bytes,signal:AbortSignal.timeout(15000)});
   if(!up.ok)throw Error('Original image could not be saved');
   chart={id,...dates,lead_hours:p.lead_hours,source:p.source,product:p.product,filename,download_time:now(),source_url:p.url,sha256:sha,metadata_method:'printed-header-ocr',ocr_header:header,issue_time_basis:'valid_time minus lead_hours (nominal run, not publication time)',image_url:base+'/storage/v1/object/public/fax-archive/'+filename,width,height};
   await db('fax_chart_archive','POST',{id,valid_time:chart.valid_time,issue_time:chart.issue_time,chart});
  }
  if(!chart.image_url){
   const up=await fetch(base+'/storage/v1/object/fax-archive/'+chart.filename,{method:'POST',headers:{...auth,'Content-Type':'image/png','Cache-Control':'max-age=31536000','x-upsert':'true'},body:bytes,signal:AbortSignal.timeout(15000)});
   if(!up.ok)throw Error('Original image backup failed');
   chart={...chart,image_url:base+'/storage/v1/object/public/fax-archive/'+chart.filename};
   await db('fax_chart_archive','POST',{id,valid_time:chart.valid_time,issue_time:chart.issue_time,chart});
  }
  await db('fax_source_status?product=eq.'+p.product,'PATCH',{checked_at:now(),sha,error:null,header:chart.ocr_header});
  return {product:p.product,valid_time:chart.valid_time,issue_time:chart.issue_time,sha};
 }catch(e){await db('fax_source_status?product=eq.'+p.product,'PATCH',{error:String(e.message).slice(0,200)});throw e;}
}
async function manifest(){
 const [rows,status]=await Promise.all([db('fax_chart_archive?select=chart&order=issue_time.desc&limit=2000'),db('fax_source_status?product=neq.__cleanup&select=product,checked_at,last_attempt,error,sha,header&order=product')]);
 const originals=rows.map(r=>r.chart),charts=retain(originals),latest_products=latestProducts(originals);
 // All-source check time is the oldest successful check, never the newest single product.
 const complete=status.length===products.length&&status.every(s=>s.checked_at&&!s.error);
 const checked=complete?status.map(s=>s.checked_at).sort()[0]:null;
 const updated=charts.map(c=>c.download_time).sort().at(-1)||null;
 return {schema_version:1,updated_at:updated,revision:charts.map(c=>c.id+':'+(c.image_url||'')).sort().join('|'),last_successful_collection:checked,collection_status:{checked_at:checked,products:products.length,download_failures:status.filter(s=>s.error).length,errors:status.filter(s=>s.error).map(s=>s.product+': '+s.error),pending:0},source_status:status,latest_products,charts,pending:[],live_archive:true};
}
async function cleanup(){
 if(!await db('rpc/claim_fax_check','POST',{p_product:'__cleanup'}))return {skipped:true};
 try{
  const cutoff=new Date(Date.now()-8*86400000).toISOString();
  const all=await db('fax_chart_archive?select=id,chart&order=issue_time.desc&limit=2000');
  const current=new Set(latestProducts(all.map(r=>r.chart)).map(c=>c.id));
  const rows=all.filter(r=>Date.parse(r.chart.valid_time)<Date.parse(cutoff)&&!current.has(r.id)).slice(0,200);
  const prefixes=rows.filter(r=>r.chart.image_url).map(r=>r.chart.filename);
  if(prefixes.some(p=>!/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/.test(p)))throw Error('Invalid retention filename');
  if(prefixes.length){const r=await fetch(base+'/storage/v1/object/fax-archive',{method:'DELETE',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({prefixes}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Retention storage request failed');}
  for(const r of rows)await db('fax_chart_archive?id=eq.'+encodeURIComponent(r.id),'DELETE');
  await db('fax_source_status?product=eq.__cleanup','PATCH',{checked_at:now(),error:null});return {removed:rows.length};
 }catch(e){await db('fax_source_status?product=eq.__cleanup','PATCH',{error:String(e.message).slice(0,200)});throw e;}
}
Deno.serve(async req=>{
 const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return respond({error:'Origin not allowed'},403);
 try{
  const url=new URL(req.url);
  if(req.method==='GET')return respond(await manifest());
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  if(url.searchParams.get('product')==='__cleanup')return respond(await cleanup());
  const p=products.find(p=>p.product===url.searchParams.get('product'));
  if(!p)return respond({error:'Unknown product'},400);
  return respond(await collect(p));
 }catch(e){return respond({error:String(e.message).slice(0,200)},503);}
});
