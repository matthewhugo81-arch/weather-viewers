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
function viewer(){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const elements={};const get=id=>elements[id]||(elements[id]={value:'',style:{},children:[],options:[],addEventListener(){}});
 for(const [id,value] of Object.entries({model:'gfs',variable:'1',compareMode:'history',refRun:'6',lead:'0',displayView:'single'}))get(id).value=value;
 Object.defineProperty(get('lead'),'innerHTML',{set(html){this.options=[...html.matchAll(/value="(\d+)"/g)].map(m=>({value:m[1],disabled:false}));this.value=this.options[0]?.value||'';}});
 const context={window:{WZModels:r,addEventListener(){}},document:{getElementById:get,addEventListener(){}},Date,Image:function(){},setInterval(){},setTimeout(){},clearTimeout(){},AbortSignal};
 const html=fs.readFileSync(path.join(__dirname,'../Wetterzentrale_Model_Viewer.html'),'utf8');
 const code=html.match(/<script>\s*([^]*?)<\/script>/)[1].replace('updateModeUI();populateLeadOptions();reload(true);','globalThis.subject={candidate,populateLeadOptions,state,e,freshIndex};');
 vm.runInNewContext(code,context);return context.subject;
}
test('A decoded chart from the wrong day cannot enter an exact-time comparison',()=>{
 const s=viewer(),init=Date.parse('2026-10-03T06:00:00Z'),name=r.filename('aifs',6,48,1);
 s.state.index={schema:1,checkedAt:new Date().toISOString(),charts:{[name]:{init:'2026-10-02T06:00:00Z',valid:'2026-10-04T06:00:00Z',sha:'a'.repeat(64)}}};
 const wrong=s.candidate('aifs',6,48,init);assert.equal(wrong.ok,false);assert.match(wrong.reason,/Different stored date/);assert.equal(wrong.url,'');
 s.state.index.charts[name].init='2026-10-03T06:00:00Z';s.state.index.charts[name].valid='2026-10-05T06:00:00Z';
 assert.equal(s.candidate('aifs',6,48,init).url,'wetterzentrale/charts/'+'a'.repeat(64)+'.png');
});
test('Expired or missing date indices withhold charts',()=>{
 const s=viewer();assert.equal(s.freshIndex(),false);
 s.state.index={schema:1,checkedAt:new Date(Date.now()-76*60000).toISOString(),charts:{}};assert.equal(s.freshIndex(),false);
 assert.equal(s.candidate('gfs',6,48,now).ok,false);
});
test('T+0 survives selector regeneration and every UI option stays within T+240',()=>{
 const s=viewer();s.populateLeadOptions();assert.equal(s.e.lead.value,'0');
 s.e.compareMode.value='allmodels';s.populateLeadOptions();assert.equal(s.e.lead.value,'0');assert(s.e.lead.options.every(o=>+o.value<=240));
});
