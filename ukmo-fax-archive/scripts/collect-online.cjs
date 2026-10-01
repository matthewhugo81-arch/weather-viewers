// Cross-platform collector for GitHub Actions. Originals are never re-encoded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('sharp');
const {createWorker}=require('tesseract.js');
const months='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
function metadata(text,lead){
 text=text.toUpperCase().replace(/(VALID\s+)OO(\s+UTC)/g,'$100$2');
 const m=text.match(/VALID\s+(\d{2})(?:00)?\s*UTC\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/);
 if(!m)throw Error('Printed valid-time header not recognized');
 const [hour,day,month,year]=[+m[1],+m[3],months.indexOf(m[4]),+m[5]];
 const d=new Date(Date.UTC(year,month,day,hour));
 if(hour>23||hour%6||d.getUTCDate()!==day||d.getUTCMonth()!==month||d.getUTCFullYear()!==year||['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()]!==m[2])throw Error('Printed weekday/date/hour mismatch');
 const printed=text.match(/T\s*\+\s*(\d{1,3})/);
 if(lead===0?!text.includes('ANALYSIS'):!printed||+printed[1]!==lead)throw Error('Printed lead/title mismatch');
 const iso=d=>d.toISOString().replace('.000Z','Z');
 return {valid_time:iso(d),issue_time:iso(new Date(+d-lead*3600000))};
}
async function recognize(worker,bytes,lead){
 const size=await sharp(bytes).metadata();
 const layouts={'1076x864':{left:2,top:72,width:362,height:24},'1179x864':{left:2,top:38,width:397,height:25},'900x608':{left:2,top:3,width:302,height:19}};
 const crop=layouts[`${size.width}x${size.height}`];if(!crop)throw Error(`Unrecognized layout ${size.width}x${size.height}`);
 const strip=await sharp(bytes).extract(crop).resize(crop.width*4,crop.height*4).extend({top:20,bottom:20,left:20,right:20,background:'white'}).png().toBuffer();
 await worker.setParameters({tessedit_pageseg_mode:'7'});
 const result=await worker.recognize(strip);
 return {...metadata(result.data.text,lead),ocr_header:result.data.text.trim()};
}
async function download(url){
 if(new URL(url).protocol!=='https:')throw Error('HTTPS required');
 let error;for(let n=0;n<3;n++){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error',headers:{'User-Agent':'UKMO-FAX-Archive/2.0'}});if(!response.ok)throw Error('HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5e6||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Response is not an acceptable PNG');return bytes;}catch(e){error=e;if(n<2)await new Promise(r=>setTimeout(r,(n+1)*2000));}
 }throw error;
}
function writeSnapshot(root,m){
 const dir=path.join(root,'archive');fs.mkdirSync(dir,{recursive:true});
 for(const [name,data] of [['manifest.json',JSON.stringify(m,null,2)+'\n'],['manifest.js','window.FAX_ARCHIVE = '+JSON.stringify(m)+';\n']]){
  const dest=path.join(dir,name);fs.writeFileSync(dest+'.tmp',data);fs.renameSync(dest+'.tmp',dest);
 }
}
async function collect(root=path.resolve(__dirname,'..')){
 const manifestFile=path.join(root,'archive/manifest.json');
 const m=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8').replace(/^\uFEFF/,'')):{schema_version:1,charts:[],pending:[]};
 const products=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8').replace(/^\uFEFF/,'')).products.filter(p=>p.enabled);
 const now=()=>new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 let worker=null,failed=0,added=0;const errors=[];
 try{
  for(const p of products){
   try{
    if(!/^[a-z0-9_-]+$/.test(p.source)||!Number.isInteger(p.lead_hours))throw Error('Invalid source registry entry');
    const bytes=await download(p.url),sha=crypto.createHash('sha256').update(bytes).digest('hex'),id=`${p.source}:${p.product}:${sha}`;
    if(m.charts.some(c=>c.id===id)||m.pending.some(c=>c.id===id)){console.log('Unchanged: '+p.product);continue;}
    const filename=`archive/objects/${p.source}/${sha}.png`,dest=path.join(root,filename);fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(!fs.existsSync(dest))fs.writeFileSync(dest,bytes,{flag:'wx'});
    const c={id,issue_time:null,valid_time:null,lead_hours:p.lead_hours,source:p.source,product:p.product,filename,download_time:now(),source_url:p.url,sha256:sha,metadata_method:'printed-header-ocr',issue_time_basis:'valid_time minus lead_hours (nominal run, not publication time)'};
    try{if(!worker)worker=await createWorker('eng');const meta=await recognize(worker,bytes,p.lead_hours);Object.assign(c,meta);m.charts.push(c);added++;console.log('Archived: '+p.product+' valid '+c.valid_time);}
    catch(e){c.metadata_method='needs-review';c.review_reason=e.message;m.pending.push(c);console.warn('Saved for review: '+p.product+' '+e.message);}
    // Persist every saved chart so later source failure cannot discard earlier captures.
    writeSnapshot(root,m);
   }catch(e){failed++;errors.push(p.product+': '+e.message);console.error(errors.at(-1));}
  }
 }finally{if(worker)await worker.terminate();}
 m.charts.sort((a,b)=>a.valid_time.localeCompare(b.valid_time)||a.issue_time.localeCompare(b.issue_time)||a.source.localeCompare(b.source));
 m.updated_at=now();m.collection_status={checked_at:m.updated_at,products:products.length,download_failures:failed,pending:m.pending.length,errors};
 if(failed===0&&m.pending.length===0)m.last_successful_collection=m.updated_at;
 writeSnapshot(root,m);
 console.log(`${m.charts.length} indexed; ${added} new; ${m.pending.length} pending; ${failed} failures.`);
 return failed||m.pending.length?1:0;
}
module.exports={metadata,recognize,collect,writeSnapshot};
if(require.main===module)collect(process.argv[2]).then(code=>{process.exitCode=code;}).catch(e=>{console.error(e);process.exitCode=1;});
