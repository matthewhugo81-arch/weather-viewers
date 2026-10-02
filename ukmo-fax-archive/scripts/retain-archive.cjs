const fs=require('fs'),path=require('path');
function retain(charts,now=Date.now()){
 const cutoff=now-7*86400000,groups=new Map();
 for(const c of charts){if(Date.parse(c.valid_time)<cutoff)continue;const key=c.valid_time+'|'+c.issue_time,old=groups.get(key);if(!old||(c.source==='metbrief-nowster'&&old.source!=='metbrief-nowster')||(c.source===old.source&&c.download_time>old.download_time))groups.set(key,c);}
 const counts=new Map();return [...groups.values()].sort((a,b)=>a.valid_time.localeCompare(b.valid_time)||b.issue_time.localeCompare(a.issue_time)).filter(c=>{const n=counts.get(c.valid_time)||0;counts.set(c.valid_time,n+1);return n<4;});
}
function apply(root){const file=path.join(root,'archive/manifest.json'),m=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),before=m.charts.length;m.charts=retain(m.charts);m.retention={runs_per_valid_time:4,past_valid_days:7,preferred_source:'metbrief-nowster',applied_at:new Date().toISOString()};
 const keep=new Set([...m.charts,...(m.pending||[])].map(c=>c.filename));
 // Commit the index before removing unreferenced originals; never follow symlinks.
 fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');fs.writeFileSync(path.join(root,'archive/manifest.js'),'window.FAX_ARCHIVE = '+JSON.stringify(m)+';\n');let removed=0;
 const objects=path.join(root,'archive/objects');for(const source of fs.readdirSync(objects,{withFileTypes:true})){if(!source.isDirectory()||source.isSymbolicLink())continue;for(const f of fs.readdirSync(path.join(objects,source.name),{withFileTypes:true})){if(!f.isFile()||!/^([a-f0-9]{64})\.png$/.test(f.name))continue;const rel='archive/objects/'+source.name+'/'+f.name;if(!keep.has(rel)){fs.unlinkSync(path.join(objects,source.name,f.name));removed++;}}}
 console.log(JSON.stringify({before,retained:m.charts.length,removed_images:removed}));}
module.exports={retain,apply};if(require.main===module)apply(path.resolve(__dirname,'..'));
