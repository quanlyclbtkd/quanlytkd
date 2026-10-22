// Source-level Quick Link memo matrix using dummy inputs and existing owner.
// No live provider, bank account, Firestore, or physical-device verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness,syntheticForUrl} from '../qr-v7/harness.mjs';
const h=await createHarness({providerBytes:syntheticForUrl});
let pass=0;
for(const size of [20,24,25,26,30,40,48]){
  // Distinct synthetic references, no actual student information.
  const expected='A'.repeat(size-4)+' T10';
  assert.equal(expected.length,size);
  const value=h.eval(`_receiptPaymentMemo(${JSON.stringify(expected)},'')`);
  assert.equal(value,expected);
  const url=h.eval(`generateVietQR(500000,${JSON.stringify(expected)},'','CS1','qr_only')`);
  const parsed=new URL(url);assert.equal(parsed.searchParams.get('addInfo'),expected);
  assert(parsed.hostname==='img.vietqr.io'&&parsed.pathname.endsWith('qr_only.svg'));
  pass++;console.log('PASS source memo URL canonical length',size);
}
assert.throws(()=>h.eval("_receiptPaymentMemo('A'.repeat(49),'')"), e=>e.code==='MEMO_TOO_LONG');pass++;
const good=await h.run();assert.equal(good.ok,true);assert.equal(h.writes.length,0);pass++;console.log('PASS synthetic pixel decode and zero financial writes');
const rec={scope:'SOURCE_AND_SYNTHETIC_PIXELS_ONLY',verifiedLengths:[20,24,25,26,30,40,48],overLimit:49,pass,total:9,providerQuickLinkBehavior:'NOT_VERIFIED',actualMobile:'NOT_VERIFIED',financialWrites:0};
console.log('A8 QR MEMO MATRIX',JSON.stringify(rec));
