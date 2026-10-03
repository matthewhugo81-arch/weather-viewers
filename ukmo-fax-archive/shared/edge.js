const SITE='https://matthewhugo81-arch.github.io/weather-viewers/ukmo-fax-archive/';
const origin='https://matthewhugo81-arch.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Vary':'Origin'};
const colours=new Set(['#df1717','#07952b','#174cf0','#9226bf']);
const chartOK=s=>typeof s==='string'&&/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/.test(s);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
let manifest={at:0,charts:[]};
async function db(path,method='GET',body){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw new Error(data.message||'Storage unavailable');return data;
}
Deno.serve(async req=>{
 const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return respond({error:'Origin not allowed'},403);
 try{
  const url=new URL(req.url);
  if(req.method==='GET'){
   const chart=url.searchParams.get('chart');if(!chartOK(chart))return respond({error:'Invalid chart'},400);
   return respond(await db('fax_drawings?chart=eq.'+encodeURIComponent(chart)+'&select=id,author,strokes,created_at&order=created_at.desc&limit=50'));
  }
  if(!['POST','DELETE'].includes(req.method))return respond({error:'Method not allowed'},405);
  if(Number(req.headers.get('content-length'))>120000)return respond({error:'Drawing is too large'},413);
  const reader=req.body?.getReader();if(!reader)return respond({error:'Body required'},400);
  let chunks=[],size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>120000){await reader.cancel();return respond({error:'Drawing is too large'},413);}chunks.push(value);}
  const joined=new Uint8Array(size);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}
  let b;try{b=JSON.parse(new TextDecoder().decode(joined));}catch{return respond({error:'Invalid drawing'},400);}
  if(!b||typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return respond({error:'Browser publishing identity missing'},400);
  const owner=await hash(b.token);
  if(req.method==='DELETE'){
   if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/.test(b.id))return respond({error:'Invalid version'},400);
   const rows=await db('fax_drawings?id=eq.'+b.id+'&owner_hash=eq.'+owner,'DELETE');
   return respond({removed:rows.length>0},rows.length?200:403);
  }
  if(!chartOK(b.chart)||typeof b.author!=='string'||!b.author.trim()||b.author.length>40||/[\x00-\x1f<>]/.test(b.author))return respond({error:'Enter a name of 1–40 characters'},400);
  if(!Array.isArray(b.strokes)||!b.strokes.length||b.strokes.length>200)return respond({error:'Publish between 1 and 200 lines'},400);
  let total=0;for(const s of b.strokes){if(!s||!colours.has(s.colour)||!Array.isArray(s.points)||s.points.length<2||s.points.length>5000)return respond({error:'Invalid line'},400);total+=s.points.length;for(const p of s.points)if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>5000))return respond({error:'Invalid point'},400);}
  if(total>10000)return respond({error:'Too many points in this drawing'},400);
  if(Date.now()-manifest.at>60000){const m=await fetch(SITE+'archive/manifest.json?shared='+Math.floor(Date.now()/60000));if(!m.ok)throw new Error('Cannot verify chart; try again shortly');manifest={at:Date.now(),charts:(await m.json()).charts};}
  if(!manifest.charts.some(c=>c.filename===b.chart))return respond({error:'This chart is no longer in the current archive'},400);
  const im=await fetch(SITE+b.chart);if(!im.ok)throw new Error('Cannot verify chart image');const bytes=await im.arrayBuffer();const v=new DataView(bytes);if(v.byteLength<24||v.getUint32(0)!==0x89504e47)throw new Error('Invalid chart image');const w=v.getUint32(16),h=v.getUint32(20);
  if(b.strokes.some(s=>s.points.some(p=>p[0]>w||p[1]>h)))return respond({error:'Drawing does not match chart dimensions'},400);
  const network=await hash((Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')+'|'+new Date().toISOString().slice(0,10)+'|'+(req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown'));
  const strokes=b.strokes.map(s=>({colour:s.colour,points:s.points}));
  const id=await db('rpc/publish_fax_drawing','POST',{p_chart:b.chart,p_author:b.author.trim(),p_owner:owner,p_network:network,p_strokes:strokes});return respond({id},201);
 }catch(e){const msg=String(e.message);const quota=/limit reached|reached 50/.test(msg);return respond({error:quota?msg:'Shared drawings are temporarily unavailable. Your local drawing is safe.'},quota?429:503);}
});
