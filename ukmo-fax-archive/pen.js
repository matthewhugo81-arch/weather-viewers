/* Shared strokes: append independently, retry safely, undo only this browser's lines. */
(()=>{
'use strict';
const API='https://znlriqmliaszlxlnkeic.supabase.co/functions/v1/fax-lines';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpubHJpcW1saWFzemx4bG5rZWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMDYyNTIsImV4cCI6MjEwNjU4MjI1Mn0.p9RNJx-6QabOBVm1GeuaY42xFgxNtAyeQeljkowypfY';
const colours=['#df1717','#07952b','#174cf0','#9226bf'],names=['Red','Green','Blue','Purple'],ns='http://www.w3.org/2000/svg';
const bar=document.createElement('div');bar.className='pen-tools';bar.setAttribute('aria-label','Freehand drawing');
bar.innerHTML='<button id="penToggle" aria-pressed="false">✎ Pen</button><span class="pen-colours"></span><button id="penUndo" disabled>Undo</button><button id="penClear" disabled>Clear mine</button><span id="penHint" role="status">Drawings save automatically for everyone</span>';
document.querySelector('.toolbar').insertBefore(bar,document.querySelector('#count'));
const $=id=>document.getElementById(id),toggle=$('penToggle'),undo=$('penUndo'),clear=$('penClear'),hint=$('penHint');
let enabled=false,colour=colours[0],active=null,busy=false,wipe=false;
const frames=new Set(),states=new Map();
function valid(s){return s&&colours.includes(s.colour)&&Array.isArray(s.points)&&s.points.length>=2&&s.points.length<=5000&&s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=5000));}
function state(key){if(states.has(key))return states.get(key);let disk={};try{disk=JSON.parse(localStorage.getItem('fax-auto:'+key)||'{}');}catch{}const s={rows:[],adds:Array.isArray(disk.adds)?disk.adds.filter(r=>valid(r.stroke)):[],removes:disk.removes||[],mine:disk.mine||[],imported:!!disk.imported,working:false,reading:false,error:false};states.set(key,s);return s;}
function persist(key){const s=state(key);try{localStorage.setItem('fax-auto:'+key,JSON.stringify({adds:s.adds,removes:s.removes,mine:s.mine,imported:s.imported}));return true;}catch{hint.textContent='Browser storage unavailable · keep this page open until saved';return false;}}
function shownRows(key){const s=state(key),rows=new Map(s.rows.map(r=>[r.id,r]));for(const r of s.adds)rows.set(r.id,r);return [...rows.values()].filter(r=>!s.removes.includes(r.id));}
function shown(key){return shownRows(key).map(r=>r.stroke);}
function mine(key){const s=state(key);return shownRows(key).filter(r=>s.mine.includes(r.id));}
function prune(){for(const f of frames)if(!f.svg.isConnected)frames.delete(f);if(active&&!active.svg.isConnected)active=null;}
function controls(){prune();toggle.disabled=wipe;toggle.setAttribute('aria-pressed',String(enabled&&!wipe));bar.querySelectorAll('.pen-colours button').forEach(b=>{b.disabled=wipe;b.setAttribute('aria-pressed',String(enabled&&b.dataset.colour===colour&&!wipe));});undo.disabled=clear.disabled=wipe||!active||!mine(active.key).length;for(const f of frames)f.svg.classList.toggle('drawing',enabled&&!wipe);}
function status(){if(wipe){hint.textContent='Use 2-up, Single or 4-up for coloured drawings';return;}if(!active)return;const s=state(active.key);hint.textContent=s.error?'Not synced yet · retrying automatically':s.adds.length||s.removes.length?'Saving for everyone…':'Drawings saved for everyone';}
function line(s){const p=document.createElementNS(ns,'polyline');p.setAttribute('points',s.points.map(p=>p.join(',')).join(' '));p.setAttribute('stroke',s.colour);p.setAttribute('fill','none');p.setAttribute('stroke-width','3');p.setAttribute('stroke-linejoin','round');p.setAttribute('stroke-linecap','round');p.setAttribute('vector-effect','non-scaling-stroke');return p;}
function paint(key){if(busy)return;for(const f of frames)if(f.key===key)f.svg.replaceChildren(...shown(key).map(line));}
function select(f){active=f;controls();status();}
let browserToken;
function token(){if(browserToken)return browserToken;try{browserToken=localStorage.getItem('fax-publisher-token');}catch{}if(!/^[a-f0-9]{64}$/.test(browserToken||'')){browserToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('fax-publisher-token',browserToken);}catch{}}return browserToken;}
async function request(method,path='',body){const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+KEY,apikey:KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Shared saving unavailable');return d;}
async function refresh(key){const s=state(key);if(s.reading||s.working)return;s.reading=true;try{const rows=await request('GET','?chart='+encodeURIComponent(key));if(!Array.isArray(rows))throw Error('Invalid response');s.rows=rows.filter(r=>typeof r.id==='string'&&valid(r.stroke));s.error=false;paint(key);}catch{s.error=true;}finally{s.reading=false;controls();status();}}
async function flush(key){const s=state(key);if(s.working||s.reading)return;s.working=true;status();try{
 while(s.adds.length){const r=s.adds[0];await request('POST','',{token:token(),chart:key,id:r.id,stroke:r.stroke});if(!s.rows.some(v=>v.id===r.id))s.rows.push(r);s.adds=s.adds.filter(v=>v.id!==r.id);persist(key);}
 while(s.removes.length){const id=s.removes[0];await request('DELETE','',{token:token(),id});s.rows=s.rows.filter(r=>r.id!==id);s.removes=s.removes.filter(v=>v!==id);persist(key);}
 s.error=false;
 }catch{s.error=true;}finally{s.working=false;paint(key);controls();status();}}
function add(key,stroke){const s=state(key),id=crypto.randomUUID();s.adds.push({id,stroke});s.mine.push(id);persist(key);paint(key);controls();flush(key);}
function remove(key,ids){const s=state(key);for(const id of ids)if(!s.removes.includes(id))s.removes.push(id);persist(key);paint(key);controls();flush(key);}
function importOld(key){const s=state(key);if(s.imported)return;try{const old=JSON.parse(localStorage.getItem('fax-freehand:'+key)||'[]');if(Array.isArray(old))for(const stroke of old){if(!valid(stroke))continue;const id=crypto.randomUUID();s.adds.push({id,stroke:{colour:stroke.colour,points:stroke.points.map(p=>p.map(n=>Math.round(n*10)/10))}});s.mine.push(id);}s.imported=true;persist(key);}catch{} }
toggle.onclick=()=>{enabled=!enabled;controls();status();};
colours.forEach((c,i)=>{const b=document.createElement('button');b.className='pen-colour';b.dataset.colour=c;b.style.setProperty('--pen-colour',c);b.title=names[i]+' pen';b.setAttribute('aria-label',names[i]+' pen');b.setAttribute('aria-pressed','false');b.onclick=()=>{colour=c;enabled=true;controls();status();};bar.querySelector('.pen-colours').append(b);});
undo.onclick=()=>{if(active){const r=mine(active.key).at(-1);if(r)remove(active.key,[r.id]);}};
clear.onclick=()=>{if(active)remove(active.key,mine(active.key).map(r=>r.id));};
function attach(c,img,top){if(!img.dataset.penPanel||img.parentElement.querySelector('.pen-layer'))return;const svg=document.createElementNS(ns,'svg');svg.classList.add('pen-layer');svg.setAttribute('viewBox',`0 ${top} ${img.naturalWidth} ${img.naturalHeight-top}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Draw on Chart '+img.dataset.penPanel);const f={svg,key:c.filename,label:'Chart '+img.dataset.penPanel,caption:c.valid_time.slice(5,16).replace('T',' ')+'Z / T+'+c.lead_hours};frames.add(f);img.parentElement.append(svg);importOld(f.key);paint(f.key);prune();if(!active||f.label==='Chart A')active=f;controls();flush(f.key).then(()=>refresh(f.key));let stroke=null;
const point=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());return [Math.round(Math.max(0,Math.min(img.naturalWidth,q.x))*10)/10,Math.round(Math.max(top,Math.min(img.naturalHeight,q.y))*10)/10];};
img.parentElement.addEventListener('pointerenter',()=>{if(!busy)select(f);});
svg.addEventListener('pointerdown',e=>{if(!enabled||wipe||e.button!==0)return;select(f);if(shown(f.key).length>=200){hint.textContent='Maximum 200 lines per chart';return;}paint(f.key);busy=true;stroke={colour,points:[point(e)]};svg.setPointerCapture(e.pointerId);svg.append(line(stroke));e.preventDefault();});
svg.addEventListener('pointermove',e=>{if(!stroke)return;const p=point(e),last=stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<1.5||stroke.points.length>=5000)return;stroke.points.push(p);svg.lastChild.setAttribute('points',stroke.points.map(p=>p.join(',')).join(' '));});
const finish=(e,cancel=false)=>{if(!stroke)return;if(!cancel){if(stroke.points.length===1)stroke.points.push(point(e));const finished=stroke;busy=false;add(f.key,finished);}stroke=null;busy=false;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);paint(f.key);controls();};svg.addEventListener('pointerup',e=>finish(e));svg.addEventListener('pointercancel',e=>finish(e,true));}
window.FaxPen={attach,get busy(){return busy||[...states.values()].some(s=>s.working||s.adds.length||s.removes.length);},sync(mode){wipe=mode==='wipe';controls();status();}};
setInterval(()=>{if(document.hidden||busy)return;prune();const keys=new Set([...frames].map(f=>f.key));for(const [key,s] of states)if(s.adds.length||s.removes.length)keys.add(key);for(const key of keys)flush(key).then(()=>refresh(key));},15000);
window.addEventListener('online',()=>{for(const key of states.keys())flush(key).then(()=>refresh(key));});
controls();
})();
