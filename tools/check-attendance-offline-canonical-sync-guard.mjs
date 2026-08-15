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
check(syncBlock.includes('_removeAttOfflineMutation(record)') && attendance.includes('current?.revision') && attendance.includes('record.revision'), 'Committed cleanup is revision-scoped');

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
  globalThis.RoleReadBoundary = { isCoachAttendanceOnly: () => globalThis.userRole === 'coach', canMount: () => true };
  const runtimeErrors = []; globalThis.recordRuntimeError = (source, err, extra) => runtimeErrors.push({ source, err, extra });

  // G1-G4: exercise the real canonical offline writer with fake writeBatch.
  const writes = []; const deletes = [];
  globalThis._fb_init = {
    doc: (...parts) => ({ parts }),
    writeBatch: () => ({ set: (ref, payload) => writes.push({ ref, payload }), delete: ref => deletes.push(ref), commit: async () => {} }),
  };
  const serviceUrl = pathToFileURL(path.join(root, 'js/services/attendance.service.js')).href + '?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1';
  const { AttendanceService } = await import(serviceUrl);
  const realBulkSyncOffline = AttendanceService.bulkSyncOffline.bind(AttendanceService);
  const dirty = { version: 2, clubId: 'club-a', operation: 'set', shiftMode: 'explicit-shift', queuedAt: 100, lastUpdatedAt: 200, revision: 3, docId: 'Alice_2026-08-15_morning', journalKey: 'local', syncState: 'pending', retryCount: 9, profileId: 'p1', name: 'Alice', belt: 'Đai Đen', branch: 'CS1', date: '2026-08-15', month: '2026-08', shiftId: 'morning', status: 1 };
  await realBulkSyncOffline('club-a', '2026-08-15', { [dirty.docId]: dirty });
  const payload = writes[0]?.payload || {};
  const expectedKeys = ['profileId','name','belt','branch','date','month','status','timestamp','shiftId'].sort();
  check(JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(expectedKeys), 'G1 canonical batch.set payload contains business fields only', JSON.stringify(payload));
  const forbidden = ['version','clubId','operation','shiftMode','queuedAt','lastUpdatedAt','revision','docId','journalKey','syncState','retryCount'];
  check(forbidden.every(key => !Object.prototype.hasOwnProperty.call(payload, key)), 'G2 journal metadata is absent from Firestore payload');
  writes.length = 0; deletes.length = 0;
  await realBulkSyncOffline('club-a', '2026-08-15', { x: { ...dirty, operation: 'delete', status: 3 } });
  check(deletes.length === 1 && writes.length === 0, 'G3 operation=delete preserves delete semantics');
  writes.length = 0; deletes.length = 0;
  await realBulkSyncOffline('club-a', '2026-08-15', { Alice: { name: 'Alice', profileId: 'p1', belt: 'Đai Đen', branch: 'CS1', date: '2026-08-15', month: '2026-08', status: 1, queuedAt: 999, legacyNoise: true } });
  check(writes.length === 1 && !Object.prototype.hasOwnProperty.call(writes[0].payload, 'queuedAt') && !Object.prototype.hasOwnProperty.call(writes[0].payload, 'legacyNoise'), 'G4 legacy V1 record uses the same canonical sanitizer');

  // Replace network methods only after canonical service tests.
  let shiftImpl = async () => []; let dailyImpl = async () => []; let bulkSyncImpl = async () => {};
  const syncCalls = [];
  AttendanceService.loadShifts = (...args) => shiftImpl(...args);
  AttendanceService.loadByDate = (...args) => dailyImpl(...args);
  AttendanceService.loadCoachNotes = async () => [];
  AttendanceService.saveRecord = async () => {};
  AttendanceService.deleteRecord = async () => {};
  AttendanceService.bulkSaveRecords = async () => {};
  AttendanceService.saveShifts = async () => {};
  AttendanceService.updateMemberStats = async () => {};
  AttendanceService._increment = n => n;
  AttendanceService.bulkSyncOffline = async (...args) => { syncCalls.push({ clubId: args[0], date: args[1], count: Object.keys(args[2] || {}).length }); return bulkSyncImpl(...args); };

  const registry = await import(pathToFileURL(path.join(root, 'js/core/globalOwnershipRegistry.js')).href);
  registry.initGlobalOwnershipRegistry();
  const moduleUrl = pathToFileURL(path.join(root, 'js/modules/attendance.js')).href + `?v5u6g1=${Date.now()}`;
  const { initAttendance } = await import(moduleUrl);
  const api = initAttendance(); await tick();

  const switchContext = async ({ club, uid = `uid-${club}`, role = 'admin', coachBranch = '', shifts = [] }) => {
    globalThis.__store.clubId = club; globalThis.__store.currentClubId = club; globalThis.currentClubId = club;
    globalThis.__store.userRole = role; globalThis.userRole = role; globalThis.__store.coachBranch = coachBranch; globalThis.coachBranch = coachBranch;
    Object.assign(globalThis.__verifiedAuthContextState, { ready: true, uid, clubId: club, role, coachBranch, generation: Number(globalThis.__verifiedAuthContextState.generation || 0) + 1 });
    dateEl.value = '2026-08-15'; branchEl.value = role === 'coach' ? coachBranch : 'all'; beltEl.value = 'all'; shiftEl.value = ''; showAll.checked = true; day.style.display = ''; month.style.display = 'none'; tab.classList.add('active');
    shiftImpl = async () => shifts; dailyImpl = async () => [];
    api.resetForClub(club); await api.ensureShiftsLoaded({ force: true });
  };
  const reset = async ({ club = 'club-a', role = 'admin', coachBranch = '', shifts = [], online = true } = {}) => { storage.clear(); syncCalls.length = 0; navigatorState.onLine = online; bulkSyncImpl = async () => {}; await switchContext({ club, role, coachBranch, shifts }); };
  const selectShift = async (id) => { shiftEl.value = id; await globalThis.onShiftChange(); };
  const makeLegacyRecord = (club, name = 'Alice', revision = 1) => ({ clubId: club, date: '2026-08-15', month: '2026-08', branch: 'CS1', shiftMode: 'legacy-no-shift', shiftId: '', docId: `${name}_2026-08-15`, profileId: name, name, operation: 'set', status: 1, queuedAt: 1, lastUpdatedAt: 1, revision });

  // G5 same-context single flight.
  await reset({ club: 'club-a', shifts: [], online: true }); seedV2(makeLegacyRecord('club-a'));
  const sameLatch = deferred(); bulkSyncImpl = () => sameLatch.promise;
  const g5a = globalThis.syncOfflineAttendance(); const g5b = globalThis.syncOfflineAttendance(); const g5c = globalThis.syncOfflineAttendance();
  await waitFor(() => syncCalls.length === 1, 'G5 one writer call');
  check(g5a === g5b && g5b === g5c && syncCalls.length === 1, 'G5 same-context requests share exactly one writer flight');
  sameLatch.resolve(); await Promise.all([g5a,g5b,g5c]); await tick();

  // G6/G7/G9 A -> B: B cannot run in parallel and receives exactly one follow-up.
  await reset({ club: 'club-a', shifts: [], online: true }); const aKey = seedV2(makeLegacyRecord('club-a')); const bKey = seedV2(makeLegacyRecord('club-b'));
  const abLatch = deferred(); bulkSyncImpl = (club) => club === 'club-a' ? abLatch.promise : Promise.resolve();
  const staleUiBefore = Number(globalThis.__attendanceDebug?.offlineSyncStaleUiRefreshDropped || 0);
  const abA = globalThis.syncOfflineAttendance(); await waitFor(() => syncCalls.length === 1 && syncCalls[0].clubId === 'club-a', 'G6 A started');
  await switchContext({ club: 'club-b', shifts: [] }); const abB = globalThis.syncOfflineAttendance();
  check(abB === abA && syncCalls.length === 1, 'G6 A→B queues B without starting a parallel writer');
  abLatch.resolve(); await abA; await waitFor(() => syncCalls.some(c => c.clubId === 'club-b'), 'G7 B follow-up'); await waitFor(() => !storage.has(bKey), 'G7 B cleanup');
  check(syncCalls.filter(c => c.clubId === 'club-b').length === 1, 'G7 A settle starts exactly one B follow-up flight');
  check(!storage.has(aKey) && !storage.has(bKey), 'G7 committed A and follow-up B clean only their confirmed entries');
  check(Number(globalThis.__attendanceDebug?.offlineSyncStaleUiRefreshDropped || 0) > staleUiBefore, 'G9 late A completion cannot refresh Club B Attendance UI');

  // G8 A -> B -> C latest pending context wins.
  await reset({ club: 'club-a', shifts: [], online: true }); seedV2(makeLegacyRecord('club-a')); const bKeep = seedV2(makeLegacyRecord('club-b')); const cKey = seedV2(makeLegacyRecord('club-c'));
  const abcLatch = deferred(); bulkSyncImpl = (club) => club === 'club-a' ? abcLatch.promise : Promise.resolve();
  const abcA = globalThis.syncOfflineAttendance(); await waitFor(() => syncCalls.length === 1, 'G8 A started');
  await switchContext({ club: 'club-b', shifts: [] }); globalThis.syncOfflineAttendance();
  await switchContext({ club: 'club-c', shifts: [] }); globalThis.syncOfflineAttendance();
  abcLatch.resolve(); await abcA; await waitFor(() => syncCalls.some(c => c.clubId === 'club-c'), 'G8 C follow-up'); await waitFor(() => !storage.has(cKey), 'G8 C cleanup');
  check(syncCalls.filter(c => c.clubId === 'club-b').length === 0 && syncCalls.filter(c => c.clubId === 'club-c').length === 1 && storage.has(bKeep), 'G8 A→B→C follows only latest C; B queue remains pending');

  // G10-G12: stale context after first of 3 chunks stops future A writes and preserves uncommitted entries.
  await reset({ club: 'club-a', shifts: [], online: true });
  for (let i = 0; i < 850; i++) seedV2(makeLegacyRecord('club-a', `P${i}`));
  const chunkLatch = deferred(); bulkSyncImpl = () => chunkLatch.promise;
  const chunkFlight = globalThis.syncOfflineAttendance(); await waitFor(() => syncCalls.length === 1 && syncCalls[0].count === 400, 'G10 first 400 chunk');
  await switchContext({ club: 'club-b', shifts: [] }); chunkLatch.resolve(); await chunkFlight; await tick();
  check(syncCalls.length === 1, 'G10 stale old context starts zero chunk-2/chunk-3 network writes');
  check(clubEntries('club-a').length === 450, 'G11/G12 only committed chunk-1 is cleaned; 450 uncommitted entries remain');

  // G13 revision guard: older commit must not delete a newer local mutation.
  await reset({ club: 'club-a', shifts: [], online: true });
  const rev3 = makeLegacyRecord('club-a', 'Alice', 3); const revKey = seedV2(rev3); const revLatch = deferred(); bulkSyncImpl = () => revLatch.promise;
  const revFlight = globalThis.syncOfflineAttendance(); await waitFor(() => syncCalls.length === 1, 'G13 revision 3 sent');
  storage.set(revKey, JSON.stringify({ ...rev3, revision: 4, status: 2, lastUpdatedAt: 2 }));
  revLatch.resolve(); await revFlight;
  const latest = JSON.parse(storage.get(revKey) || 'null');
  check(latest?.revision === 4 && latest?.status === 2, 'G13 successful revision-3 commit preserves newer local revision-4 mutation');

  // G14 Morning/Evening isolation remains; G15 configured blank blocks; G16 legacy no-shift remains.
  await reset({ club: 'club-a', shifts: [{ id:'morning', name:'Ca sáng', branch:'CS1' }, { id:'evening', name:'Ca chiều', branch:'CS1' }], online: false });
  await selectShift('morning'); await globalThis.toggleAttendance('Alice'); await selectShift('evening'); await globalThis.toggleAttendance('Alice');
  const docs = new Set(clubEntries('club-a').map(([,raw]) => JSON.parse(raw).docId));
  check(docs.has('Alice_2026-08-15_morning') && docs.has('Alice_2026-08-15_evening') && docs.size === 2, 'G14 Morning/Evening same-date mutations remain isolated');
  await reset({ club:'club-a', shifts:[{ id:'morning', name:'Ca sáng', branch:'CS1' }], online:false }); await api.requestDailyRefresh('g15', { force:true }); await globalThis.toggleAttendance('Alice');
  check(storage.size === 0, 'G15 configured shifts + blank selection performs zero offline write');
  await reset({ club:'club-a', shifts:[], online:false }); await api.requestDailyRefresh('g16', { force:true }); await globalThis.toggleAttendance('Alice');
  const legacyV2 = clubEntries('club-a').map(([,raw]) => JSON.parse(raw));
  check(legacyV2.length === 1 && legacyV2[0].shiftMode === 'legacy-no-shift' && legacyV2[0].shiftId === '', 'G16 true legacy no-shift Attendance remains supported');

  check(onlineHandlers.length === 1, 'Existing online event owner remains idempotent (one listener in runtime harness)');
} catch (error) {
  check(false, 'G1-G16 runtime harness completed', error?.stack || error?.message || String(error));
}

console.log(`\nTotal: ${passes.length + failures.length} | PASS: ${passes.length} | FAIL: ${failures.length}`);
if (failures.length) {
  failures.forEach(({ message, detail }) => console.error(' -', message, detail || ''));
  process.exit(1);
}
console.log('Phase 4K-6V5U6G1 Attendance Offline Canonical Sync Guard passed.\n');
