'use strict';
(async () => {
 const $=id=>document.getElementById(id);
 const names={'metbrief-nowster':'Metbrief / Nowster',vedur:'Icelandic Met Office'};
 const fmt=s=>s.replace('T',' ').replace(':00:00Z','Z');
 const short=s=>new Date(s).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC',hour12:false}).replace(',','')+'Z';
 const LIVE_API='https://znlriqmliaszlxlnkeic.supabase.co/functions/v1/fax-collector';
 const LIVE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpubHJpcW1saWFzemx4bG5rZWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMDYyNTIsImV4cCI6MjEwNjU4MjI1Mn0.p9RNJx-6QabOBVm1GeuaY42xFgxNtAyeQeljkowypfY';
 const imageBase='https://znlriqmliaszlxlnkeic.supabase.co/storage/v1/object/public/fax-archive/';
 let archiveError=false;
 async function readArchive(fallback=true){
  try{
   const r=await fetch(LIVE_API,{headers:{Authorization:'Bearer '+LIVE_KEY,apikey:LIVE_KEY},cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('Live archive unavailable');const m=await r.json();
   if(!m.live_archive||!Array.isArray(m.charts)||!m.charts.length)throw Error('Invalid live archive');
   archiveError=false;return m;
  }catch(e){if(!fallback)throw e;}
  const r=await fetch('archive/manifest.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Saved archive unavailable');archiveError=true;return r.json();
 }
 function validCharts(m){return (m.charts||[]).filter(c=>/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/.test(c.filename)&&Number.isFinite(Date.parse(c.issue_time))&&Date.parse(c.valid_time)-Date.parse(c.issue_time)===c.lead_hours*3600000&&(!c.image_url||c.image_url===imageBase+c.filename));}
 let archive=window.FAX_ARCHIVE||{charts:[],pending:[]};
 if(location.protocol==='https:'||location.protocol==='http:'){
  try{archive=await readArchive();}catch{archiveError=true;}
 }
 let charts=validCharts(archive);
 const imageURLs=new Map(charts.map(c=>[c.filename,location.protocol==='file:'?c.filename:(c.image_url||c.filename)]));
 let mode='2',chosenB='',groups=new Map(),entries=[],latest=new Map();
 function rebuild(){
  const old=$('valid').value;
  ({entries,groups,latest}=window.FaxModel.build(charts,$('source').value));
  $('valid').replaceChildren();
  for(const e of entries){
   const c=e.a,label=e.label+' · valid '+short(c.valid_time)+' · run '+short(c.issue_time);
   $('valid').add(new Option(label,e.key));
  }
  if(entries.some(e=>e.key===old))$('valid').value=old;
  else if(entries.length)$('valid').value=entries[0].key;
  $('selectionLabel').textContent='CHART A — LATEST AVAILABLE CHART';
  $('leadShelf').replaceChildren();
  for(const slot of window.FaxModel.slots.filter(s=>!$('source').value||s.source===$('source').value)){
   const c=latest.get(slot.key),button=document.createElement('button');button.type='button';button.dataset.key=slot.key;button.disabled=!c;
   button.textContent=slot.label;
   button.title=c?slot.label+' · run '+short(c.issue_time)+' · valid '+short(c.valid_time)+' · T+'+c.lead_hours:'No chart captured for '+slot.label;
   button.setAttribute('aria-pressed',String($('valid').value===slot.key));
   button.onclick=()=>{if(!c)return;$('valid').value=slot.key;chosenB='';render();};$('leadShelf').append(button);
  }
  render();
 }
 // Cache immutable images as object URLs, shared by visible panels and prefetches.
 const imageCache=new Map();let preloadTimer;
 function cachedImage(filename,priority='high'){
  if(imageCache.has(filename))return imageCache.get(filename);
  const task=(async()=>{let lastError;for(let attempt=0;attempt<2;attempt++){
   try{const r=await fetch((imageURLs.get(filename)||filename)+(attempt?'?retry=1':''),{signal:AbortSignal.timeout(8000),priority});if(!r.ok)throw Error('HTTP '+r.status);const blob=await r.blob();const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());if(signature.join(',')!=='137,80,78,71,13,10,26,10')throw Error('Invalid image');return URL.createObjectURL(blob);}catch(e){lastError=e;}
  }throw lastError;})();
  imageCache.set(filename,task);task.catch(()=>{if(imageCache.get(filename)===task)imageCache.delete(filename);});return task;
 }
 function preloadNearby(){
  clearTimeout(preloadTimer);preloadTimer=setTimeout(()=>{
   const visible=[...document.querySelectorAll('#panels img,#wipeCanvas img')];
   if(visible.some(i=>!i.complete||!i.naturalWidth))return;
   const pos=entries.findIndex(e=>e.key===$('valid').value);
   const candidates=[entries[pos+1]?.a,entries[pos-1]?.a].filter(Boolean);
   for(const c of candidates)cachedImage(c.filename,'low').catch(()=>{});
   // Bound memory without revoking URLs still displayed by a panel.
   while(imageCache.size>32){const key=imageCache.keys().next().value,task=imageCache.get(key);imageCache.delete(key);task.then(url=>{if(![...document.images].some(i=>i.src===url))URL.revokeObjectURL(url);}).catch(()=>{});}
  },250);
 }
 function image(c,cls='chart'){
  const i=document.createElement('img');i.className=cls;i.alt=fmt(c.valid_time)+' valid · run '+fmt(c.issue_time)+' · T+'+c.lead_hours;i.decoding='async';i.loading='eager';
  let statusBox,generation=0;
  const clearStatus=()=>{statusBox?.remove();statusBox=null;};
  function status(message,retry=false){const frame=i.parentElement;if(!frame)return;clearStatus();const box=document.createElement('div');statusBox=box;box.className='load-status';box.setAttribute('role','status');box.textContent=message;if(retry){const button=document.createElement('button');button.textContent='Retry chart';button.onclick=()=>{imageCache.delete(c.filename);start();};box.append(button);}frame.append(box);}
  async function start(){const current=++generation;status('Loading chart…');try{const url=location.protocol==='file:'?c.filename:await cachedImage(c.filename);if(i.isConnected&&current===generation)i.src=url;}catch{if(i.isConnected&&current===generation)status('Chart could not load. ',true);}}
  i.addEventListener('load',()=>{
   clearStatus();
   const top=c.source==='metbrief-nowster'&&i.naturalHeight===864?(i.naturalWidth===1076?70:i.naturalWidth===1179?36:0):0;
   const frame=i.parentElement;if(frame){frame.style.aspectRatio=i.naturalWidth+'/'+(i.naturalHeight-top);frame.style.minHeight='0';}
   i.style.transform=top?'translateY(-'+(100*top/i.naturalHeight)+'%)':'none';
   window.FaxPen?.attach(c,i,top);preloadNearby();
  });
  i.addEventListener('error',()=>{imageCache.delete(c.filename);status('Chart could not load. ',true);});
  setTimeout(()=>{if(i.isConnected)start();},0);return i;
 }
 function original(c){const a=document.createElement('a');a.href=imageURLs.get(c.filename)||c.filename;a.target='_blank';a.rel='noopener';a.textContent='Open original ↗';return a;}
 function description(c){const cycle=c.issue_time.slice(11,13)+"Z";const date=new Date(c.issue_time).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});return `${cycle} ${c.lead_hours===0?"analysis":"run"} · ${date} · T+${c.lead_hours}`;}
 function panel(c,index,older){
  const p=document.createElement('article');p.className='panel';const h=document.createElement('div');h.className='panel-head';
  const l=document.createElement('div');l.className='panel-label';l.textContent=index===0?('CHART A · '+(entries.find(e=>e.key===$('valid').value)?.label||'LATEST AVAILABLE')):index===1?'CHART B · PREVIOUS RUN':`CHART ${String.fromCharCode(65+index)} · OLDER RUN`;h.append(l);
  if(index===1){const s=document.createElement('select');s.setAttribute('aria-label','Chart B previous run');
   if(!older.length){s.add(new Option('No previous run saved yet',''));s.disabled=true;}
   older.forEach((x,i)=>s.add(new Option(`${i===0?'Previous run':`${i+1} runs back`} · ${description(x)}`,x.id)));
   s.value=c?.id||'';s.onchange=()=>{chosenB=s.value;render();};h.append(s);
  }else{const title=document.createElement('p');title.className='run-title';if(c){const badge=document.createElement('strong');badge.className='cycle-badge';badge.textContent=c.issue_time.slice(11,13)+'Z '+(c.lead_hours===0?'ANALYSIS':'RUN');title.append(badge,document.createTextNode(description(c).split(' · ').slice(1).join(' · ')));title.title='Nominal forecast run time, not the download time. All times UTC.';}else title.textContent='No older run saved';h.append(title);}
  if(c){const m=document.createElement('div');m.className='metadata';m.textContent=`Valid ${short(c.valid_time)} · ${names[c.source]||c.source} · `;m.append(original(c));h.append(m);}
  p.append(h);
  if(mode!=='wipe'){const wrap=document.createElement('div');wrap.className=c?'image-wrap':'placeholder';if(c){const img=image(c);img.dataset.penPanel=String.fromCharCode(65+index);wrap.append(img);}else wrap.textContent='No previous forecast has been saved for this time yet.';p.append(wrap);}
  return p;
 }
 function slider(){const n=Number($('slider').value);$('percent').textContent=n+'%';const o=$('wipeCanvas').querySelector('.overlay'),l=$('wipeCanvas').querySelector('.wipe-line');if(o)o.style.clipPath=`inset(0 0 0 ${100-n}%)`;if(l)l.style.left=`${100-n}%`;}
 function fit(){const img=$('wipeCanvas').querySelector('img');if(img?.naturalWidth)$('wipeCanvas').style.width=Math.min(900,$('wipeArea').clientWidth,innerHeight*.58*img.naturalWidth/img.naturalHeight)+'px';}
 function wipe(a,b){
  $('wipeCanvas').replaceChildren();$('wipeWarning').textContent='';$('slider').disabled=true;
  if(mode!=='wipe')return;
  if(!a||!b){$('wipeWarning').textContent='There is no previous run saved for this time yet.';return;}
  if(a.source!==b.source){$('wipeWarning').textContent='These runs come from different image sources. Use 2-up to compare them without misaligning the maps.';return;}
  const first=image(a),second=image(b,'overlay'),line=document.createElement('div');line.className='wipe-line';
  const check=()=>{if(!first.naturalWidth||!second.naturalWidth)return;
   if(first.naturalWidth!==second.naturalWidth||first.naturalHeight!==second.naturalHeight){$('wipeCanvas').replaceChildren();$('wipeWarning').textContent='Image layouts differ. Use 2-up to avoid a misleading overlay.';return;}
   $('slider').disabled=false;fit();};
  first.onload=check;second.onload=check;$('wipeCanvas').append(first,second,line);slider();check();
 }
 function render(){
  document.body.classList.toggle('single-view',mode==='1');
  const entry=entries.find(e=>e.key===$('valid').value),a=entry?.a,older=entry?.older||[],g=a?[a,...older]:[];
  const b=older.find(c=>c.id===chosenB)||older[0];chosenB=b?.id||'';
  const n=mode==='1'?1:mode==='4'?4:2;const bi=g.indexOf(b);
  const selected=[a,b,...(bi>=0?g.slice(bi+1):[])];
  $('panels').className='panels '+(n===1?'single':'');$('panels').replaceChildren();
  for(let i=0;i<n;i++)$('panels').append(panel(selected[i],i,older));
  $('validTitle').textContent=a?`VALID ${fmt(a.valid_time)}`:'No saved charts';
  const period=$('valid');
  const timeline=entries.map(e=>e.key),position=timeline.indexOf(period.value);
  $('previousPeriod').disabled=position<=0;
  $('nextPeriod').disabled=position<0||position>=timeline.length-1;
  $('count').textContent=`${older.length} previous run${older.length===1?'':'s'} saved`;
  $('availability').textContent=!a?'No charts are available for this source.':('Latest available '+entry.label+' · run '+short(a.issue_time)+'. This chart stays in Chart A until its replacement arrives. ')+(b?'B: earlier run '+short(b.issue_time)+' (T+'+b.lead_hours+'). Both valid '+short(a.valid_time)+'.':'No earlier forecast is saved for this exact valid time.');
  document.querySelectorAll('#leadShelf button').forEach(button=>button.setAttribute('aria-pressed',String(period.value===button.dataset.key)));
  $('wipeArea').hidden=mode!=='wipe';wipe(a,b);window.FaxPen?.sync(mode);preloadNearby();
  $('rows').replaceChildren();g.forEach(c=>{const tr=document.createElement('tr');[fmt(c.valid_time),fmt(c.issue_time),'T+'+c.lead_hours,names[c.source]||c.source,fmt(c.download_time)].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});const td=document.createElement('td');td.append(original(c));tr.append(td);$('rows').append(tr);});
  const best=entries.find(e=>e.older.length);$('example').disabled=!best;$('exampleInfo').textContent=best?' '+short(best.a.valid_time):' No period has previous runs yet.';
 }
 $('source').add(new Option('Combined · latest available products',''));
 [...new Set(charts.map(c=>c.source))].sort().forEach(s=>$('source').add(new Option(names[s]||s,s)));
 $('source').value='';
 $('source').onchange=()=>{chosenB='';rebuild();};$('valid').onchange=()=>{chosenB='';render();};
 function stepPeriod(delta){
  const period=$('valid'),timeline=entries.map(e=>e.key),next=timeline.indexOf(period.value)+delta;
  if(next<0||next>=period.options.length)return;
  period.value=timeline[next];chosenB='';render();
 }
 $('previousPeriod').onclick=()=>stepPeriod(-1);
 $('nextPeriod').onclick=()=>stepPeriod(1);
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
 $('example').onclick=()=>{const best=entries.find(e=>e.older.length);if(best){$('valid').value=best.key;chosenB='';render();document.querySelector('.controls').scrollIntoView({behavior:'smooth'});}};
 $('slider').oninput=slider;window.addEventListener('resize',fit);
 $('updated').textContent=archive.updated_at?'Snapshot '+fmt(archive.updated_at):'Archive unavailable';$('inventoryCount').textContent=charts.length+' stored images';
 if(archive.pending?.length){$('pending').hidden=false;$('pending').textContent=archive.pending.length+' chart(s) await date review. See the setup guide.';}
 if(archive.collection_status?.download_failures){$('pending').hidden=false;$('pending').textContent+=' Some chart sources could not be downloaded at the last check; previously saved charts remain available.';}
 rebuild();
 function updateFreshness(){
  const stamp=archive.collection_status?.checked_at||archive.last_successful_collection||archive.updated_at;
  const age=Date.now()-Date.parse(stamp||'');
  const overdue=!Number.isFinite(age)||age>15*60000||archiveError||!!archive.collection_status?.download_failures;
  $('updated').textContent=(stamp?(archive.live_archive?'Sources checked ':'Snapshot ')+fmt(new Date(stamp).toISOString().replace('.000Z','Z')):'Archive unavailable')+(overdue?' · update delayed':'');
  $('updated').title=overdue?'A source check is overdue or unavailable. Last verified charts remain displayed.':'Every source is checked independently every five minutes.';
  const errors=archive.collection_status?.errors||[];
  $('pending').hidden=!errors.length&&!archiveError;
  $('pending').textContent=errors.length?'Source check needs attention: '+errors.join('; '):archiveError?'Live archive unavailable; showing the last saved charts. Retrying automatically.':'';
  $('inventoryCount').textContent=charts.length+' stored images';
 }
 updateFreshness();setInterval(updateFreshness,60000);
 if(location.protocol==='https:'||location.protocol==='http:'){
  let refreshing=false;
  async function refreshArchive(){
   updateFreshness();if(refreshing||document.hidden)return;refreshing=true;
   try{
    const next=await readArchive(!archive.live_archive);
    if(window.FaxPen?.busy)return;
    const changed=(next.revision||next.updated_at)!==(archive.revision||archive.updated_at);
    archive=next;archiveError=false;
    if(changed){charts=validCharts(archive);for(const c of charts)imageURLs.set(c.filename,location.protocol==='file:'?c.filename:(c.image_url||c.filename));rebuild();}
    updateFreshness();
   }catch{archiveError=true;updateFreshness();}finally{refreshing=false;}
  }
  setInterval(refreshArchive,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshArchive();});
  window.addEventListener('focus',refreshArchive);
 }
})();
