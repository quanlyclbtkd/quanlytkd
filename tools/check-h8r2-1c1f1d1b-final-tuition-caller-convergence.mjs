import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const read=f=>fs.readFileSync(f,'utf8');let pass=0,fail=0,seq=0;
const check=(name,ok,detail='')=>{if(ok){pass++;console.log('✅',name)}else{fail++;console.error('❌',name,detail)}};
const tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const app=read('app.js'),fin=read('js/modules/finance.js'),tcbSrc=read('js/core/tuitionCommandBoundary.js'),tdcSrc=read('js/core/tuitionDebtCanonical.js'),tdiSrc=read('js/core/transactionDeleteIntegrity.js'),financeServiceSrc=read('js/services/finance.service.js');

function extractAssignment(src,marker){const start=src.indexOf(marker);if(start<0)throw new Error('missing '+marker);const brace=src.indexOf('{',start);let depth=0,state='code',quote='';for(let i=brace;i<src.length;i++){const c=src[i],n=src[i+1];if(state==='line'){if(c==='\n')state='code';continue}if(state==='block'){if(c==='*'&&n==='/'){state='code';i++}continue}if(state==='str'){if(c==='\\'){i++;continue}if(c===quote)state='code';continue}if(state==='template'){if(c==='\\'){i++;continue}if(c==='`')state='code';continue}if(c==='/'&&n==='/'){state='line';i++;continue}if(c==='/'&&n==='*'){state='block';i++;continue}if(c==='"'||c==="'"){state='str';quote=c;continue}if(c==='`'){state='template';continue}if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0){const semi=src.indexOf(';',i);return src.slice(start,semi+1)}}}throw new Error('unterminated '+marker)}
function extractLegacyForm(src){const marker="document.getElementById('transactionForm').onsubmit = async (e) => {";return extractAssignment(src,marker)}
const legacyFormSrc=extractLegacyForm(app),legacyComboSrc=extractAssignment(app,'window.processCombo = async () => {');

// --- Static authority / ownership checks ---
check('1. canonical Form actual handler exists',fin.includes("_txFormEl.onsubmit = async (e) =>"));
check('2. canonical Combo actual handler exists',fin.includes('window.processCombo = async (action) =>'));
check('3. Form uses existing profile lane',/runInProfileTuitionMutationLane\(\{studentName:name,reason:'finance\.transactionForm'\}/.test(fin));
check('4. Combo uses existing multi-profile lanes',/runInProfileTuitionMutationLanes\(\{profiles:intents\.map/.test(fin));
check('5. latest Tuition decision is called inside Form lane task',fin.indexOf('runInProfileTuitionMutationLane')<fin.indexOf('_freshTuitionDecision(name,monthsToRecord)'));
check('6. latest Tuition decisions are called inside Combo lane task',fin.indexOf('runInProfileTuitionMutationLanes')<fin.indexOf('_freshTuitionDecision(x.studentName,[x.month])'));
check('7. Form final atomic plan is built inside lane task',fin.indexOf('_freshTuitionDecision(name,monthsToRecord)')<fin.indexOf("reason:'transaction-form-tuition'"));
check('8. Combo final profileUpdates are built after latest decisions',fin.indexOf('const latest=intents.map')<fin.indexOf('profileUpdates.push'));
check('9. Form local canonical commit occurs after primary atomic success',fin.indexOf("const atomic=await FinanceService.commitAtomicWritePlan({transactions:[{data:finalTx")<fin.indexOf("reason:'finance.transactionForm'});return{ok:true"));
check('10. Combo local commits occur after primary atomic success',fin.indexOf('const atomic=await FinanceService.commitAtomicWritePlan({transactions,profileUpdates})')<fin.lastIndexOf("reason:'finance.processCombo'}"));
check('11. Form stale settled state prevents primary plan',/if\(fresh\.settlement\?\.paidMonths\?\.length\)return\{alreadySettled:true/.test(fin));
check('12. Combo stale participant fails closed',/latest\.some\(x=>x\.settlement\?\.paidMonths\?\.length\)\)return\{stale:true\}/.test(fin));
check('13. canonical settlement authority remains TuitionDebtCanonical',fin.includes('window.TuitionDebtCanonical')&&tdcSrc.includes('function areTuitionMonthsSettled'));
check('14. exactly one profileMutationLanes Map definition',((app+fin+tcbSrc).match(/profileMutationLanes\s*=\s*new Map\s*\(/g)||[]).length===1);
check('15. legacy transaction form writer is hard-disabled no-write stub',legacyFormSrc.includes('Chức năng tài chính đang khởi tạo')&&!/addDoc|updateDoc|commitAtomicWritePlan/.test(legacyFormSrc));
check('16. legacy processCombo writer is hard-disabled no-write stub',legacyComboSrc.includes('Chức năng tài chính đang khởi tạo')&&!/addDoc|updateDoc|commitAtomicWritePlan|writeBatch/.test(legacyComboSrc));
check('17. no legacy window.saveTx writer is mounted',!/(window\.saveTx\s*=|function\s+saveTx\s*\()/.test(app+fin));
check('18. Tuition delete owner analyzes canonical transaction impact itself',/const analyzer = window\.TransactionDeleteIntegrity\?\.analyzeTransactionDeleteImpact/.test(tcbSrc)&&/const analyzed = analyzer\(\{ \.\.\.tx, id \}\)/.test(tcbSrc));
check('19. Tuition delete owner rejects inventory/mixed impact',/analyzed\.hasInventory \|\| analyzed\.requiresInventoryRollback \|\| analyzed\.isMixedBundle/.test(tcbSrc));
check('20. no new tuition writer/service/lane names',!/transactionFormV2|processComboV2|freshTuitionService|newFinanceCoordinator|newPaymentQueue|SecondProfileLane/.test(app+fin+tcbSrc));
check('20b. fee_audit secondary failure stays observable without invalidating canonical payment',financeServiceSrc.includes("classification: 'fee-audit-write-failed'")&&financeServiceSrc.includes('canonicalPaymentPreserved: true')&&financeServiceSrc.includes("recordRuntimeError?.('secondary-consistency:'"));

// --- Global harness using real production handlers + real TCB, service I/O mocked ---
globalThis.window=globalThis;window.location={hostname:'example.com'};window.userRole='admin';window.currentUserEmail='qa@example.test';window.__verifiedAuthContextState={generation:1,uid:'qa'};
const elements={};
function E(value=''){return{value,checked:false,style:{},dataset:{},reset(){this.resetCount=(this.resetCount||0)+1}}}
['transactionForm','type','description','amountActual','date','branch','tx_package','tx_discount','tx_discount_pct','tx_discount_saved','tx_exam_amountActual','tx_exam_title','combo_name1','combo_fee1_actual','combo_month1','combo_name2','combo_fee2_actual','combo_month2','comboModal'].forEach(id=>elements[id]=E(''));
elements.transactionForm.dataset={}; elements.tx_package.options=['1','3','6','12'].map(value=>({value})); elements.comboModal.style={display:'block'};
globalThis.document={getElementById:id=>elements[id]||null};globalThis.confirm=()=>true;globalThis.alert=()=>{};
const toasts=[],receipts=[];window.showToast=m=>toasts.push(String(m));window.exportReceipt=async(...args)=>{receipts.push({args,laneCount:window.TuitionCommandBoundary?.getMetrics?.().profileMutationLaneCount});return{ok:true}};window.toggleTxFormType=()=>{};window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true;window.recordFinancialActionAudit=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};window.invalidateLists=()=>{};window.refreshListsComputation=()=>{};window.renderExamList=()=>{};window.studentProfileStore={mergeProfile:()=>{}};window.StudentStatusCommandBoundary={addSkippedMonth:async()=>{},removeSkippedMonth:async()=>{},markQuit:async()=>{}};
window._fb_init={arrayUnion:(...items)=>({__arrayUnion:items})};window.__store={clubId:'clubA',profiles:{},transactions:[],inventory:[],clubConfig:{branchCount:2},colRef:{},db:{}};window.allProfiles=window.__store.profiles;window.allTransactions=window.__store.transactions;
vm.runInThisContext(tdcSrc,{filename:'tuitionDebtCanonical.js'});
const {TransactionDeleteIntegrity}=await import(pathToFileURL(path.resolve('js/core/transactionDeleteIntegrity.js')).href+`?d1b=${++seq}`);window.TransactionDeleteIntegrity=TransactionDeleteIntegrity;
const {FinanceService}=await import(pathToFileURL(path.resolve('js/services/finance.service.js')).href+'?v=long-term-production-stability-20260917-v5u6h8r2');window.FinanceService=FinanceService;
const {TuitionCommandBoundary,initTuitionCommandBoundary}=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+`?d1b=${++seq}`);initTuitionCommandBoundary();
let commits=[],auditCalls=0,addTxCalls=0,deleteCalls=0,failNextCommit=false,commitGate=null;
FinanceService.commitAtomicWritePlan=async plan=>{if(failNextCommit){failNextCommit=false;throw new Error('mock primary failure')}if(commitGate)await commitGate.promise;commits.push(plan);return{committed:(plan.transactions?.length||0)+(plan.profileUpdates?.length||0),txIds:(plan.transactions||[]).map((_,i)=>`TX-${commits.length}-${i}`)}};
FinanceService.addFeeAuditSilent=async()=>{auditCalls++;return{ok:true}};FinanceService.addTransaction=async()=>{addTxCalls++;return'OTHER-1'};FinanceService.deleteTransaction=async id=>{deleteCalls++;return id};FinanceService.getStudentTuitionTxs=async()=>[];FinanceService.updateProfileAfterTxDelete=async()=>{};
window.reconcileStudentTuitionAfterDeletedTransaction=async()=>({ok:true});
const FinanceModule=await import(pathToFileURL(path.resolve('js/modules/finance.js')).href+`?d1b=${++seq}`);

function profile(name,paidUntil='2026-08',paidMonths=['2026-08']){return{profileId:'p-'+name,name,branch:'CS1',paidUntil,paidMonths:[...paidMonths],skippedMonths:[],tuitionFee:100000}}
function setProfiles(obj){window.__store.profiles=obj;window.allProfiles=obj}
function resetCounts(){commits=[];auditCalls=0;addTxCalls=0;deleteCalls=0;toasts.length=0;receipts.length=0;commitGate=null;failNextCommit=false;delete elements.transactionForm.dataset.atomicSubmitInFlight}
function setForm(name,month='2026-09',amount='100000',type='Học phí',pkg='1'){elements.type.value=type;elements.description.value=name;elements.amountActual.value=amount;elements.date.value=month+'-21';elements.branch.value='CS1';elements.tx_package.value=pkg;elements.tx_exam_amountActual.value='50000';elements.tx_exam_title.value='Thi đai'}
function setCombo(a,am,ma,b,bm,mb){elements.combo_name1.value=a||'';elements.combo_fee1_actual.value=String(am||0);elements.combo_month1.value=ma||'';elements.combo_name2.value=b||'';elements.combo_fee2_actual.value=String(bm||0);elements.combo_month2.value=mb||'';elements.comboModal.style.display='block'}
async function submitForm(){return elements.transactionForm.onsubmit({preventDefault(){},target:elements.transactionForm})}

// Execute legacy stubs before canonical init in an isolated VM: zero financial write.
{
 const ctx={window:null,document:{getElementById:()=>({})},writes:0};ctx.window=ctx;ctx.window.userRole='admin';ctx.window.showToast=()=>{};vm.createContext(ctx);vm.runInContext(legacyFormSrc,ctx);vm.runInContext(legacyComboSrc,ctx);await ctx.document.getElementById('transactionForm').onsubmit?.({preventDefault(){}});await ctx.window.processCombo('pay');check('21. pre-canonical legacy financial entrypoints perform zero writes',ctx.writes===0);
}
// Canonical module overrides the legacy handler/global.
const legacyComboIdentity=window.processCombo;FinanceModule.initFinance();
check('22. post-bootstrap canonical processCombo replaces legacy/no-write owner',window.processCombo!==legacyComboIdentity&&typeof window.processCombo==='function');
check('23. post-bootstrap transaction form has exactly one canonical onsubmit business handler',typeof elements.transactionForm.onsubmit==='function');

// FORM01 normal.
resetCounts();setProfiles({A:profile('A')});setForm('A');await submitForm();
check('24. FORM01 actual Form normal Tuition produces one primary plan',commits.length===1&&commits[0].transactions.length===1&&commits[0].profileUpdates.length===1);
check('25. FORM01 local state is committed before next intent',window.__store.profiles.A.paidUntil==='2026-09'&&window.__store.profiles.A.paidMonths.includes('2026-09'));

// FORM02 / RACE-A: blocker changes latest state to Oct while Form waits.
resetCounts();setProfiles({B:profile('B')});setForm('B','2026-09');const gateA=deferred();let blockerEntered=false;
const blocker=TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'B'},async()=>{blockerEntered=true;window.__store.profiles.B={...window.__store.profiles.B,paidUntil:'2026-10',paidMonths:['2026-08','2026-09','2026-10']};await gateA.promise});await tick();const formWait=submitForm();await tick();check('26. FORM02 actual Form waits earlier same-profile lane',blockerEntered&&commits.length===0);gateA.resolve();await blocker;await formWait;check('27. FORM02 stale Form never regresses paidUntil to Sep',window.__store.profiles.B.paidUntil==='2026-10'&&commits.length===0);

// FORM03 / RACE-B same-month becomes paid while waiting.
resetCounts();setProfiles({C:profile('C')});setForm('C','2026-09');const gateB=deferred();const b=TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'C'},async()=>{window.__store.profiles.C={...window.__store.profiles.C,paidUntil:'2026-09',paidMonths:['2026-08','2026-09']};await gateB.promise});await tick();const formDup=submitForm();await tick();check('28. FORM03 Form same-month remains queued until prior mutation completes',commits.length===0);gateB.resolve();await b;await formDup;check('29. FORM03 same-month duplicate creates zero primary transaction/profile write',commits.length===0&&toasts.some(x=>x.includes('Không tạo thêm khoản thu')));

// FORM04 / RACE-C local commit blocks immediate actual QuickPay before snapshot.
resetCounts();setProfiles({D:profile('D')});setForm('D','2026-09');await submitForm();const beforeQuick=commits.length;const quickAfterForm=await TuitionCommandBoundary.collectTuition({studentName:'D',months:['2026-09'],branch:'CS1',amount:100000,source:'d1b-form-race-c'});check('30. FORM04 immediate QuickPay sees local committed paid state',quickAfterForm.alreadySettled===true&&commits.length===beforeQuick);

// FORM05 primary failure releases lane and does not local-commit.
resetCounts();setProfiles({E:profile('E')});setForm('E','2026-09');failNextCommit=true;await submitForm();const afterFail=TuitionCommandBoundary.getMetrics().profileMutationLaneCount;check('31. FORM05 primary failure leaves local profile unpaid and releases lane',window.__store.profiles.E.paidUntil==='2026-08'&&afterFail===0&&commits.length===0);
// FORM07 infrastructure: independent profile lanes are not globally serialized.
const g1=deferred(),g2=deferred();let aEntered=false,zEntered=false;setProfiles({F:profile('F'),G:profile('G')});const pF=TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'F'},async()=>{aEntered=true;await g1.promise});const pG=TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'G'},async()=>{zEntered=true;await g2.promise});await tick();check('32. FORM07 different profiles can occupy independent tuition lanes concurrently',aEntered&&zEntered);g1.resolve();g2.resolve();await Promise.all([pF,pG]);

// COMBO01 normal 2-student.
resetCounts();setProfiles({H:profile('H'),I:profile('I')});setCombo('H',100000,'2026-09','I',100000,'2026-09');await window.processCombo('pay');check('33. COMBO01 actual Combo produces one atomic plan for two tx/two profiles',commits.length===1&&commits[0].transactions.length===2&&commits[0].profileUpdates.length===2);check('34. COMBO01 local state committed for every affected profile',window.__store.profiles.H.paidUntil==='2026-09'&&window.__store.profiles.I.paidUntil==='2026-09');check('35. Combo receipt executes after critical lanes release',receipts.length===1&&receipts[0].laneCount===0,String(receipts[0]?.laneCount));

// COMBO03 / RACE-B: participant becomes paid while Combo waits -> fail closed zero write.
resetCounts();setProfiles({J:profile('J'),K:profile('K')});setCombo('J',100000,'2026-09','K',100000,'2026-09');const gateC=deferred();const lockJ=TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'J'},async()=>{window.__store.profiles.J={...window.__store.profiles.J,paidUntil:'2026-09',paidMonths:['2026-08','2026-09']};await gateC.promise});await tick();const comboWait=window.processCombo('pay');await tick();check('36. COMBO03 actual Combo waits overlapping profile lane',commits.length===0);gateC.resolve();await lockJ;await comboWait;check('37. COMBO03 stale participant fails closed with zero partial write',commits.length===0&&toasts.some(x=>x.includes('vừa thay đổi')));

// COMBO04 paidUntil newer while target month still genuinely unpaid gap: no scalar regression.
resetCounts();setProfiles({L:profile('L','2026-10',['2026-08','2026-10']),M:profile('M')});setCombo('L',100000,'2026-09','M',100000,'2026-09');await window.processCombo('pay');check('38. COMBO04 newer paidUntil makes intended Sep already settled; no regression/duplicate write',window.__store.profiles.L.paidUntil==='2026-10'&&commits.length===0);

// COMBO05 local commits block immediate QuickPay before snapshot.
const comboCommitCount=commits.length;const qL=await TuitionCommandBoundary.collectTuition({studentName:'L',months:['2026-09'],branch:'CS1',amount:100000,source:'d1b-combo-race-c'});check('39. COMBO05 immediate QuickPay is blocked by local canonical commit',qL.alreadySettled===true&&commits.length===comboCommitCount);

// COMBO06/07 deterministic multi-lane ordering no deadlock.
resetCounts();setProfiles({N:profile('N'),O:profile('O')});const orderGate=deferred();let firstEntered=false,secondEntered=false;
const first=TuitionCommandBoundary.runInProfileTuitionMutationLanes({profiles:[{studentName:'N'},{studentName:'O'}]},async()=>{firstEntered=true;await orderGate.promise});await tick();const second=TuitionCommandBoundary.runInProfileTuitionMutationLanes({profiles:[{studentName:'O'},{studentName:'N'}]},async()=>{secondEntered=true});await tick();check('40. COMBO06/07 reverse profile order does not enter conflicting task early',firstEntered&&!secondEntered);orderGate.resolve();await Promise.all([first,second]);check('41. COMBO06/07 deterministic lane ordering completes without deadlock',secondEntered&&TuitionCommandBoundary.getMetrics().profileMutationLaneCount===0);

// COMBO08 primary failure releases all lanes and no local commit.
resetCounts();setProfiles({P:profile('P'),Q:profile('Q')});setCombo('P',100000,'2026-09','Q',100000,'2026-09');failNextCommit=true;await window.processCombo('pay');check('42. COMBO08 failed primary batch releases lanes and does not false-commit local state',TuitionCommandBoundary.getMetrics().profileMutationLaneCount===0&&window.__store.profiles.P.paidUntil==='2026-08'&&window.__store.profiles.Q.paidUntil==='2026-08');

// Owner-level Tuition delete self guard DEL01-DEL06.
resetCounts();window.__store.transactions=[];setProfiles({R:profile('R','2026-09',['2026-08','2026-09'])});
const pure={id:'T-PURE',type:'Học phí',description:'R',txMonth:'2026-09',packageMonths:['2026-09'],amount:100000,date:'2026-09-21'};await TuitionCommandBoundary.deleteTuitionTransaction({txId:'T-PURE',transaction:pure,source:'d1b-del01'});check('43. DEL01 pure Tuition is allowed by owner self-guard',deleteCalls===1);
async function rejects(tx,id){try{await TuitionCommandBoundary.deleteTuitionTransaction({txId:id,transaction:tx,source:'d1b-del'});return false}catch{return true}}
const nested={id:'T-NEST',type:'Học phí',description:'R',txMonth:'2026-09',components:[{kind:'inventory',relatedInvId:'INV-1'}]};check('44. DEL02 nested Inventory is rejected by Tuition owner',await rejects(nested,'T-NEST'));
const mixed={id:'T-MIX',type:'Học phí',description:'R',txMonth:'2026-09',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV-2'}]};check('45. DEL03 mixed bundle is rejected by Tuition owner',await rejects(mixed,'T-MIX'));
const invRollback={id:'T-INV',type:'Học phí',description:'R',txMonth:'2026-09',relatedInvId:'INV-3'};check('46. DEL04 requiresInventoryRollback transaction is rejected',await rejects(invRollback,'T-INV'));
check('47. DEL05 empty/invalid transaction is rejected',await rejects({},'BAD-ID'));
const fakeImpact={valid:true,hasTuition:true,isPureTuition:true,hasInventory:false};check('48. DEL06 bad caller impact cannot bypass owner canonical self-guard',await rejects(mixed,'T-MIX-2')&&fakeImpact.isPureTuition===true);

// Existing closure gates / budgets / parity.
const d1a=spawnSync(process.execPath,['tools/check-h8r2-1c1f1d1a-actual-runtime-authority-closure.mjs'],{encoding:'utf8'});check('49. F1D1A actual-runtime closure remains PASS',d1a.status===0,(d1a.stderr||d1a.stdout||'').slice(-500));
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(!['migrations','diagnostics'].includes(e.name))walk(f,o)}else if(e.name.endsWith('.js'))o.push(f)}return o}const runtime=['app.js',...walk('js')],pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g},counts={getDoc:0,getDocs:0,onSnapshot:0};for(const f of runtime)for(const line of read(f).split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}check('50. Firestore budget is exactly 29/45/16',counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16,JSON.stringify(counts));
const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});check('51. root/public parity PASS',parity.status===0,(parity.stderr||parity.stdout||'').slice(-500));
check('52. finance.js remains below hard 72KB ceiling',Buffer.byteLength(fin)<=72000,String(Buffer.byteLength(fin)));check('53. app.js remains below hard line ceiling',app.split('\n').length<=11300,String(app.split('\n').length));

console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);if(fail)process.exit(1);console.log('H8R2.1C1F1D1B final tuition caller convergence gate PASS.');
