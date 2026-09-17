#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const financeModule = read('js/modules/finance.js');
const attendanceServiceSrc = read('js/services/attendance.service.js');
const attendanceModule = read('js/modules/attendance.js');
const financeServiceSrc = read('js/services/finance.service.js');
const tuitionBoundary = read('js/core/tuitionCommandBoundary.js');
const inventoryService = read('js/services/inventory.service.js');
const profiles = read('js/listeners/profiles.listeners.js');
const index = read('index.html');
const main = read('js/main.js');
const pkg = JSON.parse(read('package.json'));
const ok = [];
const fail = [];
function check(v, m, d='') { (v?ok:fail).push({m,d}); console.log(v?'✅':'❌', m, v||!d?'':`— ${d}`); }
function block(src, a, b) { const i=src.indexOf(a); if(i<0)return ''; const j=src.indexOf(b,i+a.length); return src.slice(i,j<0?src.length:j); }
function count(src,re){ return (src.match(re)||[]).length; }

console.log('\n🔎 H8R2.1 — Long-Term Production Stability + Residual Correctness Gate\n');

const txInit = financeModule.slice(financeModule.indexOf('export function initTransactionPagination()'));
check(!/curTab\s*===\s*['\"]tx['\"]\s*\|\|\s*document\.getElementById\(['\"]txList['\"]\)/.test(txInit) && txInit.includes('_isTransactionTabActuallyActive'), '1. Transaction pagination is not activated by hidden DOM existence');
check(txInit.includes("if (!_isTransactionTabActuallyActive())") && txInit.includes('_contextDirty'), '2. Hidden Transaction tab causes no pagination load and only marks local context dirty');
check(main.includes("ensureTransactionPaginationForActiveTab('switch-tab-tx')"), '2b. Existing tab activation hook starts pagination only on real Thu Chi activation');

const loadDay = block(attendanceServiceSrc, 'async loadByDate(date, options = {})', '// ── SAVE / DELETE ATTENDANCE');
check(loadDay.includes('while (true)') && loadDay.includes('startAfter(cursor)') && loadDay.includes('pageSize') && loadDay.includes('safetyCeiling'), '3. Attendance loadByDate owns bounded cursor pagination');
check(!/limit\s*\(\s*1200\s*\)|_lim\s*\(\s*1200\s*\)/.test(loadDay) && loadDay.includes("error.code = 'attendance/daily-coverage-incomplete'") && loadDay.includes('coverageComplete = false'), '4. Attendance daily cannot silently truncate at legacy 1200 limit');
const bulkSave = block(attendanceServiceSrc, 'async bulkSaveRecords(records, options = {})', '/**\n     * Đồng bộ dữ liệu offline');
check(bulkSave.includes('Math.min(400') && bulkSave.includes('for (let offset = 0; offset < rows.length; offset += chunkSize)'), '5. Attendance bulk writer chunks at <=400 inside the existing writer');
check(bulkSave.includes('onChunkCommitted') && bulkSave.includes('error.committedIds') && bulkSave.includes('error.pending'), '6. Attendance bulk exposes committed-chunk scoped cleanup/partial failure metadata');
const bulkUi = block(attendanceModule, 'window.bulkCheckIn = async', '// ── Offline sync');
check(bulkUi.includes('onChunkCommitted') && bulkUi.includes('_removeAttOfflineMutation') && !/finally\s*\{[^}]*removeItem/s.test(bulkUi), '6b. Attendance UI cleans only committed journal records, never the whole day in finally');

check(financeServiceSrc.includes('async commitAtomicWritePlan(plan = {})') && financeServiceSrc.includes('const SAFE_LIMIT = 400') && financeServiceSrc.includes('await batch.commit()'), '7. Existing FinanceService owns one safe atomic logical write plan');
const txForm = block(financeModule, 'transactionForm.onsubmit', '// ──');
check(txForm.includes('commitAtomicWritePlan') && !/await\s+FinanceService\.addTransaction[\s\S]*await\s+FinanceService\.updateStudentPayment/.test(txForm), '8. transactionForm no longer sequences independent primary tuition writes');
const comboModule = block(financeModule, 'window.processCombo = async', '// ──');
const comboLegacy = block(app, 'window.processCombo = async (action) =>', 'window.processBatchUpgrade');
check(comboModule.includes('commitAtomicWritePlan') && comboLegacy.includes('commitAtomicWritePlan'), '9. processCombo routes primary writes through existing atomic finance owner');
const multi = block(app, 'window.processMultiItem = async (action) =>', '// ─── Setup currency inputs');
check(multi.includes('writeBatch(db)') && multi.includes("_batch.set(_bundleDocRef") && !multi.includes('multi-item-tuition-fallback') && !multi.includes('await window.InventoryService.addItem'), '10. processMultiItem commits one logical primary batch and has no sequential fallback writer');
check(!/FinanceWriterV2|PaymentServiceV2|AtomicFinanceWriter/.test(app+financeModule+financeServiceSrc), '11. No new parallel financial writer authority introduced');
check(tuitionBoundary.includes('commitAtomicWritePlan') && tuitionBoundary.includes('addFeeAuditSilent'), '11b. TuitionCommandBoundary keeps canonical ownership; audit stays secondary');
check(inventoryService.includes('prepareAddItemMutation') && inventoryService.includes('async markPaid') && block(inventoryService,'async markPaid','async getCategories').includes('writeBatch'), '11c. Inventory existing owner exposes pure prepare primitive and atomic debt-payment linkage');

const quitLoad = block(profiles, 'export async function loadQuitProfilesIfNeeded', 'export async function ensureQuitProfilesComplete');
check(!quitLoad.includes('60000') && !quitLoad.includes('ageMs') && quitLoad.includes("_state.quitAuthorityState === 'dirty'") && quitLoad.includes("_state.quitAuthorityState === 'error'"), '12. Quit authority has no 60-second time-only full refresh');
check(quitLoad.includes('!dirty') && quitLoad.includes('_state.quitCompletenessReconciled') && quitLoad.includes('options.force === true'), '13. Quit full snapshot requires incomplete/dirty/error/explicit refresh semantics');
check(!/\bonSnapshot\s*\(|\bfbOnSnapshot\s*\(/.test(quitLoad), '14. Quit authority itself adds no listener; it reuses existing profile ownership');

const upgrade = block(app, 'window.processBatchUpgrade = async', 'window.downloadExcelTemplate');
const finish = block(app, 'window.finishExamSession = async', '// ─── Phase 4K-5B');
check(upgrade.includes('EXAM_CHUNK_SIZE = 400') && finish.includes('EXAM_CHUNK_SIZE = 400'), '15. Exam promotion/reset cannot exceed safe batch size');
check(upgrade.includes('belt: newBelt') && upgrade.includes('upgradedFrom: currentBelt') && upgrade.includes('examCommitted') && upgrade.includes('Có thể thử lại an toàn'), '16. Exam retry writes deterministic target state and reports committed/pending');

check(index.includes('BOOT_TIMEOUT_MS = 15000') && index.includes('__MAIN_BOOT_TIMEOUT') && index.includes('polling stopped') && index.includes('setTimeout(_loadMainWhenLegacyReady, 50)'), '17. Main bootstrap retry is bounded by a hard deadline');
check(!index.includes('setInterval(_syncMobileHeader,3000)') && index.includes("window.addEventListener('app:context-ready',_syncMobileHeader)"), '18. Permanent 3-second mobile-header interval removed; existing context event reused');
check(app.includes('function _legacyEscapeHtmlFailClosed') && !/window\.escapeHtml \|\| \([^)]*=>\s*(?:s|String\(v\s*\|\|\s*['\"]['\"]\))/.test(app), '19. User text has fail-closed escaping instead of raw identity fallback');

function walkJs(dir,out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const f=path.join(dir,e.name); if(e.isDirectory()){ if(['migrations','diagnostics'].includes(e.name))continue; walkJs(f,out);} else if(e.name.endsWith('.js')) out.push(f);} return out; }
const runtimeFiles=[path.join(root,'app.js'),...walkJs(path.join(root,'js'))];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtimeFiles){ const src=fs.readFileSync(f,'utf8'); for(const line of src.split('\n')){ const t=line.trim(); if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue; for(const [k,re] of Object.entries(pats)){ re.lastIndex=0; if(re.test(line))counts[k]++; } } }
check(counts.getDoc<=29 && counts.getDocs<=51 && counts.onSnapshot<=16, `20. Firestore static budget unchanged (${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot} <= 29/51/16)`);

// Dynamic scale checks use deterministic SDK fakes; no Firebase/network access.
globalThis.window = globalThis.window || {};
window.__store = { db:{}, clubId:'club-test' };
window.userRole='admin';
window.RoleReadBoundary={ canMount(){return true;}, isCoachAttendanceOnly(){return false;} };
window.__scaleConfig={ attendanceDailyPageSize:400, attendanceDailySafetyCeiling:10000 };
let pageCall=0;
const totalRows=1501;
const docs=Array.from({length:totalRows},(_,i)=>({id:'r'+i,data:()=>({profileId:'p'+i,date:'2026-09-17',branch:'CS1',shiftId:'morning'})}));
window._fb_init={
  collection:(...a)=>({kind:'col',a}), where:(...a)=>({kind:'where',a}), limit:n=>({kind:'limit',n}), startAfter:c=>({kind:'cursor',c}), query:(...a)=>({a}),
  getDocs:async(q)=>{ const start=pageCall*400; pageCall++; const arr=docs.slice(start,start+400); return {size:arr.length,docs:arr,forEach(fn){arr.forEach(fn);}}; },
  writeBatch:()=>{ const ops=[]; return {set(...a){ops.push(['set',...a]);},delete(...a){ops.push(['delete',...a]);},async commit(){return true;}}; },
  doc:(...a)=>({id:String(a[a.length-1]||'auto'),a})
};
const {AttendanceService}=await import(pathToFileURL(path.join(root,'js/services/attendance.service.js')).href+'?h8r2='+Date.now());
const rows1501=await AttendanceService.loadByDate('2026-09-17',{branch:'CS1',shiftId:'morning',requireShift:true,isCurrent:()=>true});
check(rows1501.length===1501 && rows1501.coverageComplete===true && pageCall===4, 'B6 dynamic: 1501 daily records load completely across 4 pages');
let commits=0;
window._fb_init.writeBatch=()=>{ const ops=[]; return {set(...a){ops.push(a);}, async commit(){commits++; if(commits===2) throw Object.assign(new Error('injected chunk2 failure'),{code:'unavailable'});}}; };
const bulkRows=Array.from({length:1001},(_,i)=>({docId:'d'+i,data:{profileId:'p'+i,name:'p'+i,branch:'CS1',date:'2026-09-17',month:'2026-09',status:1}}));
let partial=null;
try { await AttendanceService.bulkSaveRecords(bulkRows,{chunkSize:400}); } catch(e){ partial=e; }
check(partial && partial.committed===400 && partial.pending===601 && commits===2, 'B10 dynamic: injected chunk-2 failure reports 400 committed / 601 pending without false all-success');

// H8R2.1 residual correctness assertions 28..39.
const paidPatchBlock = block(inventoryService, 'prepareMarkPaidPatch(', '/**\n     * Thêm một bản ghi kho mới');
const { InventoryService } = await import(pathToFileURL(path.join(root,'js/services/inventory.service.js')).href+'?h8r21inv='+Date.now());
const { isActiveInventoryDebt } = await import(pathToFileURL(path.join(root,'js/data/inventoryStore.js')).href+'?h8r21debt='+Date.now());
window.getLocalToday = () => '2026-09-17';
const canonicalPaidPatch = InventoryService.prepareMarkPaidPatch({
  txId:'bundle-1', paymentBundleId:'bundle-1', paidDate:'2026-09-17', paidAt:123456789
});
const paidStateOk = canonicalPaidPatch.unpaid===false &&
  canonicalPaidPatch.inventoryDebtStatus==='paid' && canonicalPaidPatch.paidAt===123456789 &&
  canonicalPaidPatch.paidDate==='2026-09-17' && canonicalPaidPatch.paidTxId==='bundle-1' &&
  canonicalPaidPatch.paymentBundleId==='bundle-1' && isActiveInventoryDebt({type:'Xuất bán',...canonicalPaidPatch})===false;
check(paidStateOk && multi.includes('prepareMarkPaidPatch({') && multi.includes('_inventoryDebtPaidPatch'), '28. MultiItem debt-paid patch is canonical (paid status/date/tx/bundle) and no longer classifies active');
check(paidPatchBlock && !/(getDoc|getDocs|setDoc|updateDoc|addDoc|writeBatch|onSnapshot)\s*\(/.test(paidPatchBlock), '29. InventoryService paid mutation preparer is PURE and performs ZERO Firestore write/read/listener');
check(multi.includes("_batch.update(doc(db, 'clubs', currentClubId, 'inventory', id), _inventoryDebtPaidPatch)") && !multi.includes('InventoryService.markPaid('), '30. MultiItem debt paid mutation stays inside the SAME existing atomic batch');
check(multi.includes('if (_preparedInventory || invDebtIds.length > 0)') && multi.includes("notifyInventoryMutation?.('processMultiItem-atomic', { writeThrough: true })"), '31. Debt-only MultiItem payment invalidates the existing Inventory cache/history path without a new read');

const paidCalcStart = multi.indexOf('const _previousPaidUntil');
const paidCalcEnd = multi.indexOf('const _miAuditPayload', paidCalcStart);
const paidCalcSrc = paidCalcStart >= 0 && paidCalcEnd > paidCalcStart ? multi.slice(paidCalcStart, paidCalcEnd) : '';
const { normalizeYYYYMM } = await import(pathToFileURL(path.join(root,'js/utils/format.js')).href+'?h8r21fmt='+Date.now());
let paidUntilCasesOk = false;
if (paidCalcSrc) {
  const calc = new Function('profile','hasTuition','packageMonths','lastMonth','normalizeYYYYMM', `${paidCalcSrc}; return {previous:_previousPaidUntil,candidate:_candidatePaidUntil,result:_resultPaidUntil};`);
  const f1 = calc({paidUntil:'2026-12'}, true, ['2026-09','2026-10'], '2026-10', normalizeYYYYMM);
  const f2 = calc({paidUntil:'2026-08'}, true, ['2026-09','2026-10'], '2026-10', normalizeYYYYMM);
  const f3 = calc({paidUntil:''}, true, ['2026-09'], '2026-09', normalizeYYYYMM);
  paidUntilCasesOk = f1.result==='2026-12' && f2.result==='2026-10' && f3.result==='2026-09';
}
check(paidUntilCasesOk && multi.includes('paidUntil: _resultPaidUntil') && !/paidUntil\s*:\s*lastMonth/.test(multi), '32. MultiItem paidUntil uses max(existing,candidate); F1/F2/F3 monotonic cases PASS and raw lastMonth write is forbidden');
const profileGuardPos = multi.indexOf('const profile = allProfiles[name];');
const missingGuardPos = multi.indexOf("if(!profile) return alert('Không tìm thấy hồ sơ võ sinh hợp lệ. Vui lòng chọn võ sinh từ danh sách.')");
const writeBatchPos = multi.indexOf('const _batch = writeBatch(db)');
check(profileGuardPos>=0 && missingGuardPos>profileGuardPos && writeBatchPos>missingGuardPos, '33. MultiItem requires canonical profile existence before any atomic write plan/commit');
check(multi.includes("_batch.update(doc(db, 'clubs', currentClubId, 'profiles', name)") && !multi.includes("_batch.set(doc(db, 'clubs', currentClubId, 'profiles', name)"), '34. MultiItem tuition profile mutation cannot create a missing profile; update() makes disappearance fail the whole batch');
check(!multi.includes('allProfiles[name] || {}') && multi.indexOf('profileId: name') > missingGuardPos, '35. MultiItem has no raw-input profile identity fallback; profileId=name is only used after exact canonical profile existence is proven');

const quitDirty = block(profiles, 'export function markQuitAuthorityDirty', '// ─────────────────────────────────────────────────────────────────────────────\n// CLEANUP QUIT');
const statusBoundarySrc = read('js/core/studentStatusCommandBoundary.js');
const commitProfilePatch = block(statusBoundarySrc, 'function _commitProfilePatch', 'function _commitRename');
check(quitDirty.includes("_state.quitAuthorityState = 'dirty'") && quitDirty.includes('markQuitComplete(false)') &&
  !/(getDoc|getDocs|setDoc|updateDoc|addDoc|writeBatch|onSnapshot)\s*\(/.test(quitDirty) &&
  commitProfilePatch.includes('_isQuitProfile(previous) || _isQuitProfile(next)') && commitProfilePatch.includes('markQuitAuthorityDirty'),
  '36. Quit-profile canonical mutation marks the EXISTING Quit authority dirty locally with ZERO read/write/listener');

let quitReads = 0;
window.__store = { db:{}, clubId:'club-quit', profiles:{} };
window.currentClubId = 'club-quit';
window.userRole = 'admin';
window.RoleReadBoundary = { canMount(){return true;}, isCoachAttendanceOnly(){return false;} };
window._fb_init = {
  collection:(...a)=>({kind:'collection',a}),
  getDocs:async()=>{ quitReads++; const qdocs=[
    {id:'active-a',data:()=>({status:'active',displayName:'Active A'})},
    {id:'quit-a',data:()=>({status:'quit',displayName:'Quit A'})},
  ]; return {size:qdocs.length,docs:qdocs,forEach(fn){qdocs.forEach(fn);}}; }
};
const profilesRuntime = await import(pathToFileURL(path.join(root,'js/listeners/profiles.listeners.js')).href+'?h8r21quit='+Date.now());
profilesRuntime.resetProfilesListeners('h8r21-test-reset');
const qctx={clubId:'club-quit',db:window.__store.db,profRef:{kind:'profiles'},role:'admin'};
await profilesRuntime.loadQuitProfilesIfNeeded('q1',qctx);
for(let i=0;i<10;i++) await profilesRuntime.loadQuitProfilesIfNeeded('q-repeat-'+i,qctx);
const qReadsAfterRepeat = quitReads;
profilesRuntime.markQuitAuthorityDirty('q3-edit-quit-display');
const qDirtyBeforeReload = profilesRuntime.getProfilesListenerMetrics().quitAuthorityState==='dirty';
await profilesRuntime.loadQuitProfilesIfNeeded('q4-after-dirty',qctx);
const qReadsAfterDirtyReload = quitReads;
for(let i=0;i<10;i++) await profilesRuntime.loadQuitProfilesIfNeeded('q-post-refresh-'+i,qctx);
check(qReadsAfterRepeat===1 && qDirtyBeforeReload && qReadsAfterDirtyReload===2 && quitReads===2, '37. Quit Q1-Q4: repeated opens reuse complete cache; one local dirty mutation causes exactly one existing canonical refresh');

let primitiveReads = 0;
window.__store = { db:{}, clubId:'club-att' };
window.userRole='admin';
window.RoleReadBoundary={ canMount(){return true;}, isCoachAttendanceOnly(){return false;} };
const attBase={collection:(...a)=>({a}),where:(...a)=>({a}),query:(...a)=>({a}),getDocs:async()=>{primitiveReads++; return {size:0,docs:[],forEach(){}};}};
window._fb_init={...attBase,limit:n=>({n})}; // startAfter missing
let a2=''; try{await AttendanceService.loadByDate('2026-09-17',{branch:'CS1',shiftId:'morning',requireShift:true});}catch(e){a2=e&&e.code||'';}
window._fb_init={...attBase,startAfter:c=>({c})}; // limit missing
let a3=''; try{await AttendanceService.loadByDate('2026-09-17',{branch:'CS1',shiftId:'morning',requireShift:true});}catch(e){a3=e&&e.code||'';}
check(a2==='attendance/daily-pagination-unavailable' && a3==='attendance/daily-pagination-unavailable' && primitiveReads===0 && loadDay.includes("error.code = 'attendance/daily-pagination-unavailable'"), '38. Attendance A2/A3 fails closed before any read when limit/startAfter primitives are unavailable');
check(counts.getDoc<=29 && counts.getDocs<=51 && counts.onSnapshot<=16, `39. H8R2.1 Firestore static budget preserved (${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot} <= 29/51/16)`);

check(pkg.scripts?.['check:long-term-production-stability']==='node tools/check-long-term-production-stability.mjs','Package exposes check:long-term-production-stability');
console.log(`\nTotal: ${ok.length+fail.length} | PASS: ${ok.length} | FAIL: ${fail.length}`);
if(fail.length){ console.error('\nH8R2.1 long-term/residual stability gate FAILED:'); fail.forEach(x=>console.error(' - '+x.m)); process.exit(1); }
console.log('\nH8R2.1 long-term/residual stability gate PASS.');
