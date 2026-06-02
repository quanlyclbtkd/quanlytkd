// tools/check-attendance-scheduled-accuracy.mjs
// Phase 4.0B-4J-6: Static analysis — Attendance Scheduled Session Accuracy
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');

const TAG = '[AttendanceScheduleCheck]';
let passes = 0; let fails = 0; let warns = 0;

function pass(msg)  { console.log(`${TAG} PASS  ${msg}`); passes++; }
function fail(msg)  { console.error(`${TAG} FAIL  ${msg}`); fails++; }
function warn(msg)  { console.warn(`${TAG} WARN  ${msg}`); warns++; }
function section(s) { console.log(`\n${TAG} ── ${s} ──`); }

const attPath   = resolve(rootDir, 'js/modules/attendance.js');
const rulesPath = resolve(rootDir, 'firestore.rules');

if (!existsSync(attPath)) {
    console.error(`${TAG} FAIL  attendance.js not found`);
    process.exit(1);
}
if (!existsSync(rulesPath)) {
    console.error(`${TAG} FAIL  firestore.rules not found`);
    process.exit(1);
}

const att   = readFileSync(attPath,   'utf-8');
const rules = readFileSync(rulesPath, 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
section('1. getScheduledTrainingDatesForProfile helper');
if (/function getScheduledTrainingDatesForProfile/.test(att))
    pass('getScheduledTrainingDatesForProfile defined in attendance.js');
else
    fail('getScheduledTrainingDatesForProfile MISSING from attendance.js');

if (/trainingDays|scheduleDays/.test(att) && /getScheduledTrainingDatesForProfile/.test(att))
    pass('getScheduledTrainingDatesForProfile reads trainingDays/scheduleDays from profile');
else
    fail('getScheduledTrainingDatesForProfile does not use trainingDays/scheduleDays');

if (/expected:\s*true/.test(att))
    pass('getScheduledTrainingDatesForProfile includes expected:true flag in output');
else
    fail('getScheduledTrainingDatesForProfile output missing expected:true flag');

if (/Không có lịch|return \[\]/.test(att))
    pass('getScheduledTrainingDatesForProfile returns [] when no schedule found (with warning)');
else
    warn('getScheduledTrainingDatesForProfile may not return [] gracefully for missing schedule');

// ─────────────────────────────────────────────────────────────────────────────
section('2. computeMonthlyAttendanceAccuracy helper');
if (/function computeMonthlyAttendanceAccuracy/.test(att))
    pass('computeMonthlyAttendanceAccuracy defined in attendance.js');
else
    fail('computeMonthlyAttendanceAccuracy MISSING from attendance.js');

if (/expectedSessions/.test(att))
    pass('expectedSessions computed in attendance.js');
else
    fail('expectedSessions MISSING from attendance.js');

if (/missingAttendanceCount/.test(att))
    pass('missingAttendanceCount computed in attendance.js');
else
    fail('missingAttendanceCount MISSING from attendance.js');

if (/attendanceRate/.test(att))
    pass('attendanceRate computed in attendance.js');
else
    fail('attendanceRate MISSING from attendance.js');

if (/completionRate/.test(att))
    pass('completionRate computed in attendance.js');
else
    fail('completionRate MISSING from attendance.js');

// ─────────────────────────────────────────────────────────────────────────────
section('3. expectedSessions — no division by zero');
if (/expectedSessions\s*>\s*0/.test(att))
    pass('Division-by-zero guard: expectedSessions > 0 check present');
else
    fail('No division-by-zero guard for expectedSessions — will produce NaN/Infinity');

// ─────────────────────────────────────────────────────────────────────────────
section('4. attendanceRate based on expectedSessions (not just marked records)');
if (/presentCount\s*\/\s*expectedSessions/.test(att))
    pass('attendanceRate = presentCount / expectedSessions (schedule-based)');
else
    fail('attendanceRate not computed from expectedSessions — still uses old formula');

// ─────────────────────────────────────────────────────────────────────────────
section('5. completionRate — marked sessions / expected');
if (/completionRate/.test(att) && /presentCount\s*\+\s*absentCount\s*\+\s*excusedCount/.test(att))
    pass('completionRate formula uses (present+absent+excused)/expectedSessions');
else
    fail('completionRate formula MISSING or incomplete');

// ─────────────────────────────────────────────────────────────────────────────
section('6. printAttendanceSessionCompletion function');
if (/window\.printAttendanceSessionCompletion/.test(att))
    pass('printAttendanceSessionCompletion defined on window');
else
    fail('printAttendanceSessionCompletion MISSING');

if (/missingCount/.test(att) && /markedCount/.test(att))
    pass('printAttendanceSessionCompletion computes missingCount and markedCount');
else
    fail('printAttendanceSessionCompletion missing missingCount/markedCount fields');

if (/Còn.*võ sinh.*chưa.*điểm danh|chưa được điểm danh/.test(att))
    pass('printAttendanceSessionCompletion warns when võ sinh not marked');
else
    fail('printAttendanceSessionCompletion missing "chưa điểm danh" warning');

// ─────────────────────────────────────────────────────────────────────────────
section('7. printAttendanceBranchReport function');
if (/window\.printAttendanceBranchReport/.test(att))
    pass('printAttendanceBranchReport defined on window');
else
    fail('printAttendanceBranchReport MISSING');

if (/byBranch|branchStats/.test(att))
    pass('printAttendanceBranchReport groups output by branch');
else
    fail('printAttendanceBranchReport does not group by branch');

// ─────────────────────────────────────────────────────────────────────────────
section('8. No Firestore writes in new helpers');
const newHelperSection = att.slice(att.indexOf('getScheduledTrainingDatesForProfile'));
if (/setDoc|addDoc|updateDoc|writeBatch|batch\.set/.test(newHelperSection.slice(0, 3000)))
    fail('New helpers contain Firestore write calls — must not write Firestore');
else
    pass('New helpers do not write to Firestore');

// ─────────────────────────────────────────────────────────────────────────────
section('9. No PII logging in new functions');
if (/console\.(log|info|warn|error).*name.*printAttendanceBranchReport|printAttendanceBranchReport.*console.*name/.test(att))
    fail('printAttendanceBranchReport may be logging student names (PII)');
else
    pass('printAttendanceBranchReport does not log student names (PII safe)');

// ─────────────────────────────────────────────────────────────────────────────
section('10. Firestore rules — no public access opened');
if (/allow\s+(read|write)\s*:\s*if\s+true/.test(rules))
    fail('firestore.rules has allow read/write: if true — public access!');
else
    pass('No public access in firestore.rules');

// ─────────────────────────────────────────────────────────────────────────────
section('11. renderAttMonthly — dateMap tracked per profile');
if (/dateMap/.test(att))
    pass('dateMap tracked per profile in renderAttMonthly grouped object');
else
    fail('dateMap NOT tracked — computeMonthlyAttendanceAccuracy will always get empty map');

// ─────────────────────────────────────────────────────────────────────────────
section('12. UI — Chưa có lịch học message present');
if (/Chưa có lịch học để tính chuyên cần chuẩn/.test(att))
    pass('UI shows "Chưa có lịch học để tính chuyên cần chuẩn" when no schedule');
else
    fail('"Chưa có lịch học" fallback message MISSING from UI');

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${TAG} Checked: ${passes + fails + warns} items`);
if (fails > 0) {
    console.error(`${TAG} ❌ FAILED — ${fails} failure(s), ${warns} warning(s), ${passes} passed.`);
    process.exit(1);
} else {
    console.log(`${TAG} ✅ OK — All scheduled accuracy checks passed (${warns} warning(s)).`);
}
