const {test}=require('node:test'),assert=require('node:assert/strict');
const r=require('./models.js'),{readDates,stamp}=require('./check-availability.cjs');
const now=Date.parse('2026-10-03T11:00:00Z');
function printed(init,lead){const date=n=>{let s=stamp(n);return s.slice(0,3)+','+s.slice(3,-3)+' '+s.slice(-3)};return `Init: ${date(init)} 500 hPa Valid: ${date(init+lead*3600000)}`;}
test('Every configured model, run and forecast step stays within T+240',()=>{
 for(const key of r.order)for(const run of r.models[key].cycles)assert(r.leads(key,run).every(h=>Number.isInteger(h)&&h>=0&&h<=240));
 assert.equal(r.leads('gfs',6).at(-1),240);assert.equal(r.leads('aifs',6).at(-1),240);
});
test('Shorter UKMO, ICON and ECMWF cycles have their genuine endpoints',()=>{
 assert.equal(r.leads('ukmo',6).at(-1),66);assert.equal(r.leads('ukmo',18).at(-1),66);assert.equal(r.leads('ukmo',0).at(-1),168);
 assert.equal(r.leads('icon',6).at(-1),120);assert.equal(r.leads('icon',12).at(-1),180);
 assert.equal(r.leads('ecm',6).at(-1),144);assert(r.leads('ecm',0).includes(66));assert(!r.leads('ecm',0).includes(156));
 assert.deepEqual(r.leads('ecmens',0),[0,24,48,72,96,120,144,168,192,216,240]);assert.deepEqual(r.leads('gem',6),[]);
});
test('Dates are read as printed, including a previous-day run',()=>{
 const init=Date.parse('2026-10-02T06:00:00Z');assert.deepEqual(readDates(printed(init,66),6,66,now),{init:new Date(init).toISOString(),valid:'2026-10-05T00:00:00.000Z'});
});
test('Observed bitmap OCR aliases do not change the run date',()=>{
 const text='Init: Sat,030CTZ2026 QBZ I00 hPa Stromlinien und Windgeschwindigkeit (kt) valid: Mon, 0S0CT2026 06Z';
 assert.equal(readDates(text,6,48,now).init,'2026-10-03T06:00:00.000Z');
});
test('Wrong cycle, wrong lead and uncertain date readings are rejected',()=>{
 const init=Date.parse('2026-10-03T00:00:00Z');
 assert.throws(()=>readDates(printed(init,48),6,48,now));
 assert.throws(()=>readDates(printed(init,48),0,72,now));
 assert.throws(()=>readDates('Init: nonsense Valid: nonsense',0,48,now));
});
function viewer(imageFactory,fetchMock){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const elements={};const get=id=>elements[id]||(elements[id]={value:'',style:{},children:[],options:[],classList:{toggle(){}},addEventListener(){},getAttribute(n){return this[n]||null},removeAttribute(n){delete this[n]},querySelector(){return {textContent:''}}});
 for(const [id,value] of Object.entries({model:'gfs',variable:'1',compareMode:'history',refRun:'6',lead:'0',displayView:'single'}))get(id).value=value;
 Object.defineProperty(get('lead'),'innerHTML',{set(html){this.options=[...html.matchAll(/value="(\d+)"/g)].map(m=>({value:m[1],disabled:false}));this.value=this.options[0]?.value||'';}});
 const context={window:{WZModels:r,addEventListener(){}},document:{getElementById:get,addEventListener(){}},Date,fetch:fetchMock,Image:imageFactory||function(){},setInterval(){},setTimeout,clearTimeout,AbortSignal};
 const html=fs.readFileSync(path.join(__dirname,'../Wetterzentrale_Model_Viewer.html'),'utf8');
 const code=html.match(/<script>\s*([^]*?)<\/script>/)[1].replace('updateModeUI();populateLeadOptions();reload(true);','renderRunBar=()=>{};updatePanelDisplay=()=>{};globalThis.subject={candidate,populateLeadOptions,state,e,freshIndex,buildFrames,loadImage,cancelImageLoads,refreshIndex};');
 vm.runInNewContext(code,context);return context.subject;
}
test('A decoded chart from the wrong day cannot enter an exact-time comparison',()=>{
 const s=viewer(),init=Date.parse('2026-10-03T06:00:00Z'),name=r.filename('aifs',6,48,1);
 s.state.index={schema:1,checkedAt:new Date().toISOString(),charts:{[name]:{init:'2026-10-02T06:00:00Z',valid:'2026-10-04T06:00:00Z',sha:'a'.repeat(64)}}};
 const wrong=s.candidate('aifs',6,48,init);assert.equal(wrong.ok,false);assert.match(wrong.reason,/Different stored date/);assert.equal(wrong.url,'');
 s.state.index.charts[name].init='2026-10-03T06:00:00Z';s.state.index.charts[name].valid='2026-10-05T06:00:00Z';
 assert.match(s.candidate('aifs',6,48,init).url,/charts\/a{64}\.png\?session=/);
});
test('Missing and excessively old indices are rejected; delayed snapshots remain usable',()=>{
 const s=viewer();assert.equal(s.freshIndex(),false);
 s.state.index={schema:1,checkedAt:new Date(Date.now()-76*60000).toISOString(),charts:{}};assert.equal(s.freshIndex(),true);
 s.state.index.checkedAt=new Date(Date.now()-7*3600000).toISOString();assert.equal(s.freshIndex(),false);
 assert.equal(s.candidate('gfs',6,48,now).ok,false);
});
test('T+0 survives selector regeneration and every UI option stays within T+240',()=>{
 const s=viewer();s.populateLeadOptions();assert.equal(s.e.lead.value,'0');
 s.e.compareMode.value='allmodels';s.populateLeadOptions();assert.equal(s.e.lead.value,'0');assert(s.e.lead.options.every(o=>+o.value<=240));
});
test('A Pages refresh retains retired images until open date indices expire',()=>{
 const fs=require('node:fs'),path=require('node:path'),{pruneSnapshots}=require('./check-availability.cjs');
 const dir=fs.mkdtempSync(path.join(__dirname,'.test-snapshots-'));
 const current='a'.repeat(64)+'.png',recent='b'.repeat(64)+'.png',expired='c'.repeat(64)+'.png';
 try{
  for(const file of [current,recent,expired])fs.writeFileSync(path.join(dir,file),'test');
  fs.utimesSync(path.join(dir,recent),(now-5*3600000)/1000,(now-5*3600000)/1000);
  fs.utimesSync(path.join(dir,expired),(now-9*3600000)/1000,(now-9*3600000)/1000);
  pruneSnapshots(dir,new Set([current]),now);
  assert(fs.existsSync(path.join(dir,current)));assert(fs.existsSync(path.join(dir,recent)));assert(!fs.existsSync(path.join(dir,expired)));
 }finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
});

test('All-model single view displays the first model even when it finishes first',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 const s=viewer(MockImage),init=Date.parse('2026-10-03T00:00:00Z');
 s.e.compareMode.value='allmodels';s.e.refRun.value='0';s.e.lead.value='120';s.state.referenceInit=init;
 const charts={};for(const [i,key] of r.order.entries())charts[r.filename(key,0,120,1)]={init:new Date(init).toISOString(),valid:new Date(init+120*3600000).toISOString(),sha:String(i+1).repeat(64)};
 s.state.index={schema:1,checkedAt:new Date().toISOString(),charts};s.buildFrames();
 assert.equal(images.length,6);images[0].onload();await new Promise(resolve=>setImmediate(resolve));
 assert.match(s.e.singleImg.src,/1{64}\.png\?session=/);assert.equal(s.e.empty.style.display,'none');
 for(let i=1;i<images.length;i++)images[i].onload();await new Promise(resolve=>setImmediate(resolve));
 s.buildFrames();await new Promise(resolve=>setImmediate(resolve));assert.equal(images.length,8);assert(s.e.singleImg.src);
});
test('A selected run cannot retain a reference date from a different cycle',async()=>{
 const s=viewer();s.e.compareMode.value='allmodels';s.e.refRun.value='0';s.e.lead.value='120';
 s.state.referenceInit=Date.parse('2026-10-03T06:00:00Z');s.buildFrames();
 assert.equal(new Date(s.state.referenceInit).getUTCHours(),0);
});

test('Selection changes during initial index loading do not report missing maps',()=>{
 const s=viewer();s.e.refresh.disabled=true;s.e.refRun.value='0';s.e.lead.value='120';s.buildFrames();
 assert.equal(s.state.userSelected,true);assert.equal(s.state.frames.length,0);
 assert.equal(s.e.statusText.textContent,'Checking model dates…');assert.equal(s.e.empty.style.display,'flex');
});

test('Rapid forecast navigation cancels obsolete requests and bounds browser concurrency',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 const s=viewer(MockImage),pending=[];
 for(let i=0;i<40;i++)pending.push(s.loadImage('old-'+i));assert.equal(images.length,6);
 s.cancelImageLoads();assert((await Promise.all(pending)).every(ok=>ok===false));
 assert(images.every(im=>im.src===''));assert(images.every(im=>im.onload===null));
 const next=s.loadImage('current-168');assert.equal(images.length,7);images.at(-1).onload();assert.equal(await next,true);
 assert.equal(await s.loadImage('current-168'),true);assert.equal(images.length,7);
});

test('A failed image retries with a fresh URL rather than a cached failure',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 const s=viewer(MockImage),result=s.loadImage('chart.png');images[0].onerror();
 assert.equal(images.length,2);assert.match(images[1].src,/chart\.png\?retry=/);
 images[1].onload();assert.equal(await result,true);
});


test('A delayed index still permits exact dated snapshots, not a substituted run',()=>{
 const s=viewer(),init=Date.parse('2026-10-03T06:00:00Z'),name=r.filename('icon',6,108,1);
 s.state.index={schema:1,checkedAt:new Date(Date.now()-2*3600000).toISOString(),charts:{[name]:{init:new Date(init).toISOString(),valid:new Date(init+108*3600000).toISOString(),sha:'a'.repeat(64)}}};
 assert.equal(s.candidate('icon',6,108,init).ok,null);
 assert.equal(s.candidate('icon',6,108,init+24*3600000).ok,false);
 assert.match(s.candidate('icon',18,132,init).reason,/Required T\+132.*T\+120/);
});
test('Background refresh adopts newer indices, preserves selection and survives failures',async()=>{
 let response;const s=viewer(undefined,async()=>{if(response instanceof Error)throw response;return {ok:true,json:async()=>response};});
 const previous={schema:1,ceiling:240,checkedAt:new Date(Date.now()-2*3600000).toISOString(),charts:{}};
 s.state.index=previous;s.e.refRun.value='12';s.e.lead.value='18';
 response=new Error('offline');await s.refreshIndex();assert.equal(s.state.index,previous);assert.equal(s.e.lead.value,'18');
 response={...previous,checkedAt:new Date().toISOString()};await s.refreshIndex();assert.equal(s.state.index,response);assert.equal(s.e.refRun.value,'12');assert.equal(s.e.lead.value,'18');
 const current=response;response=previous;await s.refreshIndex();assert.equal(s.state.index,current);
 response={...previous,checkedAt:new Date(Date.now()+3600000).toISOString()};await s.refreshIndex();assert.equal(s.state.index,current);
});
test('Every model/cycle/variable/lead resolves a matching dated snapshot within T+240',()=>{
 const s=viewer(),init=Date.parse('2026-10-03T00:00:00Z');let count=0;
 s.state.index={schema:1,checkedAt:new Date().toISOString(),charts:{}};
 for(const key of r.order)for(const run of r.models[key].cycles)for(const v of r.models[key].vars)for(const lead of r.leads(key,run)){
  const start=init+run*3600000,name=r.filename(key,run,lead,v);s.e.variable.value=String(v);
  s.state.index.charts[name]={init:new Date(start).toISOString(),valid:new Date(start+lead*3600000).toISOString(),sha:'a'.repeat(64)};
  assert.equal(s.candidate(key,run,lead,start).ok,null,name);count++;
 }
 assert(count>2000);
});
test('Session-keyed image retries preserve the query and cached success is reused',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 const s=viewer(MockImage),p=s.loadImage('chart.png?session=sample');assert.equal(images[0].fetchPriority,'high');images[0].onerror();
 assert.match(images[1].src,/\?session=sample&retry=/);images[1].onload();assert.equal(await p,true);
 assert.equal(await s.loadImage('chart.png?session=sample'),true);assert.equal(images.length,2);
});

test('ICON 12Z T+114 waits for publication then becomes usable without changing the selection',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 let response;const s=viewer(MockImage,async()=>({ok:true,json:async()=>response}));
 const init=Date.parse('2026-10-03T12:00:00Z'),name=r.filename('icon',12,114,1);
 s.e.model.value='icon';s.e.refRun.value='12';s.e.lead.value='114';s.state.referenceInit=init;
 s.state.index={schema:1,ceiling:240,checkedAt:new Date(Date.now()-60000).toISOString(),charts:{
  [name]:{init:'2026-10-02T12:00:00.000Z',valid:'2026-10-07T06:00:00.000Z',sha:'a'.repeat(64)}
 }};
 const old=s.candidate('icon',12,114,init);assert.equal(old.awaitingVerification,true);assert.equal(old.url,'');
 assert.equal(s.candidate('icon',18,132,init).awaitingVerification,false);
 response={...s.state.index,checkedAt:new Date().toISOString(),charts:{
  [name]:{init:'2026-10-03T12:00:00.000Z',valid:'2026-10-08T06:00:00.000Z',sha:'b'.repeat(64)}
 }};
 await s.refreshIndex();assert.equal(images.length,1);images[0].onload();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.e.refRun.value,'12');assert.equal(s.e.lead.value,'114');assert.equal(s.state.referenceInit,init);
 assert.equal(s.state.frames.at(-1).ok,true);assert.equal(s.state.frames.at(-1).awaitingVerification,false);
 assert.match(s.e.singleImg.src,/b{64}\.png/);
});

test('Missing indexed charts are awaiting verification, while bad references remain errors',()=>{
 const s=viewer(),init=Date.parse('2026-10-03T12:00:00Z'),name=r.filename('icon',12,114,1);
 s.state.index={schema:1,checkedAt:new Date().toISOString(),charts:{}};
 assert.equal(s.candidate('icon',12,114,init).awaitingVerification,true);
 s.state.index.charts[name]={init:new Date(init).toISOString(),valid:new Date(init+114*3600000).toISOString(),sha:'invalid'};
 const invalid=s.candidate('icon',12,114,init);assert.equal(invalid.awaitingVerification,false);assert.equal(invalid.url,'');
 assert.match(invalid.reason,/Invalid verified/);
});
