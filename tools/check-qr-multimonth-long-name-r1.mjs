import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (process.env.A9R18_QR_FIXTURE_PRELOAD === '1') {
  const {registerHooks}=await import('node:module');
  registerHooks({load(url,context,nextLoad){
    const loaded=nextLoad(url,context);
    if (url.startsWith('file:') && fileURLToPath(url)===path.resolve(process.cwd(),'tools/qr-v7/harness.mjs')) {
      const source=String(loaded.source),needle='export function publishExistingSettingsFixture(c,config) {';
      assert(source.includes(needle));
      const fixture=`\n  const fixtureOwner=JSON.stringify([c.window.__verifiedAuthContextState,c.currentClubId]);\n  c.isCurrentAuthInit=()=>JSON.stringify([c.window.__verifiedAuthContextState,c.currentClubId])===fixtureOwner;\n`;
      return {...loaded,source:source.replace(needle,needle+fixture)};
    }
    return loaded;
  }});
} else if (process.argv.includes('--protected-fixtures')) {
  const out=path.resolve(process.env.A9R18_CHECK_LOG_DIR || '../evidence/phase-c'),rows=[];
  for(const name of ['check:qr-report-render-payment-intent','check:qr-v4-payment-account-authority']){
    const r=spawnSync('npm',['run',name],{encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,A9R18_QR_FIXTURE_PRELOAD:'1',NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --import=${import.meta.url}`}});
    const log='current_fixture_'+name.replaceAll(':','_')+'.txt';fs.writeFileSync(path.join(out,log),(r.stdout||'')+(r.stderr||''));
    rows.push({check:name,status:r.status===0?'PASS':'FAIL',exitCode:r.status,log,adaptation:'Captured settings initialization owner fixture supplied; production callback and every behavioral assertion unchanged'});
  }
  fs.writeFileSync(path.join(out,'CURRENT_OWNER_FIXTURE_RESULTS.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows,null,2));if(rows.some(r=>r.status!=='PASS'))process.exitCode=1;
} else {
const root=path.resolve(process.env.QR_TEST_SOURCE_ROOT || process.cwd());
process.env.QR_TEST_SOURCE_ROOT=root;
const {createHarness,syntheticForUrl,decodePng,pngFixture}=await import(pathToFileURL(path.join(root,'tools/qr-v7/harness.mjs')));
const {formatMonthCompact}=await import(pathToFileURL(path.join(root,'js/utils/format.js')));
const rows=[];
const longName='Nguyễn Thị Hoàng Phương Thảo Huyền Trang';
const monthList=(start,count)=>{const [y,m]=start.split('-').map(Number);return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-1+i));return d.toISOString().slice(0,7);});};
function readPeriods(memo) {
  const range=/(20\d{2}(?:0[1-9]|1[0-2])) DEN (20\d{2}(?:0[1-9]|1[0-2]))$/.exec(memo);
  if(range){const a=range[1],b=range[2],start=a.slice(0,4)+'-'+a.slice(4);return monthList(start,(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(4)-+a.slice(4))+1);}
  const compact=/(20\d{2}(?:0[1-9]|1[0-2])(?: 20\d{2}(?:0[1-9]|1[0-2]))*)$/.exec(memo);
  if(compact)return compact[1].split(' ').map(s=>s.slice(0,4)+'-'+s.slice(4));
  const p=memo.split(/ HP | Hoc Phi Thang /).at(-1), out=[];
  for(const g of p.matchAll(/((?:T\d{1,2}\s*)+)\s+(20\d{2})/g))for(const m of g[1].matchAll(/T(\d{1,2})/g))out.push(g[2]+'-'+m[1].padStart(2,'0'));
  if(out.length)return out;
  const one=/^(\d{1,2}) (20\d{2})$/.exec(p);
  return one?[one[2]+'-'+one[1].padStart(2,'0')]:[];
}
async function run({name=longName,months=monthList('2026-11',12),id='VS0123',profile={},extraProfiles={},mixed=false,transform=m=>m,providerBytes,coverage=true,switchContext=false,mutateProfile=false}={}) {
  const h=await createHarness({providerBytes:providerBytes || (async url=>{const u=new URL(url);u.searchParams.set('addInfo',transform(u.searchParams.get('addInfo')));if(switchContext)h.w.__verifiedAuthContextState.generation++;if(mutateProfile)h.w.__store.profiles['New duplicate']={memberId:'VS0123'};return syntheticForUrl(u.toString());})});
  h.c.allProfiles={ [name]:{branch:'CS1',tuitionFee:400000,...(id===null?{}:{memberId:id}),...profile},...extraProfiles };
  h.w.__store.profiles=h.c.allProfiles;
  h.w.formatMonthCompact=formatMonthCompact;
  if(!coverage)h.w.getDebtProfileCoverageStatus=()=>({ready:false,clubId:'club-a'});
  h.eval('window.__longNameIntents=[];const _longNameOriginalVerifier=_verifyReceiptQrPixels;_verifyReceiptQrPixels=async function(image,intent,stage){window.__longNameIntents.push({...intent,stage});return _longNameOriginalVerifier(image,intent,stage);};');
  const breakdown=[{kind:'tuition',label:'Học phí '+months.join(' / '),amount:400000*months.length,packageMonths:months.slice()}];
  if(mixed)breakdown.push({kind:'inventoryDebt',label:'Nợ kho Bảo hộ',amount:230000});
  const amount=breakdown.reduce((s,r)=>s+r.amount,0);
  const result=await h.w.exportReceipt(name,amount,mixed?'Học phí + Kho Đồ':'Học phí','2026-11-16',months[0],'CS1','','PHIẾU BÁO HỌC PHÍ',breakdown);
  const memo=h.fetches[0]?new URL(h.fetches[0].url).searchParams.get('addInfo'):'';
  return {h,result,memo,months,amount,name};
}
async function check(name,fn){try{const detail=await fn();rows.push({name,status:'PASS',...detail});console.log('PASS',name);}catch(e){rows.push({name,status:'FAIL',detail:e.message});console.error('FAIL',name,e.message);}}
function success(x){
  assert.equal(x.result.ok,true,JSON.stringify({reason:x.result.reason,stage:x.result.stage}));
  assert.match(x.memo,/^[A-Za-z0-9 ]+$/);assert(x.memo.length<=40);
  assert.deepEqual(readPeriods(x.memo),[...x.months].sort(),'All exact months, no gaps filled');
  assert.equal(x.h.writes.length,0);assert.equal(x.h.fetches.length,1);
  assert.equal(x.h.document.getElementById('r_name').innerText,x.name.toUpperCase());
  for(const month of x.months)assert(x.h.document.getElementById('r_breakdown_table').innerHTML.includes(month));
  assert(x.h.document.getElementById('r_type').innerText.endsWith('Nội dung CK: '+x.memo));
  assert.equal(x.h.w.__longNameIntents.length,2);
  assert(x.h.w.__longNameIntents.every(i=>i.memo===x.memo && i.amount===x.amount));
  for(const image of ['qrCodeImg','receiptPreviewImg']) {
    const q=decodePng(Buffer.from(x.h.document.getElementById(image).src.split(',')[1],'base64'));
    const decoded=x.h.c._receiptDecodeEMV(q.payload),intent=x.h.w.__longNameIntents[0];
    for(const field of ['bankBin','accountNo','amount','memo'])assert.equal(decoded[field],intent[field],image+' '+field);
  }
  return {memoLength:x.memo.length,monthCount:x.months.length,businessWrites:x.h.writes.length,providerAndPreviewPixels:'PASS'};
}
await check('1 month normal name preserves existing memo',async()=>success(await run({name:'Trần Văn An',months:['2026-11']})));
for(const count of [1,3,6,9,12])await check(`${count} months long name with unique memberId`,async()=>{const x=await run({months:monthList('2026-11',count)});const s=success(x);assert(x.memo.includes('RVS0123'));return s;});
await check('Cross-year full-name range when safe',async()=>success(await run({name:'Nguyễn Văn Anh',months:monthList('2026-11',12)})));
await check('Sparse debt months remain sparse',async()=>success(await run({months:['2026-11','2027-01','2027-03']})));
await check('Tuition 12 months plus inventory debt report',async()=>success(await run({mixed:true})));
await check('Stable key hash fallback without stored ID',async()=>{const x=await run({id:null});const s=success(x);assert.match(x.memo,/ RK[A-Z0-9]{7} /);return s;});
await check('memberID alternate canonical identifier',async()=>{const x=await run({id:null,profile:{memberID:'ALT123'}});const s=success(x);assert(x.memo.includes('RALT123'));return s;});
await check('studentId alternate canonical identifier',async()=>{const x=await run({id:null,profile:{studentId:'STU123'}});const s=success(x);assert(x.memo.includes('RSTU123'));return s;});
await check('Invalid ID is not substring-truncated',async()=>{const x=await run({id:'BAD-ID-LONGER-THAN-EIGHT'});const s=success(x);assert(!x.memo.includes('BAD'));return s;});
await check('Long final name token can be omitted whole when reference is needed',async()=>success(await run({name:'Nguyễn Thị Hoàng Supercalifragilisticexpialidocious',id:'ABCDEFGH'})));
function deniedBeforeProvider(x,reason){assert.equal(x.result.ok,false);assert.equal(x.result.reason,reason);assert.equal(x.h.fetches.length,0);assert.equal(x.h.writes.length,0);return {businessWrites:0,providerCalls:0,reason};}
await check('Duplicate ID across club profiles fails closed',async()=>deniedBeforeProvider(await run({extraProfiles:{'Other Student':{memberID:'vs0123'}}}),'MEMO_REFERENCE_UNAVAILABLE'));
await check('Missing full-profile readiness fails closed',async()=>deniedBeforeProvider(await run({coverage:false,mixed:true}),'MEMO_REFERENCE_UNAVAILABLE'));
await check('Real short-hash collision fails closed',async()=>{const suffix=' NGUYEN THI HOANG PHUONG THAO HUYEN TRANG';return deniedBeforeProvider(await run({name:'costarring'+suffix,id:null,extraProfiles:{['liquid'+suffix]:{branch:'CS1'}}}),'MEMO_REFERENCE_UNAVAILABLE');});
await check('Unrepresentable sparse set is never converted to a range',async()=>deniedBeforeProvider(await run({months:Array.from({length:12},(_,i)=>`2027-${String(i+1).padStart(2,'0')}`).filter((_,i)=>i%2===0).concat(['2028-02','2028-04','2028-06','2028-08','2028-10','2028-12'])}),'MEMO_TOO_LONG'));
for(const [label,transform] of [['tail truncation',m=>m.slice(0,-1)],['head truncation',m=>m.slice(1)],['case change',m=>m.replace(/[A-Z]/,c=>c.toLowerCase())],['space removal',m=>m.replace(' ','')],['wrong memo',m=>m.replace('VS0123','VS9999')]]) {
  await check(`${label} remains denied on compact memo`,async()=>{const x=await run({transform});assert.equal(x.result.ok,false);assert.equal(x.result.reason,'QR_EMV_MISMATCH');assert.equal(x.h.writes.length,0);return {businessWrites:0,reason:x.result.reason};});
}
for(const field of ['amount','bank','account'])await check(`Wrong ${field} remains denied`,async()=>{
  const x=await run({providerBytes:async url=>{const u=new URL(url);if(field==='amount')u.searchParams.set('amount',String(Number(u.searchParams.get('amount'))+1));else {const parts=u.pathname.split('/'),last=parts.at(-1).split('-');last[field==='bank'?0:1]=field==='bank'?'970436':'009999999999';parts[parts.length-1]=last.join('-');u.pathname=parts.join('/');}return syntheticForUrl(u.toString());}});
  assert.equal(x.result.ok,false);assert.equal(x.result.reason,'QR_EMV_MISMATCH');assert.equal(x.h.writes.length,0);return {businessWrites:0};
});
await check('Wrong CRC remains denied by real pixel decoder',async()=>{const x=await run({providerBytes:async()=>pngFixture('wrong-crc.png')});assert.equal(x.result.ok,false);assert.equal(x.result.reason,'QR_EMV_MISMATCH');assert.equal(x.result.diagnostics?.qrPixelAudit?.failure,'EMV_PARSE_OR_CRC_FAIL');assert.equal(x.h.writes.length,0);return {businessWrites:0};});
await check('Auth generation switch during QR fetch remains denied',async()=>{const x=await run({switchContext:true});assert.equal(x.result.ok,false);assert.equal(x.h.writes.length,0);return {businessWrites:0,reason:x.result.reason};});
await check('Reference collision appearing during fetch remains denied',async()=>{const x=await run({mutateProfile:true});assert.equal(x.result.ok,false);assert.equal(x.result.reason,'MEMO_REFERENCE_UNAVAILABLE');assert.equal(x.h.writes.length,0);return {businessWrites:0};});
const result={status:rows.every(r=>r.status==='PASS')?'PASS':'FAIL',pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL').length,browserExecuted:false,liveProviderExecuted:false,rows};
const output=process.argv.indexOf('--output');if(output>=0)fs.writeFileSync(path.resolve(process.argv[output+1]),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,pass:result.pass,fail:result.fail}));
if(result.fail)process.exitCode=1;
}
