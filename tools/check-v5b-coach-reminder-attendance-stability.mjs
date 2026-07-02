import fs from 'fs';

const files = {
  attendance: 'js/modules/attendance.js',
  attendancePublic: 'public/js/modules/attendance.js',
  shell: 'js/ui/legacyUiShell.js',
  shellPublic: 'public/js/ui/legacyUiShell.js',
  fallback: 'js/legacy/legacyUiFallbacks.js',
  fallbackPublic: 'public/js/legacy/legacyUiFallbacks.js',
  main: 'js/main.js',
  app: 'app.js',
  index: 'index.html',
};

let failures = 0;
function read(path) { return fs.readFileSync(path, 'utf8'); }
function ok(condition, message) {
  if (!condition) { failures++; console.error('❌ ' + message); }
  else console.log('✅ ' + message);
}

const att = read(files.attendance);
const attPub = read(files.attendancePublic);
const shell = read(files.shell);
const shellPub = read(files.shellPublic);
const fallback = read(files.fallback);
const fallbackPub = read(files.fallbackPublic);
const main = read(files.main);
const app = read(files.app);
const index = read(files.index);

for (const [label, src] of [['attendance', att], ['public attendance', attPub]]) {
  ok(src.includes("'toggleAttendance', 'toggleAttendanceFromCard', 'toggleAttendanceStatus'"), label + ' registers toggleAttendanceFromCard ownership');
  ok(src.includes('const _ATT_TOGGLE_ORDER = Object.freeze([0, 1, 3, 2])'), label + ' uses coach-friendly status cycle 0→1→3→2');
  ok(src.includes("{ label: 'Nghỉ có phép'") && src.includes("{ label: 'Nghỉ không phép'"), label + ' labels excused/unexcused explicitly');
  ok(src.includes('const _attWriteLocks = new Map()'), label + ' has per-attendance write lock');
  ok(src.includes('const _attPendingStatusByDocId = new Map()'), label + ' keeps pending local status during async writes');
  ok(src.includes('data-att-name="') && src.includes('window.toggleAttendanceFromCard(this)'), label + ' toggles by stable profile name, not only render index');
  ok(src.includes('if (_isAttendanceWriteLocked(docId))') && src.includes('_attWriteLocks.set(docId'), label + ' blocks overlapping writes for the same attendance doc');
  ok(src.includes('_attPendingStatusByDocId.forEach'), label + ' merges pending status into reload render');
  ok(src.includes('branch: _profileBranchValue(p) || p.branch ||'), label + ' writes canonical profile branch into attendance records');
}

for (const [label, src] of [['legacy ui shell', shell], ['public legacy ui shell', shellPub]]) {
  ok(src.includes('function _canShowMonthlyReminder()'), label + ' has monthly reminder role gate');
  ok(src.includes("role === 'coach'") && src.includes('_hideMonthlyReminder()'), label + ' hides monthly reminder for coach role');
  ok(src.includes('if (!_canShowMonthlyReminder())') && src.includes('openMonthlyExport'), label + ' blocks monthly export shortcut for coach role');
}

for (const [label, src] of [['legacy fallback', fallback], ['public legacy fallback', fallbackPub]]) {
  ok(src.includes('function canShowMonthlyReminder()'), label + ' has fallback monthly reminder role gate');
  ok(src.includes("role === 'coach'") && src.includes('hideMonthlyReminder()'), label + ' hides fallback monthly reminder for coach role');
  ok(src.includes('if (!canShowMonthlyReminder())') && src.includes('openMonthlyExport'), label + ' blocks fallback monthly export shortcut for coach role');
}

ok(app.includes("4K-6V5B-coach-reminder-attendance-stability-20260701") || app.includes("4K-6V5C-coach-attendance-toggle-queue-fix-20260701"), 'app version marker is V5B or newer');
ok(main.includes("4K-6V5B-coach-reminder-attendance-stability-20260701") || main.includes("4K-6V5C-coach-attendance-toggle-queue-fix-20260701"), 'main version marker is V5B or newer');
ok(index.includes('coach-reminder-attendance-stability-20260701-v5b') || index.includes('coach-attendance-toggle-queue-fix-20260701-v5c'), 'index cache-bust is V5B or newer');

if (failures) {
  console.error(`\n${failures} V5B checks failed.`);
  process.exit(1);
}
console.log('\n✅ V5B coach reminder + attendance stability checks passed.');
