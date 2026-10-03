/* Freehand annotations stay in this browser, keyed to the unchanged chart image. */
(() => {
 'use strict';
 const colours=['#df1717','#07952b','#174cf0','#9226bf'],names=['Red','Green','Blue','Purple'];
 const bar=document.createElement('div');bar.className='pen-tools';bar.setAttribute('aria-label','Freehand drawing');
 bar.innerHTML='<button id="penToggle" aria-pressed="false">✎ Pen</button><span class="pen-colours"></span><button id="penUndo" disabled>Undo</button><button id="penClear" disabled>Clear chart</button><span id="penHint">Drawings stay in this browser.</span>';
 document.querySelector('.toolbar').insertBefore(bar,document.querySelector('#count'));
 const toggle=bar.querySelector('#penToggle'),undo=bar.querySelector('#penUndo'),clear=bar.querySelector('#penClear'),hint=bar.querySelector('#penHint');
 let enabled=false,colour=colours[0],active=null,busy=false,wipe=false;
 const frames=new Set(),data=new Map(),ns='http://www.w3.org/2000/svg';
 function load(key){if(data.has(key))return data.get(key);let strokes=[];try{const raw=localStorage.getItem('fax-freehand:'+key);if(raw&&raw.length<2000000){const d=JSON.parse(raw);if(Array.isArray(d)&&d.length<=200&&d.every(s=>colours.includes(s.colour)&&Array.isArray(s.points)&&s.points.length<=5000&&s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=20000))))strokes=d;}}catch{}data.set(key,strokes);return strokes;}
 function save(key){try{localStorage.setItem('fax-freehand:'+key,JSON.stringify(load(key)));hint.textContent='Saved on this browser · '+(active?.label||'chart');}catch{hint.textContent='Drawing kept for this visit; browser storage unavailable.';}}
 function prune(){for(const f of frames)if(!f.svg.isConnected)frames.delete(f);if(active&&!active.svg.isConnected)active=null;}
 function controls(){prune();toggle.disabled=wipe;toggle.setAttribute('aria-pressed',String(enabled&&!wipe));bar.querySelectorAll('.pen-colours button').forEach(b=>{b.disabled=wipe;b.setAttribute('aria-pressed',String(enabled&&b.dataset.colour===colour&&!wipe));});undo.disabled=clear.disabled=wipe||!active||!load(active.key).length;for(const f of frames)f.svg.classList.toggle('drawing',enabled&&!wipe);}
 function line(s){const p=document.createElementNS(ns,'polyline');p.setAttribute('points',s.points.map(p=>p.join(',')).join(' '));p.setAttribute('stroke',s.colour);p.setAttribute('fill','none');p.setAttribute('stroke-width','3');p.setAttribute('stroke-linejoin','round');p.setAttribute('stroke-linecap','round');p.setAttribute('vector-effect','non-scaling-stroke');return p;}
 function paint(key){for(const f of frames)if(f.key===key){f.svg.replaceChildren(...load(key).map(line));}}
 function select(f){active=f;hint.textContent=f.label+' · drawings stay in this browser.';controls();}
 toggle.onclick=()=>{enabled=!enabled;controls();hint.textContent=enabled?'Choose a colour, then drag on either chart.':'Pen off · drawings stay in this browser.';};
 colours.forEach((c,i)=>{const b=document.createElement('button');b.className='pen-colour';b.dataset.colour=c;b.style.setProperty('--pen-colour',c);b.title=names[i]+' pen';b.setAttribute('aria-label',names[i]+' pen');b.setAttribute('aria-pressed','false');b.onclick=()=>{colour=c;enabled=true;controls();hint.textContent='Drag on a chart with the '+names[i].toLowerCase()+' pen.';};bar.querySelector('.pen-colours').append(b);});
 undo.onclick=()=>{if(!active)return;load(active.key).pop();paint(active.key);save(active.key);controls();};
 clear.onclick=()=>{if(!active)return;data.set(active.key,[]);paint(active.key);save(active.key);controls();};
 function attach(c,img,top){if(!img.dataset.penPanel||img.parentElement.querySelector('.pen-layer'))return;const svg=document.createElementNS(ns,'svg');svg.classList.add('pen-layer');svg.setAttribute('viewBox',`0 ${top} ${img.naturalWidth} ${img.naturalHeight-top}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Draw on Chart '+img.dataset.penPanel);const f={svg,key:c.filename,label:'Chart '+img.dataset.penPanel};frames.add(f);img.parentElement.append(svg);load(f.key);paint(f.key);prune();if(!active||f.label==='Chart A')active=f;controls();let stroke=null;
  const point=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());return [Math.max(0,Math.min(img.naturalWidth,q.x)),Math.max(top,Math.min(img.naturalHeight,q.y))];};
  img.parentElement.addEventListener('pointerenter',()=>{if(!busy)select(f);});
  svg.addEventListener('pointerdown',e=>{if(!enabled||wipe||e.button!==0)return;select(f);if(load(f.key).length>=200){hint.textContent='This chart has 200 strokes. Clear it before adding more.';return;}busy=true;stroke={colour,points:[point(e)]};svg.setPointerCapture(e.pointerId);svg.append(line(stroke));e.preventDefault();});
  svg.addEventListener('pointermove',e=>{if(!stroke)return;const p=point(e),last=stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<1.5||stroke.points.length>=5000)return;stroke.points.push(p);svg.lastChild.setAttribute('points',stroke.points.map(p=>p.join(',')).join(' '));});
  const finish=(e,cancel=false)=>{if(!stroke)return;if(!cancel){const p=point(e);if(stroke.points.length===1)stroke.points.push(p);load(f.key).push(stroke);save(f.key);}stroke=null;busy=false;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);paint(f.key);controls();};
  svg.addEventListener('pointerup',e=>finish(e));svg.addEventListener('pointercancel',e=>finish(e,true));
 }
 window.FaxPen={attach,get busy(){return busy;},sync(mode){wipe=mode==='wipe';controls();hint.textContent=wipe?'Use 2-up, Single or 4-up to draw on individual charts.':enabled?'Choose a colour, then drag on a chart.':'Drawings stay in this browser.';}};
 controls();
})();

