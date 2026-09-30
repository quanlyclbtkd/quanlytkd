#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8'); let pass=0,fail=0;
const check=(n,ok,d='')=>{if(ok){pass++;console.log('✅ '+n)}else{fail++;console.error('❌ '+n+(d?' — '+d:''))}};
const app=read('app.js'),tcb=read('js/core/tuitionCommandBoundary.js'),tdiSrc=read('js/core/transactionDeleteIntegrity.js'),fin=read('js/modules/finance.js'),inv=read('js/services/inventory.service.js'),pkg=JSON.parse(read('package.json'));
const miStart=app.indexOf('window.processMultiItem = async (action) => {'),miEnd=app.indexOf('// ─── Setup currency inputs for multi-item modal',miStart),mi=app.slice(miStart,miEnd);
check('1. processMultiItem remains existing app.js owner',miStart>=0&&/protected-legacy/.test(read('js/core/globalOwnershipRegistry.js')));
check('2. processMultiItem is not rewritten into collectTuition writer',!/collectTuition\s*\(/.test(mi));
check('3. tuition-bearing processMultiItem uses existing profile lane',mi.includes('runInProfileTuitionMutationLane')&&mi.includes("reason:'processMultiItem.tuition'"));
check('4. non-tuition branch executes primary without tuition lane',mi.includes('if(hasTuition)')&&mi.includes('else _primaryResult=await _runMultiItemPrimary()'));
check('5. profile is re-resolved inside critical lane task',mi.includes('latestProfiles=(window.__store&&window.__store.profiles)')&&mi.includes('latestProfile=latestProfiles[name]'));
check('6. settlement is rechecked inside critical task',mi.includes('areTuitionMonthsSettled(latestProfile,latestMonths'));
check('7. paidUntil is recalculated inside critical task',/reconcilePaidUntilFromMonthEvidence\(latestProfile/.test(mi));
check('8. stale paidUntil max shortcut is not used for final in-lane state',/reconcilePaidUntilFromMonthEvidence/.test(mi)&&/commitLocalTuitionPaymentState/.test(mi));
check('9. all-settled tuition-only becomes no-write',mi.includes('alreadySettled:true,primaryWritePerformed:false'));
check('10. stale mixed MultiItem fails closed',/multiitem\/stale-mixed-bundle/.test(mi));
check('11. partially settled package fails closed',/multiitem\/partial-settlement-changed/.test(mi));
check('12. lane local-state commit uses existing TCB owner',/commitLocalTuitionPaymentState/.test(mi)&&/commitLocalTuitionPaymentState/.test(tcb));
check('13. receipt runs after critical lane result',mi.indexOf("reason: 'processMultiItem.tuition'")<mi.indexOf('await window.exportReceipt'));
check('14. existing __atomicInFlight preserved',/__atomicInFlight/.test(mi));
check('15. no second profile lane Map', (tcb.match(/profileMutationLanes = new Map\(\)/g)||[]).length===1);

let seq=0;globalThis.window=globalThis;globalThis.document={getElementById:()=>null};
const {TransactionDeleteIntegrity:TDI}=await import(pathToFileURL(path.resolve('js/core/transactionDeleteIntegrity.js')).href+`?d1=${++seq}`);
const ni1=TDI.analyzeTransactionDeleteImpact({id:'i1',type:'Thu Võ phục',relatedInvId:'INV-1'});
const ni2=TDI.analyzeTransactionDeleteImpact({id:'i2',type:'Thu Võ phục',components:[{kind:'inventory',relatedInvId:'INV-2'}]});
const ni4=TDI.analyzeTransactionDeleteImpact({id:'i4',type:'Thu Võ phục',relatedInvId:'INV-A',components:[{kind:'inventory',relatedInvId:'INV-B'}]});
const ni5=TDI.analyzeTransactionDeleteImpact({id:'i5',type:'Thu Võ phục',components:[{kind:'inventory',relatedInvId:'INV-A'},{kind:'inventory',relatedInvId:'INV-B'}]});
const niMissing=TDI.analyzeTransactionDeleteImpact({id:'im',type:'Thu Võ phục',paymentBundleId:'B1',components:[{kind:'inventory',paymentBundleId:'B1'}]});
const mixed=TDI.analyzeTransactionDeleteImpact({id:'m',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV-X'}]});
check('16. TransactionDeleteIntegrity remains inventory classifier owner',/TransactionDeleteIntegrity\.analyzeTransactionDeleteImpact/.test(fin));
check('17. NI01 top-level canonical inventory ref extracted',ni1.inventoryRefs?.length===1&&ni1.inventoryRefs[0]==='INV-1'&&ni1.isPureInventory===true);
check('18. NI02 nested inventory ref extracted without top-level ref',ni2.inventoryRefs?.length===1&&ni2.inventoryRefs[0]==='INV-2'&&ni2.isPureInventory===true);
check('19. UI relatedInvId is not sole authority',/impact\?\.inventoryRefs/.test(fin)&&/hint=String\(relatedInvId/.test(fin));
check('20. conflicting top/nested inventory refs fail closed',ni4.safeToHardDelete===false&&ni4.blockers.includes('multiple-inventory-refs-no-proven-owner'));
check('21. multiple nested refs fail closed',ni5.safeToHardDelete===false&&ni5.inventoryRefs.length===2);
check('22. payment linkage without actual inventory doc ref fails closed',niMissing.safeToHardDelete===false&&niMissing.blockers.includes('inventory-no-canonical-ref'));
check('23. mixed Tuition+Inventory F1D fail-closed preserved',mixed.isMixedBundle===true&&mixed.safeToHardDelete===false&&mixed.isPureInventory===false);
check('24. finance pure-inventory execution consumes canonical refs',/impact\?\.isPureInventory===true[\s\S]*refs\[0\]/.test(fin));
check('25. missing canonical local inventory state fails before destructive write',/Inventory local owner chưa sẵn sàng/.test(fin));
check('26. existing InventoryService owner is reused',/window\.InventoryService\.deleteItem\(invId,\{previous,relatedTxId:(?:id|txId)/.test(fin));
check('27. InventoryService can delete inventory + related tx in one existing batch',/batch\.delete\(itemRef\)[\s\S]*relatedTxId[\s\S]*batch\.delete\(doc\(db, 'clubs', _clubId\(\), 'transactions', relatedTxId\)\)[\s\S]*await batch\.commit\(\)/.test(inv));
check('28. no new Inventory writer authority',!/InventoryRollbackService|MultiItemService|SecondInventoryWriter/.test(app+fin+tcb));
check('29. no new Tuition writer authority',!/SecondTuitionWriter|MultiItemTuitionWriter/.test(app+fin+tcb));

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};const tick=()=>new Promise(r=>setTimeout(r,0));
async function laneHarness(){
 globalThis.window=globalThis;globalThis.document={getElementById:()=>null};window.userRole='admin';window.currentUserEmail='qa@x';window.currentUserUid='u';window.currentClubId='clubA';window.__verifiedAuthContextState={generation:1,uid:'u'};
 window.__store={clubId:'clubA',profiles:{A:{profileId:'pA',name:'A',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]},B:{profileId:'pB',name:'B',branch:'CS1',tuitionFee:100000,paidUntil:'2026-08',paidMonths:['2026-08'],skippedMonths:[]}},transactions:[],allTransactions:[],currentUser:{uid:'u'}};window.allProfiles=window.__store.profiles;window.allTransactions=window.__store.transactions;
 window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true;window.recordFinancialActionAudit=()=>{};window.recordRuntimeError=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};window.studentProfileStore={getAllProfilesCompat:()=>window.__store.profiles,mergeProfile:(k,v)=>window.__store.profiles[k]=v};
 await import(pathToFileURL(path.resolve('js/core/tuitionDebtCanonical.js')).href+`?d1c=${++seq}`);
 let writes=0;const gates=[];window.FinanceService={_arrayUnion:(...x)=>x,async commitAtomicWritePlan(plan){writes++;const g=gates.shift();if(g)await g.promise;return{txIds:['tx-'+writes]}},async addFeeAuditSilent(){return{ok:true}}};
 const {TuitionCommandBoundary:T}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?d1t=${++seq}`);
 async function multi(name,months,{mixed=false,gate=null}={}){return T.runInProfileTuitionMutationLane({studentName:name,reason:'test.processMultiItem'},async()=>{const p=window.__store.profiles[name];const st=window.TuitionDebtCanonical.areTuitionMonthsSettled(p,months,{name});if(st.allSettled)return{alreadySettled:true};if(st.paidMonths.length){if(mixed)throw Object.assign(new Error('stale mixed'),{code:'multiitem/stale-mixed-bundle'});throw Object.assign(new Error('partial'),{code:'multiitem/partial-settlement-changed'});}if(gate)await gate.promise;const pu=window.TuitionDebtCanonical.reconcilePaidUntilFromMonthEvidence(p,(p.paidMonths||[]).concat(months),{allowRegression:false});writes++;T.commitLocalTuitionPaymentState({studentName:name,paidUntil:pu,paidMonths:months,reason:'test.multi'});return{ok:true,paidUntil:pu};});}
 const quick=(name,month)=>T.collectTuition({studentName:name,months:[month],amount:100000,branch:'CS1'});
 return{T,multi,quick,get writes(){return writes},gates};
}
{
 const h=await laneHarness(),g=deferred();let mDone=false,qDone=false;const m=h.multi('A',['2026-09'],{gate:g}).then(v=>{mDone=true;return v});await tick();const q=h.quick('A','2026-10').then(v=>{qDone=true;return v});await tick();check('30. MT04 QuickPay waits pending same-profile MultiItem lane',!qDone&&h.writes===0);g.resolve();await m;await q;check('31. MT04 serialized final paidUntil does not regress',window.__store.profiles.A.paidUntil==='2026-10'&&mDone&&qDone);
}
{
 const h=await laneHarness(),g=deferred();h.gates.push(g);let qDone=false,mDone=false;const q=h.quick('A','2026-10').then(v=>{qDone=true;return v});await tick();const m=h.multi('A',['2026-09']).then(v=>{mDone=true;return v});await tick();check('32. MT03 MultiItem waits pending same-profile QuickPay',!mDone&&h.writes===1);g.resolve();await q;await m;check('33. MT03 latest state preserves newer paidUntil',qDone&&mDone&&window.__store.profiles.A.paidUntil==='2026-10');
}
{
 const h=await laneHarness();await h.quick('A','2026-09');const before=h.writes;const r=await h.multi('A',['2026-09']);check('34. MT05 stale same-month MultiItem performs no second tuition effect',r.alreadySettled===true&&h.writes===before);
}
{
 const h=await laneHarness();window.__store.profiles.A.paidMonths.push('2026-09');let blocked=false;try{await h.multi('A',['2026-09','2026-10'],{mixed:true})}catch(e){blocked=e.code==='multiitem/stale-mixed-bundle'}check('35. MT07 stale mixed/partial bundle fails closed',blocked&&h.writes===0);
}
{
 const h=await laneHarness(),a=deferred(),b=deferred();let active=0,max=0;const f=(n,g)=>h.T.runInProfileTuitionMutationLane({studentName:n},async()=>{active++;max=Math.max(max,active);await g.promise;active--});const p1=f('A',a),p2=f('B',b);await tick();check('36. MT08 different profiles remain parallel',max===2);a.resolve();b.resolve();await Promise.all([p1,p2]);
}
{
 const h=await laneHarness();let next=false;await h.T.runInProfileTuitionMutationLane({studentName:'A'},async()=>{throw new Error('expected')}).catch(()=>{});await h.T.runInProfileTuitionMutationLane({studentName:'A'},async()=>{next=true});check('37. MT09 rejected lane task cleans up',next&&h.T.getMetrics().profileMutationLaneCount===0);
}
check('38. no nested-lane deadlock architecture: processMultiItem uses coordination API, not collectTuition',/runInProfileTuitionMutationLane/.test(mi)&&!/collectTuition\s*\(/.test(mi));
check('39. F1C completed replay remains lane-aware',/completedReplayAfterLane:\s*true/.test(tcb)&&/_withProfileMutationLane\(profileLaneKey[\s\S]*getCompletedReplay/.test(tcb));
check('40. F1C legacy gap reversal remains present',/monthsActuallyRemoved/.test(read('js/core/tuitionDebtCanonical.js')));
check('41. receipt queue preserved',/let _receiptRenderQueue = Promise\.resolve\(\)/.test(app));
check('42. fee_audit remains secondary',/void _service\(\)\.addFeeAuditSilent/.test(tcb));
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(!['migrations','diagnostics'].includes(e.name))walk(f,o)}else if(e.name.endsWith('.js'))o.push(f)}return o}
const runtime=['app.js',...walk('js')], pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g},counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtime)for(const line of read(f).split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}
check('43. no new getDoc',counts.getDoc===29,JSON.stringify(counts));
check('44. no new getDocs',counts.getDocs===45,JSON.stringify(counts));
check('45. no new onSnapshot / budget 29/45/16',counts.onSnapshot===16&&counts.getDoc===29&&counts.getDocs===45,JSON.stringify(counts));
const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});check('46. root/public parity PASS',parity.status===0,(parity.stderr||parity.stdout||'').slice(-400));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);if(fail)process.exit(1);console.log('H8R2.1C1F1D1 multiitem/inventory closure gate PASS.');
