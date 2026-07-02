import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  boundary: read('js/core/profileCanonicalBoundary.js'),
  status: read('js/data/profileStatusConfig.js'),
  store: read('js/data/studentProfileStore.js'),
  attendance: read('js/modules/attendance.js'),
  students: read('js/modules/students.js'),
  tuition: read('js/core/tuitionDebtCanonical.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  publicBoundary: read('public/js/core/profileCanonicalBoundary.js'),
  publicApp: read('public/app.js'),
  pkg: read('package.json'),
};

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

check('V5A/V5B/V5C cache-bust marker is active',
  (files.index.includes('canonical-read-adoption-legacy-fallback-gate-20260701-v5a') || files.index.includes('coach-reminder-attendance-stability-20260701-v5b') || files.index.includes('coach-attendance-toggle-queue-fix-20260701-v5c')) &&
  (files.app.includes('4K-6V5A-canonical-read-adoption-legacy-fallback-gate-20260701') || files.app.includes('4K-6V5B-coach-reminder-attendance-stability-20260701') || files.app.includes('4K-6V5C-coach-attendance-toggle-queue-fix-20260701')));
check('classic boundary exposes shared read helpers',
  ['getCanonicalProfileReadStatus','getCanonicalProfileReadBranch','getCanonicalProfileReadInfo','isProfileActiveForDisplay','isProfileQuitForDisplay','isProfileActiveForAttendance','isProfileActiveForDebt','profileBranchMatchesFilter'].every(x => files.boundary.includes(x)));
check('canonical status gate falls back only after missing canonical fields',
  files.boundary.includes('function _hasCanonicalStatusSignal') &&
  files.boundary.indexOf('hasStatusKind || hasIsQuit') < files.boundary.indexOf('legacy-status-fallback'));
check('canonical conflict policy prevents quit students entering active/debt flows',
  files.boundary.includes('quit wins') && files.boundary.includes('if (p.isQuit === true) kind = \'quit\''));
check('canonical branch gate prefers branchCode before legacy branch fields',
  files.boundary.includes('function getCanonicalProfileReadBranch') &&
  files.boundary.indexOf('p.branchCode') < files.boundary.indexOf('legacy-branch-fallback'));
check('profileStatusConfig delegates to the canonical read gate',
  files.status.includes('Phase 4K-6V5A') && files.status.includes('getCanonicalProfileReadStatus(profile)'));
check('student store keeps using the centralized classifier',
  files.store.includes('return _classifyFromConfig(profile)'));
check('attendance uses canonical active and branch helpers',
  files.attendance.includes('window.isProfileActiveForAttendance') && files.attendance.includes('getCanonicalProfileReadBranch'));
check('debt/bulk Zalo uses isProfileActiveForDebt and profileBranchMatchesFilter',
  files.students.includes('window.isProfileActiveForDebt') && files.students.includes('window.profileBranchMatchesFilter(p, selBranch)') &&
  files.app.includes('window.isProfileActiveForDebt') && files.app.includes('window.profileBranchMatchesFilter(p, selBranch)'));
check('tuition debt canonical state reads through the same gate',
  files.tuition.includes('getCanonicalProfileReadStatus') && files.tuition.includes('getCanonicalProfileReadBranch'));
check('quit render branch display uses canonical branch info',
  files.renderStudents.includes('getCanonicalProfileReadBranch(p)') && files.renderStudents.includes('_branchCode'));
check('canonical health metrics are available without Firestore reads',
  files.boundary.includes('computeCanonicalProfileHealth') && files.boundary.includes('printCanonicalProfileHealth') && files.boundary.includes('noRead') === false);
check('V5A check is wired into package scripts',
  files.pkg.includes('check:v5a-canonical-read-adoption-legacy-fallback-gate'));
check('public mirrors are synced to V5A/V5B/V5C',
  files.publicBoundary.includes('4K-6V5A-canonical-read-adoption-legacy-fallback-gate') &&
  (files.publicApp.includes('4K-6V5A-canonical-read-adoption-legacy-fallback-gate') || files.publicApp.includes('4K-6V5B-coach-reminder-attendance-stability-20260701') || files.publicApp.includes('4K-6V5C-coach-attendance-toggle-queue-fix-20260701')));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5a-canonical-read-adoption-legacy-fallback-gate] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5a-canonical-read-adoption-legacy-fallback-gate] PASS ${checks.length}/${checks.length}`);
