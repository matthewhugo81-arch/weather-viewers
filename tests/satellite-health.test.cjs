const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../Satellite_Image_Viewer.html'),'utf8');
const between=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function harness(){
 const images=[],timers=new Map(),elements={};let id=0;
 const state={generation:1,cache:new Map(),pending:new Set(),lastRefresh:100,loading:true};
 const context=vm.createContext({state,URL,location:{href:'https://example.test/'},Promise,
  Image:class{constructor(){this.naturalWidth=1440;this.naturalHeight=810;images.push(this);}},
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:key=>timers.delete(key),
  $:key=>elements[key]??=( {value:'latest',style:{},textContent:'',hidden:false}),
  liveURL:(p,token)=>'https://view.eumetsat.int/wms?refresh='+token,
  empty:(i,text)=>{(elements['empty'+i]??={}).textContent=text;},regionData:()=>({latest:'url'}),
  log:()=>{},status:()=>{},utc:()=>'',updateDownloadButton:()=>{}});
 vm.runInContext(between('function loadImage(','function empty(')+between('async function loadLive(','function reload('),context);
 return {context,state,images,timers,elements};
}
test('a slow EUMETView image remains loadable after the old 12-second timeout',async()=>{
 const h=harness();let slow=0;
 const promise=h.context.loadImage('https://view.eumetsat.int/wms',1,false,()=>slow++);
 assert.deepEqual([...h.timers.values()].map(t=>t.delay).sort((a,b)=>a-b),[10000,45000]);
 [...h.timers.values()].find(t=>t.delay===10000).fn();assert.equal(slow,1);
 h.images[0].onload();assert.equal(await promise,true);assert.equal(h.timers.size,0);assert.equal(h.state.pending.size,0);
});
test('ordinary feeds retain their bounded timeout and timeout releases the request',async()=>{
 const h=harness(),promise=h.context.loadImage('https://modeles20.meteociel.fr/image.png',1);
 [...h.timers.values()].find(t=>t.delay===12000).fn();assert.equal(await promise,false);
 assert.equal(h.images[0].src,'');assert.equal(h.state.pending.size,0);
});
test('changing area cancels old requests without poisoning the cache',async()=>{
 const h=harness();const promise=h.context.loadImage('https://view.eumetsat.int/wms',1);
 h.state.generation++;[...h.state.pending][0]();assert.equal(await promise,false);
 assert.equal(h.state.cache.size,0);assert.equal(h.timers.size,0);
 assert.equal(await h.context.loadImage('https://view.eumetsat.int/wms',1),false);assert.equal(h.images.length,1);
});
test('latest EUMETView retries once and reports a successful second image',async()=>{
 const h=harness(),product={layer:'geo',label:'GeoColour',group:'EUMETView extras'};
 const promise=h.context.loadLive(1,[product]);h.images[0].onerror();await new Promise(setImmediate);
 assert.equal(h.images.length,2);assert.match(h.images[1].src,/-retry$/);
 h.images[1].onload();await promise;assert.equal(h.state.loading,false);assert.equal(h.elements.empty0.hidden,true);
});
test('two failed attempts stop; a cancelled load never starts a retry',async()=>{
 const h=harness(),product={layer:'geo',label:'GeoColour',group:'EUMETView extras'};
 const promise=h.context.loadLive(1,[product]);h.images[0].onerror();await new Promise(setImmediate);
 h.images[1].onerror();await promise;assert.equal(h.images.length,2);assert.equal(h.elements.stamp0.textContent,'Unavailable');
 const h2=harness(),cancelled=h2.context.loadLive(1,[product]);h2.state.generation++;[...h2.state.pending][0]();await cancelled;
 assert.equal(h2.images.length,1);assert.equal(h2.timers.size,0);
});
