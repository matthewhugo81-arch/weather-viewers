const fs=require('fs'),path=require('path');
function latestProducts(charts){
 const selected=new Map();
 for(const c of charts.slice().sort((a,b)=>b.issue_time.localeCompare(a.issue_time)||b.download_time.localeCompare(a.download_time))){const key=c.source+'|'+c.product;if(!selected.has(key))selected.set(key,c);}
 return [...selected.values()];
}
function retain(charts,now=Date.now()){
 const cutoff=now-7*86400000,pins=latestProducts(charts),keep=new Map(),groups=new Map();
 const pool=charts.filter(c=>Date.parse(c.valid_time)>=cutoff).sort((a,b)=>b.issue_time.localeCompare(a.issue_time)||(a.source==='metbrief-nowster'?0:1)-(b.source==='metbrief-nowster'?0:1)||b.download_time.localeCompare(a.download_time));
 for(const c of pool){if(!groups.has(c.valid_time))groups.set(c.valid_time,[]);const g=groups.get(c.valid_time);if(!g.some(x=>x.issue_time===c.issue_time))g.push(c);}
 for(const g of groups.values())for(const c of g.slice(0,4))keep.set(c.id,c);
 // Current products remain selectable in A even when their run is older than
 // four overlapping forecasts. Keep earlier comparisons relative to each A.
 for(const c of pins){keep.set(c.id,c);for(const earlier of (groups.get(c.valid_time)||[]).filter(x=>x.issue_time<c.issue_time).slice(0,3))keep.set(earlier.id,earlier);}
 return [...keep.values()].sort((a,b)=>a.valid_time.localeCompare(b.valid_time)||a.issue_time.localeCompare(b.issue_time));
}
function apply(root){const file=path.join(root,'archive/manifest.json'),m=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),before=m.charts.length;m.charts=retain(m.charts);m.retention={runs_per_valid_time:4,past_valid_days:7,preferred_source:'metbrief-nowster',applied_at:new Date().toISOString()};
 const keep=new Set([...m.charts,...(m.pending||[])].map(c=>c.filename));
 // Commit the index before removing unreferenced originals; never follow symlinks.
 fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');fs.writeFileSync(path.join(root,'archive/manifest.js'),'window.FAX_ARCHIVE = '+JSON.stringify(m)+';\n');let removed=0;
 const objects=path.join(root,'archive/objects');for(const source of fs.readdirSync(objects,{withFileTypes:true})){if(!source.isDirectory()||source.isSymbolicLink())continue;for(const f of fs.readdirSync(path.join(objects,source.name),{withFileTypes:true})){if(!f.isFile()||!/^([a-f0-9]{64})\.png$/.test(f.name))continue;const rel='archive/objects/'+source.name+'/'+f.name;if(!keep.has(rel)){fs.unlinkSync(path.join(objects,source.name,f.name));removed++;}}}
 console.log(JSON.stringify({before,retained:m.charts.length,removed_images:removed}));}
module.exports={retain,latestProducts,apply};if(require.main===module)apply(path.resolve(__dirname,'..'));
