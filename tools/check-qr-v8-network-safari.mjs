import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createHarness,pngFixture,cut,source} from './qr-v7/harness.mjs';

let pass=0, fail=0;
const outcomes=[];
async function test(name,fn) {
  try {await fn(); pass++; outcomes.push({name,status:'PASS'}); console.log('PASS',name);}
  catch(e) {fail++; outcomes.push({name,status:'FAIL',observed:e.message}); console.log('FAIL',name,e.message);}
}
function response(url,overrides={}) {
  return {ok:true,status:200,redirected:false,type:'cors',url:String(url),headers:{get:()=> 'image/png'},arrayBuffer:async()=>pngFixture('valid.png'),...overrides};
}
for(const nativeDecoder of [true,false]) {
  for(const extension of ['png','svg'])await test('Canonical SVG request, allowed '+extension+' destination; native decoder '+nativeDecoder,async()=>{
    const h=await createHarness({nativeDecoder});
    h.c.fetch=async (url,options)=>{
      h.fetches.push({url,options});
      assert.equal(options.redirect,'follow');
      assert.equal(options.credentials,'omit');
      assert.match(String(url),/-qr_only\.svg\?/);
      return response(String(url).replace(/-qr_only\.(?:png|svg)\?/, '-qr_only.'+extension+'?'),{redirected:true});
    };
    const r=await h.run();
    assert.equal(r.ok,true,r.reason);assert.equal(h.fetches.length,1);assert.equal(h.writes.length,0);
    h.document.getElementById('btnDownloadReceipt').onclick();assert.equal(h.downloads.length,1);
  });
  await test('Direct PNG and actual pixel verification; native decoder '+nativeDecoder,async()=>{
    const h=await createHarness({nativeDecoder});h.c.fetch=async url=>response(url);
    const r=await h.run();assert.equal(r.ok,true,r.reason);assert.equal(h.writes.length,0);
  });
}
for(const [name,transform] of [
  ['other origin',u=>u.replace('https://img.vietqr.io/','https://other.invalid/')],
  ['non-HTTPS',u=>u.replace('https:','http:')],
  ['different account',u=>u.replace('001234567890','009999999999')],
  ['different bank',u=>u.replace('970422','970436')],
  ['different amount',u=>u.replace('amount=500000','amount=1')],
  ['different memo',u=>u+'&addInfo=DIFFERENT'],
  ['foreign credentials',u=>u.replace('https://','https://user:pass@')],
  ['unexpected path',u=>u.replace('/image/','/unexpected/')],
]) await test('Reject redirect '+name,async()=>{
  const h=await createHarness();h.c.fetch=async url=>response(transform(String(url)),{redirected:true});
  const r=await h.run();assert.equal(r.ok,false);assert.equal(r.reason,'QR_FETCH_REDIRECT');
  assert.equal(h.renders.length,0);assert.equal(h.writes.length,0);assert.equal(h.document.getElementById('btnDownloadReceipt').onclick,null);
});
await test('Network rejection has accurate network reason, no unproven CORS diagnosis',async()=>{
  const h=await createHarness({network:'cors'});const r=await h.run();
  assert.equal(r.reason,'QR_FETCH_NETWORK');assert.equal(r.stage,'fetch');assert.equal(h.writes.length,0);
});
await test('Both debt and multiitem entry points retain the existing receipt owner',async()=>{
  assert.match(source,/window\.generateMultiMonthPaymentRequest[\s\S]*?return window\.exportReceipt/);
  assert.match(source,/const _miReceiptResult = await window\.exportReceipt/);
  assert.equal((source.match(/window\.exportReceipt\s*=/g)||[]).length,1);
});
console.log(JSON.stringify({pass,fail,sourceSha:crypto.createHash('sha256').update(source).digest('hex'),testSha:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),layer:'ACTUAL_SOURCE_HANDLERS / PIXELS / RESPONSE_FIXTURES',outcomes},null,2));
process.exitCode=fail?1:0;
