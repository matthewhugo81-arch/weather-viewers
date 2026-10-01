// Optional validation: Node.js 18+. No packages required.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'archive/manifest.json'),'utf8'));
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'archive/manifest.js'),'utf8'),sandbox);
assert.equal(JSON.stringify(manifest),JSON.stringify(sandbox.window.FAX_ARCHIVE),'JSON and file:// companion differ');
const ids=new Set();for(const c of [...manifest.charts,...manifest.pending]){
 assert(!ids.has(c.id),'Duplicate ID');ids.add(c.id);
 assert.match(c.filename,/^archive\/objects\/[a-z0-9_-]+\/[a-f0-9]{64}\.png$/);
 const bytes=fs.readFileSync(path.join(root,c.filename));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),c.sha256,'Image changed');
 assert(Number.isFinite(Date.parse(c.download_time)));
 if(c.valid_time!==null)assert.equal(Date.parse(c.valid_time)-Date.parse(c.issue_time),c.lead_hours*3600000);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(https:|data:)/.test(m[1]))continue;assert(fs.existsSync(path.join(root,m[1])),`Missing link ${m[1]}`);}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');new vm.Script(app);
for(const m of app.matchAll(/\$\('([^']+)'\)/g)) assert(html.includes(`id="${m[1]}"`),`Missing control ${m[1]}`);
console.log(`PASS: ${ids.size} image hashes, all timestamps, unique IDs, companion manifest, JS syntax, controls and local links.`);
