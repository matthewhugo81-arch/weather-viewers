'use strict';
(async () => {
 const $=id=>document.getElementById(id);
 const names={'metbrief-nowster':'Metbrief / Nowster',vedur:'Icelandic Met Office'};
 const fmt=s=>s.replace('T',' ').replace(':00:00Z','Z');
 const short=s=>new Date(s).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC',hour12:false}).replace(',','')+'Z';
 let archive=window.FAX_ARCHIVE||{charts:[],pending:[]};
 // Hosted viewers request the current snapshot; offline opening still uses manifest.js.
 if(location.protocol==='https:'||location.protocol==='http:'){
  try{const response=await fetch('archive/manifest.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(response.ok)archive=await response.json();}catch{/* Keep the last published companion snapshot available. */}
 }
 const charts=(archive.charts||[]).filter(c=>/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/.test(c.filename)&&Number.isFinite(Date.parse(c.issue_time))&&Date.parse(c.valid_time)-Date.parse(c.issue_time)===c.lead_hours*3600000);
 let mode='2',chosenB='',groups=new Map();
 function rebuild(){
  groups=new Map();
  // Merge valid times across sources. Distributor copies are not separate forecast runs.
  // Prefer Nowster for equal runs, then the newest revision within that source.
  charts.filter(c=>!$('source').value||c.source===$('source').value).sort((a,b)=>b.issue_time.localeCompare(a.issue_time)||(a.source==='metbrief-nowster'?0:1)-(b.source==='metbrief-nowster'?0:1)||b.download_time.localeCompare(a.download_time)).forEach(c=>{
   if(!groups.has(c.valid_time))groups.set(c.valid_time,[]);
   const g=groups.get(c.valid_time);if(!g.some(x=>x.issue_time===c.issue_time))g.push(c);
  });
  const old=$('valid').value;$('valid').replaceChildren();
  [...groups.keys()].sort().forEach(v=>{const g=groups.get(v),a=g[0];$('valid').add(new Option(`${a.lead_hours===0?'Analysis · T+0':'T+'+a.lead_hours} · ${short(v)}${g.length>1?' · previous runs available':''}`,v));});
  if(groups.has(old))$('valid').value=old;
  else {const best=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length)[0];if(best)$('valid').value=best[0];}
  chosenB='';render();
 }
 function image(c,cls='chart'){
  const i=document.createElement('img');i.className=cls;i.src=c.filename;i.alt=`${fmt(c.valid_time)} valid · run ${fmt(c.issue_time)} · T+${c.lead_hours}`;
  i.onerror=()=>{$('wipeWarning').textContent='Image unavailable. Keep the archive folder alongside index.html.';};return i;
 }
 function original(c){const a=document.createElement('a');a.href=c.filename;a.target='_blank';a.rel='noopener';a.textContent='Open original ↗';return a;}
 function description(c){return `Run ${short(c.issue_time)} · T+${c.lead_hours}`;}
 function panel(c,index,older){
  const p=document.createElement('article');p.className='panel';const h=document.createElement('div');h.className='panel-head';
  const l=document.createElement('div');l.className='panel-label';l.textContent=index===0?'CHART A · LATEST SAVED':index===1?'CHART B · PREVIOUS RUN':`CHART ${String.fromCharCode(65+index)} · OLDER RUN`;h.append(l);
  if(index===1){const s=document.createElement('select');s.setAttribute('aria-label','Chart B previous run');
   if(!older.length){s.add(new Option('No previous run saved yet',''));s.disabled=true;}
   older.forEach((x,i)=>s.add(new Option(`${i===0?'Previous run':`${i+1} runs back`} · ${description(x)}`,x.id)));
   s.value=c?.id||'';s.onchange=()=>{chosenB=s.value;render();};h.append(s);
  }else{const title=document.createElement('p');title.className='run-title';title.textContent=c?description(c):'No older run saved';h.append(title);}
  if(c){const m=document.createElement('div');m.className='metadata';m.textContent=`Valid ${short(c.valid_time)} · ${names[c.source]||c.source} · `;m.append(original(c));h.append(m);}
  p.append(h);
  if(mode!=='wipe'){const wrap=document.createElement('div');wrap.className=c?'image-wrap':'placeholder';if(c)wrap.append(image(c));else wrap.textContent='No previous forecast has been saved for this time yet.';p.append(wrap);}
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
  const g=groups.get($('valid').value)||[],a=g[0],older=g.slice(1);
  const b=older.find(c=>c.id===chosenB)||older[0];chosenB=b?.id||'';
  const n=mode==='1'?1:mode==='4'?4:2;const bi=g.indexOf(b);
  const selected=[a,b,...(bi>=0?g.slice(bi+1):[])];
  $('panels').className='panels '+(n===1?'single':'');$('panels').replaceChildren();
  for(let i=0;i<n;i++)$('panels').append(panel(selected[i],i,older));
  $('validTitle').textContent=a?`VALID ${fmt(a.valid_time)}`:'No saved charts';
  const period=$('valid');
  $('previousPeriod').disabled=period.selectedIndex<=0;
  $('nextPeriod').disabled=period.selectedIndex<0||period.selectedIndex>=period.options.length-1;
  $('count').textContent=`${older.length} previous run${older.length===1?'':'s'} saved`;
  $('availability').textContent=!a?'No charts are indexed. Run archive.bat, then reload.':b?`A: latest run ${short(a.issue_time)} (T+${a.lead_hours}). B: ${short(b.issue_time)} (T+${b.lead_hours}). Both valid ${short(a.valid_time)}.`:'Chart A is the latest saved forecast. No earlier run is archived for this valid time yet.';
  $('wipeArea').hidden=mode!=='wipe';wipe(a,b);
  $('rows').replaceChildren();g.forEach(c=>{const tr=document.createElement('tr');[fmt(c.valid_time),fmt(c.issue_time),'T+'+c.lead_hours,names[c.source]||c.source,fmt(c.download_time)].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});const td=document.createElement('td');td.append(original(c));tr.append(td);$('rows').append(tr);});
  const best=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length)[0];$('example').disabled=!best||best[1].length<2;$('exampleInfo').textContent=best&&best[1].length>1?' '+short(best[0]):' No period has previous runs yet.';
 }
 $('source').add(new Option('Combined · all available times',''));
 [...new Set(charts.map(c=>c.source))].sort().forEach(s=>$('source').add(new Option(names[s]||s,s)));
 $('source').value='';
 $('source').onchange=rebuild;$('valid').onchange=()=>{chosenB='';render();};
 function stepPeriod(delta){
  const period=$('valid'),next=period.selectedIndex+delta;
  if(next<0||next>=period.options.length)return;
  period.selectedIndex=next;chosenB='';render();
 }
 $('previousPeriod').onclick=()=>stepPeriod(-1);
 $('nextPeriod').onclick=()=>stepPeriod(1);
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
 $('example').onclick=()=>{const best=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length)[0];if(best){$('valid').value=best[0];chosenB='';render();document.querySelector('.controls').scrollIntoView({behavior:'smooth'});}};
 $('slider').oninput=slider;window.addEventListener('resize',fit);
 $('updated').textContent=archive.updated_at?'Snapshot '+fmt(archive.updated_at):'Archive unavailable';$('inventoryCount').textContent=charts.length+' stored images';
 if(archive.pending?.length){$('pending').hidden=false;$('pending').textContent=archive.pending.length+' chart(s) await date review. See the setup guide.';}
 if(archive.collection_status?.download_failures){$('pending').hidden=false;$('pending').textContent+=' Some chart sources could not be downloaded at the last check; previously saved charts remain available.';}
 if(Date.now()-Date.parse(archive.updated_at)>3*3600000){$('pending').hidden=false;$('pending').textContent+=' The archive has not been checked for over three hours. The online collector may need attention.';}
 rebuild();
})();
