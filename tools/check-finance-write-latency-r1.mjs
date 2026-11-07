#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse} from './v11r2/vendor/acorn.mjs';

// Same executable assertions run against the untouched parent and candidate.
const root = path.resolve(process.env.FINANCE_LATENCY_SOURCE_ROOT || process.cwd());
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject};};
const turn = () => new Promise(setImmediate);
let passed=0, failed=0;
const check = (label, fn) => {try {fn();passed++;console.log('PASS',label);} catch(e) {failed++;console.error('FAIL',label,e.message);}};
const source = read('js/modules/finance.js');
const tree = parse(source, {ecmaVersion:'latest', sourceType:'module'});
let quickAssignment, formAssignment;
const walk = n => {if (!n || typeof n !== 'object') return;
  if (n.type === 'AssignmentExpression' && n.left?.object?.name === 'window' && n.left?.property?.name === 'quickPay') quickAssignment = n;
  if (n.type === 'AssignmentExpression' && n.left?.object?.name === '_txFormEl' && n.left?.property?.name === 'onsubmit') formAssignment = n;
  for (const value of Object.values(n)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
};
walk(tree);
assert(quickAssignment, 'actual QuickPay adapter must exist');
const firstExport = tree.body.find(n => n.type.startsWith('Export')).start;
const prelude = tree.body.filter(n => n.end <= firstExport && n.type !== 'ImportDeclaration').map(n => source.slice(n.start,n.end)).join('\n');
function uiHarness() {
  const messages=[], nodes=[];
  const current = {clubId:'A',uid:'u',generation:1,sessionEpoch:1,authGeneration:1};
  const contextCurrent = c => Object.keys(current).every(k => c[k] === current[k]);
  const w = {userRole:'admin',__store:{profiles:{S:{profileId:'pS',branch:'CS1',tuitionFee:100}}},showToast:m=>messages.push(String(m))};
  const document = {body:{appendChild:n=>nodes.push(n)}, createElement:tag=>({tagName:tag,style:{},setAttribute(){},remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1);}})};
  const service = {captureFinancialWriteContext:()=>({...current}),isFinancialWriteContextCurrent:contextCurrent};
  const sandbox = {window:w,document,FinanceService:service,console:{warn(){},error(){}},getLocalToday:()=> '2026-11-05',formatMonthCompact:s=>s,prompt:()=>null};
  const context=vm.createContext(sandbox);
  vm.runInContext(prelude+'\n'+source.slice(quickAssignment.start,quickAssignment.end)+';',context);
  const success = (months=['2026-11']) => ({ok:true,primaryCommitted:true,postCommitContextCurrent:contextCurrent({...current}),txId:'T',paidMonths:months,amount:100,branch:'CS1',monthLabel:months.join(','),txDate:'2026-11-05'});
  const setupForm = () => {
    const form={dataset:{},resets:0,reset(){this.resets++;}};
    const el=(value,options=[])=>({value,options:options.map(value=>({value})),style:{}});
    const elements={transactionForm:form,type:el('Học phí',['Học phí']),description:el('S'),amountActual:el('100'),date:el('2026-11-01'),branch:el('CS1',['CS1']),tx_package:el('3',['1','3','6','9','12'])};
    document.getElementById=id=>elements[id]||null;
    w.__store.clubConfig={branchCount:2};w.guardFinancialWriteIntent=()=>true;w.isFinancialWriteAllowed=()=>true;
    service._arrayUnion=(...months)=>months;service.addFeeAuditSilent=async()=>({ok:true});
    sandbox._txFormEl=form;
    vm.runInContext(source.slice(formAssignment.start,formAssignment.end)+';',context);
    return {form,elements,submit:()=>form.onsubmit({preventDefault(){},target:form})};
  };
  return {w,current,messages,nodes,success,service,setupForm,pay:()=>w.quickPay('S','2026-11','CS1','100',true)};
}

// A real unresolved primary ACK, unresolved receipt, and no Debt readiness signal.
{
  const h=uiHarness(), ack=deferred(), receipt=deferred();let receipts=0, finished=false;
  h.w.TuitionCommandBoundary={collectTuition:()=>ack.promise};h.w.exportReceipt=()=>{receipts++;return receipt.promise;};
  const p=h.pay().then(r=>{finished=true;return r;});await turn();
  check('pending financial operation has persistent visible feedback',()=>assert.equal(h.nodes.length,1));
  check('no success or receipt before primary ACK',()=>{assert(!h.messages.some(x=>x.startsWith('✅')));assert.equal(receipts,0);assert.equal(finished,false);});
  ack.resolve(h.success());await turn();
  check('success after primary ACK does not wait for Debt refresh',()=>assert(h.messages.some(x=>x.startsWith('✅'))));
  check('QuickPay returns while receipt remains unresolved',()=>assert.equal(finished,true));
  check('pending feedback is removed at financial completion',()=>assert.equal(h.nodes.length,0));
  check('one receipt uses acknowledged payment',()=>assert.equal(receipts,1));
  receipt.resolve({ok:true});assert.equal(await p,true);
}
{
  const h=uiHarness();h.w.TuitionCommandBoundary={collectTuition:async()=>({ok:false,blocked:true,reason:'SERVER_EVIDENCE_UNVERIFIED',writeDecision:{status:'UNKNOWN'}})};
  let receipts=0;h.w.exportReceipt=()=>{receipts++;};const r=await h.pay();
  check('UNKNOWN evidence yields explicit non-success feedback',()=>{assert.equal(r,false);assert(h.messages.some(x=>x.includes('chưa')||x.includes('Chưa')));assert(!h.messages.some(x=>x.startsWith('✅')));assert.equal(receipts,0);assert.equal(h.nodes.length,0);});
}
{
  const h=uiHarness(), ack=deferred();let receipts=0;h.w.TuitionCommandBoundary={collectTuition:()=>ack.promise};h.w.exportReceipt=()=>{receipts++;};
  const p=h.pay();await turn();h.current.clubId='B';h.current.generation++;ack.resolve({...h.success(),postCommitContextCurrent:false});const r=await p;
  check('post-ACK club switch keeps primary success and skips receipt',()=>{assert.equal(r,true);assert.equal(receipts,0);assert.equal(h.nodes.length,0);assert(h.messages.some(x=>x.includes('CLB trước')));});
}
{
  const h=uiHarness(), receipt=deferred();h.w.TuitionCommandBoundary={collectTuition:async()=>h.success()};h.w.exportReceipt=()=>receipt.promise;
  let done=false;const p=h.pay().then(r=>{done=true;return r;});await turn();const count=h.messages.length;h.current.generation++;receipt.reject(new Error('image failed'));await p;await turn();
  check('receipt rejection cannot overwrite a later session',()=>assert.equal(h.messages.length,count));
  check('receipt rejection never converts acknowledged payment to failure',()=>assert.equal(done,true));
}
{
  const h=uiHarness();h.w.TuitionCommandBoundary={collectTuition:async()=>h.success()};h.w.exportReceipt=()=>{throw new Error('renderer unavailable');};
  const r=await h.pay();
  check('synchronous receipt failure preserves primary success',()=>assert.equal(r,true));
  await turn();
  check('synchronous receipt failure leaves no pending indicator',()=>assert.equal(h.nodes.length,0));
}
{
  const h=uiHarness(), a=deferred(), b=deferred();let calls=0;h.w.TuitionCommandBoundary={collectTuition:()=> (++calls===1?a:b).promise};
  const pa=h.pay(),pb=h.pay();await turn();a.resolve(h.success());await pa;
  check('overlapping adapters retain feedback until all financial operations finish',()=>assert.equal(h.nodes.length,1));
  b.reject(new Error('permission-denied'));await pb;
  check('failed primary write removes final pending feedback',()=>assert.equal(h.nodes.length,0));
}
{
  const h=uiHarness(), ack=deferred(), f=h.setupForm();let commits=0,plan;
  h.w.TuitionCommandBoundary={runInProfileTuitionMutationLane:(_o,fn)=>fn(),requireTuitionUnpaidForWrite:async()=>({status:'VERIFIED_UNPAID',profile:h.w.__store.profiles.S,paidUntil:'2027-01'}),commitLocalTuitionPaymentState(){}};
  h.service.commitAtomicWritePlan=p=>{commits++;plan=p;return ack.promise;};
  const p=f.submit();await turn();
  check('tuition form shows persistent pre-ACK feedback',()=>assert.equal(h.nodes.length,1));
  check('tuition form remains locked without success before primary ACK',()=>{assert.equal(f.form.dataset.atomicSubmitInFlight,'1');assert.equal(f.form.resets,0);assert(!h.messages.some(x=>x.startsWith('✅')));});
  await f.submit();
  check('double form submit still performs exactly one atomic commit',()=>assert.equal(commits,1));
  check('three-month form preserves exact months, amount and one batch',()=>{assert.deepEqual(Array.from(plan.transactions[0].data.packageMonths),['2026-11','2026-12','2027-01']);assert.equal(plan.transactions[0].data.amount,100);assert.equal(plan.profileUpdates.length,1);});
  ack.resolve({primaryCommitted:true,postCommitContextCurrent:true,txIds:['T']});const r=await p;
  check('form clears pending feedback and unlocks only after primary completion',()=>{assert.equal(r,true);assert.equal(h.nodes.length,0);assert.equal(f.form.dataset.atomicSubmitInFlight,undefined);assert.equal(f.form.resets,1);});
}
{
  const h=uiHarness(), a=deferred(),b=deferred();let calls=0,receipts=0;
  h.w.TuitionCommandBoundary={collectTuition:()=> (++calls===1?a:b).promise};h.w.exportReceipt=async()=>{receipts++;return{ok:true};};
  const p=h.pay(),q=h.pay();await turn();a.resolve(h.success());await p;b.resolve(h.success());await q;
  check('overlapping acknowledged payments each retain the existing receipt queue',()=>assert.equal(receipts,2));
}
{
  const h=uiHarness(), f=h.setupForm();h.w.TuitionCommandBoundary={runInProfileTuitionMutationLane:(_o,fn)=>fn(),requireTuitionUnpaidForWrite:async()=>{throw new Error('UNKNOWN');},commitLocalTuitionPaymentState(){}};
  const r=await f.submit();
  check('failed form preserves entered data and cleans up feedback/mutex',()=>{assert.equal(r,false);assert.equal(f.form.resets,0);assert.equal(f.form.dataset.atomicSubmitInFlight,undefined);assert.equal(h.nodes.length,0);assert(!h.messages.some(x=>x.startsWith('✅')));});
}
{
  const h=uiHarness(), a=deferred(),b=deferred();let count=0;h.w.TuitionCommandBoundary={collectTuition:async()=>h.success()};h.w.exportReceipt=()=> (++count===1?a:b).promise;
  const p=h.pay();await turn();const q=h.pay();await turn();const before=h.messages.length;a.reject(new Error('old receipt failed'));await turn();
  check('earlier receipt failure cannot replace a newer operation message',()=>assert.equal(h.messages.length,before));
  b.resolve({ok:true});await Promise.all([p,q]);
}

// Actual existing evidence owner: success, rejection, metadata, pagination,
// in-flight deduplication and no retained negative result between requests.
globalThis.window=globalThis;window.userRole='admin';
window.__verifiedAuthContextState={ready:true,uid:'u',generation:1,sessionEpoch:1,authGeneration:1};
window.__store={clubId:'A',db:{},profiles:{S:{profileId:'pS',branch:'CS1',tuitionFee:100}},transactions:[],allTransactions:[],currentUser:{uid:'u'}};
window.getCanonicalTransactionReadMode=()=> 'legacy';window.allTransactions=[];
let calls=[], provider;
window._fb_init={collection:(...args)=>({args}),where:(field,op,value)=>({field,op,value}),limit:n=>({limit:n}),startAfter:cursor=>({cursor}),query:(ref,...constraints)=>({ref,constraints}),getDocs:q=>{
  const w=q.constraints.filter(c=>c.field), source=w.some(x=>x.field==='accountingMonths')?'canonical':w.some(x=>x.field==='txMonth')?'byTxMonth':w.some(x=>x.field==='packageMonths')?'byPackageMonth':'byDate';
  calls.push({source,month:w[0]?.value,cursor:q.constraints.some(c=>c.cursor)});return provider({source,q});
}};
const trusted={fromCache:false,hasPendingWrites:false};
const snap=(metadata=trusted,rows=[])=>({metadata,docs:rows.map((x,i)=>({id:x.id||'d'+i,data:()=>x}))});
const {FinanceService:F}=await import(pathToFileURL(path.join(root,'js/services/finance.service.js')).href);
window.FinanceService=F;
provider=async()=>snap();calls=[];let e=await F.getCompleteMonthEvidence({month:'2026-01'});
check('legacy negative evidence still requires all three server sources',()=>{assert.equal(e.serverComplete,true);assert.deepEqual(calls.map(x=>x.source),['byTxMonth','byDate','byPackageMonth']);});
provider=async()=>{throw Object.assign(new Error('denied'),{code:'permission-denied'});};calls=[];e=await F.getCompleteMonthEvidence({month:'2026-02'});
check('first-source rejection keeps baseline one-READ stop',()=>{assert.equal(e.serverComplete,false);assert.equal(calls.length,1);});
provider=async({source})=>{if(source==='byDate')throw new Error('offline');return snap();};calls=[];e=await F.getCompleteMonthEvidence({month:'2026-03'});
check('second-source rejection keeps baseline two-READ stop',()=>{assert.equal(e.serverComplete,false);assert.equal(calls.length,2);});
provider=async()=>snap({fromCache:true,hasPendingWrites:false});calls=[];e=await F.getCompleteMonthEvidence({month:'2026-04'});
check('cache evidence cannot authorize unpaid',()=>assert.equal(e.serverComplete,false));
provider=async()=>snap({...trusted,hasPendingWrites:true});e=await F.getCompleteMonthEvidence({month:'2026-05'});
check('pending writes cannot authorize unpaid',()=>assert.equal(e.serverComplete,false));
provider=async()=>snap(undefined); // Explicit missing metadata below.
provider=async()=>({docs:[]});e=await F.getCompleteMonthEvidence({month:'2026-06'});
check('missing metadata cannot authorize unpaid',()=>assert.equal(e.serverComplete,false));
provider=async()=>snap();calls=[];await F.getCompleteMonthEvidence({month:'2026-07'});await F.getCompleteMonthEvidence({month:'2026-07'});
check('completed negative evidence is not cached across operations',()=>assert.equal(calls.length,6));
calls=[];const pending=deferred();provider=async()=>{await pending.promise;return snap();};const pa=F.getCompleteMonthEvidence({month:'2026-08'}),pb=F.getCompleteMonthEvidence({month:'2026-08'});pending.resolve();await Promise.all([pa,pb]);
check('same-context active evidence retains existing single-flight',()=>assert.equal(calls.length,3));
window.getCanonicalTransactionReadMode=()=> 'canonical';provider=async()=>snap();calls=[];e=await F.getCompleteMonthEvidence({month:'2026-09'});
check('canonical evidence remains one accountingMonths query',()=>{assert.equal(e.serverComplete,true);assert.equal(calls.length,1);assert.equal(calls[0].source,'canonical');});
window.getCanonicalTransactionReadMode=()=> 'legacy';
const {TuitionCommandBoundary:B}=await import(pathToFileURL(path.join(root,'js/core/tuitionCommandBoundary.js')).href);
await import(pathToFileURL(path.join(root,'js/core/tuitionDebtCanonical.js')).href);
for(const size of [1,3,6,9,12]) {
  const months=Array.from({length:size},(_,i)=>'2027-'+String(i+1).padStart(2,'0'));calls=[];provider=async()=>snap();
  const p={...window.__store.profiles.S,paidMonths:months};
  let d=await B.resolveTuitionSettlementForWrite({profile:p,studentName:'S',targetMonths:months});
  check(`${size} profile-paid months preserve zero READ`,()=>{assert.equal(d.status,'PAID');assert.equal(calls.length,0);});
  calls=[];d=await B.resolveTuitionSettlementForWrite({studentName:'S',targetMonths:months,expectedContext:F.captureFinancialWriteContext()});
  check(`${size} unpaid months preserve exact successful READ count`,()=>{assert.equal(d.status,'VERIFIED_UNPAID');assert.equal(calls.length,3*size);});
  calls=[];provider=async()=>{throw new Error('offline');};d=await B.resolveTuitionSettlementForWrite({studentName:'S',targetMonths:months,expectedContext:F.captureFinancialWriteContext()});
  check(`${size} months preserve first-month failure stop`,()=>{assert.equal(d.status,'UNKNOWN');assert.equal(calls.length,1);});
}
const protectedFiles=['app.js','js/services/finance.service.js','js/core/tuitionCommandBoundary.js','js/core/tuitionDebtCanonical.js','js/core/debtProfileReadBoundary.js','js/listeners/profiles.listeners.js','js/core/transactionCanonicalBoundary.js','firestore.rules','firestore.indexes.json'];
const parentManifest=JSON.parse(read('tools/v11r2/manifests/V11R6_A9R18_REACHABLE_DOM_TRUST_BOUNDARY_R1_4B.json'));
for(const file of protectedFiles) check('protected financial source unchanged: '+file,()=>assert.equal(sha(read(file)),parentManifest.canonicalRuntimeFiles[file] || parentManifest[file==='firestore.rules'?'rulesSHA256':'indexesSHA256']));
// Exact parent files are authenticated by the source registry; this gate also
// verifies no financial operations entered the UI adapter patch.
check('UI adapter contains no direct Firestore reads or listeners',()=>assert(!/\b(getDoc|getDocs|onSnapshot)\s*\(/.test(source)));
check('new progress feedback has no polling or fixed wait',()=>{const p=source.slice(source.indexOf('function _beginTuitionFeedback'),source.indexOf('/** @deprecated'));assert(!/setTimeout|setInterval|requestAnimationFrame/.test(p));});
check('root/public Finance adapter parity',()=>assert.equal(read('public/js/modules/finance.js'),source));
console.log(JSON.stringify({gate:'FINANCE_WRITE_LATENCY_R1_SAFE_FEEDBACK',passed,failed,sourceRoot:root}));
if(failed)process.exitCode=1;
