// tools/check-attendance-reliability.mjs
// Phase 4.0B-4J-5: Static analysis for Attendance Reliability & Session Accuracy
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = resolve(__dirname, '..');

const TAG = '[AttendanceReliabilityCheck]';
let passes = 0; let fails = 0; let warns = 0;

function pass(msg)  { console.log(`${TAG} PASS  ${msg}`); passes++; }
function fail(msg)  { console.error(`${TAG} FAIL  ${msg}`); fails++; }
function warn(msg)  { console.warn(`${TAG} WARN  ${msg}`); warns++; }
function section(s) { console.log(`\n${TAG} ── ${s} ──`); }

const svcPath = resolve(rootDir, 'js/services/attendance.service.js');
const attPath = resolve(rootDir, 'js/modules/attendance.js');
const rulesPath = resolve(rootDir, 'firestore.rules');

if (!existsSync(svcPath)) { console.error(`${TAG} FAIL  attendance.service.js not found`); process.exit(1); }
if (!existsSync(attPath)) { console.error(`${TAG} FAIL  attendance.js not found`); process.exit(1); }
if (!existsSync(rulesPath)) { console.error(`${TAG} FAIL  firestore.rules not found`); process.exit(1); }

const svc   = readFileSync(svcPath,   'utf-8');
const att   = readFileSync(attPath,   'utf-8');
const rules = readFileSync(rulesPath, 'utf-8');
const bulkStart = att.indexOf('window.bulkCheckIn = async');
const bulkEnd = att.indexOf('// ── Offline sync', bulkStart);
const bulkBlock = att.slice(bulkStart, bulkEnd);

// ─────────────────────────────────────────────────────────────────────────────
section('1. AttendanceService.loadByDate — limit destructure');
if (/_limit/.test(svc) || /limit\s*[,:}]/.test(svc))
    pass('limit is destructured (or aliased) from SDK in loadByDate');
else
    fail('limit NOT destructured from SDK in loadByDate — will throw ReferenceError');

if (/if.*_lim.*warn|console\.warn.*limit/.test(svc.replace(/\s+/g,' ')))
    pass('Warning logged when limit() unavailable (graceful degradation)');
else
    warn('No fallback warning for missing limit() — minor');

// ─────────────────────────────────────────────────────────────────────────────
section('2. getAttendanceDocId helper');
if (/function getAttendanceDocId/.test(att))
    pass('getAttendanceDocId defined in attendance.js');
else
    fail('getAttendanceDocId MISSING from attendance.js');

if (/shiftId\s*\?.*name.*_.*date.*_.*shiftId/.test(att.replace(/\s+/g,' ')))
    pass('getAttendanceDocId returns shift-aware docId');
else
    fail('getAttendanceDocId shift logic MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('3. bulkCheckIn — shift-aware docId');
if (/getAttendanceDocId\(name,\s*(?:_attCurrentDate|writeDate),\s*(?:_currentShiftId|writeShiftId)\)/.test(bulkBlock))
    pass('bulkCheckIn uses getAttendanceDocId with its guarded shift capture');
else
    fail('bulkCheckIn does NOT use getAttendanceDocId — docId will be wrong for shift mode');

// ─────────────────────────────────────────────────────────────────────────────
section('4. bulkCheckIn — shiftId in data');
if (/(?:_currentShiftId|writeShiftId)\s*\?\s*\{\s*shiftId\s*:\s*(?:_currentShiftId|writeShiftId)\s*\}/.test(bulkBlock.replace(/\s+/g,' ')))
    pass('bulkCheckIn data includes the same guarded shift captured by its docId');
else
    fail('bulkCheckIn data MISSING shiftId field for shift records');

// ─────────────────────────────────────────────────────────────────────────────
section('5. _updateAttSummary — shift-aware key');
if (/summary\[_attendanceCache\[getAttendanceDocId/.test(att))
    pass('_updateAttSummary uses getAttendanceDocId for cache key');
else
    fail('_updateAttSummary does NOT use getAttendanceDocId — summary wrong in shift mode');

// ─────────────────────────────────────────────────────────────────────────────
section('6. isActiveProfileForAttendance helper');
if (/function isActiveProfileForAttendance/.test(att))
    pass('isActiveProfileForAttendance defined');
else
    fail('isActiveProfileForAttendance MISSING');

if (/p\.status\s*===\s*'trial'|status.*trial/.test(att))
    pass('isActiveProfileForAttendance handles trial status');
else
    fail('isActiveProfileForAttendance missing trial status handling');

if (/!p\.status.*return true|if.*!p\.status.*true/.test(att.replace(/\s+/g,' ')))
    pass('isActiveProfileForAttendance handles legacy missing status (returns true)');
else
    fail('isActiveProfileForAttendance does NOT handle missing status — legacy data will be hidden');

// ─────────────────────────────────────────────────────────────────────────────
section('7. renderAttMonthly — no direct p.status!==active');
if (/p\.status\s*!==\s*'active'/.test(att))
    fail("renderAttMonthly (or other code) still uses p.status!=='active' directly — use isActiveProfileForAttendance");
else
    pass("No direct p.status!=='active' in attendance.js — using helper");

// ─────────────────────────────────────────────────────────────────────────────
section('8. firestore.rules — attendanceNotes rule');
if (/match\s*\/attendanceNotes\/\{/.test(rules))
    pass('attendanceNotes rule present in firestore.rules');
else
    fail('attendanceNotes rule MISSING from firestore.rules — HLV cannot write notes');

if (/isCoach\(clubId\)/.test(rules))
    pass('isCoach(clubId) used in rules for attendanceNotes/adminNotifications');
else
    fail('isCoach(clubId) NOT used in rules');

// ─────────────────────────────────────────────────────────────────────────────
section('9. firestore.rules — adminNotifications rule');
if (/match\s*\/adminNotifications\/\{/.test(rules))
    pass('adminNotifications rule present in firestore.rules');
else
    fail('adminNotifications rule MISSING from firestore.rules');

if (/isClubAdmin.*adminNotifications|adminNotifications.*isClubAdmin/.test(rules.replace(/\s+/g,' ')))
    pass('adminNotifications delete restricted to admin (not coach)');
else
    fail('adminNotifications delete restriction MISSING');

// ─────────────────────────────────────────────────────────────────────────────
section('10. printAttendanceStatus debug function');
if (/window\.printAttendanceStatus/.test(att))
    pass('printAttendanceStatus defined in attendance.js');
else
    fail('printAttendanceStatus MISSING');

if (/__attendanceDebug/.test(att))
    pass('__attendanceDebug populated in attendance.js');
else
    fail('__attendanceDebug NOT populated — printAttendanceStatus will return empty data');

if (/currentDate.*currentShiftId|currentShiftId.*currentDate/.test(att.replace(/\s+/g,' ')))
    pass('__attendanceDebug tracks currentDate and currentShiftId');
else
    warn('__attendanceDebug may not track all required fields');

// ─────────────────────────────────────────────────────────────────────────────
section('11. No PII logged in attendance debug');
if (/console\.(log|info|warn|error).*name.*printAttendanceStatus|printAttendanceStatus.*console.*name/.test(att))
    fail('printAttendanceStatus may be logging student names (PII)');
else
    pass('No student name logging in printAttendanceStatus (PII safe)');

// ─────────────────────────────────────────────────────────────────────────────
section('12. Firestore rules — no public access opened');
if (/allow\s+(read|write)\s*:\s*if\s+true/.test(rules))
    fail('firestore.rules has allow read/write: if true — public access!');
else
    pass('No public access in firestore.rules');

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${TAG} Checked: ${passes + fails + warns} items`);
if (fails > 0) {
    console.error(`${TAG} ❌ FAILED — ${fails} failure(s), ${warns} warning(s), ${passes} passed.`);
    process.exit(1);
} else {
    console.log(`${TAG} ✅ OK — All attendance reliability checks passed (${warns} warning(s)).`);
}
