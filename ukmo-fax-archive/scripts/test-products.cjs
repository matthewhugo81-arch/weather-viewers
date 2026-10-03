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

const iceland=['00','06','12','18'].map(hour=>({...c(24,'2026-10-03T'+hour+':00:00Z','2026-10-04T'+hour+':00:00Z','PPVE89_EGRR_'+hour+'00'),source:'vedur'}));
const duplicate={...iceland[0],id:'older-00',issue_time:'2026-10-02T00:00:00Z',valid_time:'2026-10-03T00:00:00Z'};
const combined=model.build(retain([...sample,...iceland,duplicate],Date.parse('2026-10-03T19:00:00Z')));
assert.deepEqual(combined.entries.map(e=>e.key),model.slots.map(s=>s.key));
assert.deepEqual(combined.entries.slice(0,4).map(e=>e.a.id),iceland.map(c=>c.id),'Four Icelandic cycles stay independently selectable despite sharing T+24');
assert.equal(combined.entries[4].a.source,'metbrief-nowster','T+24 after Iceland is the existing longer-range source');
assert.equal(model.build([...sample,...iceland],'vedur').entries.length,4);
assert.equal(model.build([...sample,...iceland],'metbrief-nowster').entries.length,8);
const replacement={...iceland[1],id:'new-06',issue_time:'2026-10-04T06:00:00Z',valid_time:'2026-10-05T06:00:00Z'};
const refreshed=model.build([...sample,...iceland,replacement]);
assert.equal(refreshed.entries[1].a.id,'new-06');assert.equal(refreshed.entries[0].a.id,iceland[0].id);
assert(combined.entries.every(e=>e.older.every(b=>b.valid_time===e.a.valid_time&&b.issue_time<e.a.issue_time)));
console.log('PASS independent Icelandic cycles, source filters, replacement, lead retention and same-valid-time comparison');
