const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {metadata,recognize}=require('./collect-online.cjs');
const {createWorker}=require('tesseract.js');
assert.equal(metadata('Forecast chart (T+24) valid 00 UTC FRI 01 JAN 2027',24).issue_time,'2026-12-31T00:00:00Z');
assert.equal(metadata('Forecast chart (T+24) valid 00 UTC FRI 01 MAR 2024',24).issue_time,'2024-02-29T00:00:00Z');
assert.throws(()=>metadata('Forecast chart (T+24) valid 00 UTC MON 01 MAR 2024',24));
assert.throws(()=>metadata('Forecast chart (T+24) valid 00 UTC FRI 01 MAR 2024',48));
assert.throws(()=>metadata('Forecast chart (T+24) valid 00 UTC SAT 31 FEB 2024',24));
assert.throws(()=>metadata('No readable header',24));
(async()=>{const root=path.resolve(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(root,'archive/manifest.json'),'utf8'));
const worker=await createWorker('eng');let fail=0;
try{for(const c of m.charts){try{const meta=await recognize(worker,fs.readFileSync(path.join(root,c.filename)),c.lead_hours);assert.equal(meta.valid_time,c.valid_time);assert.equal(meta.issue_time,c.issue_time);console.log('PASS '+c.product+' '+c.valid_time);}catch(e){fail++;console.error('FAIL '+c.product+' '+e.message);}}}finally{await worker.terminate();}
assert.equal(fail,0,`${fail} saved chart headers did not match`);console.log('PASS cloud OCR and date safeguards');})().catch(e=>{console.error(e);process.exitCode=1;});
