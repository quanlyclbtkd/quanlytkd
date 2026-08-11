#!/usr/bin/env node
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}

const builds = ['student-status-command-cutover-tx-delete-fix-20260722-v5u1', 'tuition-command-cutover-20260730-v5u2', 'attendance-excel-documentid-sdk-fix-20260801-v5u2e'];
const searchBuild = 'student-given-name-priority-20260811-v5u3';
const patches = ['4K-6V5U-1-student-status-command-cutover-tx-delete-fix-20260722', '4K-6V5U-2-tuition-command-cutover-20260730', '4K-6V5U-2E-attendance-excel-documentid-sdk-fix-20260801'];
const boundary = read('js/core/studentStatusCommandBoundary.js');
const boundaryPublic = read('public/js/core/studentStatusCommandBoundary.js');
const main = read('js/main.js');
const mainPublic = read('public/js/main.js');
const app = read('app.js');
const appPublic = read('public/app.js');
const students = read('js/modules/students.js');
const studentsPublic = read('public/js/modules/students.js');
const finance = read('js/modules/finance.js');
const financePublic = read('public/js/modules/finance.js');
const studentService = read('js/services/students.service.js');
const financeService = read('js/services/finance.service.js');
const rules = read('firestore.rules');
const statsCache = read('js/core/clubStatsAutoCache.js');
const index = read('index.html');
const indexPublic = read('public/index.html');
const baseline = JSON.parse(read('tools/baselines/v5u1-legacy-write-baseline.json'));
const pkg = JSON.parse(read('package.json'));

check('V5U-1 boundary source/public mirrors are exact', boundary === boundaryPublic);
check('V5U-1-or-later app/index/main markers active', patches.some(p=>app.includes(p)) && patches.some(p=>main.includes(p)) && builds.some(b=>index.includes(`app.js?v=${b}`)) && (index.includes(`./js/main.js?v=${searchBuild}`) || builds.some(b=>index.includes(`./js/main.js?v=${b}`))));
check('V5U-1-or-later public app/index/main markers active', patches.some(p=>appPublic.includes(p)) && patches.some(p=>mainPublic.includes(p)) && builds.some(b=>indexPublic.includes(`app.js?v=${b}`)) && (indexPublic.includes(`./js/main.js?v=${searchBuild}`) || builds.some(b=>indexPublic.includes(`./js/main.js?v=${b}`))));
check('main imports and initializes StudentStatusCommandBoundary', builds.some(b=>main.includes(`./core/studentStatusCommandBoundary.js?v=${b}`)) && main.includes('initStudentStatusCommandBoundary();'));
check('StudentStatus boundary initializes after students and before finance', main.indexOf('initStudents();') < main.indexOf('initStudentStatusCommandBoundary();') && main.indexOf('initStudentStatusCommandBoundary();') < main.indexOf('initFinance();'));
check('StudentStatus boundary owns reviewed status commands', ['updateProfile','deleteProfile','addSkippedMonth','removeSkippedMonth','markQuit'].every(x => boundary.includes(`async ${x}`)));
check('StudentStatus boundary delegates to existing StudentService only', boundary.includes('StudentService') && !/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(boundary));
check('StudentStatus boundary centralizes affected domain invalidation', ['students.activeList','students.quitList','students.debtList','attendance.list','dashboard.summary'].every(x => boundary.includes(x)));
check('StudentStatus boundary has single-flight protection', boundary.includes('inFlight.get(key)') && boundary.includes('duplicatePrevented++') && boundary.includes('inFlight.set(key, promise)'));

check('students module writes status only through boundary', students.includes('StudentStatusCommandBoundary.updateProfile') && students.includes('StudentStatusCommandBoundary.deleteProfile') && students.includes('StudentStatusCommandBoundary.addSkippedMonth') && students.includes('StudentStatusCommandBoundary.removeSkippedMonth') && students.includes('StudentStatusCommandBoundary.markQuit'));
check('finance aliases write status only through boundary', finance.includes('StudentStatusCommandBoundary.addSkippedMonth') && finance.includes('StudentStatusCommandBoundary.removeSkippedMonth') && finance.includes('StudentStatusCommandBoundary.markQuit'));
check('students/finance public mirrors are exact', students === studentsPublic && finance === financePublic);
check('legacy app student status writers are frozen to no-write stubs', app.includes('legacy student status writers were removed from app.js') && app.includes("window.updateProfile = async () => _studentStatusNotReady('updateProfile')") && app.includes("window.deleteProfile = async () => _studentStatusNotReady('deleteProfile')"));
check('legacy app no longer contains old direct status writer signatures', !app.includes('profiles", oldName), updateData, { merge: true }') && !app.includes('profiles", targetName)); closeModal()') && !app.includes('{ skippedMonths: arrayUnion(month) }') && !app.includes('{ skippedMonths: arrayRemove(month) }') && !app.includes('profiles", name), updateData, { merge: true }).then'));

function countWrites(src) {
  const ops = ['addDoc','setDoc','updateDoc','deleteDoc'];
  const counts = Object.fromEntries(ops.map(op => [op, (src.match(new RegExp(`\\b${op}\\s*\\(`, 'g')) || []).length]));
  return { counts, total: Object.values(counts).reduce((a,b)=>a+b,0) };
}
const actualWrites = countWrites(app);
check('V5U-1 baseline remains an upper bound after later cutovers', baseline.phase === '4K-6V5U-1' && baseline.total === 66 && actualWrites.total <= 66, JSON.stringify({ baseline: baseline.total, actual: actualWrites }));
check('V5U-1 per-op write baseline did not regress', Object.entries(actualWrites.counts).every(([op,count]) => count <= Number(baseline.counts[op] || 0)), JSON.stringify(actualWrites.counts));
check('app/public app direct-write surfaces remain exact', JSON.stringify(countWrites(app)) === JSON.stringify(countWrites(appPublic)));
check('rename service chunks historical transaction updates', studentService.includes('for (let i = 0; i < txUpdates.length; i += 400)') && studentService.includes('profileBatch.commit()'));

check('Firestore Rules allow only club Admin/SuperAdmin to delete own-club transactions', rules.includes('match /transactions/{transactionId}') && rules.includes('allow delete: if isSuperAdmin() || isClubAdmin(clubId);'));
check('FinanceService annotates permission-denied delete failures', financeService.includes('Tài khoản chưa được Firestore Rules cấp quyền xóa giao dịch'));
check('deleteTx catches permission errors and retains Tuition tab', finance.includes("activeTabBeforeDelete === 'tx'") && finance.includes("window.getCurrentActiveTabId() === 'debt'") && finance.includes("window.switchTab('tx')") && finance.includes('return false;'));
check('clubStatsAutoCache is write-mounted only for admin/owner/root roles', statsCache.includes("['admin', 'owner', 'super_admin', 'superadmin', 'root', 'root_admin', 'admin_root'].includes(role)"));

check('package exposes V5U-1 checks', pkg.scripts?.['check:v5u1-student-status-command-cutover'] === 'node tools/check-v5u1-student-status-command-cutover.mjs' && pkg.scripts?.['check:v5u1-student-status-command-behavior'] === 'node tools/check-v5u1-student-status-command-behavior.mjs');
check('default pipelines include V5U-1 checks', String(pkg.scripts?.check || '').includes('check:v5u1-student-status-command-cutover') && String(pkg.scripts?.['check:all'] || '').includes('check:v5u1-student-status-command-behavior'));

if (failures) {
  console.error(`\nV5U-1 student status command cutover check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5U-1 student status command cutover check PASS.');
