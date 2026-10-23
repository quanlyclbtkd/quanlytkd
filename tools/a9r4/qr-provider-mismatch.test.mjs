/** A9R4 QR diagnostic verification from actual _verifyReceiptQrPixels body. NO provider calls or financial writes. */
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync('app.js','utf8');
const first=src.indexOf('async function _verifyReceiptQrPixels('),last=src.indexOf('function _receiptFailureMessage(',first);
assert(first>0&&last>first);
const text=src.slice(first,last);
let decoded={bankBin:'9704',accountNo:'SYNTHETIC',amount:100000,memo:'A'.repeat(40)},writes=0;
const createError=(code,stage)=>Object.assign(Error(code),{code,stage});
const context={window:{QRBankingHelpers:{decodeReceiptQrImage:async()=>[{rawValue:'SYNTHETIC',boundingBox:{x:10,y:10,width:180,height:180}}]}},
 _receiptError:createError,_receiptQrMismatch:(stage,failure,details={})=>Object.assign(createError('QR_EMV_MISMATCH',stage),{qrPixelAudit:{failure,...details}}),_receiptDecodeEMV:()=>decoded};
vm.createContext(context);vm.runInContext(text,context);
const img={naturalWidth:200,naturalHeight:200};
const intent={bankBin:'9704',accountNo:'SYNTHETIC',amount:100000,memo:'A'.repeat(42)};
let failures=0;
try{await context._verifyReceiptQrPixels(img,intent,'provider-pixels');}catch(e){
 assert.equal(e.code,'QR_EMV_MISMATCH');assert.equal(e.qrPixelAudit.failure,'INTENT_FIELD_MISMATCH');
 assert.equal(e.qrPixelAudit.fieldsMatch.bankBin,true);assert.equal(e.qrPixelAudit.fieldsMatch.accountNo,true);
 assert.equal(e.qrPixelAudit.fieldsMatch.amount,true);assert.equal(e.qrPixelAudit.fieldsMatch.memo,false);
 assert.equal(e.qrPixelAudit.expectedMemoLength,42);assert.equal(e.qrPixelAudit.qrMemoLength,40);
 assert.equal(e.qrPixelAudit.memoTransform.lengthDelta,-2);
 assert(!JSON.stringify(e.qrPixelAudit).includes('SYNTHETIC'));failures++;
}
assert.equal(failures,1);
decoded={...decoded,memo:'A A'};const before={...intent,memo:'AA'};
await assert.rejects(context._verifyReceiptQrPixels(img,before,'provider-pixels'),e=>e.qrPixelAudit.memoTransform.sameIgnoringSpaces===true);
decoded={...decoded,memo:intent.memo};await assert.doesNotReject(context._verifyReceiptQrPixels(img,intent,'provider-pixels'));
assert.equal(writes,0);
assert(/const _isReportQR = amount > 0 && _kind === 'REPORT';/.test(src));
console.log('A9R4 QR diagnostic 3/3 PASS; real provider pixel policy NOT VERIFIED; writes=0');
