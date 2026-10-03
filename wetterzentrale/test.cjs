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
function viewer(imageFactory,fetchMock,dateFactory=Date){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const elements={};const get=id=>elements[id]||(elements[id]={value:'',style:{},children:[],options:[],classList:{toggle(){}},addEventListener(){},getAttribute(n){return this[n]||null},removeAttribute(n){delete this[n]},querySelector(){return {textContent:''}}});
 for(const [id,value] of Object.entries({model:'gfs',variable:'1',compareMode:'history',refRun:'6',lead:'0',displayView:'single'}))get(id).value=value;
 Object.defineProperty(get('lead'),'innerHTML',{set(html){this.options=[...html.matchAll(/value="(\d+)"/g)].map(m=>({value:m[1],disabled:false}));this.value=this.options[0]?.value||'';}});
 const context={window:{WZModels:r,addEventListener(){}},document:{getElementById:get,addEventListener(){}},Date:dateFactory,fetch:fetchMock,Image:imageFactory||function(){},setInterval(){},setTimeout,clearTimeout,AbortSignal};
 const html=fs.readFileSync(path.join(__dirname,'../Wetterzentrale_Model_Viewer.html'),'utf8');
 const code=html.match(/<script>\s*([^]*?)<\/script>/)[1].replace('updateModeUI();populateLeadOptions();reload(true);','renderRunBar=()=>{};updatePanelDisplay=()=>{};globalThis.subject={candidate,populateLeadOptions,state,e,buildFrames,loadImage,cancelImageLoads,sourceUrl,reload,autoRefresh};');
 vm.runInNewContext(code,context);return context.subject;
}


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
 assert.match(s.e.singleImg.src,/wetterzentrale\.de\/maps\/ECMOPEU00_120_1\.png\?v=/);assert.equal(s.e.empty.style.display,'none');
 for(let i=1;i<images.length;i++)images[i].onload();await new Promise(resolve=>setImmediate(resolve));
 s.buildFrames();await new Promise(resolve=>setImmediate(resolve));assert.equal(images.length,8);assert(s.e.singleImg.src);
});
test('A selected run cannot retain a reference date from a different cycle',async()=>{
 const s=viewer();s.e.compareMode.value='allmodels';s.e.refRun.value='0';s.e.lead.value='246';
 s.state.referenceInit=Date.parse('2026-10-03T06:00:00Z');s.buildFrames();
 assert.equal(new Date(s.state.referenceInit).getUTCHours(),0);
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




test('Every configured model/cycle/variable/lead requests the direct source within T+240',()=>{
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

test('ICON 12Z T+132 loads without an availability index',()=>{
 const s=viewer();const f=s.candidate('icon',12,132,now);
 assert.equal(f.ok,null);assert.match(f.url,/^https:\/\/wetterzentrale\.de\/maps\/ICOOPEU12_132_1\.png\?v=\d+$/);
 assert.match(s.candidate('icon',18,132,now).reason,/ends at T\+120/);
 assert.equal(s.candidate('ukmo',6,66,now).ok,null);
 assert.equal(s.candidate('ukmo',6,72,now).ok,false);
 assert.equal(s.candidate('gfs',0,246,now).ok,false);
});
test('Reload forces a fresh source URL while selection is preserved',async()=>{
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741;}
 const s=viewer(MockImage);s.e.model.value='ecmens';s.e.refRun.value='0';s.e.lead.value='240';
 const before=s.sourceUrl('ecmens',0,240,1);s.reload(false);
 assert.notEqual(s.sourceUrl('ecmens',0,240,1),before);assert.equal(s.e.lead.value,'240');assert.equal(s.e.refRun.value,'0');
 for(const im of images)im.onload();await new Promise(resolve=>setImmediate(resolve));
 assert.match(s.e.sameValid.textContent,/check printed Init\/Valid dates/);
 assert.doesNotMatch(s.e.statusText.textContent,/verified/);
});
test('The viewer has no manifest fetch or expiry gate',()=>{
 const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'../Wetterzentrale_Model_Viewer.html'),'utf8');
 assert(!html.includes('availability.json'));assert(!html.includes('fetch('));assert(!html.includes('MAX_INDEX_AGE'));
});

test('Revisiting a source slot refreshes its cache key after three minutes',()=>{
 let clock=Date.parse('2026-10-03T12:00:00Z');class Clock extends Date{static now(){return clock}}
 const s=viewer(undefined,undefined,Clock),a=s.sourceUrl('icon',12,132,1);
 clock+=120000;assert.equal(s.sourceUrl('icon',12,132,1),a);
 clock+=60000;assert.notEqual(s.sourceUrl('icon',12,132,1),a);
});


test('Run bar puts today 12Z to the right of 06Z and yesterday 18Z first',()=>{
 class Clock extends Date{constructor(...a){super(...(a.length?a:['2026-10-03T16:00:00Z']))}static now(){return Date.parse('2026-10-03T16:00:00Z')}}
 const s=viewer(undefined,undefined,Clock);s.e.refRun.value='6';s.e.lead.value='144';s.buildFrames();
 assert.deepEqual(Array.from(s.state.frames,f=>f.run),[18,0,6,12]);
 assert.deepEqual(Array.from(s.state.frames,f=>f.lead),[156,150,144,138]);
 assert(s.state.frames.every(f=>f.valid===s.state.frames[0].valid));s.cancelImageLoads();
});
test('Automatic refresh keeps the old image until replacement loads and preserves selection',async()=>{
 let time=Date.parse('2026-10-03T16:00:00Z');class Clock extends Date{constructor(...a){super(...(a.length?a:[time]))}static now(){return time}}
 const images=[];function MockImage(){images.push(this);this.naturalWidth=959;this.naturalHeight=741}
 const s=viewer(MockImage,undefined,Clock);s.e.lead.value='144';s.buildFrames();
 for(const im of images)im.onload();await new Promise(r=>setImmediate(r));
 const old=s.e.singleImg.src,idx=s.state.idx;s.state.zoom=2;
 time+=300001;const pending=s.autoRefresh();assert.equal(s.e.singleImg.src,old);assert.equal(s.state.idx,idx);
 for(const im of images.slice(4))im.onload();await pending;
 assert.notEqual(s.e.singleImg.src,old);assert.equal(s.state.idx,idx);assert.equal(s.state.zoom,2);assert.equal(s.e.lead.value,'144');
 const fresh=s.e.singleImg.src;time+=300001;const failed=s.autoRefresh();
 for(let i=8;i<images.length;i++)images[i].onerror();await failed;assert.equal(s.e.singleImg.src,fresh);
});
