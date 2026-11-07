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
async function report({months=['2026-11','2026-11'],ids=['VTF001','VTF002'],mutate='',differentAccounts=false,extraProfiles={}}={}){
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
 h.c.allProfiles=Object.fromEntries(names.map((n,i)=>[n,{profileId:'profile-'+i,memberId:ids[i],branch:i?'CS2':'CS1',tuitionFee:500000,paidUntil:'2026-09'}]));
 Object.assign(h.c.allProfiles,extraProfiles);h.w.__store.profiles=h.c.allProfiles;
 for(let i=0;i<2;i++)for(const [key,value]of Object.entries({['combo_name'+(i+1)]:names[i],['combo_fee'+(i+1)+'_actual']:'500000',['combo_month'+(i+1)]:months[i]}))h.document.getElementById(key).value=value;
 h.document.getElementById('comboModal').style.display='flex';
 h.c.FinanceService=h.w.FinanceService;
 vm.runInContext(prelude+'\n'+actualProcess,h.c);
 // Delegate to the actual queued receipt and QR owner; never replace its builder/verifier.
 const actualReceipt=h.w.exportReceipt,calls=[];let receiptResult;
 h.w.exportReceipt=(...args)=>{calls.push(args);return actualReceipt(...args).then(r=>{receiptResult=r;return r;});};
 const result=await h.w.processCombo('report');
 const memo=h.fetches[0]?new URL(h.fetches[0].url).searchParams.get('addInfo'):'';
 return {h,result,receiptResult,memo,calls,summary:{result,receiptOK:receiptResult?.ok,reason:receiptResult?.reason,stage:receiptResult?.stage,providerFetches:h.fetches.length,memo,months,writes:h.writes.length}};
}
function success(id,r){observations.push({id,...r.summary});check(id+' actual Family handler/receipt succeeds',()=>{assert.equal(r.result,true);assert.equal(r.receiptResult?.ok,true);assert.equal(r.h.fetches.length,1);});}
function denied(id,r,reason){observations.push({id,...r.summary});check(id,()=>{assert.equal(r.result,false);assert.equal(r.receiptResult?.ok,false);assert.equal(r.receiptResult?.reason,reason);assert.equal(r.h.document.getElementById('btnDownloadReceipt').onclick,null);});}
const good=await report();success('F01 F02 F05 F09 long names / same month / member IDs / same account',good);
check('F17 report reaches zero SDK/business writers',()=>assert.equal(good.h.writes.length,0));
check('F18 full names and participant-month mapping remain in receipt',()=>{const html=good.h.document.getElementById('r_breakdown_table').innerHTML;for(const n of names)assert(html.includes(n),html);assert(html.includes('11/2026'));});
check('F19 F20 canonical memo references everyone and all periods within local cap',()=>{assert.match(good.memo,/^[A-Za-z0-9 ]+$/);assert(good.memo.length<=40);for(const id of ['VTF001','VTF002'])assert(good.memo.includes(id));assert(good.memo.includes('T11 2026'));});
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
check('F07 bounded compact references retain both exact periods',()=>{assert(bothMissing.memo.length<=40);assert(bothMissing.memo.includes('202611')&&bothMissing.memo.includes('202712'));});
const repeated=await report({ids:[undefined,undefined],months:['2026-11','2027-12']});
check('F08 repeated fallback build is deterministic',()=>{assert.equal(repeated.memo,bothMissing.memo);assert.equal(repeated.receiptResult?.ok,true);});
const conflict=await report({differentAccounts:true});denied('F10 conflicting receiving accounts DENY',conflict,'ACCOUNT_ALIAS_CONFLICT');
check('F10 denial occurs before provider',()=>assert.equal(conflict.h.fetches.length,0));
for(const [id,mutate] of [['F11','tail'],['F12','head'],['F13','case'],['F14','amount'],['F15','bank'],['F16','account']]){
 const r=await report({mutate});denied(id+' provider '+mutate+' mutation DENY',r,'QR_EMV_MISMATCH');
 check(id+' exactly one provider response is audited, no financial write',()=>{assert.equal(r.h.fetches.length,1);assert.equal(r.h.writes.length,0);});
}
const duplicateRef=await report({ids:['SAME','SAME']});denied('F21 duplicate compact references fail closed',duplicateRef,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
const collision=await report({extraProfiles:{Other:{profileId:'other-profile',memberId:'VTF001'}}});denied('F22 reference collision against current profile cache fails closed',collision,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
const aliases=await report({ids:[undefined,undefined],extraProfiles:{[names[0]]:{profileId:'alias-0',memberID:'ALT001',studentId:'ST001',branch:'CS1'},[names[1]]:{profileId:'alias-1',studentId:'ST002',branch:'CS2'}}});success('F23 existing memberID/studentId priority',aliases);
check('F23 first valid compact identifier wins',()=>{assert(aliases.memo.includes('ALT001'));assert(aliases.memo.includes('ST002'));assert(!aliases.memo.includes('ST001'));});
const noIds=await report({ids:[undefined,undefined],extraProfiles:{[names[0]]:{branch:'CS1'},[names[1]]:{branch:'CS2'}}});success('F24 existing canonical name key fallback',noIds);
check('F24 fallback never persists or adds an ID to profiles',()=>{assert.equal(noIds.h.writes.length,0);assert.deepEqual(Object.keys(noIds.h.c.allProfiles[names[0]]),['branch']);});
// Known distinct FNV-1a inputs sharing 0x5e4daa9d; the fallback must DENY.
const hashCollision=await report({ids:[undefined,undefined],extraProfiles:{[names[0]]:{profileId:'costarring',branch:'CS1'},[names[1]]:{profileId:'liquid',branch:'CS2'}}});denied('F25 actual derived-reference hash collision fails closed',hashCollision,'FAMILY_MEMO_REFERENCE_UNAVAILABLE');
check('F25 hash collision is rejected before provider',()=>assert.equal(hashCollision.h.fetches.length,0));
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
