import fs from 'node:fs';import assert from 'node:assert/strict';
import {createHarness,pngFixture,syntheticForUrl} from '../qr-v7/harness.mjs';
let pass=0;
async function test(label,providerBytes,expected,field){
 const h=await createHarness({providerBytes}),r=await h.run();
 assert.equal(r.ok,false,label);assert.equal(r.reason,'QR_EMV_MISMATCH');
 const audit=r.diagnostics.qrPixelAudit;assert.equal(audit?.failure,expected,label);
 if(field) assert.equal(audit.fieldsMatch[field],false);
 assert.equal(h.writes.length,0);assert.equal(h.renders.length,0);
 assert(!JSON.stringify(r.diagnostics).includes('001234567890'));
 assert(!JSON.stringify(r.diagnostics).includes('TEST VDV'));
 console.log('PASS',label,audit);pass++;
}
await test('CRC damaged pixels are distinctly reported',pngFixture('wrong-crc.png'),'EMV_PARSE_OR_CRC_FAIL');
for(const x of [['bank','wrong-bank.png','bankBin'],['account','wrong-account.png','accountNo'],['amount','wrong-amount.png','amount'],['memo','wrong-memo.png','memo']])
 await test('Only '+x[0]+' field mismatch is exposed (boolean)',pngFixture(x[1]),'INTENT_FIELD_MISMATCH',x[2]);
const good=await createHarness({providerBytes:syntheticForUrl});const result=await good.run();assert.equal(result.ok,true);assert.equal(good.writes.length,0);pass++;console.log('PASS all-fields match and no write');
fs.mkdirSync('handoff/A7',{recursive:true});fs.writeFileSync('handoff/A7/qr-pixels-test.json',JSON.stringify({pass,total:6,scope:'SYNTHETIC_PIXELS_ONLY',productionWrites:0},null,2));
console.log('A7 QR',pass,'/6');
