#!/usr/bin/env node
/**
 * D1C3B7R2R6 — actual window.syncOfflineAttendance per-day isolation
 * Real-module/runtime gate with fake Firestore SDK. No network access.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const attendance = read('js/modules/attendance.js');
const serviceSource = read('js/services/attendance.service.js');
const passes = []; const failures = [];
const check = (ok, message, detail = '') => {
  (ok ? passes : failures).push({ message, detail });
  console.log(ok ? '✅' : '❌', message, ok || !detail ? '' : `— ${detail}`);
};
const block = (src, startNeedle, endNeedle) => {
  const start = src.indexOf(startNeedle); if (start < 0) return '';
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  return src.slice(start, end < 0 ? src.length : end);
};
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate, label) { for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); } throw new Error('Timed out: ' + label); }

console.log('\n🔎 D1C3B7R2R6R1 V1 disposition vs V2 canonical target\n');

// ── Static architecture contracts ────────────────────────────────────────
const canonicalBuilder = block(serviceSource, 'function _toCanonicalAttendanceWrite(', 'export const AttendanceService');
const bulkSync = block(serviceSource, 'async bulkSyncOffline(', '// ── MEMBER STATS');
const syncBlock = block(attendance, 'const _runOfflineAttendanceSync = async', '// ── Sub-tab chuyển Ngày / Tháng');
check(canonicalBuilder.includes('const payload = {') && canonicalBuilder.includes('profileId:') && canonicalBuilder.includes('timestamp: Date.now()'), 'Canonical offline payload uses explicit business-field whitelist');
check(!canonicalBuilder.includes('...rec') && !canonicalBuilder.includes('...record') && !bulkSync.includes('_prepareWriteData({ ...rec'), 'Canonical Firestore payload never spreads journal/source object');
for (const key of ['version','clubId','operation','shiftMode','queuedAt','lastUpdatedAt','revision','docId']) {
  check(!new RegExp(`\\b${key}\\s*:`).test(canonicalBuilder), `Canonical builder excludes journal field: ${key}`);
}
check((serviceSource.match(/async bulkSyncOffline\s*\(/g) || []).length === 1, 'ONE AttendanceService.bulkSyncOffline writer owner remains');
check(attendance.includes('let _offlineAttendanceSyncPromise = null;') && (attendance.match(/let _offlineAttendanceSyncPromise/g) || []).length === 1, 'ONE active offline sync Promise latch remains');
check(attendance.includes('let _offlineAttendancePendingContext = null;') && (attendance.match(/_offlineAttendancePendingContext\s*=/g) || []).length >= 2, 'ONE latest pending context RAM state exists');
check(attendance.includes('_sameOfflineAttendanceSyncContext(requestedContext, _offlineAttendanceActiveContext)') && attendance.includes('return _offlineAttendanceSyncPromise'), 'Same-context requests coalesce to active flight');
check(attendance.includes('offlineSyncDifferentContextFollowups++') && attendance.includes('_startOfflineAttendanceSyncFlight(pendingContext)'), 'Different-context request has one bounded follow-up handoff');
check(!/new\s+Map\s*\([^)]*club/i.test(syncBlock) && !/Map\s*<.*Promise/.test(syncBlock), 'No per-club Promise map/parallel writer introduced');
check(!/setInterval\s*\(/.test(syncBlock) && !/setTimeout\s*\(/.test(syncBlock), 'No polling or recursive timer retry added to offline sync');
check(syncBlock.includes('_isOfflineAttendanceSyncContextCurrent(syncContext)') && syncBlock.includes('break v2Dates'), 'Stale context is checked before chunks and stops future chunks');
check(syncBlock.includes('_removeAttOfflineMutation(record, raw)') && attendance.includes('localStorage.getItem(key) !== expectedRaw'), 'Committed V2 cleanup requires exact submitted raw, not revision-only');

// Static Firestore call-site freeze using the same runtime-file policy as V5U6A.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const q = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (['migrations','diagnostics'].includes(entry.name)) continue; walk(q, out); }
    else if (entry.name.endsWith('.js')) out.push(q);
  }
  return out;
}
const runtimeFiles = ['app.js', ...walk('js')];
const patterns = {
  getDoc: /(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,
  getDocs: /(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,
  onSnapshot: /(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g,
};
const counts = { getDoc: 0, getDocs: 0, onSnapshot: 0 };
for (const file of runtimeFiles) for (const line of read(file).split('\n')) {
  const t = line.trim(); if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
  for (const [name, re] of Object.entries(patterns)) { re.lastIndex = 0; if (re.test(line)) counts[name]++; }
}
check(counts.getDoc === 29, `No new getDoc call-site (${counts.getDoc} <= 31)`);
check(counts.getDocs === 44, `No new getDocs call-site (${counts.getDocs} <= 56)`);
check(counts.onSnapshot <= 16, `No new onSnapshot call-site (${counts.onSnapshot} <= 16)`);

// ── Runtime harness ──────────────────────────────────────────────────────
class FakeClassList { constructor(...names) { this.names = new Set(names); } contains(n) { return this.names.has(n); } add(...n) { n.forEach(x => this.names.add(x)); } remove(...n) { n.forEach(x => this.names.delete(x)); } }
class FakeElement {
  constructor(id) { this.id = id; this.value = ''; this.checked = false; this.disabled = false; this.innerHTML = ''; this.textContent = ''; this.dataset = {}; this.hidden = false; this.style = { display: '', removeProperty(name) { delete this[name]; } }; this.classList = new FakeClassList(); }
  addEventListener() {} querySelector() { return null; } querySelectorAll() { return []; } closest() { return null; }
}
const storage = new Map();
const v2Key = (record) => 'offline_att_v2_' + [record.clubId || '', record.date || '', record.shiftMode === 'explicit-shift' ? record.shiftId || '' : 'legacy-no-shift', record.docId || ''].map(v => encodeURIComponent(String(v))).join('~');
const seedV2 = (record) => { const rec = { version: 2, month: String(record.date || '').slice(0,7), branch: 'CS1', belt: '', queuedAt: 1, lastUpdatedAt: 1, revision: 1, operation: Number(record.status || 0) === 0 ? 'delete' : 'set', ...record }; storage.set(v2Key(rec), JSON.stringify(rec)); return v2Key(rec); };
const clubEntries = (club) => Array.from(storage.entries()).filter(([key, raw]) => key.startsWith('offline_att_v2_') && JSON.parse(raw).clubId === club);

try {
  globalThis.window = globalThis;
  const elements = new Map();
  const addEl = (id, value = '') => { const el = new FakeElement(id); el.value = value; elements.set(id, el); return el; };
  const tab = addEl('tab_attendance'); tab.classList.add('active', 'tab-content');
  const day = addEl('att_sub_day'); const month = addEl('att_sub_month'); month.style.display = 'none';
  const dateEl = addEl('att_date', '2026-08-15'); const branchEl = addEl('att_branch', 'all'); const beltEl = addEl('att_belt', 'all'); const shiftEl = addEl('att_shift', '');
  const showAll = addEl('chk_show_all_att'); showAll.checked = true;
  ['attendanceGrid','attendanceSummary','admin_daily_branch_summary','admin_daily_branch_body','shiftModal','shiftList','shift_name','shift_start','shift_end','att_bulk_btn'].forEach(id => addEl(id));
  globalThis.document = { getElementById: id => elements.get(id) || null, querySelector: selector => selector === '.tab-content.active' ? tab : null, querySelectorAll: () => [], createElement: () => new FakeElement('created'), body: { appendChild() {}, removeChild() {} } };
  globalThis.localStorage = { get length() { return storage.size; }, key(i) { return Array.from(storage.keys())[i] || null; }, getItem(k) { return storage.has(k) ? storage.get(k) : null; }, setItem(k,v) { storage.set(k, String(v)); }, removeItem(k) { storage.delete(k); } };
  const navigatorState = { onLine: true }; Object.defineProperty(globalThis, 'navigator', { value: navigatorState, configurable: true });
  const onlineHandlers = []; globalThis.addEventListener = (type, fn) => { if (type === 'online') onlineHandlers.push(fn); };
  globalThis.innerWidth = 1024; globalThis.scrollTo = () => {}; globalThis.showToast = () => {}; globalThis.getLocalToday = () => '2026-08-15'; globalThis.getBranchNameDisplay = v => v; globalThis.classifyProfileStatus = p => p?.status || 'active';
  globalThis.BranchIdentity = { normalize(value, options = {}) { const raw = String(value || '').trim(); if (!raw) return Object.prototype.hasOwnProperty.call(options,'fallback') ? options.fallback : 'CS1'; if (/^(mặc định|mac dinh|default)$/i.test(raw)) return 'CS1'; if (raw === 'all') return options.allowAll ? 'all' : (options.fallback ?? ''); return /^CS\d+$/i.test(raw) ? raw.toUpperCase() : (options.fallback ?? ''); }, aliases(v) { return String(v) === 'CS1' ? ['CS1','Mặc định'] : [String(v)]; }, isSameBranch(a,b) { return this.normalize(a,{fallback:''}) === this.normalize(b,{fallback:''}); } };
  const profiles = { Alice: { status: 'active', branch: 'CS1', belt: 'Đai Đen', trainingDays: [] }, Bob: { status: 'active', branch: 'CS1', belt: 'Đai Xanh', trainingDays: [] } };
  globalThis.__store = { db: {}, clubId: 'club-a', currentClubId: 'club-a', userRole: 'admin', coachBranch: '', profiles, clubConfig: {}, clubData: {} };
  globalThis.currentClubId = 'club-a'; globalThis.userRole = 'admin'; globalThis.coachBranch = '';
  globalThis.__verifiedAuthContextState = { ready: true, uid: 'uid-a', clubId: 'club-a', role: 'admin', coachBranch: '', generation: 100 };
  const roleHolder = {};
  (await import('node:vm')).runInNewContext(read('js/core/roleReadBoundary.js'), { window: roleHolder });
  globalThis.RoleReadBoundary = { normalizeRole: roleHolder.RoleReadBoundary.normalizeRole, isCoachAttendanceOnly: () => globalThis.userRole === 'coach', canMount: () => true };
  const runtimeErrors = []; globalThis.recordRuntimeError = (source, err, extra) => runtimeErrors.push({ source, err, extra });

  const events=[];
  const serviceUrl=pathToFileURL(path.join(root,'js/services/attendance.service.js')).href+'?v=residual-financial-cache-correctness-20260917-v5u6h8r2_1';
  globalThis._fb_init={doc:(...args)=>({args}),writeBatch:()=>({set(){},delete(){},async commit(){}})};
  const {AttendanceService}=await import(serviceUrl);
  let shifts=[],syncImpl=async()=>({committed:1});
  AttendanceService.loadShifts=async()=>shifts;
  AttendanceService.loadByDate=async()=>[];
  AttendanceService.loadByMonth=async()=>[];
  AttendanceService.loadCoachNotes=async()=>[];
  AttendanceService.bulkSyncOffline=async(...args)=>{events.push({type:'write',args});return syncImpl(...args)};
  AttendanceService.saveRecord=async()=>{};AttendanceService.deleteRecord=async()=>{};
  AttendanceService.bulkSaveRecords=async()=>{};AttendanceService.saveShifts=async()=>{};
  AttendanceService.updateMemberStats=async()=>{};
  const reg=await import(pathToFileURL(path.join(root,'js/core/globalOwnershipRegistry.js')).href);
  reg.initGlobalOwnershipRegistry();
  const {initAttendance}=await import(pathToFileURL(path.join(root,'js/modules/attendance.js')).href+'?r3='+Date.now());
  const api=initAttendance();await tick();
  const baseline=()=>{storage.clear();events.length=0;syncImpl=async()=>({committed:1});shifts=[];navigatorState.onLine=true;};
  const auth=async({ready=true,club='club-a',uid='uid-a',role='admin',branch='',uiRole=role,storeRole=role,gen=100,shiftsConfig=[]}={})=>{
    globalThis.__store.clubId=club;globalThis.__store.currentClubId=club;globalThis.currentClubId=club;
    globalThis.__store.userRole=storeRole;globalThis.userRole=uiRole;globalThis.__store.coachBranch=branch;globalThis.coachBranch=branch;
    globalThis.__verifiedAuthContextState={ready,uid,clubId:club,role,coachBranch:branch,generation:gen};
    shifts=shiftsConfig; api.resetForClub(club); await api.ensureShiftsLoaded({force:true});
  };
  const v1=(records,club='club-a')=>({clubId:club,date:'2026-08-15',records});
  const rec=(name='Alice',branch='CS1',status=1)=>({name,profileId:name,branch,status});
  const v1key='offline_att_club-a_2026-08-15';
  const put=(key,payload)=>storage.set(key,JSON.stringify(payload));
  const count=()=>events.filter(e=>e.type==='write').length;
  const assertCheck=(label,ok,more='')=>check(Boolean(ok),label,more);

  const good = (name, date, extra={}) => ({ clubId:'club-a', date, docId:name+'_'+date,
    name, profileId:name, branch:'CS1', status:1, operation:'set', shiftMode:'legacy-no-shift', shiftId:'', ...extra });
  const goodDate='2026-08-16', badDate='2026-08-15';
  const submitted=()=>events.filter(x=>x.type==='write').map(x=>({date:x.args[1],ids:Object.keys(x.args[2])}));
  const measure = (label,truth,result) => assertCheck(label,truth,JSON.stringify({calls:submitted(),result,pending:storage.size}));
  const oldKey = 'offline_att_club-a_2026-08-15';
  const oldPayload=(records)=>({clubId:'club-a',date:badDate,records});
  const latestWriteDates=()=>submitted().map(x=>x.date);
  const isOnlyV2=()=>submitted().length===1&&submitted()[0].date===goodDate;
  const putV1=(p,key=oldKey)=>{const raw=JSON.stringify(p);storage.set(key,raw);return raw};
  // X01: V1 wrong shape is DENIED_STABLE, NOT an attempted writer.
  baseline();await auth({});const v1BadRaw=putV1(oldPayload('corrupt-records'));const v2GoodKey=seedV2(good('Different',goodDate));
  const x01=await globalThis.syncOfflineAttendance();
  measure('X01 RED denied stable V1 nonobject records must not block independent V2',isOnlyV2()&&storage.get(oldKey)===v1BadRaw&&!storage.has(v2GoodKey)&&x01.synced===1,x01);
  // X02: V1 row missing name cannot target a writer this flight.
  baseline();await auth({});const x02Raw=putV1(oldPayload({bad:{status:1,branch:'CS1'}}));const x02v2=seedV2(good('Different',goodDate));
  const x02=await globalThis.syncOfflineAttendance();
  measure('X02 RED no-name V1 denied stable must not block unrelated V2',isOnlyV2()&&storage.get(oldKey)===x02Raw&&!storage.has(x02v2),x02);
  // X03: V1 ACK target continues to conflict even after journal cleanup.
  baseline();await auth({});putV1(oldPayload({Overlap:rec('Overlap')}));const x03v2=seedV2(good('Overlap',badDate));const x03=await globalThis.syncOfflineAttendance();
  measure('X03 V1 ACK target still prevents V2 same canonical docId',count()===1&&submitted()[0].date===badDate&&storage.has(x03v2)&&!storage.has(oldKey),x03);
  // X04: V1 ACK + V2 disjoint has exactly the two existing writer calls.
  baseline();await auth({});putV1(oldPayload({V1:rec('V1')}));const x04v2=seedV2(good('Unique',goodDate));const x04=await globalThis.syncOfflineAttendance();
  measure('X04 disjoint ACK V1 and V2 run in existing order',JSON.stringify(latestWriteDates())===JSON.stringify([badDate,goodDate])&&!storage.has(oldKey)&&!storage.has(x04v2)&&x04.synced===2,x04);
  // X05: rejected V1 writer remains potential, never treated as DENIED_STABLE.
  baseline();await auth({});const x05raw=putV1(oldPayload({Overlap:rec('Overlap')}));const x05v2=seedV2(good('Overlap',badDate));
  syncImpl=()=>Promise.reject(Object.assign(new Error('uncertain'),{code:'unavailable'}));const x05=await globalThis.syncOfflineAttendance();
  measure('X05 rejected V1 writer is uncertain and V2 target remains blocked',count()===1&&storage.get(oldKey)===x05raw&&storage.has(x05v2),x05);
  // X06 invalid branch/date/shape/oversized V1 are stable denied; V2 independently eligible.
  for(const [label,payload] of [
    ['wrong-branch',oldPayload({X:rec('X','')} )],
    ['bad-date',{clubId:'club-a',date:'2026-02-30',records:{X:rec('X')}}],
    ['bad-operation',oldPayload({X:{...rec('X'),operation:'delete',status:1}})],
    ['oversized',oldPayload(Object.fromEntries(Array.from({length:401},(_,i)=>['X'+i,rec('X'+i)])))],
    ['array-records',oldPayload([rec('X')])],
  ]){
    baseline();await auth({});const v1Raw=putV1(payload);const v2=seedV2(good('Unique',goodDate));const r=await globalThis.syncOfflineAttendance();
    measure('X06 denied stable '+label+' does not block independent V2',isOnlyV2()&&storage.get(oldKey)===v1Raw&&!storage.has(v2),r);
  }
  // X07 late rewrite of originally denied V1; do not rely on stale disposition.
  baseline();await auth({});putV1(oldPayload({bad:{status:1,branch:'CS1'}}));const x07v2=seedV2(good('Later',goodDate));
  const x07second='offline_att_club-a_2026-08-17';
  putV1({clubId:'club-a',date:'2026-08-17',records:{Other:{...rec('Other'),date:'2026-08-17'}}},x07second);
  const delayedV1=deferred();syncImpl=()=>delayedV1.promise;
  const x07flight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'X07 other V1 writer pending');
  putV1(oldPayload({Later:rec('Later')}));delayedV1.resolve({committed:1});const x07=await x07flight;
  measure('X07 denied V1 rewritten while another V1 writer awaits: fail closed before V2',count()===1&&storage.has(oldKey)&&storage.has(x07v2),x07);
  // X08 changed at the initial V1 raw guard, not an authorized denial.
  baseline();await auth({});putV1(oldPayload({bad:{status:1,branch:'CS1'}}));const x08v2=seedV2(good('Later',goodDate));
  let x08read=0;const originalGet=globalThis.localStorage.getItem;
  globalThis.localStorage.getItem=function(k){if(k===oldKey&&++x08read===2){putV1(oldPayload({Later:rec('Later')}));}return originalGet.call(this,k)};
  const x08=await globalThis.syncOfflineAttendance();globalThis.localStorage.getItem=originalGet;
  measure('X08 V1 raw changed at guard is not DENIED_STABLE',count()===0&&storage.has(x08v2),x08);
  // X09 unreadable at V1 preflight: cannot classify safe.
  baseline();await auth({});putV1(oldPayload({bad:{status:1,branch:'CS1'}}));const x09v2=seedV2(good('Later',goodDate));let x09read=0;
  globalThis.localStorage.getItem=function(k){if(k===oldKey&&++x09read>=3)throw new Error('storage permission');return originalGet.call(this,k)};
  let x09Error=null;try{await globalThis.syncOfflineAttendance()}catch(e){x09Error=e}globalThis.localStorage.getItem=originalGet;
  measure('X09 unreadable journal fails closed without sending V2',count()===0&&storage.has(oldKey)&&storage.has(x09v2),{error:String(x09Error)});
  // X10 after V1 ACK, raw change defers cleanup and V2 collision still blocked.
  baseline();await auth({});putV1(oldPayload({Overlap:rec('Overlap')}));const x10v2=seedV2(good('Overlap',badDate));
  syncImpl=async()=>{putV1(oldPayload({Overlap:rec('Overlap', 'CS1',2)}));return {committed:1}};
  const x10=await globalThis.syncOfflineAttendance();
  measure('X10 V1 ACK but cleanup deferred cannot free conflicting target',count()===1&&storage.has(oldKey)&&storage.has(x10v2),x10);
  // X11 delete target same ID remains conflict; service writer semantics use name-date-shift.
  baseline();await auth({});putV1(oldPayload({Overlap:{...rec('Overlap','CS1',0),operation:'delete'}}));const x11v2=seedV2(good('Overlap',badDate));const x11=await globalThis.syncOfflineAttendance();
  measure('X11 V1 delete and V2 set same canonical target stay non-overlapping',count()===1&&storage.has(x11v2),x11);
  // X12 denied stable C, bad V2 A, good V2 B.
  baseline();await auth({});const x12v1=putV1(oldPayload('corrupt-records'));const x12bad=seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));const x12good=seedV2(good('Good',goodDate));const x12=await globalThis.syncOfflineAttendance();
  measure('X12 local invalid V2 day A and denied V1 allow independent B',isOnlyV2()&&storage.get(oldKey)===x12v1&&storage.has(x12bad)&&!storage.has(x12good),x12);
  // X13 denied V1 same date as valid V2 is not itself a conflict.
  baseline();await auth({});putV1(oldPayload({bad:{status:1,branch:'CS1'}}));const x13v2=seedV2(good('SameDay',badDate));const x13=await globalThis.syncOfflineAttendance();
  measure('X13 denied stable V1 same date does not count as submitted target',count()===1&&!storage.has(x13v2)&&storage.has(oldKey),x13);
  // X14 foreign V1 and V2 both retained while current V2 proceeds.
  baseline();await auth({});const fV1='offline_att_club-b_2026-08-15';const fV1raw=putV1(oldPayload({Foreign:rec('Foreign')}),'offline_att_club-b_2026-08-15');
  storage.set(fV1,JSON.stringify({clubId:'club-b',date:badDate,records:{Foreign:rec('Foreign')}}));const fV2=seedV2(good('Foreign2',badDate,{clubId:'club-b'}));const x14v2=seedV2(good('Own',goodDate));const x14=await globalThis.syncOfflineAttendance();
  measure('X14 foreign V1/V2 preserved without blocking current V2',isOnlyV2()&&storage.has(fV1)&&storage.has(fV2)&&!storage.has(x14v2),x14);
  // X15 current owner switch during V1 pending stops V2.
  baseline();await auth({});putV1(oldPayload({First:rec('First')}));const x15v2=seedV2(good('Next',goodDate));const pending=deferred();syncImpl=()=>pending.promise;
  const x15flight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'X15 V1 writer');globalThis.__verifiedAuthContextState.uid='changed';pending.resolve({committed:1});const x15=await x15flight;
  measure('X15 stale UID after V1 writer stops V2',count()===1&&storage.has(x15v2)&&storage.has(oldKey),x15);
  // X16 one denied stable + one ACK overlapping V2: attempted still blocks.
  baseline();await auth({});const old2='offline_att_club-a_2026-08-16';putV1(oldPayload('corrupt-records'));putV1({clubId:'club-a',date:goodDate,records:{Overlap:rec('Overlap')}},old2);
  const x16v2=seedV2(good('Overlap',goodDate));const x16=await globalThis.syncOfflineAttendance();
  measure('X16 failed stable V1 cannot mask other attempted V1 overlap',count()>=1&&storage.has(x16v2)&&storage.has(oldKey),x16);
  // X17 mixed V2 same day never partial submits; unrelated date progress.
  baseline();await auth({});putV1(oldPayload('corrupt-records'));const x17good=seedV2(good('Yes',badDate));const x17bad=seedV2(good('No',badDate,{shiftMode:'explicit-shift',shiftId:''}));const x17other=seedV2(good('Other',goodDate));const x17=await globalThis.syncOfflineAttendance();
  measure('X17 same-day V2 blocked, independent date progresses',isOnlyV2()&&storage.has(x17good)&&storage.has(x17bad)&&!storage.has(x17other),x17);
  // X18 raw revision change while submitted retains V2 new raw.
  baseline();await auth({});putV1(oldPayload('corrupt-records'));const x18v2=seedV2(good('Mutable',goodDate));syncImpl=async()=>{storage.set(x18v2,JSON.stringify({...JSON.parse(storage.get(x18v2)),status:2}));return {committed:1}};const x18=await globalThis.syncOfflineAttendance();
  measure('X18 V2 post-ACK changed raw must not be deleted',count()===1&&storage.has(x18v2),x18);
  // X19 pending invalid V1 means final toast must mention pending, not total completion.
  baseline();await auth({});putV1(oldPayload('corrupt-records'));seedV2(good('Notice',goodDate));const notices=[];globalThis.showToast=x=>notices.push(String(x));const x19=await globalThis.syncOfflineAttendance();globalThis.showToast=()=>{};
  measure('X19 pending V1 stays pending and completion message is qualified',count()===1&&storage.has(oldKey)&&notices.some(x=>x.includes('chờ đồng bộ')),x19);
  // R2R6R2 M01–M14: actual completion-message decisions after canonical ACK.
  const mToast = async (setup, inspect) => {
    baseline(); await auth({});
    const notices=[]; globalThis.showToast = message => notices.push(String(message));
    const state = setup();
    const result = await globalThis.syncOfflineAttendance();
    globalThis.showToast = () => {};
    return {notices, result, state};
  };
  const completes = notes => notes.some(x => x.includes('Đã đồng bộ') && x.includes('bản ghi'));
  const partials = notes => notes.some(x => x.includes('Đã gửi') && x.includes('chờ đồng bộ'));
  // M01 X19 already asserts denied V1, successful V2 and pending count.
  const m02=await mToast(()=>({key:seedV2(good('Complete',goodDate))}),()=>{});
  measure('M02 clean V2 ACK retains normal complete toast',m02.result.synced===1&&m02.result.pending===0&&count()===1&&completes(m02.notices),m02);
  const m03=await mToast(()=>({bad:seedV2(good('BadNotice',badDate,{shiftMode:'explicit-shift',shiftId:''})),good:seedV2(good('GoodNotice',goodDate))}));
  measure('M03 blocked V2 day A and ACK day B report partial with untouched A',count()===1&&m03.result.synced===1&&m03.result.pending===1&&storage.has(m03.state.bad)&&partials(m03.notices),m03);
  const m04=await mToast(()=>{const raw=putV1(oldPayload({One:rec('One')}));syncImpl=async()=>{storage.set(oldKey,JSON.stringify({...JSON.parse(raw),changedAfterSubmit:true}));return {committed:1};};return {};});
  measure('M04 V1 ACK with deferred cleanup reports partial, never total completion',count()===1&&m04.result.legacySynced===1&&m04.result.pending===1&&m04.result.legacyCleanupDeferred>=1&&partials(m04.notices),m04);
  const m05=await mToast(()=>{const key=seedV2(good('V2Deferred',goodDate));syncImpl=async()=>{storage.set(key,JSON.stringify({...JSON.parse(storage.get(key)),revision:2}));return {committed:1};};return {key};});
  measure('M05 V2 same-key newer raw survives and completes partially',count()===1&&m05.result.v2CleanupDeferred===1&&m05.result.pending===1&&storage.has(m05.state.key)&&partials(m05.notices),m05);
  const m06=await mToast(()=>{const foreign='offline_att_club-b_2026-08-15';storage.set(foreign,'foreign-journal');seedV2(good('CurrentOnly',goodDate));return {foreign};});
  measure('M06 foreign-club device journal is described without assigning to current club',count()===1&&m06.result.synced===1&&m06.result.pending===1&&storage.has(m06.state.foreign)&&partials(m06.notices)&&m06.notices.some(x=>x.includes('trên thiết bị')),m06);
  const m07=await mToast(()=>{putV1(oldPayload({A:{branch:'CS1',status:1},B:{branch:'CS1',status:2}}));seedV2(good('OneWriter',goodDate));return {};});
  measure('M07 one invalid V1 KEY containing multiple rows counts one journal item',count()===1&&m07.result.pending===1&&m07.notices.some(x=>x.includes('1 mục nhật ký')),m07);
  // M08 owner change after ACK: no old-session completion toast.
  const m08=await mToast(()=>{seedV2(good('StaleUser',goodDate));syncImpl=async()=>{globalThis.__verifiedAuthContextState.uid='another-user';return {committed:1};};return {};});
  measure('M08 switched UID after ACK never displays completion for new session',count()===1&&m08.result.pending===1&&!completes(m08.notices)&&!partials(m08.notices),m08);
  const m09=await mToast(()=>{const key=seedV2(good('Rejected',goodDate));syncImpl=async()=>{const e=new Error('denied');e.code='permission-denied';throw e;};return {key};});
  measure('M09 rejected writer cannot cleanup or show false success',count()===1&&m09.result.synced===0&&storage.has(m09.state.key)&&!completes(m09.notices)&&!partials(m09.notices),m09);
  const m10=await mToast(()=>({raw:putV1(oldPayload('corrupt-records'))}));
  measure('M10 denied journal with no ACK does not generate success message',count()===0&&m10.result.synced===0&&m10.result.pending===1&&!completes(m10.notices)&&!partials(m10.notices),m10);
  const m11=await mToast(()=>{seedV2(good('FirstDone',goodDate));syncImpl=async()=>{storage.set('offline_att_later_current_device','needs-review');return {committed:1};};return {};});
  measure('M11 late device journal appears in one post-ACK count',count()===1&&m11.result.synced===1&&m11.result.pending===1&&partials(m11.notices),m11);
  // M12: no resend after successful V2 cleanup; denied V1 remains.
  baseline();await auth({});putV1(oldPayload('corrupt-records'));seedV2(good('FirstOnly',goodDate));
  const m12first=await globalThis.syncOfflineAttendance(),m12writes=count(),m12second=await globalThis.syncOfflineAttendance();
  measure('M12 repeated flight has no extra write and unchanged pending V1',m12writes===1&&count()===1&&m12first.pending===1&&m12second.pending===1&&m12second.synced===0,{m12first,m12second});
  // M13: enumeration fails AFTER SDK resolves; do not misreport complete or retry.
  baseline();await auth({});const m13key=seedV2(good('UnreadableCount',goodDate));
  const origLengthDesc=Object.getOwnPropertyDescriptor(globalThis.localStorage,'length');
  syncImpl=async()=>{Object.defineProperty(globalThis.localStorage,'length',{configurable:true,get(){throw new Error('test-only count failed')}});return {committed:1};};
  const m13Notes=[];globalThis.showToast=x=>m13Notes.push(String(x));
  let m13=null,m13Error='';try{m13=await globalThis.syncOfflineAttendance();}catch(error){m13Error=error?.message||String(error);}finally{Object.defineProperty(globalThis.localStorage,'length',origLengthDesc);globalThis.showToast=()=>{};}
  measure('M13 failed pending count cannot claim completion or retry ACK',!m13Error&&count()===1&&m13?.synced===1&&m13?.pending===null&&m13Notes.some(x=>x.includes('chưa xác minh'))&&!completes(m13Notes),m13);
  // M14: role policy and context remain the existing write guard, not toast logic.
  baseline();await auth({role:'coach',branch:'CS1',uiRole:'hlv',storeRole:'coach'});putV1(oldPayload('corrupt-records'));const m14=await globalThis.syncOfflineAttendance();
  measure('M14 completion patch does not make Coach bypass its existing roster/branch scope',count()===0&&m14.synced===0&&storage.has(oldKey),m14);
  // X20 another flight must never re-send ACK-cleaned V2 while V1 remains pending.
  baseline();await auth({});putV1(oldPayload('corrupt-records'));const x20v2=seedV2(good('Once',goodDate));const x20first=await globalThis.syncOfflineAttendance(),callsAfter=count();const x20second=await globalThis.syncOfflineAttendance();
  measure('X20 V2 one-shot ACK then second sync has zero new writes',callsAfter===1&&count()===1&&!storage.has(x20v2)&&storage.has(oldKey)&&x20second.synced===0,{x20first,x20second});
  console.log(`R2R6R1 ACTUAL HANDLER: ${passes.length} PASS / ${failures.length} FAIL`);
} catch(error){check(false,'R2R6R1 real module bootstrap',error?.stack||String(error));}
if(failures.length)process.exitCode=1;
