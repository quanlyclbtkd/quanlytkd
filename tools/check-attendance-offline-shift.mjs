// tools/check-attendance-offline-shift.mjs
// Phase 4.0B-4J-6A: Static analysis — Attendance Offline Shift Sync + Branch Report Accuracy
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');

const TAG = '[AttOfflineShiftCheck]';
let passes = 0; let fails = 0; let warns = 0;

function pass(msg)  { console.log(`${TAG} PASS  ${msg}`); passes++; }
function fail(msg)  { console.error(`${TAG} FAIL  ${msg}`); fails++; }
function warn(msg)  { console.warn(`${TAG} WARN  ${msg}`); warns++; }
function section(s) { console.log(`\n${TAG} ── ${s} ──`); }

const attPath = resolve(rootDir, 'js/modules/attendance.js');
const svcPath = resolve(rootDir, 'js/services/attendance.service.js');

if (!existsSync(attPath)) { console.error(`${TAG} FAIL  attendance.js not found`); process.exit(1); }
if (!existsSync(svcPath)) { console.error(`${TAG} FAIL  attendance.service.js not found`); process.exit(1); }

const att = readFileSync(attPath, 'utf-8');
const svc = readFileSync(svcPath, 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
section('1. _saveAttOffline stores shiftId');
if (/_saveAttOffline/.test(att) && /shiftId.*_currentShiftId|_currentShiftId.*shiftId/.test(att))
    pass('_saveAttOffline stores shiftId from _currentShiftId');
else
    fail('_saveAttOffline does NOT store shiftId — offline records will lose shift info');

// ─────────────────────────────────────────────────────────────────────────────
section('2. _saveAttOffline stores docId');
if (/_saveAttOffline[\s\S]{0,600}docId/.test(att))
    pass('_saveAttOffline stores docId in each offline record');
else
    fail('_saveAttOffline does NOT store docId — bulkSyncOffline will use legacy name_date key');

// ─────────────────────────────────────────────────────────────────────────────
section('3. bulkSyncOffline uses rec.docId (shift-aware)');
if (/rec\.docId\s*\|\|/.test(svc))
    pass('bulkSyncOffline prefers rec.docId before computing docId');
else
    fail('bulkSyncOffline does not use rec.docId — offline sync will always use legacy name_date key');

// ─────────────────────────────────────────────────────────────────────────────
section('4. bulkSyncOffline has shift-aware docId helper');
if (/_getAttDocId|rec\.shiftId/.test(svc))
    pass('bulkSyncOffline has shift-aware docId fallback (_getAttDocId or rec.shiftId)');
else
    fail('bulkSyncOffline missing shift-aware docId fallback');

// ─────────────────────────────────────────────────────────────────────────────
section('5. bulkSyncOffline writes shiftId to Firestore document');
if (/writeData\.shiftId\s*=\s*rec\.shiftId|rec\.shiftId/.test(svc))
    pass('bulkSyncOffline includes shiftId in written document data');
else
    fail('bulkSyncOffline does NOT write shiftId to Firestore document');

// ─────────────────────────────────────────────────────────────────────────────
section('6. bulkSyncOffline canonical sanitizer excludes docId/journal metadata');
const canonicalWriteStart = svc.indexOf('function _toCanonicalAttendanceWrite(');
const canonicalWriteEnd = svc.indexOf('export const AttendanceService', canonicalWriteStart);
const canonicalWriteBlock = svc.slice(canonicalWriteStart, canonicalWriteEnd);
if (canonicalWriteStart >= 0 && !/\bdocId\s*:/.test(canonicalWriteBlock) && !canonicalWriteBlock.includes('...rec'))
    pass('bulkSyncOffline whitelist sanitizer excludes docId and journal metadata from Firestore data');
else
    fail('bulkSyncOffline canonical sanitizer missing or may leak docId/journal metadata');

// ─────────────────────────────────────────────────────────────────────────────
section('7. bulkCheckIn catch rollback uses getAttendanceDocId');
if (/getAttendanceDocId\(name,\s*_attCurrentDate,\s*_currentShiftId\)/.test(att))
    pass('bulkCheckIn catch rollback uses getAttendanceDocId (shift-aware key)');
else
    fail('bulkCheckIn catch rollback still uses name+_attCurrentDate — shift cache rollback will be wrong');

// ─────────────────────────────────────────────────────────────────────────────
section('8. printAttendanceBranchReport calls AttendanceService.loadByMonth');
if (/AttendanceService\.loadByMonth/.test(att))
    pass('printAttendanceBranchReport calls AttendanceService.loadByMonth for real data');
else
    fail('printAttendanceBranchReport does NOT call loadByMonth — still uses empty attendanceMap');

// ─────────────────────────────────────────────────────────────────────────────
section('9. printAttendanceBranchReport no longer calls computeMonthlyAttendanceAccuracy with empty map {}');
// Check the branch report section specifically — it must not have computeMonthlyAttendanceAccuracy(p, monthStr, {})
const branchReportSection = att.slice(att.indexOf('printAttendanceBranchReport'));
if (/computeMonthlyAttendanceAccuracy\([^)]*,\s*\{\s*\}\s*\)/.test(branchReportSection))
    fail('printAttendanceBranchReport still calls computeMonthlyAttendanceAccuracy with empty {} map');
else
    pass('printAttendanceBranchReport no longer calls computeMonthlyAttendanceAccuracy with empty map');

// ─────────────────────────────────────────────────────────────────────────────
section('10. printAttendanceBranchReport is async (awaits loadByMonth)');
if (/window\.printAttendanceBranchReport\s*=\s*async\s+function/.test(att))
    pass('printAttendanceBranchReport is async function');
else
    fail('printAttendanceBranchReport is not async — cannot await loadByMonth');

// ─────────────────────────────────────────────────────────────────────────────
section('11. computeMonthlyAttendanceAccuracy supports shiftId key lookup');
if (/profileName.*shiftId|entry\.shiftId.*attendanceMap/.test(att))
    pass('computeMonthlyAttendanceAccuracy uses shiftId-aware key when profileName provided');
else
    fail('computeMonthlyAttendanceAccuracy does not support shiftId key lookup');

// ─────────────────────────────────────────────────────────────────────────────
section('12. computeMonthlyAttendanceAccuracy handles object values from loadByMonth');
if (/typeof raw === 'object'\s*\?.*raw\.status|rec\.status/.test(att))
    pass('computeMonthlyAttendanceAccuracy handles object values (rec.status) from loadByMonth');
else
    fail('computeMonthlyAttendanceAccuracy does not handle object values — will count loadByMonth records as missing');

// ─────────────────────────────────────────────────────────────────────────────
section('13. printAttendanceStatus has offlineQueueCount');
if (/offlineQueueCount/.test(att))
    pass('printAttendanceStatus includes offlineQueueCount');
else
    fail('printAttendanceStatus missing offlineQueueCount');

// ─────────────────────────────────────────────────────────────────────────────
section('14. printAttendanceStatus has offlineShiftRecordsCount');
if (/offlineShiftRecordsCount/.test(att))
    pass('printAttendanceStatus includes offlineShiftRecordsCount');
else
    fail('printAttendanceStatus missing offlineShiftRecordsCount');

// ─────────────────────────────────────────────────────────────────────────────
section('15. No Firestore writes in new helpers (only bulkSyncOffline writes)');
const newHelpersBlock = att.slice(att.indexOf('_buildAttendanceMapForProfile'));
if (/setDoc|addDoc|updateDoc|writeBatch/.test(newHelpersBlock.slice(0, 2000)))
    fail('_buildAttendanceMapForProfile or branch report contains Firestore write call');
else
    pass('_buildAttendanceMapForProfile and branch report do not write to Firestore');

// ─────────────────────────────────────────────────────────────────────────────
section('16. No PII logged in offline/shift helpers');
if (/console\.(log|info|warn|error)\s*\(.*name.*\+/.test(
    att.slice(att.indexOf('_buildAttendanceMapForProfile')).slice(0, 2000)
))
    warn('_buildAttendanceMapForProfile may be logging student names (PII)');
else
    pass('No PII (student name) logged in _buildAttendanceMapForProfile');

// ─────────────────────────────────────────────────────────────────────────────
section('17. Backward compatibility — legacy records without shiftId still work');
// bulkSyncOffline should have fallback to name_date when no shiftId.
// The helper returns name + '_' + d when shiftId is falsy.
if (/rec\.docId\s*\|\|/.test(svc) && /_getAttDocId/.test(svc))
    pass('bulkSyncOffline falls back to name_date key when no docId/shiftId (_getAttDocId backward compat)');
else if (/rec\.docId\s*\|\|/.test(svc) && /name\s*\+\s*'_'\s*\+/.test(svc))
    pass('bulkSyncOffline falls back to name_date concat when no docId/shiftId (backward compat)');
else
    fail('bulkSyncOffline missing backward compat fallback for legacy records without shiftId');

// ─────────────────────────────────────────────────────────────────────────────
section('18. No Firestore Rules opened as public');
const rulesPath = resolve(rootDir, 'firestore.rules');
if (existsSync(rulesPath)) {
    const rules = readFileSync(rulesPath, 'utf-8');
    if (/allow\s+(read|write)\s*:\s*if\s+true/.test(rules))
        fail('firestore.rules has allow read/write: if true — public access!');
    else
        pass('No public access in firestore.rules');
} else {
    warn('firestore.rules not found — skipping rules check');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${TAG} Checked: ${passes + fails + warns} items`);
if (fails > 0) {
    console.error(`${TAG} ❌ FAILED — ${fails} failure(s), ${warns} warning(s), ${passes} passed.`);
    process.exit(1);
} else {
    console.log(`${TAG} ✅ OK — All offline shift checks passed (${warns} warning(s)).`);
}
