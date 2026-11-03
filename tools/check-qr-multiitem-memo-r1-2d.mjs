import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness,syntheticForUrl} from './qr-v7/harness.mjs';

const root=process.env.R1_2D_TEST_SOURCE_ROOT || path.resolve(import.meta.dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
let pass=0, fail=0;
const check=(name,fn)=>{try{fn();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,e.message);}};
const checkAsync=async(name,fn)=>{try{await fn();pass++;console.log('PASS',name);}catch(e){fail++;console.error('FAIL',name,e.message);}};
const fixture={name:'Trần Thị Huyền Trang',tuition:400000,inventoryDebt:230000,total:630000,month:'2026-11'};
const breakdown=[
  {kind:'tuition',label:'Học phí 11/2026',amount:fixture.tuition,packageMonths:[fixture.month]},
  {kind:'inventoryDebt',label:'📦 Nợ kho: Kho Đồ',amount:fixture.inventoryDebt},
];
const transformProvider=(transform)=>async url=>{const u=new URL(url);u.searchParams.set('addInfo',transform(u.searchParams.get('addInfo')||''));return syntheticForUrl(u.toString());};
async function run(providerTransform=(memo=>memo), overrides={}){
  const h=await createHarness({providerBytes:transformProvider(providerTransform)});
  h.c.allProfiles[fixture.name]={branch:'CS1',tuitionFee:fixture.tuition};
  const result=await h.w.exportReceipt(fixture.name,overrides.amount ?? fixture.total,'Học phí + Kho Đồ','2026-11-03',fixture.month,'CS1','','PHIẾU BÁO HỌC PHÍ',breakdown);
  return {h,result,memo:h.fetches.length?new URL(h.fetches[0].url).searchParams.get('addInfo'):''};
}

const productionProvider=memo=>memo.length>40?memo.slice(0,40):memo;
const primary=await run(productionProvider);
const audit=primary.result.diagnostics?.qrPixelAudit;
console.log('Q0_SAFE_EVIDENCE',JSON.stringify({
  failure:audit?.failure||'',fieldsMatch:audit?.fieldsMatch||null,
  expectedMemoLength:audit?.expectedMemoLength ?? primary.memo.length,
  decodedMemoLength:audit?.qrMemoLength ?? primary.memo.length,
  memoTransform:audit?.memoTransform||null,
  generatedMemoLength:primary.memo.length,
}));
check('screenshot-equivalent mixed Tuition + inventory debt QR succeeds with provider-compatible canonical memo',()=>assert.equal(primary.result.ok,true,JSON.stringify(primary.result.diagnostics||{})));
check('mixed bundle canonical memo is compact and deterministic',()=>{assert(primary.memo.length<=40);assert.match(primary.memo,/^Tran Thi Huyen Trang HP /);assert(primary.memo.includes('T11 2026'));});
check('processMultiItem supplies canonical tuition component metadata to receipt intent',()=>{
  const miStart=app.indexOf('window.processMultiItem = async'); const bStart=app.indexOf('const breakdown = []',miStart); const section=app.slice(bStart,app.indexOf('let _previousPaidUntil',bStart));
  assert(section.includes("breakdown.push({ kind: 'tuition'"));assert(section.includes('packageMonths: packageMonths.slice()'));
});
check('one canonical memo feeds addInfo, expected intent and visible transfer memo',()=>{
  const section=app.slice(app.indexOf('const _verboseMemo='),app.indexOf("const _abortQR",app.indexOf('const _verboseMemo=')));
  assert(section.includes("generateVietQR(amount, qrName, paymentContent, _accounts[0], 'qr_only', _canonicalMemo)"));
  assert(section.includes('memo:_canonicalMemo'));
  assert(app.includes("Nội dung CK: '+_intent.memo"));
});
check('QR report generation remains write-free',()=>assert.equal(primary.h.writes.length,0));

for(const [label,transform] of [
  ['tail truncation',m=>m.slice(0,-1)],['head truncation',m=>m.slice(1)],['case change',m=>m.replace(/[A-Z]/,x=>x.toLowerCase())],['space removal',m=>m.replace(' ','')]
]){
  await checkAsync('provider '+label+' remains DENIED',async()=>{const x=await run(transform);assert.equal(x.result.ok,false);assert.equal(x.result.reason,'QR_EMV_MISMATCH');assert.equal(x.result.diagnostics?.qrPixelAudit?.fieldsMatch?.memo,false);});
}
await checkAsync('wrong amount remains DENIED',async()=>{
  const h=await createHarness({providerBytes:async url=>{const u=new URL(url);u.searchParams.set('amount',String(Number(u.searchParams.get('amount'))+1));return syntheticForUrl(u.toString());}});
  h.c.allProfiles[fixture.name]={branch:'CS1',tuitionFee:fixture.tuition};
  const r=await h.w.exportReceipt(fixture.name,fixture.total,'Học phí + Kho Đồ','2026-11-03',fixture.month,'CS1','','PHIẾU BÁO HỌC PHÍ',breakdown);
  assert.equal(r.ok,false);assert.equal(r.reason,'QR_EMV_MISMATCH');assert.equal(r.diagnostics?.qrPixelAudit?.fieldsMatch?.amount,false);
});
await checkAsync('wrong bank remains DENIED',async()=>{
  const h=await createHarness({providerBytes:async url=>{const u=new URL(url),parts=u.pathname.split('/');parts[parts.length-1]=parts.at(-1).replace(/^\d+-/,'970436-');u.pathname=parts.join('/');return syntheticForUrl(u.toString());}});
  h.c.allProfiles[fixture.name]={branch:'CS1',tuitionFee:fixture.tuition};
  const r=await h.w.exportReceipt(fixture.name,fixture.total,'Học phí + Kho Đồ','2026-11-03',fixture.month,'CS1','','PHIẾU BÁO HỌC PHÍ',breakdown);
  assert.equal(r.ok,false);assert.equal(r.reason,'QR_EMV_MISMATCH');assert.equal(r.diagnostics?.qrPixelAudit?.fieldsMatch?.bankBin,false);
});
await checkAsync('wrong account remains DENIED',async()=>{
  const h=await createHarness({providerBytes:async url=>{const u=new URL(url),parts=u.pathname.split('/'),f=parts.at(-1).split('-');f[1]='009999999999';parts[parts.length-1]=f.join('-');u.pathname=parts.join('/');return syntheticForUrl(u.toString());}});
  h.c.allProfiles[fixture.name]={branch:'CS1',tuitionFee:fixture.tuition};
  const r=await h.w.exportReceipt(fixture.name,fixture.total,'Học phí + Kho Đồ','2026-11-03',fixture.month,'CS1','','PHIẾU BÁO HỌC PHÍ',breakdown);
  assert.equal(r.ok,false);assert.equal(r.reason,'QR_EMV_MISMATCH');assert.equal(r.diagnostics?.qrPixelAudit?.fieldsMatch?.accountNo,false);
});
check('canonical memo contains no punctuation, so provider punctuation-removal cannot become a new fuzzy equivalence',()=>assert.match(primary.memo,/^[A-Za-z0-9 ]+$/));

console.log(`R1_2D_QR_RESULT ${JSON.stringify({pass,fail,total:pass+fail})}`);
if(fail) process.exit(1);
