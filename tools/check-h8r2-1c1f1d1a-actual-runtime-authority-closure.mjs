import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const read=f=>fs.readFileSync(f,'utf8'); let pass=0,fail=0,seq=0;
function check(name,ok,detail=''){if(ok){pass++;console.log('✅',name)}else{fail++;console.error('❌',name,detail)}}
const app=read('app.js'), fin=read('js/modules/finance.js'), tcb=read('js/core/tuitionCommandBoundary.js'), tdc=read('js/core/tuitionDebtCanonical.js'), tdiSrc=read('js/core/transactionDeleteIntegrity.js'), invR=read('js/ui/render/computation/inventoryRenderer.js'), invS=read('js/services/inventory.service.js'), finS=read('js/services/finance.service.js');

function extractAssignment(src,marker){const start=src.indexOf(marker);if(start<0)throw new Error('marker missing '+marker);const brace=src.indexOf('{',start);let depth=0,state='code',quote='';for(let i=brace;i<src.length;i++){const c=src[i],n=src[i+1];if(state==='line'){if(c==='\n')state='code';continue}if(state==='block'){if(c==='*'&&n==='/'){state='code';i++}continue}if(state==='str'){if(c==='\\'){i++;continue}if(c===quote)state='code';continue}if(state==='template'){if(c==='\\'){i++;continue}if(c==='`'){state='code';continue}}if(state==='code'){if(c==='/'&&n==='/'){state='line';i++;continue}if(c==='/'&&n==='*'){state='block';i++;continue}if(c==='"'||c==="'"){state='str';quote=c;continue}if(c==='`'){state='template';continue}}if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0){const semi=src.indexOf(';',i);return src.slice(start,semi+1)}}}throw new Error('unterminated '+marker)}
const actualMultiItemSource=extractAssignment(app,'window.processMultiItem = async (action) => {');

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};const tick=()=>new Promise(r=>setTimeout(r,0));
function el(value='',checked=false,attrs={}){return{value,checked,style:{},getAttribute:k=>attrs[k]??null}}
function laneOwnerFor(ctx){const lanes=new Map();return{async runInProfileTuitionMutationLane(meta,task){const key='clubA|'+String(meta.profileId||meta.studentName||'');const prev=lanes.get(key)||Promise.resolve();let current;current=prev.catch(()=>{}).then(task);lanes.set(key,current);try{return await current}finally{if(lanes.get(key)===current)lanes.delete(key)}},commitLocalTuitionPaymentState({studentName,paidUntil,paidMonths}){const p=ctx.allProfiles[studentName];p.paidUntil=paidUntil;p.paidMonths=[...new Set([...(p.paidMonths||[]),...(paidMonths||[])])];return p},get laneCount(){return lanes.size}}}
function buildActualMultiHarness(opts={}){
 const elements={mi_name:el(opts.name??'A'),branch:el('CS1'),mi_tuition_month:el(opts.month??'2026-09'),mi_tuition_pkg:el(String(opts.pkg??1),false,{'data-months':opts.month??'2026-09'}),mi_tuition_actual:el(String(opts.tuition??100000)),mi_exam_toggle:el('',!!opts.exam),mi_exam_title:el('Lệ phí thi'),mi_exam_actual:el(opts.exam?'50000':'0'),mi_other_toggle:el('',!!opts.other),mi_other_desc:el('Thu khác'),mi_other_actual:el(opts.other?'50000':'0'),mi_inv_toggle:el('',!!opts.inv),mi_inv_category:el('Võ phục'),mi_inv_size_select:el(opts.inv?'Size 1m6':''),mi_inv_size_text:el(''),mi_inv_qty:el('1'),mi_inv_price_actual:el(opts.inv?'200000':'0'),mi_inv_total_actual:el(opts.inv?'200000':'0'),mi_tuition_enabled:el('',opts.tuitionEnabled!==false),multiItemModal:{style:{display:'block'}}};
 const profile={profileId:'pA',name:'A',branch:'CS1',paidUntil:opts.paidUntil??'2026-08',paidMonths:[...(opts.paidMonths??['2026-08'])],skippedMonths:[],belt:'Đai trắng'};const profiles=opts.validProfile===false?{}:{A:profile};
 const alerts=[],toasts=[],receipts=[],ops=[];let commits=0;let commitGate=opts.commitGate||null;
 const ctx={console,Date,Math,Number,String,Array,Object,Set,Map,Promise,Error,alert:m=>alerts.push(String(m)),confirm:()=>true,document:{getElementById:id=>elements[id]||el(''),querySelectorAll:()=>[]},allProfiles:profiles,allTransactions:[],allInventory:[],currentClubId:'clubA',db:{},colRef:{kind:'txcol'},getLocalToday:()=> '2026-09-21',normalizeYYYYMM:v=>/^\d{4}-\d{2}/.test(String(v||''))?String(v).slice(0,7):'',arrayUnion:(...x)=>({__arrayUnion:x}),doc:(...a)=>a.length===1?{id:'tx-'+(commits+1)}:{path:a.slice(1).join('/'),id:String(a.at(-1)||'')},writeBatch:()=>({update:(...a)=>ops.push(['update',...a]),set:(...a)=>ops.push(['set',...a]),delete:(...a)=>ops.push(['delete',...a]),commit:async()=>{commits++;if(commitGate)await commitGate.promise}}),_canonicalTxPayload:x=>x};
 ctx.window=ctx;ctx.window.userRole='admin';ctx.window.__store={profiles,inventory:[],transactions:[]};ctx.window.allProfiles=profiles;ctx.window.showToast=m=>toasts.push(String(m));ctx.window.guardFinancialWriteIntent=()=>true;ctx.window.isFinancialWriteAllowed=r=>r===true||r?.ok===true;ctx.window.recordFinancialActionAudit=()=>{};ctx.window.buildMultiItemTuitionPackageMonths=(start,pkg)=>{const out=[];let[y,m]=start.split('-').map(Number);for(let i=0;i<pkg;i++){let mm=m+i,yy=y;while(mm>12){mm-=12;yy++}out.push(`${yy}-${String(mm).padStart(2,'0')}`)}return{months:out}};ctx.window.formatTuitionMonthList=a=>a.join(',');ctx.window.formatMonthCompact=s=>s;ctx.window.formatMonth=m=>m;ctx.window.ProfileCanonicalStore={resolveDisplayName:(n,p)=>p.name||n};ctx.window.buildPaymentBundleTransaction=o=>({id:'',type:o.components.some(c=>c.kind==='tuition')?'Học phí':'Thu khác',description:o.studentName,studentName:o.studentName,profileId:o.profileId,branch:o.branch,date:o.date,txMonth:o.refMonth,amount:o.components.reduce((s,c)=>s+Number(c.amount||0),0),paymentKind:'bundle',components:o.components,packageMonths:o.components.find(c=>c.kind==='tuition')?.packageMonths||[]});ctx.window.resolveInventoryDebtIdentity=()=>({profileId:'pA'});ctx.window.InventoryService={prepareAddItemMutation:p=>({itemRef:{id:'INV-1'},payload:p,statsRef:{id:'stats'},summaryPatch:{},runtimeItem:{id:'INV-1',...p}}),prepareMarkPaidPatch:o=>o};ctx.window.mergeInventoryIntoRuntimeStore=()=>{};ctx.window.notifyInventoryMutation=()=>{};ctx.window.mergeTransactionIntoRuntimeStore=(tx)=>ctx.window.__store.transactions.push(tx);ctx.window.exportReceipt=async(...a)=>{receipts.push(a);return{ok:true}};
 vm.createContext(ctx);vm.runInContext(tdc,ctx,{filename:'tuitionDebtCanonical.js'});ctx.window.TuitionCommandBoundary=laneOwnerFor(ctx);vm.runInContext(actualMultiItemSource,ctx,{filename:'app.js#actual-processMultiItem'});
 return{ctx,elements,alerts,toasts,receipts,ops,get commits(){return commits},setCommitGate:g=>commitGate=g};
}
async function runActual(opts={}){const h=buildActualMultiHarness(opts);await h.ctx.window.processMultiItem('pay');return h}

// Static authority assertions.
check('1. actual processMultiItem source is loaded from app.js',actualMultiItemSource.includes('window.processMultiItem = async'));
check('2. processMultiItem profile binding is reassignable (P1 crash fix)',/let profile = allProfiles\[name\]/.test(actualMultiItemSource)&&!/const profile = allProfiles\[name\]/.test(actualMultiItemSource));
check('3. Tuition MultiItem calls existing profile lane',/TuitionCommandBoundary[\s\S]*runInProfileTuitionMutationLane/.test(actualMultiItemSource));
check('4. profile is re-resolved inside primary lane task',/const latestProfiles=[\s\S]*latestProfile=[\s\S]*profile=latestProfile/.test(actualMultiItemSource));
check('5. settlement recheck occurs in actual handler',/areTuitionMonthsSettled\(latestProfile,latestMonths/.test(actualMultiItemSource));
check('6. paidUntil reconciliation uses canonical helper inside actual handler',/reconcilePaidUntilFromMonthEvidence\(latestProfile/.test(actualMultiItemSource));
check('7. processMultiItem remains its existing batch writer',/const _batch = writeBatch\(db\)/.test(actualMultiItemSource)&&!(/collectTuition\s*\(/.test(actualMultiItemSource)));
check('8. receipt remains after lane result',actualMultiItemSource.indexOf('runInProfileTuitionMutationLane')<actualMultiItemSource.indexOf('await window.exportReceipt'));
check('9. one profileMutationLanes Map definition',((app+fin+tcb).match(/profileMutationLanes\s*=\s*new Map\s*\(/g)||[]).length===1);
check('10. one canonical settlement function definition',((tdc.match(/function reconcilePaidUntilFromMonthEvidence\s*\(/g)||[]).length===1));
check('11. TransactionDeleteIntegrity is relation classifier owner',/extractInventoryRefsFromTransaction/.test(tdiSrc)&&/analyzeTransactionDeleteImpact/.test(tdiSrc));
check('12. active renderer imports canonical TDI',/import \{ TransactionDeleteIntegrity \} from .*transactionDeleteIntegrity/.test(invR));
check('13. active renderer does not independently map tx.relatedInvId',!(/if \(tx\.relatedInvId\) relatedTxByInvId/.test(invR)));
check('14. no renderer emits literal undefined transaction intent',!app.includes("deleteTx('undefined'")&&!invR.includes("deleteTx('undefined'"));
check('15. finance coordinator normalizes invalid tx identity before routing',/validTxId=.*txId!==['"]undefined['"].*txId!==['"]null['"]/.test(fin));
check('16. InventoryService remains mutation owner',/window\.InventoryService\.deleteItem/.test(fin)&&/async deleteItem\(invId/.test(invS));
check('17. FinanceService retains transaction mutation owner',/async deleteTransaction\(txId/.test(finS));
check('18. no second inventory rollback service/owner introduced',!/InventoryRollbackService|SecondInventoryWriter|deleteInventoryFromRenderer/.test(app+fin+invR+tdiSrc));
check('19. no second Tuition writer introduced',!/SecondTuitionWriter|MultiItemTuitionWriter/.test(app+fin+tcb));
check('20. finance.js remains within hard size ceiling',Buffer.byteLength(fin)<=72000,String(Buffer.byteLength(fin)));
check('21. app.js remains within line ceiling',app.split('\n').length<=11300,String(app.split('\n').length));

// ACT01-ACT04 execute exact handler source from production app.js.
{
 const h=await runActual();check('22. ACT01 actual Tuition-only handler no const reassignment crash',h.commits===1&&!h.alerts.some(x=>/Assignment to constant variable/.test(x)),JSON.stringify(h.alerts));check('23. ACT01 one primary batch + one Tuition lane',h.commits===1&&h.ctx.window.TuitionCommandBoundary.laneCount===0);
 const m=await runActual({inv:true});check('24. ACT02 actual Tuition+Inventory handler preserves atomic primary commit',m.commits===1&&m.ops.filter(x=>x[0]==='set').length>=2,String(m.ops.length));
 const n=await runActual({tuitionEnabled:false,tuition:0,month:'',other:true});check('25. ACT03 no-Tuition handler commits without Tuition mutation state',n.commits===1&&n.ctx.allProfiles.A.paidUntil==='2026-08');
 const bad=await runActual({name:'',validProfile:false});check('26. ACT04 invalid input fails safely with zero writes',bad.commits===0&&bad.alerts.length===1,JSON.stringify(bad.alerts));
}

// Actual-handler race tests: production handler + canonical settlement, shared profile lane dependency.
{
 const qGate=deferred(), h=buildActualMultiHarness();let quickDone=false,multiDone=false;
 const quick=h.ctx.window.TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'A',profileId:'pA'},async()=>{h.ctx.allProfiles.A.paidUntil='2026-10';h.ctx.allProfiles.A.paidMonths=['2026-08','2026-09','2026-10'];await qGate.promise;quickDone=true});
 await tick();const multi=h.ctx.window.processMultiItem('pay').then(()=>{multiDone=true});await tick();check('27. actual MultiItem waits an earlier same-profile Tuition mutation',!multiDone&&h.commits===0);qGate.resolve();await quick;await multi;check('28. stale MultiItem cannot regress newer paidUntil',h.ctx.allProfiles.A.paidUntil==='2026-10'&&h.commits===0,String(h.ctx.allProfiles.A.paidUntil));
}
{
 const commitGate=deferred(),h=buildActualMultiHarness({commitGate});let qDone=false;const multi=h.ctx.window.processMultiItem('pay');await tick();const q=h.ctx.window.TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'A',profileId:'pA'},async()=>{h.ctx.allProfiles.A.paidUntil='2026-10';h.ctx.allProfiles.A.paidMonths=[...new Set([...(h.ctx.allProfiles.A.paidMonths||[]),'2026-10'])];qDone=true});await tick();check('29. QuickPay-side mutation waits actual pending MultiItem critical lane',!qDone&&h.commits===1);commitGate.resolve();await multi;await q;check('30. reverse race final state is latest and lane releases',qDone&&h.ctx.allProfiles.A.paidUntil==='2026-10'&&h.ctx.window.TuitionCommandBoundary.laneCount===0);
}
{
 const qGate=deferred(),h=buildActualMultiHarness();let multiDone=false;const q=h.ctx.window.TuitionCommandBoundary.runInProfileTuitionMutationLane({studentName:'A',profileId:'pA'},async()=>{h.ctx.allProfiles.A.paidUntil='2026-09';h.ctx.allProfiles.A.paidMonths=['2026-08','2026-09'];await qGate.promise});await tick();const p=h.ctx.window.processMultiItem('pay').then(()=>{multiDone=true});await tick();check('31. same-month stale MultiItem waits lane',!multiDone&&h.commits===0);qGate.resolve();await q;await p;check('32. same-month stale MultiItem creates zero duplicate Tuition write',h.commits===0&&h.ctx.allProfiles.A.paidUntil==='2026-09');
}

// Actual TDI + actual renderer.
globalThis.window=globalThis;window.__store={_dataVersion:101,inventoryStats:{}};window.normalizeVNForSearch=s=>String(s||'').toLowerCase();globalThis.performance={now:()=>0};
const {TransactionDeleteIntegrity:TDI}=await import(pathToFileURL(path.resolve('js/core/transactionDeleteIntegrity.js')).href+`?d1a=${++seq}`);
const R=await import(pathToFileURL(path.resolve('js/ui/render/computation/inventoryRenderer.js')).href+`?d1a=${++seq}`);
const empty=TDI.analyzeTransactionDeleteImpact({});check('33. empty transaction impact fails closed',empty.valid===false&&empty.failClosed===true&&empty.safeToHardDelete===false,JSON.stringify(empty));
const nested={id:'TX-42',type:'Thu Võ phục',components:[{kind:'inventory',relatedInvId:'INV-42'}]};check('34. nested relatedInvId extracted by canonical owner',JSON.stringify(TDI.extractInventoryRefsFromTransaction(nested))==='["INV-42"]');
R.computeAndCacheInventory([{id:'INV-42',type:'Xuất bán',size:'Size 1m6',category:'Võ phục',desc:'A',amount:200000,date:'2026-09-21'}],[nested],{curTabId:'inventory',isAdmin:true,invCats:['Võ phục'],catOrder:{'Võ phục':0}});let html=R.getInventoryCachedHtml('uniformTxRows');check('35. actual renderer maps nested inventory relation to real tx id',html.includes("deleteTx('TX-42', 'INV-42')"),html.match(/deleteTx\([^)]*\)/)?.[0]||'');
R.invalidateInventoryRender('all');window.__store._dataVersion=102;R.computeAndCacheInventory([{id:'INV-43',type:'Nhập kho',size:'Size 1m6',category:'Võ phục',desc:'Nhập',amount:0,date:'2026-09-21'}],[],{curTabId:'inventory',isAdmin:true,invCats:['Võ phục'],catOrder:{'Võ phục':0}});html=R.getInventoryCachedHtml('uniformTxRows');check('36. no-Finance inventory row emits explicit blank-id intent, never undefined',html.includes("deleteTx('', 'INV-43')")&&!html.includes("deleteTx('undefined'"));

// Actual finance coordinator with service I/O mocked, handler itself unmodified.
window.location={hostname:'example.com'};globalThis.document={getElementById:()=>null};globalThis.confirm=()=>true;const alerts=[];globalThis.alert=m=>alerts.push(String(m));window.userRole='admin';window.showToast=()=>{};window.guardFinancialWriteIntent=()=>true;window.isFinancialWriteAllowed=r=>r===true||r?.ok===true;window.recordFinancialActionAudit=()=>{};window.invalidateDashboard=()=>{};window.invalidateList=()=>{};window.getCurrentActiveTabId=()=> 'inventory';window.StudentStatusCommandBoundary={addSkippedMonth:async()=>{},removeSkippedMonth:async()=>{},markQuit:async()=>{}};window.TransactionDeleteIntegrity=TDI;
const {FinanceService}=await import(pathToFileURL(path.resolve('js/services/finance.service.js')).href+`?d1a=${++seq}`);let financeDeletes=[];FinanceService.deleteTransaction=async id=>financeDeletes.push(id);let invDeletes=[];window.InventoryService={deleteItem:async(id,opt)=>{invDeletes.push({id,opt});return{deleted:true}}};
const F=await import(pathToFileURL(path.resolve('js/modules/finance.js')).href+`?d1a=${++seq}`);window.__store={transactions:[],inventory:[{id:'INV-1',type:'Nhập kho'}],profiles:{},clubId:'clubA'};window.allInventory=window.__store.inventory;F.initFinance();
let r=await window.deleteTx('', 'INV-1');check('37. inventory row without Finance tx routes only to existing InventoryService',r===true&&invDeletes.length===1&&financeDeletes.length===0);
alerts.length=0;invDeletes=[];window.__store.inventory=[{id:'INV-2',type:'Xuất bán',paymentBundleId:'B1'}];window.allInventory=window.__store.inventory;r=await window.deleteTx('', 'INV-2');check('38. unresolved protected Inventory linkage fails closed',r===false&&invDeletes.length===0&&financeDeletes.length===0);
alerts.length=0;invDeletes=[];window.__store.transactions=[nested];window.__store.inventory=[{id:'INV-42',type:'Xuất bán'}];window.allInventory=window.__store.inventory;r=await window.deleteTx('TX-42','INV-42');check('39. actual coordinator nested-linked pure Inventory uses canonical Inventory owner',r===true&&invDeletes.length===1&&invDeletes[0].opt.relatedTxId==='TX-42'&&financeDeletes.length===0);
alerts.length=0;invDeletes=[];window.__store.transactions=[{id:'MIX-1',type:'Học phí',paymentKind:'bundle',txMonth:'2026-09',components:[{kind:'tuition',txMonth:'2026-09'},{kind:'inventory',relatedInvId:'INV-M'}]}];window.__store.inventory=[{id:'INV-M',type:'Xuất bán'}];window.allInventory=window.__store.inventory;r=await window.deleteTx('MIX-1','INV-M');check('40. mixed Tuition+Inventory remains fail-closed before destructive write',r===false&&invDeletes.length===0&&financeDeletes.length===0);
alerts.length=0;r=await window.deleteTx('undefined','');check('41. invalid transaction identity never reaches FinanceService',r===false&&financeDeletes.length===0);

// Existing behavioral closure must remain green.
const oldGate=spawnSync(process.execPath,['tools/check-h8r2-1c1f1d1-multiitem-inventory-closure.mjs'],{encoding:'utf8'});check('42. F1D1 behavioral gate preserved',oldGate.status===0,(oldGate.stderr||oldGate.stdout||'').slice(-500));
check('43. F1C replay protection source preserved',/completedReplayAfterLane:\s*true/.test(tcb)&&/monthsActuallyRemoved/.test(tdc));
check('44. receipt queue preserved',/let _receiptRenderQueue = Promise\.resolve\(\)/.test(app));
check('45. fee_audit remains secondary',/void _service\(\)\.addFeeAuditSilent/.test(tcb));

function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()){if(!['migrations','diagnostics'].includes(e.name))walk(f,o)}else if(e.name.endsWith('.js'))o.push(f)}return o}
const runtime=['app.js',...walk('js')],pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g},counts={getDoc:0,getDocs:0,onSnapshot:0};for(const f of runtime)for(const line of read(f).split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}
check('46. Firestore budget remains exactly 29/45/16',counts.getDoc===29&&counts.getDocs===45&&counts.onSnapshot===16,JSON.stringify(counts));
const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});check('47. root/public parity PASS',parity.status===0,(parity.stderr||parity.stdout||'').slice(-500));
const pkg=JSON.parse(read('package.json'));const rel=String(pkg.scripts?.['check:release']||'');check('48. F1D1A release wiring exactly once',(rel.match(/check:h8r2-1c1f1d1a/g)||[]).length===1);

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);if(fail)process.exit(1);console.log('H8R2.1C1F1D1A actual runtime authority closure gate PASS.');
