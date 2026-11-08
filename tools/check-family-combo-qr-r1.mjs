import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from './v11r2/vendor/acorn.mjs';

const root=path.resolve(process.env.FAMILY_TEST_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
process.chdir(root);process.env.QR_TEST_SOURCE_ROOT=root;
const {createHarness,syntheticForUrl,bankConfig,decodePng}=await import(pathToFileURL(path.join(root,'tools/qr-v7/harness.mjs')));
const finance=fs.readFileSync(path.join(root,'js/modules/finance.js'),'utf8');
const tree=parse(finance,{ecmaVersion:'latest',sourceType:'module'}),firstExport=tree.body.find(n=>n.type.startsWith('Export')).start;
const prelude=tree.body.filter(n=>n.end<=firstExport&&n.type!=='ImportDeclaration').map(n=>finance.slice(n.start,n.end)).join('\n');
const begin=finance.indexOf('window.processCombo = async (action) => {'),end=finance.indexOf('// Phase 4K-6S: openComboModal',begin);
assert(begin>=0&&end>begin);const actualProcess=finance.slice(begin,end);
const outcomes=[],observations=[];
function check(name,fn){try{fn();outcomes.push({name,result:'PASS'});console.log('PASS',name);}catch(e){outcomes.push({name,result:'FAIL',reason:e.message});console.error('FAIL',name,e.message);}}
const names=['Trần Thị Huyền Trang','Nguyễn Văn Minh'];
async function report({studentNames=names,months=['2026-11','2026-11'],ids=['VTF001','VTF002'],mutate='',differentAccounts=false,extraProfiles={}}={}){
 const config=bankConfig();if(!differentAccounts)config.branchPaymentAccountMap.CS2='bank1';
 const providerBytes=async url=>{const u=new URL(url),parts=u.pathname.split('/'),bits=parts.pop().split('-');
  const memo=u.searchParams.get('addInfo');
  if(mutate==='tail')u.searchParams.set('addInfo',memo.slice(0,-2));
  if(mutate==='head')u.searchParams.set('addInfo',memo.slice(3));
  if(mutate==='case')u.searchParams.set('addInfo',memo[0].toLowerCase()+memo.slice(1));
  if(mutate==='amount')u.searchParams.set('amount',String(Number(u.searchParams.get('amount'))+1));
  if(mutate==='bank')bits[0]=bits[0]==='970436'?'970415':'970436';
  if(mutate==='account')bits[1]='999999999999';
  parts.push(bits.join('-'));u.pathname=parts.join('/');return syntheticForUrl(u);
 };
 const h=await createHarness({config,providerBytes});
 h.c.allProfiles=Object.fromEntries(studentNames.map((n,i)=>[n,{profileId:'profile-'+i,memberId:ids[i],branch:i?'CS2':'CS1',tuitionFee:500000,paidUntil:'2026-09'}]));
 Object.assign(h.c.allProfiles,extraProfiles);h.w.__store.profiles=h.c.allProfiles;
 for(let i=0;i<2;i++)for(const [key,value]of Object.entries({['combo_name'+(i+1)]:studentNames[i],['combo_fee'+(i+1)+'_actual']:'500000',['combo_month'+(i+1)]:months[i]}))h.document.getElementById(key).value=value;
 h.document.getElementById('comboModal').style.display='flex';
 h.c.FinanceService=h.w.FinanceService;
 vm.runInContext(prelude+'\n'+actualProcess,h.c);
 const intents=[];h.c.__captureFamilyIntent=(intent,stage)=>intents.push({memo:intent.memo,stage});
 h.eval('_verifyReceiptQrPixels = (original => function(img,intent,stage) { __captureFamilyIntent(intent,stage); return original(img,intent,stage); })(_verifyReceiptQrPixels);');
 // Delegate to the actual queued receipt and QR owner; never replace its builder/verifier.
 const actualReceipt=h.w.exportReceipt,calls=[];let receiptResult;
 h.w.exportReceipt=(...args)=>{calls.push(args);return actualReceipt(...args).then(r=>{receiptResult=r;return r;});};
 const result=await h.w.processCombo('report');
 const memo=h.fetches[0]?new URL(h.fetches[0].url).searchParams.get('addInfo'):'';
 const visibleMemo=h.document.getElementById('r_type').innerText.split('\nNội dung CK: ')[1]||null;
 const decoded=id=>receiptResult?.ok?h.eval('_receiptDecodeEMV('+JSON.stringify(decodePng(Buffer.from(h.document.getElementById(id).src.split(',')[1],'base64')).payload)+')').memo:null;
 const providerMemo=decoded('qrCodeImg'),previewMemo=decoded('receiptPreviewImg');
 return {h,result,receiptResult,memo,calls,intents,visibleMemo,providerMemo,previewMemo,summary:{result,receiptOK:receiptResult?.ok,reason:receiptResult?.reason,stage:receiptResult?.stage,providerFetches:h.fetches.length,memo,visibleMemo,providerMemo,previewMemo,intents,studentNames,months,writes:h.writes.length}};
}
function success(id,r){observations.push({id,...r.summary});check(id+' actual Family handler/receipt succeeds',()=>{assert.equal(r.result,true);assert.equal(r.receiptResult?.ok,true);assert.equal(r.h.fetches.length,1);});}
function denied(id,r,reason){observations.push({id,...r.summary});check(id,()=>{assert.equal(r.result,false);assert.equal(r.receiptResult?.ok,false);assert.equal(r.receiptResult?.reason,reason);assert.equal(r.h.document.getElementById('btnDownloadReceipt').onclick,null);});}
const good=await report();success('F01 F02 F05 F09 long names / same month / member IDs / same account',good);
check('F17 report reaches zero SDK/business writers',()=>assert.equal(good.h.writes.length,0));
check('F18 full names and participant-month mapping remain in receipt',()=>{const html=good.h.document.getElementById('r_breakdown_table').innerHTML;for(const n of names)assert(html.includes(n),html);assert(html.includes('11/2026'));});
check('F19 F20 human names, exact periods and local cap replace ID-first policy',()=>{assert.match(good.memo,/^[A-Z0-9 ]+$/);assert(good.memo.length<=40);assert(good.memo.includes('HUYEN TRANG VAN MINH'));assert(!good.memo.includes('VTF001'));assert(!good.memo.includes('VTF002'));assert(good.memo.includes('T11 2026'));});
check('single exact memo at addInfo, visible transfer and independently decoded provider/preview pixels',()=>{
 assert(good.h.document.getElementById('r_type').innerText.endsWith('Nội dung CK: '+good.memo));
 const provider=decodePng(Buffer.from(good.h.document.getElementById('qrCodeImg').src.split(',')[1],'base64'));
 const preview=decodePng(Buffer.from(good.h.document.getElementById('receiptPreviewImg').src.split(',')[1],'base64'));
 assert(provider.payload.includes(good.memo));assert.equal(provider.payload,preview.payload);
});
const different=await report({months:['2026-10','2026-11']});success('F03 different months',different);
check('F03 both distinct months represented without false range',()=>assert(different.memo.includes('T10 T11 2026')));
const cross=await report({months:['2026-11','2027-01']});success('F04 different years',cross);
check('F04 both month/year pairs represented',()=>assert(cross.memo.includes('T11 2026 T1 2027')));
const oneMissing=await report({ids:['VTF001',undefined]});success('F06 one member ID missing',oneMissing);
const bothMissing=await report({ids:[undefined,undefined],months:['2026-11','2027-12']});success('F07 both IDs missing / longest cross-year periods',bothMissing);
check('F07 human labels retain both exact periods',()=>{assert(bothMissing.memo.length<=40);assert(bothMissing.memo.includes('T11 2026 T12 2027')||(bothMissing.memo.includes('202611')&&bothMissing.memo.includes('202712')));assert(bothMissing.memo.includes('TRANG')&&bothMissing.memo.includes('MINH'));});
const repeated=await report({ids:[undefined,undefined],months:['2026-11','2027-12']});
check('F08 repeated fallback build is deterministic',()=>{assert.equal(repeated.memo,bothMissing.memo);assert.equal(repeated.receiptResult?.ok,true);});
const conflict=await report({differentAccounts:true});denied('F10 conflicting receiving accounts DENY',conflict,'ACCOUNT_ALIAS_CONFLICT');
check('F10 denial occurs before provider',()=>assert.equal(conflict.h.fetches.length,0));
for(const [id,mutate] of [['F11','tail'],['F12','head'],['F13','case'],['F14','amount'],['F15','bank'],['F16','account']]){
 const r=await report({mutate});denied(id+' provider '+mutate+' mutation DENY',r,'QR_EMV_MISMATCH');
 check(id+' exactly one provider response is audited, no financial write',()=>{assert.equal(r.h.fetches.length,1);assert.equal(r.h.writes.length,0);});
}
const sameNames=['Nguyễn Văn An','NGUYEN VAN AN'];
const duplicateRef=await report({studentNames:sameNames,ids:['SAME','SAME']});denied('F21 identical normalized names and duplicate disambiguators fail closed',duplicateRef,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
const collision=await report({studentNames:sameNames,ids:['A12','B34'],extraProfiles:{'nguyen van an':{profileId:'other-profile',memberId:'A12'}}});denied('F22 same-name disambiguator collision in cache fails closed',collision,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
const aliases=await report({studentNames:sameNames,ids:[undefined,undefined],extraProfiles:{[sameNames[0]]:{profileId:'alias-0',memberID:'ALT001',studentId:'ST001',branch:'CS1'},[sameNames[1]]:{profileId:'alias-1',studentId:'ST002',branch:'CS2'}}});success('F23 memberID/studentId only supplement identical names',aliases);
check('F23 human-readable names remain before valid disambiguators',()=>{assert(aliases.memo.includes('AN ALT001'));assert(aliases.memo.includes('AN ST002'));assert(!aliases.memo.includes('ST001'));});
const noIds=await report({ids:[undefined,undefined],extraProfiles:{[names[0]]:{branch:'CS1'},[names[1]]:{branch:'CS2'}}});success('F24 existing canonical name key fallback',noIds);
check('F24 fallback never persists or adds an ID to profiles',()=>{assert.equal(noIds.h.writes.length,0);assert.deepEqual(Object.keys(noIds.h.c.allProfiles[names[0]]),['branch']);});
// Known distinct FNV-1a inputs sharing 0x5e4daa9d; the fallback must DENY.
const hashCollision=await report({studentNames:sameNames,ids:[undefined,undefined],extraProfiles:{[sameNames[0]]:{profileId:'costarring',branch:'CS1'},[sameNames[1]]:{profileId:'liquid',branch:'CS2'}}});denied('F25 identical names and actual derived-suffix hash collision fail closed',hashCollision,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
check('F25 hash collision is rejected before provider',()=>assert.equal(hashCollision.h.fetches.length,0));
const imageNames=['Lê Hoàng Ngân Khánh','Lê Hoàng Hải Đăng'],expectedImageMemo='GD NGAN KHANH HAI DANG HP T11 2026';
const image=await report({studentNames:imageNames,ids:[undefined,undefined]});success('R01 R03 R04 R07 image names / accents / same month / Tier1',image);
check('R01 exact image canonical memo is 34 characters',()=>{assert.equal(image.memo,expectedImageMemo);assert.equal(image.memo.length,34);});
check('R18 visible transfer memo exactly equals URL addInfo',()=>assert.equal(image.visibleMemo,expectedImageMemo));
check('R19 expected intent at both unchanged pixel-verifier calls exactly equals addInfo',()=>{assert.equal(image.intents.length,2);assert(image.intents.every(x=>x.memo===expectedImageMemo));});
check('R20 independent provider pixels decode to exact canonical memo',()=>assert.equal(image.providerMemo,expectedImageMemo));
check('R21 independent preview pixels decode to exact canonical memo',()=>assert.equal(image.previewMemo,expectedImageMemo));
check('R01 receipt keeps full names and exact participant/month labels',()=>{assert.equal(image.h.document.getElementById('r_name').innerText,imageNames.join(' & ').toUpperCase());const html=image.h.document.getElementById('r_breakdown_table').innerHTML;for(const n of imageNames)assert(html.includes(n+' — T11/2026'));});
const compact=await report({studentNames:['Nguyễn Thiên ThanhHuyền','Trần Quốc MinhHoàng']});success('R08 deterministic Tier2 when Tier1 exceeds40',compact);
check('R08 last human tokens replace long LAST2 without substring truncation',()=>assert.equal(compact.memo,'GD THANHHUYEN MINHHOANG HP T11 2026'));
const exactPeriods=await report({studentNames:['AlexanderA','BenedictB'],months:['2026-11','2027-12']});success('R06 exact YYYYMM compaction keeps cross-year evidence',exactPeriods);
check('R06 compact period retains both months and years',()=>assert.equal(exactPeriods.memo,'GD ALEXANDERA BENEDICTB HP 202611 202712'));
const sameLast=await report({studentNames:['Nguyễn Chương An','Trần Trường An'],months:['2026-11','2027-01']});success('R10 same last token expands to distinguishable human suffixes',sameLast);
check('R10 never collapses both students to AN AN',()=>assert.equal(sameLast.memo,'GD CHUONG AN TRUONG AN HP 202611 202701'));
const sameLast2=await report({studentNames:['Nguyễn Văn An','Trần Văn An']});success('R11 same LAST2 expands through full human names',sameLast2);
check('R11 no disambiguator while full names can distinguish',()=>assert.equal(sameLast2.memo,'GD NGUYEN VAN AN TRAN VAN AN HP T11 2026'));
const identical=await report({studentNames:sameNames,ids:['A12','B34']});success('R12 R14 identical normalized full names need name plus ID',identical);
check('R14 IDs only supplement human names',()=>{assert(identical.memo.includes('AN A12'));assert(identical.memo.includes('AN B34'));});
const fallback=await report({studentNames:sameNames,ids:[undefined,undefined]});success('R15 no ID uses name plus deterministic suffix',fallback);
check('R15 both participants still have a human name token',()=>{assert.equal((fallback.memo.match(/\bAN\b/g)||[]).length,2);assert(!/^GD M[A-Z0-9]+ M[A-Z0-9]+ HP /.test(fallback.memo));});
const fallbackAgain=await report({studentNames:sameNames,ids:[undefined,undefined]});
check('R17 identical-name fallback is byte-deterministic',()=>assert.equal(fallbackAgain.memo,fallback.memo));
const idsIgnored=await report({ids:['SAME','SAME']});success('R02 R09 R13 different names stay primary even if IDs duplicate',idsIgnored);
check('R13 available IDs do not replace readable names',()=>{assert.equal(idsIgnored.memo,'GD HUYEN TRANG VAN MINH HP T11 2026');assert(!idsIgnored.memo.includes('SAME'));});
const imageAgain=await report({studentNames:imageNames,ids:[undefined,undefined]});check('R17 repeated image input byte-identical',()=>assert.equal(imageAgain.memo,expectedImageMemo));
const successes=[good,different,cross,oneMissing,bothMissing,repeated,aliases,noIds,image,compact,exactPeriods,sameLast,sameLast2,identical,fallback,fallbackAgain,idsIgnored,imageAgain];
check('R16 no successful opaque-only participant identity; every last name remains recognizable',()=>{for(const r of successes){assert(r.receiptResult?.ok);assert(r.memo.length<=40);assert.match(r.memo,/^[A-Z0-9 ]+$/);for(const n of r.summary.studentNames){const last=r.h.c.removeVietnameseTonesForQR(n).toUpperCase().replace(/[^A-Z0-9 ]/g,' ').trim().split(/\s+/).at(-1);assert(r.memo.split(' ').includes(last),r.memo);}}});
check('R05 R06 R18 R19 R20 R21 all successes keep URL/UI/intent/provider/preview byte-identical',()=>{for(const r of successes){assert.equal(r.visibleMemo,r.memo);assert.equal(r.providerMemo,r.memo);assert.equal(r.previewMemo,r.memo);assert.equal(r.intents.length,2);assert(r.intents.every(x=>x.memo===r.memo));}});
const overflow=await report({studentNames:['ABCDEFGHIJKLMNOPQRSTUVWXYZA','ZYXWVUTSRQPONMLKJIHGFEDCBAZA']});denied('R22 irreducible names fail closed, no opaque fallback',overflow,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
check('R22 no provider call when full human tokens cannot fit',()=>assert.equal(overflow.h.fetches.length,0));
// Actual Family pay handler with controlled existing write-boundary decisions.
async function payTest(statuses,{pending=false,reject=false,double=false}={}){
 const profiles=Object.fromEntries(names.map((n,i)=>[n,{profileId:'p'+i,branch:'CS1',tuitionFee:500000}]));
 const values={};names.forEach((n,i)=>Object.assign(values,{['combo_name'+(i+1)]:{value:n},['combo_fee'+(i+1)+'_actual']:{value:'500000'},['combo_month'+(i+1)]:{value:'2026-11'}}));values.comboModal={style:{display:'flex'}};
 let commits=0,local=0,receipt=0,evidence=0,plan,resolve;
 const ack=new Promise(r=>resolve=r),events=[];
 const service={captureFinancialWriteContext:()=>({clubId:'A'}),isFinancialWriteContextCurrent:()=>true,_arrayUnion:(...x)=>x,addFeeAuditSilent:async()=>{},commitAtomicWritePlan:async p=>{commits++;plan=p;if(pending)await ack;if(reject)throw Error('primary rejected');return {primaryCommitted:true};}};
 const w={__store:{profiles},showToast:m=>events.push(m),guardFinancialWriteIntent:()=>true,isFinancialWriteAllowed:()=>true,exportReceipt:()=>{receipt++;return Promise.resolve({ok:true});},TuitionCommandBoundary:{runInProfileTuitionMutationLanes:async(_,fn)=>fn(),requireTuitionUnpaidForWrite:async({studentName})=>{const i=names.indexOf(studentName);evidence++;return {status:statuses[i],profile:profiles[studentName],paidUntil:'2026-11'};},commitLocalTuitionPaymentState:()=>{local++;}}};
 const c=vm.createContext({window:w,document:{getElementById:id=>values[id]||null},FinanceService:service,getLocalToday:()=> '2026-11-07',console:{error(){},warn(){}},Date});vm.runInContext(prelude+'\n'+actualProcess,c);
 const first=w.processCombo('pay');await new Promise(setImmediate);
 const before={commits,local,receipt,success:events.some(x=>x.startsWith('✅'))};if(double)await w.processCombo('pay');resolve();const result=await first;
 return {result,commits,local,receipt,evidence,plan,before};
}
const paid=await payTest(['PAID','VERIFIED_UNPAID']);
check('PAY01 concurrent settlement PAID blocks entire atomic plan',()=>{assert.equal(paid.result,false);assert.equal(paid.evidence,2);assert.equal(paid.commits,0);assert.equal(paid.local,0);assert.equal(paid.receipt,0);});
const pay=await payTest(['VERIFIED_UNPAID','VERIFIED_UNPAID'],{pending:true,double:true});
check('PAY02 one atomic plan / two transactions / two profile updates',()=>{assert.equal(pay.result,true);assert.equal(pay.commits,1);assert.equal(pay.plan.transactions.length,2);assert.equal(pay.plan.profileUpdates.length,2);assert.equal(pay.local,2);});
check('PAY03 pending ACK has no financial success/local promotion/receipt; double tap one writer',()=>{assert.deepEqual(pay.before,{commits:1,local:0,receipt:0,success:false});assert.equal(pay.receipt,1);});
const rejected=await payTest(['VERIFIED_UNPAID','VERIFIED_UNPAID'],{reject:true});
check('PAY04 rejected primary creates no local partial success or receipt',()=>{assert.equal(rejected.result,false);assert.equal(rejected.commits,1);assert.equal(rejected.local,0);assert.equal(rejected.receipt,0);});
const failed=outcomes.filter(x=>x.result==='FAIL').length;
console.log('FAMILY_QR_RESULT',JSON.stringify({sourceRoot:root,passed:outcomes.length-failed,failed,observations,outcomes}));
if(failed)process.exitCode=1;
