import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  app: read('app.js'),
  attendance: read('js/modules/attendance.js'),
  scheduler: read('js/ui/render/renderScheduler.js'),
  invalidation: read('js/ui/render/renderInvalidation.js'),
  publicAttendance: read('public/js/modules/attendance.js'),
  publicScheduler: read('public/js/ui/render/renderScheduler.js'),
  pkg: read('package.json'),
};
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.error('FAIL', name); } }
const build = 'role-runtime-audit-profiler-20260704-v5o';
const compatibleVersions = ['4K-6V5O-role-runtime-audit-profiler-20260704', '4K-6V5I-attendance-render-window-slow-warning-guard-20260703', '4K-6V5L-superadmin-revenue-cache-fallback-20260704', '4K-6V5N-debt-zalo-feature-off-20260704'];
check('index uses V5I-or-later cache bust for app and main', files.index.includes(`app.js?v=${build}`) && files.index.includes(`js/main.js?v=${build}`));
check('main/app version markers are V5I-or-later', compatibleVersions.some(v => files.main.includes(v)) && compatibleVersions.some(v => files.app.includes(v)));
check('attendance module defines a render window and step', files.attendance.includes('ATTENDANCE_RENDER_INITIAL_LIMIT') && files.attendance.includes('ATTENDANCE_RENDER_STEP'));
check('attendance module resets render window on club reset', files.attendance.includes('_attendanceVisibleLimit = ATTENDANCE_RENDER_INITIAL_LIMIT') && files.attendance.includes("_attendanceListSignature = ''"));
check('attendance render signature tracks date/shift/branch/belt/showAll', ['att_date','_currentShiftId','att_branch','att_belt','att_show_all'].every(x => files.attendance.includes(x)));
check('attendance cards render a slice instead of full roster', files.attendance.includes('_attVisibleProfiles = _attCurrentProfiles.slice(0, _attVisibleCount)') && files.attendance.includes('_attVisibleProfiles.forEach'));
check('attendance summary still uses full filtered roster', files.attendance.includes('_attCurrentProfiles.forEach(([name]) => {') && files.attendance.includes('summary[st]++'));
check('attendance list exposes loadMoreAttendanceCards', files.attendance.includes('window.loadMoreAttendanceCards = function loadMoreAttendanceCards') && files.attendance.includes('Tải thêm võ sinh'));
check('attendance large-list metric uses rendered rows with totalRows metadata', files.attendance.includes("trackLargeListRender('attendance.list', Math.min") && files.attendance.includes('totalRows: _attCurrentProfiles.length') && files.attendance.includes('suppressWarning: true'));
check('large-list tracker supports intentional warning suppression', files.invalidation.includes('const suppressWarning') && files.invalidation.includes('!suppressWarning &&'));
check('attendance exposes loadMoreAttendanceCards as a runtime UI helper', files.attendance.includes('window.loadMoreAttendanceCards = function loadMoreAttendanceCards'));
check('render scheduler slow warnings are gated by debug/dev', files.scheduler.includes('function _shouldLogPerfWarning') && files.scheduler.includes('window.__RENDER_DEBUG') && files.scheduler.includes("localStorage.getItem('renderDebug')"));
check('render scheduler still records slow metrics without spamming console', files.scheduler.includes('lastSlowRender') && files.scheduler.includes('slowWarningsSuppressed'));
check('render scheduler slow warning is coalesced per key', files.scheduler.includes('_slowRenderLastWarnAt[key]') && files.scheduler.includes('now - lastAt > 120000'));
check('public mirrors are synced', files.publicAttendance.includes('ATTENDANCE_RENDER_INITIAL_LIMIT') && files.publicScheduler.includes('function _shouldLogPerfWarning'));
check('V5I check is wired into package scripts', files.pkg.includes('check:v5i-attendance-render-window-slow-warning-guard'));
console.log(`\n[check-v5i-attendance-render-window-slow-warning-guard] PASS ${pass}/${pass+fail}`);
if (fail) process.exit(1);
