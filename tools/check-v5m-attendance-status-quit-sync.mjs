#!/usr/bin/env node
import fs from 'fs';

const read = p => fs.readFileSync(p, 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  attendance: read('js/modules/attendance.js'),
  students: read('js/modules/students.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  status: read('js/data/profileStatusConfig.js'),
  pubAttendance: read('public/js/modules/attendance.js'),
  pubStudents: read('public/js/modules/students.js'),
  pubProfiles: read('public/js/listeners/profiles.listeners.js'),
  pubStatus: read('public/js/data/profileStatusConfig.js'),
};
const checks = [];
function check(name, ok) { checks.push({ name, ok: !!ok }); }
const compatibleBuilds = ['quit-authoritative-data-boundary-20260704-v5p', 'role-runtime-audit-profiler-20260704-v5o', 'debt-zalo-feature-off-20260704-v5n', 'debt-zalo-feature-off-20260704-v5n'];
const compatiblePatchMarkers = ['4K-6V5P-quit-authoritative-data-boundary-20260704', '4K-6V5O-role-runtime-audit-profiler-20260704', '4K-6V5M-attendance-status-quit-sync-20260704', '4K-6V5N-debt-zalo-feature-off-20260704'];

check('V5M/V5N cache-bust active in index', compatibleBuilds.some(build => files.index.includes(`app.js?v=${build}`) && files.index.includes(`js/main.js?v=${build}`)));
check('APP_PATCH_VERSION preserves V5M boundary through V5N', compatiblePatchMarkers.some(m => files.app.includes(m)));
check('Attendance has normalized skipped month helper', files.attendance.includes('function _profileSkippedForAttendanceMonth') && files.attendance.includes('normalizeTuitionMonthForMultiItem'));
check('Attendance no longer uses raw skippedMonths.includes(selMon)', !files.attendance.includes('p.skippedMonths.includes(selMon)'));
check('Attendance show-all does not bypass skipped-month exclusion', !files.attendance.includes('if (isShowAll) return true;\n            if (!selDateVal) return true;\n            return !_profileSkippedForAttendanceMonth'));
check('Attendance excludes explicit paused/attendance-excluded statuses', files.attendance.includes('function _profileExplicitlyExcludedFromAttendance') && files.attendance.includes('bao nghi') && files.attendance.includes('tam nghi'));
check('Attendance active gate checks exclusion before global active helper', files.attendance.indexOf('_profileExplicitlyExcludedFromAttendance(p)') > -1 && files.attendance.indexOf('_profileExplicitlyExcludedFromAttendance(p)') < files.attendance.indexOf('window.isProfileActiveForAttendance'));
check('Attendance debug records active-only skipped-month gate', files.attendance.includes("active-only-plus-skipped-month-v5m"));
check('Local status sync merges canonical studentProfileStore immediately', files.students.includes('studentProfileStore.mergeProfile(key, nextProfile, reason)') && files.students.includes('push the local status change'));
check('Local status sync invalidates attendance when quit', files.students.includes("attendance.list', reason + ':attendance-status-sync") && files.students.includes('kind === \'quit\''));
check('Skipped month sync invalidates attendance roster', files.students.includes("attendance.list', reason + ':attendance-skipped-month-sync"));
check('Debt quit action ensures quit tab re-render', files.students.includes("ensureStudentTabRendered('quit', 'after-mark-student-quit')"));
check('Debt skip action invalidates attendance list', files.students.includes("attendance.list', 'after-skip-debt-month'"));
check('Quit lazy loader includes Vietnamese/emoji legacy quit aliases', files.profiles.includes('🚫 Nghỉ') && files.profiles.includes('Nghỉ học') && files.profiles.includes('Nghi hoc'));
check('Quit lazy loader includes expanded quit date fields', files.profiles.includes('ngayNghiTap!=null') && files.profiles.includes('quitAt!=null') && files.profiles.includes('stoppedAt!=null'));
check('Classifier recognizes expanded quit date fields', files.status.includes('ngayNghiTap') && files.status.includes('nghiHocDate') && files.status.includes('quitAt'));
check('Public attendance mirror synced', files.pubAttendance.includes('function _profileSkippedForAttendanceMonth') && files.pubAttendance.includes("active-only-plus-skipped-month-v5m"));
check('Public students mirror synced', files.pubStudents.includes("attendance.list', reason + ':attendance-skipped-month-sync"));
check('Public profiles/status mirrors synced', files.pubProfiles.includes('ngayNghiTap!=null') && files.pubStatus.includes('nghiHocDate'));

const failed = checks.filter(c => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
if (failed.length) {
  console.error(`\nV5M attendance status/quit sync check failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`\n✅ V5M attendance status/quit sync checks passed: ${checks.length}/${checks.length}`);
