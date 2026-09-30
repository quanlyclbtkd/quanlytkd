#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8'); let pass=0,fail=0;
const check=(n,ok,d='')=>{if(ok){pass++;console.log('✅ '+n)}else{fail++;console.error('❌ '+n+(d?' — '+d:''))}};
const tdiSrc=read('js/core/transactionDeleteIntegrity.js'), tcbSrc=read('js/core/tuitionCommandBoundary.js'), financeSrc=read('js/modules/finance.js'), statusSrc=read('js/core/studentStatusCommandBoundary.js'), appSrc=read('app.js'), htmlSrc=read('index.html');
check('1. canonical Tuition writer unchanged',/commitAtomicWritePlan\(/.test(tcbSrc)&&/TuitionCommandBoundary\?\.collectTuition/.test(financeSrc));
check('2. canonical Inventory owner unchanged',/InventoryService\.deleteItem/.test(read('js/services/finance.service.js')));
check('3. canonical transaction owner unchanged',/FinanceService\.deleteTransaction/.test(financeSrc));
check('4. TransactionDeleteIntegrity remains classifier authority',/TransactionDeleteIntegrity\.analyzeTransactionDeleteImpact/.test(financeSrc));
check('5. finance consumes canonical isPureTuition',/impact\?\.isPureTuition === true/.test(financeSrc));
check('6. one profile mutation lane Map', (tcbSrc.match(/const profileMutationLanes = new Map\(\)/g)||[]).length===1);
check('7. external lane API reuses existing lane',/runInProfileTuitionMutationLane/.test(tcbSrc)&&/_withProfileMutationLane\(laneKey, task\)/.test(tcbSrc));
check('8. no global finance mutex introduced',!/GlobalFinanceMutex|GenericDeleteLane|InventoryTuitionLane|SecondProfileLane/.test(tcbSrc+financeSrc));
check('9. skipped-month mutations use Tuition profile lane',/student\.addSkippedMonth[\s\S]*runInProfileTuitionMutationLane/.test(statusSrc)&&/student\.removeSkippedMonth[\s\S]*runInProfileTuitionMutationLane/.test(statusSrc));
check('10. tuition-affecting generic profile update is lane-aware',/tuitionFields = \['paidUntil', 'paidMonths', 'skippedMonths'\][\s\S]*runInProfileTuitionMutationLane/.test(statusSrc));
check('11. transaction-form tuition uses existing lane',/reason:'finance\.transactionForm'/.test(financeSrc));
check('12. family combo uses existing multi-profile lane',/reason:'finance\.processCombo'/.test(financeSrc)&&/runInProfileTuitionMutationLanes/.test(financeSrc));
check('13. generic tuition-affecting delete uses existing lane',/reason: 'finance\.generic-delete'/.test(financeSrc));
check('14. mixed unsafe branch occurs before confirm/destructive path',financeSrc.indexOf('if (impact && !impact.safeToHardDelete)')<financeSrc.indexOf("await FinanceService.deleteTransaction(txId)"));
check('15. receipt queue preserved',/let _receiptRenderQueue = Promise\.resolve\(\)/.test(appSrc));
check('16. one filterBranch preserved',(htmlSrc.match(/id="filterBranch"/g)||[]).length===1);

let seq=0; globalThis.window=globalThis; globalThis.document={getElementById:()=>null};
const {TransactionDeleteIntegrity:TDI}=await import(pathToFileURL(path.resolve('js/core/transactionDeleteIntegrity.js')).href+`?f1d-tdi=${++seq}`);
const mb=[
['MB01',{id:'t',type:'Học phí',description:'A',txMonth:'2026-09'},r=>r.isPureTuition&& !r.hasInventory],
['MB02',{id:'i',type:'Thu Võ phục',relatedInvId:'INV1'},r=>!r.isPureTuition&&r.hasInventory],
['MB03',{id:'m3',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',relatedInvId:'INV1',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV1'}]},r=>r.isMixedBundle&&!r.isPureTuition&&!r.safeToHardDelete],
['MB04',{id:'m4',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV-123'}]},r=>r.hasInventory&&r.hasInventoryLinkage&&r.isMixedBundle&&!r.isPureTuition],
['MB05',{id:'m5',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',components:[{kind:'inventory',paymentBundleId:'B1'}]},r=>!r.isPureTuition],
['MB06',{id:'m6',type:'Học phí',txMonth:'2026-09',components:[{kind:'inventory',relatedInvId:'I1'}]},r=>r.requiresInventoryRollback&&!r.isPureTuition],
];
for(const [id,tx,fn] of mb){const r=TDI.analyzeTransactionDeleteImpact(tx);check(`${id} classifier`,!!fn(r),JSON.stringify(r));}
let destructive={tx:0,inv:0,profile:0,tuition:0};
async function route(tx){const impact=TDI.analyzeTransactionDeleteImpact(tx);if(!impact.safeToHardDelete)return {blocked:true,impact};if(impact.isPureTuition){destructive.tuition++;return{tuition:true,impact}}destructive.tx++;if(impact.requiresInventoryRollback)destructive.inv++;if(impact.requiresProfileReconcile)destructive.profile++;return{generic:true,impact}}
const unsafe={id:'u',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV1'}]};
const rr=await route(unsafe); check('23. MB08 unsafe mixed delete fails closed',rr.blocked===true); check('24. MB08 unsafe mixed delete zero destructive writes',Object.values(destructive).every(v=>v===0),JSON.stringify(destructive));
const pure=await route({id:'p',type:'Học phí',description:'A',txMonth:'2026-09'});check('25. pure tuition routes tuition delete only',pure.tuition===true&&destructive.tuition===1&&destructive.tx===0);

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}; const tick=()=>new Promise(r=>setTimeout(r,0));
async function harness(){
 globalThis.window=globalThis; globalThis.document={getElementById:()=>null}; window.userRole='admin';window.currentUserEmail='qa@x';window.currentUserUid='u';window.currentClubId='clubA';window.__verifiedAuthContextState={generation:1,uid:'u'};
 window.__store={clubId:'clubA',profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]},B:{profileId:'pB',name:'B',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]}},transactions:[],allTransactions:[],currentUser:{uid:'u'}};window.allProfiles=window.__store.profiles;window.allTransactions=window.__store.transactions;
 window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true;window.recordFinancialActionAudit=()=>{};window.recordRuntimeError=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};window.studentProfileStore={getAllProfilesCompat:()=>window.__store.profiles,mergeProfile:(k,v)=>window.__store.profiles[k]=v};
 await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?f1d-c=${++seq}`);
 const primaryGate=deferred();let holdPrimary=false;const calls={primary:0};window.FinanceService={_arrayUnion:(...x)=>x,async commitAtomicWritePlan(plan){calls.primary++;if(holdPrimary)await primaryGate.promise;const id='tx-'+calls.primary;window.__store.transactions.push({id,...structuredClone(plan.transactions[0].data)});return{txIds:[id]}},async addFeeAuditSilent(){return{ok:true}},async deleteTransaction(){},async getStudentTuitionTxs(){return[]},async updateProfileAfterTxDelete(){}};window.TransactionDeleteIntegrity={analyzeTransactionDeleteImpact:tx=>({hasTuition:true,requiresProfileReconcile:true,studentName:tx.description||'A'})};
 const {TuitionCommandBoundary:T}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?f1d-t=${++seq}`);return{T,calls,primaryGate,setHold:v=>holdPrimary=v,collect:(n='A')=>T.collectTuition({studentName:n,months:['2026-09'],amount:100000,branch:'CS1'})};
}
{
 const h=await harness(), gate=deferred(); let genericEntered=false,genericDone=false;
 const gd=h.T.runInProfileTuitionMutationLane({studentName:'A',reason:'TM01'},async()=>{genericEntered=true;await gate.promise;genericDone=true;}); await tick();
 let collectDone=false;const c=h.collect('A').then(v=>{collectDone=true;return v});await tick();check('26. TM01 collect waits pending same-profile generic mutation',genericEntered&&!genericDone&&!collectDone&&h.calls.primary===0);gate.resolve();await gd;await c;check('27. TM01 collect proceeds after lane release',h.calls.primary===1&&collectDone);
}
{
 const h=await harness();h.setHold(true);const c=h.collect('A');await tick();let deleteEntered=false;const d=h.T.runInProfileTuitionMutationLane({studentName:'A',reason:'TM02'},async()=>{deleteEntered=true});await tick();check('28. TM02 generic delete waits pending same-profile collect',h.calls.primary===1&&!deleteEntered);h.primaryGate.resolve();await c;await d;check('29. TM02 delete enters after collect finishes',deleteEntered);
}
{
 const h=await harness(),g1=deferred(),g2=deferred();let active=0,max=0;const f=(name,g)=>h.T.runInProfileTuitionMutationLane({studentName:name},async()=>{active++;max=Math.max(max,active);await g.promise;active--});const a=f('A',g1),b=f('B',g2);await tick();check('30. TM03 different profiles remain parallel',max===2);g1.resolve();g2.resolve();await Promise.all([a,b]);
}
{
 const h=await harness();let second=false;await h.T.runInProfileTuitionMutationLane({studentName:'A'},async()=>{throw new Error('expected')}).catch(()=>{});await h.T.runInProfileTuitionMutationLane({studentName:'A'},async()=>{second=true});check('31. TM04 rejected lane operation does not poison lane',second&&h.T.getMetrics().profileMutationLaneCount===0);
}
check('32. TM05 pure tuition path does not wrap delete in external lane',financeSrc.indexOf('if (isTuitionOnly)')<financeSrc.indexOf("reason: 'finance.generic-delete'"));
check('33. F1C completed replay remains lane-aware',/completedReplayAfterLane:\s*true/.test(tcbSrc)&&/_withProfileMutationLane\(profileLaneKey[\s\S]*getCompletedReplay/.test(tcbSrc));
const canonSrc=read('js/core/tuitionDebtCanonical.js'), mainSrc=read('js/main.js');
check('34. F1C legacy gap reversal preserved',/if \(!affectingBoundary\.length\) return previous/.test(canonSrc)&&/monthsActuallyRemoved:\s*monthsToRemove/.test(mainSrc));
check('35. packageMonths fallback preserved',/Array\.isArray\(tx\.packageMonths\)/.test(canonSrc));check('36. txMonth fallback preserved',/tx\.txMonth/.test(canonSrc));
check('37. fee_audit remains secondary',/void _service\(\)\.addFeeAuditSilent/.test(tcbSrc)&&!/await _service\(\)\.addFeeAuditSilent/.test(tcbSrc));

function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(!['migrations','diagnostics'].includes(e.name))walk(f,o)}else if(e.name.endsWith('.js'))o.push(f)}return o}const runtime=['app.js',...walk('js')], pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g},counts={getDoc:0,getDocs:0,onSnapshot:0};for(const f of runtime)for(const line of read(f).split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}
check('38. no new getDoc',counts.getDoc===29,JSON.stringify(counts));check('39. no new getDocs',counts.getDocs===45,JSON.stringify(counts));check('40. no new onSnapshot',counts.onSnapshot===16,JSON.stringify(counts));check('41. Firestore budget 29/45/16',counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16,JSON.stringify(counts));
const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});check('42. root/public parity PASS',parity.status===0,(parity.stderr||parity.stdout||'').slice(-400));
console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);if(fail)process.exit(1);console.log('H8R2.1C1F1D mixed-bundle / tuition mutation lane closure PASS.');
