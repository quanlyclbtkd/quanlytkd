import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
function extract(start,end){const a=app.indexOf(start),b=app.indexOf(end,a);assert(a>=0&&b>a,start);return app.slice(a,b);}
const section=extract('    function _receiptPaymentMemo(', '    function _receiptFailureMessage(');
const generator=extract('    function generateVietQR(', "    document.getElementById('transactionForm')");
const account={bankBin:'970415',accountNo:'113366668888',accountName:'TEST OWNER'};
const ctx={
  window:{ QRBankingHelpers:{normalizeBankAccountStrict(x){return x;} }},
  removeVietnameseTonesForQR:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D'),
  _receiptError:(code,stage)=>Object.assign(new Error(code),{code,stage}),
  getPaymentAccountForBranch:()=>account,
  console,
};
vm.createContext(ctx);
vm.runInContext(section+'\n'+generator,ctx);
const call=script=>vm.runInContext(script,ctx);
let checks=0;
const verify=(title,func)=>{func();checks++;console.log('PASS',title);};
const emvTlv=(tag,value)=>{assert(value.length<=99);return tag+String(value.length).padStart(2,'0')+value;};
function emvRaw(memo,amount=350000){
 const ben=emvTlv('00','970415')+emvTlv('01','113366668888');
 const merc=emvTlv('00','A000000727')+emvTlv('01',ben)+emvTlv('02','QRIBFTTA');
 const body=emvTlv('00','01')+emvTlv('01','12')+emvTlv('38',merc)+emvTlv('53','704')+emvTlv('54',String(amount))+emvTlv('58','VN')+emvTlv('62',emvTlv('08',memo))+'6304';
 let crc=0xffff;for(const ch of body){crc ^=ch.charCodeAt(0)<<8;for(let i=0;i<8;i++) crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
 return body+crc.toString(16).toUpperCase().padStart(4,'0');
}
const name='Lê Đào Đình Khôi';
const verbose=call(`_receiptPaymentMemo(${JSON.stringify(name)},'Hoc Phi Thang T9 T10 2026')`);
verify('A9R6 real case verbose exact 42 chars',()=>assert.equal(verbose,'Le Dao Dinh Khoi Hoc Phi Thang T9 T10 2026'));
verify('A9R6 real case verbose 42 chars',()=>assert.equal(verbose.length,42));
const compact=call(`_receiptTuitionMemo(${JSON.stringify(name)},'2026-09,2026-10',${JSON.stringify(verbose)})`);
verify('A9R6 shortens tuition period but keeps entire name and both months',()=>{
 assert(compact.startsWith('Le Dao Dinh Khoi HP '));
 assert(compact.includes('T9 T10 2026'));
 assert(compact.length<=40);
 assert.match(compact,/^[A-Za-z0-9 ]+$/);
});
const url=call(`generateVietQR(350000,'${name}','Hoc Phi Thang T9 T10 2026',${JSON.stringify(account)},'qr_only',${JSON.stringify(compact)})`);
verify('single canonical memo owns Quick Link & EMV expected intent',()=>{
 const parsed=new URL(url);
 assert.equal(parsed.searchParams.get('addInfo'),compact);
 assert.equal(parsed.searchParams.get('amount'),'350000');
 assert(parsed.pathname.includes('/970415-113366668888-qr_only.svg'));
});
verify('legacy short tuition memo remains byte-identical',()=>{
 const old='Le Thi B HP 10 2026';
 assert.equal(call(`_receiptTuitionMemo('Le Thi B','2026-10',${JSON.stringify(old)})`),old);
});
verify('reject bad periods and duplicates when compaction needed',()=>{
 for (const dates of ['2026-00,2026-10','2026-09,2026-09','2026-09,garbage']){
  assert.throws(()=>call(`_receiptTuitionMemo(${JSON.stringify(name)},${JSON.stringify(dates)},${JSON.stringify(verbose)})`),e=>e.code==='MEMO_PERIOD_INVALID');
 }
});
verify('long names fail closed, never trim student or month digits',()=>{
 assert.throws(()=>call(`_receiptTuitionMemo(${'"LONG TEST STUDENT WITH MANY NAMES EXTRA WORDS"'},'2026-09,2026-10',${JSON.stringify('X'.repeat(41))})`),e=>e.code==='MEMO_TOO_LONG');
});
const image={naturalWidth:480,naturalHeight:480};
const intent={bankBin:'970415',accountNo:'113366668888',amount:350000,memo:compact};
async function verifyRaw(payload){
 ctx.window.QRBankingHelpers.decodeReceiptQrImage=async()=>[{rawValue:payload,boundingBox:{x:12,y:12,width:456,height:456}}];
 return call(`_verifyReceiptQrPixels(${JSON.stringify(image)},${JSON.stringify(intent)},'provider-pixels')`);
}
await verifyRaw(emvRaw(compact));checks++;console.log('PASS','valid EMV exact bytes pass pixel audit');
await assert.rejects(()=>verifyRaw(emvRaw(compact.slice(0,-2))),e=>e.code==='QR_EMV_MISMATCH'&&e.qrPixelAudit?.failure==='INTENT_FIELD_MISMATCH'&&e.qrPixelAudit?.fieldsMatch?.memo===false && e.qrPixelAudit?.memoTransform?.looksLikeTailTruncation===true);checks++;console.log('PASS','two-character provider truncation still DENY');
await assert.rejects(()=>verifyRaw(emvRaw(compact,360000)),e=>e.code==='QR_EMV_MISMATCH'&&e.qrPixelAudit?.fieldsMatch?.amount===false);checks++;console.log('PASS','wrong amount still DENY');
const a=app.slice(app.indexOf('const _verboseMemo='),app.indexOf('document.getElementById(\'r_type\').innerText +=',app.indexOf('const _verboseMemo=')));
verify('actual report path computes the same memo and reuses it',()=>{
 assert(a.includes('generateVietQR(amount, qrName, paymentContent, _accounts[0], \'qr_only\', _canonicalMemo)'));
 assert(a.includes('memo:_canonicalMemo'));
});
verify('no financial changes: unchanged owner references and no stored payment write',()=>{
 assert(!a.includes('setDoc(')&&!a.includes('updateDoc(')&&!a.includes('addDoc('));
});
console.log(`A9R6_QR_MEMO_TEST_RESULT ${JSON.stringify({pass:checks,fail:0,total:checks})}`);
