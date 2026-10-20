#!/usr/bin/env node
/**
 * Phase 4K-6V5U6G1 — Attendance Offline Canonical Sync Closure
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

console.log('\n🔎 Phase 4K-6V5U6G1 — Attendance Offline Canonical Sync Guard\n');

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
check(counts.getDoc <= 31, `No new getDoc call-site (${counts.getDoc} <= 31)`);
check(counts.getDocs <= 56, `No new getDocs call-site (${counts.getDocs} <= 56)`);
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
  const serviceUrl=new URL(read('js/modules/attendance.js').match(/import \{ AttendanceService \} from '([^']+)'/)[1], pathToFileURL(path.join(root, 'js/modules/attendance.js'))).href;
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
  async function runCase(label,setup,expectedWrites=0,judge=()=>true){
    baseline();await auth(setup.auth||{});put(v1key,setup.payload||v1({Alice:rec()}));
    try{const result=await globalThis.syncOfflineAttendance();assertCheck(label,count()===expectedWrites&&judge(result),`writes=${count()}, result=${JSON.stringify(result)}`);}catch(e){check(false,label,e?.stack||String(e));}
  }
  await runCase('A01 Coach CS1 cannot replay V1 record for CS2 with no shifts',{auth:{role:'coach',branch:'CS1'},payload:v1({Bob:rec('Bob','CS2')})},0);
  await runCase('A02 mixed V1 batch must reject whole batch',{auth:{role:'coach',branch:'CS1'},payload:v1({Alice:rec(),Bob:rec('Bob','CS2')})},0);
  await runCase('A04 valid legacy V1 without record.docId/date inherits envelope',{payload:v1({Alice:rec()})},1);
  await runCase('A03 null record is malformed not valid',{payload:v1({Alice:null})},0);
  await runCase('A03 wrong status cannot go to writer',{payload:v1({Alice:rec('Alice','CS1',99)})},0);
  await runCase('A09 >400 V1 docs must preserve journal',{payload:v1(Object.fromEntries(Array.from({length:401},(_,i)=>['P'+i,rec('P'+i)])))},0);
  await runCase('A03 invalid calendar date blocked',{payload:{clubId:'club-a',date:'2026-02-30',records:{Alice:rec()}}},0);
  await runCase('B01 unverified principal cannot sync V1',{auth:{ready:false}},0);
  await runCase('B01 zero-generation principal cannot sync V1',{auth:{gen:0}},0);
  await runCase('B04 verified Coach with conflicting UI admin cannot sync V1',{auth:{role:'coach',branch:'CS1',uiRole:'admin'}},0);
  await runCase('B02 viewer principal cannot sync V1',{auth:{role:'viewer',uiRole:'viewer',storeRole:'viewer'}},0);
  await runCase('B04 Coach role alias hlv should sync authorized CS1 V1',{auth:{role:'coach',branch:'CS1',uiRole:'hlv',storeRole:'trainer'}},1);
  await runCase('A06 Coach V1 delete lacks authoritative target proof and must be held',{auth:{role:'coach',branch:'CS1'},payload:v1({Alice:{...rec(),status:0,operation:'delete'}})},0);
  await runCase('A09 exactly 400 valid V1 rows accepted',{payload:v1(Object.fromEntries(Array.from({length:400},(_,i)=>['P'+i,rec('P'+i)])))},1);
  // Real journal flow with deferred bulkSyncOffline, not cloned cleanup logic.
  baseline();await auth({});const rawA=JSON.stringify(v1({Alice:rec()}));storage.set(v1key,rawA);
  const latch=deferred();syncImpl=()=>latch.promise;
  const flight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'J01 service started');
  const rawB=JSON.stringify(v1({Alice:{...rec(),status:2}}));storage.set(v1key,rawB);latch.resolve({committed:1});
  const j01=await flight;assertCheck('J01 committed A cannot delete newer raw B',storage.get(v1key)===rawB,`journal=${storage.get(v1key)} result=${JSON.stringify(j01)}`);
  baseline();await auth({});put(v1key,v1({Alice:rec()}));
  await globalThis.syncOfflineAttendance();assertCheck('J02 committed unchanged raw A cleaned',!storage.has(v1key),`remaining=${storage.size}`);
  baseline();await auth({});put(v1key,v1({Alice:rec()}));syncImpl=()=>Promise.reject(Object.assign(new Error('permission denied'),{code:'permission-denied'}));
  await globalThis.syncOfflineAttendance();assertCheck('J02 denied writer retains journal',storage.has(v1key));
  baseline();await auth({});put(v1key,v1({Alice:rec()}));const switchLatch=deferred();syncImpl=()=>switchLatch.promise;
  const oldFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'J03 service started');
  globalThis.__verifiedAuthContextState={ready:true,uid:'uid-b',clubId:'club-b',role:'admin',generation:101};globalThis.__store.clubId='club-b';globalThis.currentClubId='club-b';
  switchLatch.resolve({committed:1});await oldFlight;
  assertCheck('J03 old session completion preserves journal for deferred reconciliation',storage.has(v1key));
  // Actual monthly production window handler with the real AttendanceService spy.
  baseline();await auth({role:'coach',branch:'CS1',uiRole:'hlv',storeRole:'coach'});
  month.style.display='';day.style.display='none';addEl('att_month','2026-08');addEl('att_month_branch','all');addEl('att_monthly_body');addEl('att_monthly_cards');addEl('att_monthly_table_wrap');
  let queryBranch='UNSET';AttendanceService.loadByMonth=async(_m,opt)=>{queryBranch=opt.branch;return []};
  await globalThis.renderAttMonthly();assertCheck('C Coach hlv monthly query must remain CS1',queryBranch==='CS1',`branch=${queryBranch}`);
  // Birthday HTML sink, render actual handler into DOM stub (no JS eval).
  baseline();await auth({role:'admin'});globalThis.__store.clubConfig={branchCount:2};
  const banner=addEl('home_birthday_banner');globalThis.getBranchNameDisplay=()=>'<img src=x onerror=alert(1)> & Quận 1';
  globalThis.__store.profiles={Alice:{status:'active',branch:'CS1',dob:'15/08/2015'}};
  globalThis._renderHomeBirthdayBanner();assertCheck('D birthday branch label must be HTML-escaped',!banner.innerHTML.includes('<img')&&banner.innerHTML.includes('&lt;img'),banner.innerHTML.slice(0,380));
  // Extra regression: V2 must not interpret unverified/foreign writes as allowed.
  baseline();await auth({ready:false});
  seedV2({clubId:'club-a',date:'2026-08-15',docId:'Alice_2026-08-15',name:'Alice',profileId:'Alice',branch:'CS1',status:1,shiftId:'',shiftMode:'legacy-no-shift'});
  const beforeV2=storage.size;await globalThis.syncOfflineAttendance();
  assertCheck('B02 V2 configured=false unverified principal is blocked',count()===0&&storage.size===beforeV2);
  baseline();await auth({role:'coach',branch:'CS1',uiRole:'hlv',storeRole:'trainer'});
  const aliasKey='offline_att_club-a_alias';put(aliasKey,v1({Alice:rec('Alice','Mặc định')}));
  await globalThis.syncOfflineAttendance();assertCheck('A02 Coach CS1 authorized Mặc định alias can write',count()===1&&!storage.has(aliasKey));
  baseline();await auth({role:'coach',branch:'CS2'});put(v1key,v1({Alice:rec('Alice','CS1')}));
  await globalThis.syncOfflineAttendance();assertCheck('A02 Coach CS2 cannot replay CS1',count()===0&&storage.has(v1key));
  baseline();await auth({uid:'uid-one'});put(v1key,v1({Alice:rec()}));const uidLatch=deferred();syncImpl=()=>uidLatch.promise;
  const uidFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'UID A started');
  Object.assign(globalThis.__verifiedAuthContextState,{uid:'uid-two'});uidLatch.resolve({committed:1});await uidFlight;
  assertCheck('B03 same club/generation with different UID retains journal',storage.has(v1key));
  baseline();await auth({});put(v1key,v1({Alice:rec()}));
  globalThis.showToast=(msg)=>{if(String(msg).includes('Đang đồng bộ'))storage.set(v1key,JSON.stringify(v1({Alice:{...rec(),status:2}})))};
  await globalThis.syncOfflineAttendance();
  assertCheck('J04 raw journal changed before writer is not sent',count()===0&&storage.has(v1key));
  globalThis.showToast=()=>{};
  baseline();await auth({role:'coach',branch:'CS1'});
  seedV2({clubId:'club-a',date:'2026-08-15',docId:'Alice_2026-08-15',name:'Alice',profileId:'Alice',branch:'CS1',status:0,operation:'delete',shiftId:'',shiftMode:'legacy-no-shift'});
  await globalThis.syncOfflineAttendance();assertCheck('A06 Coach V2 delete target lacking resource proof preserved',count()===0&&storage.size===1);
  baseline();await auth({role:'super_admin',uiRole:'super_admin',storeRole:'super_admin',club:'club-a',uid:'sa'});put(v1key,v1({Alice:rec()}));
  await globalThis.syncOfflineAttendance();assertCheck('B05 authorized SuperAdmin selected club V1 allowed',count()===1);
  // Async Coach month must never render another principal's results after await.
  baseline();await auth({role:'coach',branch:'CS1',uiRole:'trainer',storeRole:'coach'});
  month.style.display='';day.style.display='none';
  const monthGate=deferred();let monthlyQueries=0;
  AttendanceService.loadByMonth=async(_m,opt)=>{monthlyQueries++;return monthGate.promise};
  const monthlyRun=globalThis.renderAttMonthly();await waitFor(()=>monthlyQueries===1,'monthly query started');
  globalThis.__verifiedAuthContextState.uid='someone-else';monthGate.resolve([{id:'Alice_2026-08-15',data:{profileId:'Alice',name:'Alice',branch:'CS1',status:1,date:'2026-08-15'}}]);
  await monthlyRun;assertCheck('C stale monthly callback does not commit new-session HTML',!String(elements.get('att_monthly_body').innerHTML).includes('Alice'));
  // Real malformed delete docs cannot select a caller-provided target ID.
  await runCase('A06 forged V1 docId rejected',{payload:v1({Alice:{...rec(),docId:'Bob_2026-08-15'}})},0);
  baseline();await auth({});put(v1key,v1({Alice:rec()}));
  const normalRemove=globalThis.localStorage.removeItem;
  globalThis.localStorage.removeItem=()=>{throw new Error('Storage write refused')};
  const storageResult=await globalThis.syncOfflineAttendance();
  globalThis.localStorage.removeItem=normalRemove;
  assertCheck('J06 committed V1 with cleanup storage exception reports deferred and preserves journal',
    count()===1&&storage.has(v1key)&&storageResult.synced===1&&storageResult.legacyCleanupDeferred===1,
    JSON.stringify(storageResult));
  // R2R4 RED/GREEN — actual imported module, deferred service ACK and raw storage.
  baseline();await auth({});
  const sample={clubId:'club-a',date:'2026-08-15',docId:'Alice_2026-08-15',name:'Alice',profileId:'Alice',branch:'CS1',status:1,shiftMode:'legacy-no-shift',shiftId:'',operation:'set',version:2,revision:5};
  const riskKey=seedV2(sample); const rawOriginal=storage.get(riskKey);
  const sameRevLatch=deferred();syncImpl=()=>sameRevLatch.promise;
  const sameRevFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'J05 same revision original sent');
  const rawChanged=JSON.stringify({...sample,status:2,revision:5});storage.set(riskKey,rawChanged);
  sameRevLatch.resolve({committed:1});await sameRevFlight;
  assertCheck('J05 same-revision but changed-raw journal survives ACK',storage.get(riskKey)===rawChanged,`after=${storage.get(riskKey)} expected=${rawChanged}`);
  baseline();await auth({});seedV2(sample);
  const ackLatch=deferred();syncImpl=()=>ackLatch.promise;
  const switchedFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'J07 original owner sent');
  globalThis.__verifiedAuthContextState={ready:true,uid:'uid-other',clubId:'club-a',role:'admin',coachBranch:'',generation:100};
  ackLatch.resolve({committed:1});await switchedFlight;
  assertCheck('J07 same club/gen changed UID after ACK keeps journal',storage.has(riskKey));
  baseline();await auth({});seedV2(sample);
  const newerRaw=JSON.stringify({...sample,status:2,revision:5});
  globalThis.showToast=(msg)=>{if(String(msg).includes('Đang đồng bộ'))storage.set(riskKey,newerRaw)};
  await globalThis.syncOfflineAttendance();globalThis.showToast=()=>{};
  assertCheck('J08 journal edited after scan cannot submit stale V2',count()===0&&storage.get(riskKey)===newerRaw,`writes=${count()} raw=${storage.get(riskKey)}`);
  baseline();await auth({});seedV2(sample);await globalThis.syncOfflineAttendance();
  assertCheck('J10 unchanged V2 after ACK is cleaned',count()===1&&!storage.has(riskKey));
  baseline();await auth({});seedV2(sample);syncImpl=()=>Promise.reject(Object.assign(new Error('permission denied'),{code:'permission-denied'}));
  await globalThis.syncOfflineAttendance();assertCheck('J10 failed writer retains V2',storage.has(riskKey));
  baseline();await auth({});seedV2(sample);
  const revLatch=deferred();syncImpl=()=>revLatch.promise;
  const revFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'J09 pending revision');
  const revRaw=JSON.stringify({...sample,status:2,revision:6});storage.set(riskKey,revRaw);
  revLatch.resolve({committed:1});await revFlight;
  assertCheck('J09 higher revision retains newer record',storage.get(riskKey)===revRaw);
  // J11/J14/J16: actual online toggle handler, not a copied cleanup helper.
  baseline();await auth({});day.style.display='';month.style.display='none';globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-online', {force:true});
  const onlineLatch=deferred();let singleCalls=0;let statCalls=0;
  AttendanceService.saveRecord=async()=>{singleCalls++;return onlineLatch.promise};
  AttendanceService.updateMemberStats=async()=>{statCalls++};
  const singleFlight=globalThis.toggleAttendance('Alice');
  await waitFor(()=>singleCalls===1,'J11 online single sent');
  const onlineRow=clubEntries('club-a').find(([,raw])=>JSON.parse(raw).name==='Alice');
  const onlineKey=onlineRow?.[0];const onlineRaw=onlineRow?.[1];
  assertCheck('J11 single ACK test captured real persisted raw at submit',!!onlineKey&&!!onlineRaw);
  if(onlineKey){storage.set(onlineKey,JSON.stringify({...JSON.parse(onlineRaw),status:2,revision:JSON.parse(onlineRaw).revision}));}
  onlineLatch.resolve();await singleFlight;
  assertCheck('J11 same-revision new online intent survives older ACK',!!onlineKey&&storage.has(onlineKey)&&JSON.parse(storage.get(onlineKey)).status===2);
  baseline();await auth({});day.style.display='';month.style.display='none';globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-owner-switch',{force:true});
  const ownerLatch=deferred();let ownerCalls=0;statCalls=0;
  AttendanceService.saveRecord=async()=>{ownerCalls++;return ownerLatch.promise};
  const ownerFlight=globalThis.toggleAttendance('Alice');await waitFor(()=>ownerCalls===1,'J14 online single sent');
  const ownerKey=clubEntries('club-a')[0]?.[0];
  globalThis.__verifiedAuthContextState={ready:true,uid:'uid-new',clubId:'club-a',role:'admin',coachBranch:'',generation:100};
  ownerLatch.resolve();await ownerFlight;
  assertCheck('J14 owner switch after ACK preserves journal and skips new-owner member stats',!!ownerKey&&storage.has(ownerKey)&&statCalls===0);
  baseline();await auth({});day.style.display='';month.style.display='none';globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-offline-failed',{force:true});
  navigatorState.onLine=false;
  const oldSet=globalThis.localStorage.setItem;
  globalThis.localStorage.setItem=()=>{throw new Error('quota exceeded')};
  const failureResult=await globalThis.toggleAttendance('Alice');
  globalThis.localStorage.setItem=oldSet;navigatorState.onLine=true;
  assertCheck('J16 offline storage error never returns false saved-success',failureResult?.blocked===true&&storage.size===0);
  // J11b/J15 actual bulk callback: ACK only selected chunk, owner can switch.
  globalThis.__store.profiles=profiles;
  baseline();await auth({});day.style.display='';month.style.display='none';
  globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-bulk',{force:true});
  const bulkLatch=deferred();let bulkCalls=0;
  AttendanceService.bulkSaveRecords=async(_rows,options)=>{
    bulkCalls++;
    await bulkLatch.promise;
    options.onChunkCommitted(_rows.slice(0,1));
    throw Object.assign(new Error('partial'),{committed:1,pending:1});
  };
  const bulkFlight=globalThis.bulkCheckIn();await waitFor(()=>bulkCalls===1,'J11b bulk writer started');
  const bulkRows=clubEntries('club-a');
  assertCheck('J11b bulk enqueued two independently keyed journal records',bulkRows.length===2);
  const a=bulkRows.find(([,r])=>JSON.parse(r).name==='Alice');
  const b=bulkRows.find(([,r])=>JSON.parse(r).name==='Bob');
  if(a)storage.set(a[0],JSON.stringify({...JSON.parse(a[1]),status:3,revision:JSON.parse(a[1]).revision}));
  bulkLatch.resolve();await bulkFlight;
  assertCheck('J11b partial ACK cannot delete new raw, pending tail, OR rollback ACK row',
    !!a&&!!b&&storage.has(a[0])&&storage.has(b[0])&&globalThis.currentAttendanceData.Alice===1&&globalThis.currentAttendanceData.Bob===0,
    JSON.stringify(globalThis.currentAttendanceData));
  baseline();await auth({});day.style.display='';month.style.display='none';
  globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-bulk-switch',{force:true});
  const bulkOwnerLatch=deferred();bulkCalls=0;
  AttendanceService.bulkSaveRecords=async(rows,options)=>{
    bulkCalls++;await bulkOwnerLatch.promise;options.onChunkCommitted(rows);return {committed:rows.length};
  };
  const bulkOwnerFlight=globalThis.bulkCheckIn();await waitFor(()=>bulkCalls===1,'J15 bulk writer started');
  const oldBulkKeys=clubEntries('club-a').map(([k])=>k);
  globalThis.__verifiedAuthContextState={ready:true,uid:'uid-new',clubId:'club-a',role:'admin',coachBranch:'',generation:100};
  bulkOwnerLatch.resolve();await bulkOwnerFlight;
  assertCheck('J15 owner switch after bulk ACK preserves old owner journal keys',oldBulkKeys.length===2&&oldBulkKeys.every(k=>storage.has(k)));
  baseline();await auth({});day.style.display='';month.style.display='none';
  globalThis.__store.profiles=profiles;globalThis.currentAttendanceData={Alice:0,Bob:0};
  await globalThis.renderAttendanceList('r4-enqueue-partial',{force:true});
  const oldSetPartial=globalThis.localStorage.setItem;
  let enqueueCalls=0;globalThis.localStorage.setItem=(key,value)=>{
    enqueueCalls++;if(enqueueCalls===2)throw new Error('quota on second entry');
    oldSetPartial(key,value);
  };
  navigatorState.onLine=false;
  const partialResult=await globalThis.bulkCheckIn();
  globalThis.localStorage.setItem=oldSetPartial;navigatorState.onLine=true;
  const queuedPartial=clubEntries('club-a');
  assertCheck('J16 partial bulk enqueue must preserve exactly the successfully persisted item and reflect UI',
    partialResult?.blocked===true&&queuedPartial.length===1&&
    Object.values(globalThis.currentAttendanceData).filter(x=>x===1).length===1,
    'queued='+queuedPartial.length+' statuses='+JSON.stringify(globalThis.currentAttendanceData));
  // J12 preserves existing 400-item chunk policy without another writer lane.
  for (const size of [1,399,400,401]) {
    baseline();await auth({});
    for (let n=0;n<size;n++) {
      const name='F'+n;
      seedV2({...sample,name,profileId:name,docId:name+'_2026-08-15',revision:1});
    }
    await globalThis.syncOfflineAttendance();
    const sizes=events.filter(e=>e.type==='write').map(e=>Object.keys(e.args[2]).length);
    assertCheck('J12 V2 '+size+' rows use existing bounded chunks and ACK cleanup',
      sizes.reduce((a,b)=>a+b,0)===size&&sizes.every(n=>n<=400)&&
      sizes.length===Math.ceil(size/400)&&clubEntries('club-a').length===0,
      'chunks='+sizes.join(',')+' pending='+clubEntries('club-a').length);
  }
  // J17 two journal keys with one canonical docId cannot collapse silently.
  baseline();await auth({});
  const dupA=seedV2(sample);
  const dupB=seedV2({...sample,shiftMode:'explicit-shift',shiftId:''});
  await globalThis.syncOfflineAttendance();
  assertCheck('J17 duplicate docId across journal keys blocks whole chunk and preserves both',
    dupA!==dupB&&storage.has(dupA)&&storage.has(dupB)&&count()===0,
    'writes='+count()+' keys='+storage.size);
  baseline();await auth({});
  const malformed=seedV2(sample);storage.set(malformed,'{"broken":');
  await globalThis.syncOfflineAttendance();
  assertCheck('J17 malformed raw cannot be submitted or removed',count()===0&&storage.has(malformed));
  console.log(`D1C3B7R2R4 SOURCE ACTUAL HANDLERS: ${passes.length} PASS / ${failures.length} FAIL`);
} catch(error){check(false,'R3 real module test bootstrap',error?.stack||String(error));}
if(failures.length)process.exitCode=1;
