// Read dates from the chart itself and publish immutable verified snapshots.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),{createWorker}=require('tesseract.js'),sharp=require('sharp');
const registry=require('./models.js');
const HOUR=3600000,months='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' '),days='SUN MON TUE WED THU FRI SAT'.split(' ');
const iso=n=>new Date(n).toISOString();
function stamp(n){const d=new Date(n);return `${days[d.getUTCDay()]}${String(d.getUTCDate()).padStart(2,'0')}${months[d.getUTCMonth()]}${d.getUTCFullYear()}${String(d.getUTCHours()).padStart(2,'0')}Z`;}
// OCR confuses O/0, Q/0 and Z/2 in this bitmap font; normalize both sides equally.
function normal(s){return s.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/[OQ]/g,'0').replace(/Z/g,'2');}
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){let next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]!==b[j])));row=next;}return row[b.length];}
function substringDistance(text,want){let best=Infinity;for(let start=0;start<text.length;start++)for(let length=want.length-2;length<=want.length+2;length++)best=Math.min(best,distance(text.slice(start,start+length),want));return best;}
function readDates(text,run,lead,now=Date.now()){
 const parts=text.toUpperCase().split(/VALID\s*[:;]/);if(parts.length!==2||!/^\s*INIT\s*[:;]/.test(parts[0]))throw Error('Unrecognized printed date headers');
 const initialHour=parts[0].match(/INIT\s*[:;]\s*[A-Z]{3}[\s,.]+[A-Z0-9]+\s+([A-Z0-9]{2,3})\s/),validHour=parts[1].trim().split(/\s+/).at(-1);
 const hour=s=>{let token=s?.replace(/[OQ]/g,'0').replace(/[IL]/g,'1');if(token==='0Z'||token==='02')token='00Z';if(token)token=token.replace(/^0B/,'06').replace(/^1B/,'18');return token&&/^\d{2}[Z2]$/.test(token)?+token.slice(0,2):null;};
 if(hour(initialHour?.[1])!==run||hour(validHour)!==(run+lead)%24)throw Error('Printed cycle/valid hour mismatch');
 const initText=normal(parts[0]).slice(0,40),validText=normal(parts[1]);
 const weekdays=parts.map(s=>s.match(/(?:INIT\s*[:;]\s*)?([A-Z]{3,4})[,.\s]+[A-Z0-9]+\s+[A-Z0-9]{2,3}/)?.[1]);
 const clearDate=s=>{const m=s.match(/(?:^|[,\.\s])(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|[0OQ]CT|NOV|DEC)(\d{4})\s/);if(!m)return null;const month=months.indexOf(m[2].replace(/[0Q]/g,'O')),n=Date.UTC(+m[3],month,+m[1]);return new Date(n).getUTCDate()===+m[1]?n:null;};
 const clear=parts.map(clearDate);
 const today=new Date(now);today.setUTCHours(run,0,0,0);const candidates=[];
 for(let day=0;day<4;day++){
  const init=+today-day*24*HOUR;if(init>now)continue;
  const valid=init+lead*HOUR;
  if(clear.some((date,i)=>date!==null&&date!==Math.floor((i?valid:init)/(24*HOUR))*24*HOUR))continue;
  if(weekdays.some((day,i)=>!day||distance(normal(day),normal(days[new Date(i?valid:init).getUTCDay()]))>1))continue;
  const a=substringDistance(initText,normal(stamp(init))),b=substringDistance(validText,normal(stamp(init+lead*HOUR)));
  // Both independent printed dates must agree with the requested lead and cycle.
  if(a<=3&&b<=3)candidates.push({init,valid:init+lead*HOUR,score:a+b});
 }
 candidates.sort((a,b)=>a.score-b.score);
 if(!candidates.length||(candidates[1]&&candidates[1].score-candidates[0].score<3))throw Error('Ambiguous or inconsistent printed dates');
 return {init:iso(candidates[0].init),valid:iso(candidates[0].valid)};
}
function header(bytes){
 const p=PNG.sync.read(bytes);if(p.width!==959||p.height!==741)throw Error(`Unknown chart layout ${p.width}x${p.height}`);
 const scale=4,out=new PNG({width:p.width*scale+40,height:16*scale+40});out.data.fill(255);
 for(let y=0;y<16*scale;y++)for(let x=0;x<p.width*scale;x++){
  const from=(Math.floor(y/scale)*p.width+Math.floor(x/scale))*4,to=((y+20)*out.width+x+20)*4;
  p.data.copy(out.data,to,from,from+4);
 }
 return PNG.sync.write(out);
}
async function recognizeDates(worker,bytes,run,lead){
 const size=await sharp(bytes).metadata();if(size.width!==959||size.height!==741)throw Error('Unknown chart layout');
 const strip=(left,width,scale)=>sharp(bytes).extract({left,top:0,width,height:16}).resize(width*scale,16*scale).extend({top:20,bottom:20,left:20,right:20,background:'white'}).png().toBuffer();
 let error;
 const read=async image=>{const {data}=await worker.recognize(image);return readDates(data.text,run,lead);};
 try{return await read(await strip(0,959,3));}catch(e){error=e;}
 try{return await read(header(bytes));}catch(e){error=e;}
 // The fixed layout also allows the two date fields to be read separately,
 // avoiding interference from the different variable titles between them.
 for(const scale of [4,5])try{
  const a=await worker.recognize(await strip(0,235,scale)),b=await worker.recognize(await strip(725,234,scale));
  const fragment=s=>s.match(/\b[A-Za-z]{3,4}[,.]\s*[^]*$/)?.[0];
  const initial=fragment(a.data.text),valid=fragment(b.data.text);if(!initial||!valid)throw Error('Unreadable printed date fields');
  return readDates('Init: '+initial.trim()+' Valid: '+valid.trim(),run,lead);
 }catch(e){error=e;}
 for(const scale of [2,5,6])try{return await read(await strip(0,959,scale));}catch(e){error=e;}
 throw error;
}
async function request(url,options={}){
 let error;for(let n=0;n<3;n++)try{
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000),redirect:'error'});
  if(r.status>=500||r.status===429)throw Error(`HTTP ${r.status}`);return r;
 }catch(e){error=e;if(n<2)await new Promise(r=>setTimeout(r,1000*(n+1)));}throw error;
}
async function collect(root=__dirname){
 const dest=path.join(root,'availability.json');let old={charts:{}};
 if(fs.existsSync(dest))old=JSON.parse(fs.readFileSync(dest,'utf8').replace(/^\uFEFF/,''));
 const result={schema:1,checkedAt:iso(Date.now()),ceiling:240,charts:{},errors:[]};
 const objects=path.join(root,'charts');fs.mkdirSync(objects,{recursive:true});
 const jobs=[];for(const key of registry.order)for(const run of registry.models[key].cycles)for(const lead of registry.leads(key,run))for(const v of registry.models[key].vars)jobs.push({key,run,lead,v,name:registry.filename(key,run,lead,v)});
 // Optional scope is for diagnostics only; scheduled production collections always cover all charts.
 const filter=process.env.WZ_MODELS?.split(',');if(filter)for(let i=jobs.length-1;i>=0;i--)if(!filter.includes(jobs[i].key))jobs.splice(i,1);
 let complete=0,changed=0,failed=0;
 async function lane(){
  const worker=await createWorker('eng',1,{cachePath:root});await worker.setParameters({tessedit_pageseg_mode:'7'});
  try{while(jobs.length){const job=jobs.shift(),previous=old.charts[job.name],url='https://wetterzentrale.de/maps/'+job.name;
   try{
    const cached=previous?.sha&&fs.existsSync(path.join(objects,previous.sha+'.png'));
    const response=await request(url,{headers:cached&&previous?.etag?{'If-None-Match':previous.etag}:{}});
    if(response.status===304&&previous?.init){result.charts[job.name]=previous;}
    else if(response.status===404){/* Missing or out-of-range chart: omit it. */}
    else if(!response.ok)throw Error(`HTTP ${response.status}`);
    else{
     const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2e6||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');
     const sha=crypto.createHash('sha256').update(bytes).digest('hex');
     const object=path.join(objects,sha+'.png');if(!fs.existsSync(object))fs.writeFileSync(object,bytes);
     if(previous?.sha===sha&&previous.init)result.charts[job.name]={...previous,etag:response.headers.get('etag')};
     else{
      const dates=await recognizeDates(worker,bytes,job.run,job.lead);
      result.charts[job.name]={...dates,etag:response.headers.get('etag'),sha,method:'printed-header-ocr'};changed++;
     }
    }
   }catch(e){failed++;if(result.errors.length<100)result.errors.push({chart:job.name,reason:e.message});/* Fail closed, including when an old record existed. */}
   complete++;if(complete%100===0)console.log(`${complete} checked; ${changed} new date readings; ${failed} uncertain`);
  }}finally{await worker.terminate();}
 }
 await Promise.all(Array.from({length:4},lane));
 result.checkedAt=iso(Date.now());result.summary={checked:complete,verified:Object.keys(result.charts).length,changed,uncertain:failed};
 // Do not replace a healthy manifest with a wholesale source outage.
 if(result.summary.verified<complete*0.5)throw Error('Too few charts verified; previous manifest retained');
 fs.writeFileSync(dest+'.tmp',JSON.stringify(result)+'\n');fs.renameSync(dest+'.tmp',dest);
 const keep=new Set(Object.values(result.charts).map(c=>c.sha+'.png'));for(const file of fs.readdirSync(objects))if(/^[a-f0-9]{64}\.png$/.test(file)&&!keep.has(file))fs.unlinkSync(path.join(objects,file));
 console.log(JSON.stringify(result.summary));return result;
}
module.exports={readDates,header,recognizeDates,collect,stamp};
if(require.main===module)collect().catch(e=>{console.error(e);process.exitCode=1;});
