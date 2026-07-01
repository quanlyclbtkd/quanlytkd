import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  legacyUi: read('js/ui/legacyUiShell.js'),
  attendance: read('js/modules/attendance.js'),
  registry: read('js/core/globalOwnershipRegistry.js'),
  publicLegacyUi: read('public/js/ui/legacyUiShell.js'),
  publicAttendance: read('public/js/modules/attendance.js'),
  pkg: read('package.json'),
};
const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

check('V5B cache-bust marker is active',
  files.index.includes('coach-attendance-ui-reminder-guard-20260701-v5b') &&
  files.app.includes('4K-6V5B-coach-attendance-ui-reminder-guard-20260701'));
check('monthly reminder is blocked for coach role in UI shell',
  files.legacyUi.includes('function _isCoachRole') &&
  files.legacyUi.includes('if (_isCoachRole())') &&
  files.legacyUi.includes('_hideMonthlyReminder();') &&
  files.legacyUi.includes('return false;'));
check('monthly export opener is guarded for coach role',
  files.legacyUi.includes('export function openMonthlyExport') &&
  files.legacyUi.includes('if (_isCoachRole())') &&
  files.legacyUi.includes('window.openExcelExportModal'));
check('auth flow no longer schedules monthly reminder for coach',
  files.app.includes("window.userRole !== 'coach'") && files.app.includes('_checkMonthlyReminder'));
check('attendance exact setter is registered as owned global',
  files.registry.includes('setAttendanceStatus') && files.attendance.includes("'setAttendanceStatus'") && files.attendance.includes('window.setAttendanceStatus'));
check('attendance cards use exact status buttons instead of full-card cycling',
  files.attendance.includes('data-att-status-btn') &&
  files.attendance.includes('_attButtonHtml(idx, 1, status)') &&
  files.attendance.includes('_attButtonHtml(idx, 3, status)') &&
  files.attendance.includes('_attButtonHtml(idx, 2, status)') &&
  !files.attendance.includes('onclick="window.toggleAttendance('));
check('attendance save has per-record pending guard',
  files.attendance.includes('_attendanceSaveState') &&
  files.attendance.includes('state.pending') &&
  files.attendance.includes('_setAttendanceControlsPending'));
check('attendance status write is idempotent and exact',
  files.attendance.includes('_setAttendanceStatusExact') &&
  files.attendance.includes('if (newStatus === currentStatus') &&
  (files.attendance.includes('window.currentAttendanceData[target.name] = newStatus') || files.attendance.includes('window.currentAttendanceData[name] = newStatus')));
check('attendance record writes canonical branchCode as well as branch',
  files.attendance.includes('branchCode: branchValue'));
check('public mirrors include V5B reminder guard and exact attendance buttons',
  files.publicLegacyUi.includes('function _isCoachRole') && files.publicAttendance.includes('window.setAttendanceStatus'));
check('V5B check is wired into package scripts',
  files.pkg.includes('check:v5b-coach-reminder-attendance-stability'));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5b-coach-reminder-attendance-stability] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5b-coach-reminder-attendance-stability] PASS ${checks.length}/${checks.length}`);
