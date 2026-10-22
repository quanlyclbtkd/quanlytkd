import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness,syntheticForUrl} from '../qr-v7/harness.mjs';
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL '+name+': '+e.message)}}
await test('settings changed during final paint cannot return success',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl});let changed=false;
 h.c.requestAnimationFrame=fn=>{if(!changed&&h.document.getElementById('receiptModal').style.display==='flex'){changed=true;const next=structuredClone(h.c.clubConfig);next.paymentAccounts.bank1.accountNo='002222222222';h.publish(next)}fn()};
 const result=await h.run();assert.equal(changed,true);assert.equal(result.ok,false);assert.equal(result.reason,'CONFIG_STALE');assert.equal(h.document.getElementById('btnDownloadReceipt').onclick,null);assert.equal(h.writes.length,0);
});
await test('principal changed during final paint cannot return success',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl});let changed=false;
 h.c.requestAnimationFrame=fn=>{if(!changed&&h.document.getElementById('receiptModal').style.display==='flex'){changed=true;h.w.__verifiedAuthContextState.uid='other-admin'}fn()};
 const result=await h.run();assert.equal(result.ok,false);assert.equal(result.reason,'AUTH_STALE');assert.equal(h.document.getElementById('btnDownloadReceipt').onclick,null);assert.equal(h.writes.length,0);
});
await test('accepted changed settings immediately invalidate an existing QR preview',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl});assert.equal((await h.run()).ok,true);const next=structuredClone(h.c.clubConfig);next.paymentAccounts.bank1.accountNo='002222222222';h.publish(next);
 assert.equal(h.document.getElementById('receiptModal').style.display,'none');assert.equal(h.document.getElementById('btnDownloadReceipt').onclick,null);assert.equal(h.document.getElementById('receiptPreviewImg').src,'');assert.equal(h.writes.length,0);
});
await test('pending settings immediately invalidate an existing QR preview',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl});assert.equal((await h.run()).ok,true);h.publish(h.c.clubConfig,{fromCache:false,hasPendingWrites:true});assert.equal(h.document.getElementById('receiptModal').style.display,'none');assert.equal(h.writes.length,0);
});
await test('an explicit retry after HTTP failure succeeds with the same intent and zero writes',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl,network:'http'});const failed=await h.run();assert.equal(failed.ok,false);h.setNetwork('ok');const good=await h.run();assert.equal(good.ok,true);assert.notEqual(good.jobId,failed.jobId);assert.equal(h.fetches[0].url,h.fetches[1].url);assert.equal(h.writes.length,0);
});
await test('REPORT jobs stay serialized and preserve unique job identities',async()=>{
 const h=await createHarness({providerBytes:syntheticForUrl});const [a,b]=await Promise.all([h.run(),h.run()]);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.notEqual(a.jobId,b.jobId);assert.equal(h.writes.length,0);
});
if(process.env.A6_OUTPUT){fs.mkdirSync(process.env.A6_OUTPUT,{recursive:true});fs.writeFileSync(process.env.A6_OUTPUT+'/qr-races.json',JSON.stringify({results},null,2))}
console.log('A6 QR RACES '+results.filter(r=>r.status==='PASS').length+'/'+results.length);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
