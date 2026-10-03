const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function importHosted(root,m){
 const {url,key}=JSON.parse(fs.readFileSync(path.join(root,'hosted/config.json'),'utf8'));
 const r=await fetch(url,{headers:{Authorization:'Bearer '+key,apikey:key},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Hosted backup HTTP '+r.status);
 const live=await r.json();if(!live.live_archive||!Array.isArray(live.charts))throw Error('Invalid hosted archive');
 const base='https://znlriqmliaszlxlnkeic.supabase.co/storage/v1/object/public/fax-archive/';
 let added=0;
 for(const c of live.charts){
  if(m.charts.some(old=>old.id===c.id))continue;
  if(!/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/.test(c.filename)||Date.parse(c.valid_time)-Date.parse(c.issue_time)!==c.lead_hours*3600000)throw Error('Invalid hosted chart');
  const url=c.image_url||'https://matthewhugo81-arch.github.io/weather-viewers/ukmo-fax-archive/'+c.filename;
  if(c.image_url&&c.image_url!==base+c.filename)throw Error('Unexpected original URL');
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Hosted original HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw Error('Hosted original checksum mismatch');
  const dest=path.join(root,c.filename);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
  const copy={...c};delete copy.image_url;m.charts.push(copy);added++;
 }
 console.log('Backed up '+added+' independently collected charts');
}
module.exports={importHosted};
