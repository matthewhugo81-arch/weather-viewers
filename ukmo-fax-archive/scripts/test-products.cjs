const assert=require('node:assert/strict');const model=require('../viewer-model.js');const {retain}=require('./retain-archive.cjs');
let n=0;function c(lead,issue,valid,product='UKCpf'+String(lead).padStart(3,'0')){return {id:String(++n),lead_hours:lead,issue_time:issue,valid_time:valid,product,source:'metbrief-nowster',download_time:issue,filename:'chart'+n};}
const v='2026-10-06T12:00:00Z';const sample=[c(120,'2026-10-01T12:00:00Z',v),c(96,'2026-10-02T12:00:00Z',v),c(72,'2026-10-03T12:00:00Z',v),c(60,'2026-10-04T00:00:00Z',v),c(48,'2026-10-04T12:00:00Z',v),c(36,'2026-10-05T00:00:00Z',v),c(24,'2026-10-05T12:00:00Z',v),c(84,'2026-10-02T00:00:00Z','2026-10-05T12:00:00Z'),c(0,'2026-09-29T18:00:00Z','2026-09-29T18:00:00Z'),c(0,'2026-10-03T12:00:00Z','2026-10-03T12:00:00Z')];
const kept=retain(sample,Date.parse('2026-10-03T19:00:00Z')),shelf=model.build(kept);
assert.deepEqual(shelf.entries.map(e=>e.a.lead_hours),model.leads);
assert.equal(shelf.entries.find(e=>e.key==='lead:96').a.issue_time,'2026-10-02T12:00:00Z');
assert.equal(shelf.entries.find(e=>e.key==='lead:84').a.issue_time,'2026-10-02T00:00:00Z');
assert.equal(shelf.entries.find(e=>e.key==='lead:96').older[0].lead_hours,120);
assert(shelf.entries.every(e=>e.older.every(b=>b.valid_time===e.a.valid_time&&b.issue_time<e.a.issue_time)));
assert(!shelf.entries.some(e=>e.a.issue_time==='2026-09-29T18:00:00Z'));
const changed=model.build(retain([...sample,c(96,'2026-10-03T12:00:00Z','2026-10-07T12:00:00Z')],Date.parse('2026-10-03T19:00:00Z')));
assert.equal(changed.entries.find(e=>e.key==='lead:96').a.issue_time,'2026-10-03T12:00:00Z');
assert.equal(changed.entries.find(e=>e.key==='lead:84').a.issue_time,'2026-10-02T00:00:00Z');
const aged=retain([c(84,'2026-09-01T00:00:00Z','2026-09-04T12:00:00Z')],Date.parse('2026-10-03T19:00:00Z'));assert.equal(aged.length,1,'Current product remains until replaced');
assert(model.build(kept,'','archive').entries.some(e=>e.a.valid_time==='2026-09-29T18:00:00Z'));
console.log('PASS mixed runs retain all current leads, T84/T96 stay in A, comparisons use earlier runs at same valid time, history is opt-in, and leads replace independently');
