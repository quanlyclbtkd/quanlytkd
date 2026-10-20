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

  const good = (name, date, extra={}) => ({ clubId:'club-a', date, docId:name+'_'+date,
    name, profileId:name, branch:'CS1', status:1, operation:'set', shiftMode:'legacy-no-shift', shiftId:'', ...extra });
  const goodDate='2026-08-16', badDate='2026-08-15';
  const submitted=()=>events.filter(x=>x.type==='write').map(x=>({date:x.args[1],ids:Object.keys(x.args[2])}));
  const measure = (label,truth,result) => assertCheck(label,truth,JSON.stringify({calls:submitted(),result,pending:storage.size}));
  // I01: actual imported handler must not block a completely independent day.
  baseline();await auth({});
  const bad=seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  const rawBad=storage.get(bad);const goodKey=seedV2(good('Good',goodDate));
  const outcome=await globalThis.syncOfflineAttendance();
  measure('I01 RED independent valid date survives shift-contract rejection on date A',
    submitted().length===1&&submitted()[0].date===goodDate&&storage.get(bad)===rawBad&&!storage.has(goodKey)&&outcome.synced===1,outcome);
  // I03: good and bad SAME DAY must never be submitted as a subset.
  baseline();await auth({});const a=seedV2(good('Alice',badDate)),b=seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  const same=await globalThis.syncOfflineAttendance();
  measure('I03 same-day all-or-nothing preflight remains fail closed',submitted().length===0&&storage.has(a)&&storage.has(b),same);
  // I09a: foreign valid journal never blocks a current-club day.
  baseline();await auth({});const foreign=seedV2(good('Else','2026-08-17',{clubId:'club-b'}));const own=seedV2(good('Current',goodDate));
  const foreignOutcome=await globalThis.syncOfflineAttendance();
  measure('I09a valid foreign-club journal preserved while current club progresses',submitted().length===1&&!storage.has(own)&&storage.has(foreign),foreignOutcome);

  // I02: next sync has only blocked A; it must not re-send cleaned B.
  baseline();await auth({});const invalidAgain=seedV2(good('Blocked',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  const secondGood=seedV2(good('Once',goodDate));
  const first=await globalThis.syncOfflineAttendance(), firstCalls=count();
  const second=await globalThis.syncOfflineAttendance();
  measure('I02 second sync does not replay already ACK-cleaned date',firstCalls===1&&count()===1&&storage.has(invalidAgain)&&!storage.has(secondGood)&&second.synced===0,second);
  // I04: order-independent classification; no writer until complete scan.
  for(const order of ['bad-first','good-first']){
    baseline();await auth({});
    const a=()=>seedV2(good('Invalid',badDate,{shiftMode:'explicit-shift',shiftId:''}));
    const b=()=>seedV2(good('Valid',goodDate));
    if(order==='bad-first'){a();b()}else{b();a()}
    const result=await globalThis.syncOfflineAttendance();
    measure('I04 '+order+' keeps both journal scopes isolated',submitted().length===1&&submitted()[0].date===goodDate&&storage.size===1,result);
  }
  // I05: two independent good dates progress sequentially.
  baseline();await auth({});seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  seedV2(good('B',goodDate));seedV2(good('C','2026-08-17'));
  const triple=await globalThis.syncOfflineAttendance();
  measure('I05 two healthy dates pass via same sequential writer and one bad day stays pending',
    JSON.stringify(submitted().map(x=>x.date))===JSON.stringify([goodDate,'2026-08-17'])&&storage.size===1&&triple.synced===2,triple);
  // I06: both days invalid, zero V2 submissions.
  baseline();await auth({});seedV2(good('BadA',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  seedV2(good('BadB',goodDate,{shiftMode:'legacy-no-shift',shiftId:'bad'}));
  const both=await globalThis.syncOfflineAttendance();
  measure('I06 two bad dates remain pending with zero writes',count()===0&&storage.size===2,both);
  // I07: a Coach delete cannot become authorized by per-day isolation.
  baseline();await auth({role:'coach',branch:'CS1'});
  const toReview=seedV2(good('Delete',badDate,{status:0,operation:'delete'}));
  const coachGood=seedV2(good('Set',goodDate));
  const coachResult=await globalThis.syncOfflineAttendance();
  measure('I07 Coach delete is never written; separate CS1 set may proceed provisionally',
    submitted().length===1&&submitted()[0].date===goodDate&&storage.has(toReview)&&!storage.has(coachGood),coachResult);
  // I08/I19: untrusted principal or wrong branch is globally fatal for V2.
  for (const opts of [{ready:false},{role:'coach',branch:'CS1'}]) {
    baseline();await auth(opts);
    seedV2(good('Bad',badDate,opts.ready===false?{}:{branch:'CS2'}));seedV2(good('Good',goodDate));
    const blocked=await globalThis.syncOfflineAttendance();
    measure('I08/I19 unverified/wrong-branch causes global V2 STOP '+JSON.stringify(opts),count()===0&&storage.size===2,blocked);
  }
  // I09b/I20: a current-club malformed V2 scanned BEFORE classification is fatal.
  for(const corruption of ['bad-json','key-disagrees','broken-date']){
    baseline();await auth({});seedV2(good('Good',goodDate));
    const x=seedV2(good('Bad',badDate));
    if(corruption==='bad-json')storage.set(x,'{BROKEN');
    if(corruption==='key-disagrees')storage.set(x,JSON.stringify(good('Bad','2026-09-19')));
    if(corruption==='broken-date')storage.set(x,JSON.stringify(good('Bad','2026-02-30')));
    const result=await globalThis.syncOfflineAttendance();
    measure('I09b/I20 '+corruption+' aborts unsafe V2 but preserves all pending',count()===0&&storage.size===2,result);
  }
  // I10: configured shifts are checked by existing authority per record.
  baseline();await auth({shiftsConfig:[{id:'shift1',name:'Ca 1',branch:'CS1'}]});
  const invalidShift=seedV2(good('Bad',badDate,{shiftMode:'legacy-no-shift',shiftId:''}));
  const validShift=seedV2(good('Good',goodDate,{shiftMode:'explicit-shift',shiftId:'shift1',docId:'Good_'+goodDate+'_shift1'}));
  const configResult=await globalThis.syncOfflineAttendance();
  measure('I10 configured real shift B allowed, A legacy blocked without auto-upgrade',submitted().length===1&&submitted()[0].date===goodDate&&storage.has(invalidShift)&&!storage.has(validShift),configResult);
  // I11: two conflicting entries share one canonical target even across keys.
  baseline();await auth({});const dup1=seedV2(good('Dup',badDate));
  const dup2=seedV2(good('Dup',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  const dupResult=await globalThis.syncOfflineAttendance();
  measure('I11 duplicate docId prevents sending any chunk from that date',dup1!==dup2&&count()===0&&storage.size===2,dupResult);
  // I12: 401 valid B entries form 400+1 chunks, while invalid A remains isolated.
  baseline();await auth({});seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  for(let i=0;i<401;i++)seedV2(good('B'+i,goodDate));
  const batches=await globalThis.syncOfflineAttendance();
  measure('I12 401 healthy records use two old bounded chunks',submitted().length===2&&submitted()[0].ids.length===400&&submitted()[1].ids.length===1&&storage.size===1&&batches.synced===401,batches);
  // I13: raw changed after scan prevents submission, not automatic partial patch.
  baseline();await auth({});const stale=seedV2(good('Stale',goodDate));
  globalThis.showToast=msg=>{if(String(msg).includes('Đang đồng bộ'))storage.set(stale,JSON.stringify(good('Stale',goodDate,{status:2}))) };
  const staleResult=await globalThis.syncOfflineAttendance();globalThis.showToast=()=>{};
  measure('I13 changed raw before V2 service submit is not sent',count()===0&&storage.has(stale),staleResult);
  // I14: owner switches after first day's writer ACK. Never send next date.
  baseline();await auth({});const firstDay=seedV2(good('One',goodDate));const nextDay=seedV2(good('Two','2026-08-17'));
  const pendingAck=deferred();syncImpl=()=>pendingAck.promise;
  const switchFlight=globalThis.syncOfflineAttendance();await waitFor(()=>count()===1,'I14 first V2 writer started');
  globalThis.__verifiedAuthContextState.uid='uid-changed';pendingAck.resolve({committed:1});
  const switchOutcome=await switchFlight;
  measure('I14 changed UID preserves both journals and no second writer',count()===1&&storage.has(firstDay)&&storage.has(nextDay)&&switchOutcome.staleStopped===true,switchOutcome);
  // I15: failed server commit does not cleanup or submit later days.
  baseline();await auth({});const failB=seedV2(good('One',goodDate));const failC=seedV2(good('Two','2026-08-17'));
  syncImpl=()=>Promise.reject(Object.assign(new Error('permission denied'),{code:'permission-denied'}));
  const failed=await globalThis.syncOfflineAttendance();
  measure('I15 denied first commit keeps all pending and stops next day',count()===1&&storage.has(failB)&&storage.has(failC),failed);
  // I16: independently accepted V1 runs first and does not become a new V2 writer.
  baseline();await auth({});const legacy='offline_att_club-a_2026-08-15';
  storage.set(legacy,JSON.stringify({clubId:'club-a',date:badDate,records:{V1:{name:'V1',branch:'CS1',status:1}}}));
  seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));seedV2(good('Good',goodDate));
  const mixedV1=await globalThis.syncOfflineAttendance();
  measure('I16 original V1 ordering preserved while unrelated V2 B proceeds',submitted().length===2&&submitted()[0].date===badDate&&submitted()[1].date===goodDate&&mixedV1.legacySynced===1,mixedV1);
  // I17: partial ACK must not falsely claim all journal records were synced.
  baseline();await auth({});seedV2(good('Bad',badDate,{shiftMode:'explicit-shift',shiftId:''}));seedV2(good('Good',goodDate));
  const notices=[];globalThis.showToast=msg=>notices.push(String(msg));
  const partial=await globalThis.syncOfflineAttendance();globalThis.showToast=()=>{};
  measure('I17 ACK for good date reports remaining pending, not total completion',partial.synced===1&&partial.pending===1&&notices.some(msg=>msg.includes('chờ đồng bộ')),partial);

  // I17 independently tests the existing toast with a V1 server ACK while
  // V2 is blocked, even on baseline where V2 would not progress cross-date.
  baseline();await auth({});
  storage.set('offline_att_club-a_2026-08-15',JSON.stringify({clubId:'club-a',date:badDate,records:{V1Only:{name:'V1Only',branch:'CS1',status:1}}}));
  const blockedV2=seedV2(good('BlockedV2',badDate,{shiftMode:'explicit-shift',shiftId:''}));
  const v1Toasts=[];globalThis.showToast=m=>v1Toasts.push(String(m));
  const v1ToastOutcome=await globalThis.syncOfflineAttendance();globalThis.showToast=()=>{};
  measure('I17 V1 ACK with blocked V2 must not announce all offline journal as synchronized',
    count()===1&&storage.has(blockedV2)&&v1Toasts.some(m=>m.includes('chờ đồng bộ')),
    {result:v1ToastOutcome,toasts:v1Toasts});

  // I20: V1/V2 same canonical docId means V2 must not overwrite V1 ACK.
  baseline();await auth({});const old='offline_att_club-a_2026-08-15';
  storage.set(old,JSON.stringify({clubId:'club-a',date:badDate,records:{Overlap:{name:'Overlap',branch:'CS1',status:1}}}));
  const newKey=seedV2(good('Overlap',badDate));
  const conflicting=await globalThis.syncOfflineAttendance();
  measure('I20 V1/V2 shared target permits existing V1 only, V2 kept pending',count()===1&&storage.has(newKey)&&submitted()[0].date===badDate,conflicting);


  // I11 cross-day docId collision: a shift suffix can match a different day's
  // name/date ID. The invalid cross-day candidate must not isolate as safe.
  baseline();await auth({});
  const shared='Collision_'+goodDate;
  seedV2(good('Collision',badDate,{shiftMode:'explicit-shift',shiftId:'2026-08-16',docId:shared.replace('_'+goodDate,'_'+badDate+'_'+goodDate)}));
  seedV2(good('Collision_'+badDate,goodDate,{docId:'Collision_'+badDate+'_'+goodDate}));
  const cross=await globalThis.syncOfflineAttendance();
  measure('I11 same canonical docId across two dates triggers GLOBAL_V2_FATAL',count()===0&&storage.size===2,cross);
  // I12 preflight invalid record last in a 401-item date: no first chunk may go.
  baseline();await auth({});
  for(let i=0;i<401;i++)seedV2(good('Last'+i,goodDate));
  const tail=seedV2(good('LastBad',goodDate,{shiftMode:'explicit-shift',shiftId:''}));
  const lateBad=await globalThis.syncOfflineAttendance();
  measure('I12 late invalid on a >400 date prevents EVERY chunk',count()===0&&storage.size===402&&storage.has(tail),lateBad);
  // I12 ACK chunk 1, reject chunk 2: do not claim rollback of already ACKed.
  baseline();await auth({});
  for(let i=0;i<401;i++)seedV2(good('Chunk'+i,goodDate));
  let chunkNumber=0;syncImpl=()=>{chunkNumber++;if(chunkNumber===2)throw Object.assign(new Error('network'),{code:'unavailable'});return Promise.resolve({committed:400})};
  const chunksPartial=await globalThis.syncOfflineAttendance();
  measure('I12 partial second chunk failure retains 1 and reports 400 server ACK',count()===2&&storage.size===1&&chunksPartial.synced===400,chunksPartial);

  console.log(`R2R6 REAL HANDLER: ${passes.length} PASS / ${failures.length} FAIL`);
} catch(error){check(false,'R2R6 real module bootstrap',error?.stack||String(error));}
if(failures.length)process.exitCode=1;
