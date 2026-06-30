import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  boundary: read('js/core/profileCanonicalBoundary.js'),
  status: read('js/data/profileStatusConfig.js'),
  service: read('js/services/students.service.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  attendance: read('js/modules/attendance.js'),
  students: read('js/modules/students.js'),
  store: read('js/core/profileCanonicalStore.js'),
  rules: read('firestore.rules'),
  publicBoundary: read('public/js/core/profileCanonicalBoundary.js'),
  publicApp: read('public/app.js'),
};

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

check('index loads profileCanonicalBoundary before app.js',
  files.index.indexOf('profileCanonicalBoundary.js?v=canonical-profile-status-branch-boundary-20260701-v5') > -1 &&
  files.index.indexOf('profileCanonicalBoundary.js') < files.index.indexOf('app.js?v=canonical-profile-status-branch-boundary-20260701-v5'));
check('boundary exposes canonical profile API',
  ['canonicalizeProfileForWrite','buildCanonicalProfilePatch','selfHealProfileCanonicalFields','canonicalProfileBranchCode','canonicalProfileStatusKind'].every(x => files.boundary.includes(x)));
check('canonical write fields are defined',
  ['statusKind','branchCode','isQuit','updatedAt'].every(x => files.boundary.includes(x)));
check('boundary avoids default branchCode on status-only patches',
  files.boundary.includes('function _hasBranchSignal') && files.boundary.includes('if (branchCode) patch.branchCode = branchCode'));
check('classifier prioritizes canonical statusKind before legacy fallback',
  files.status.includes('Phase 4K-6V5: canonical fields are the primary read boundary') &&
  files.status.indexOf('profile.statusKind') < files.status.indexOf('profile.quit === true'));
check('app writes canonical fields on add student',
  files.app.includes("_canonicalProfilePayload(_newProfileData, 'add-new-student'") && files.app.includes('forceBranchIndex: true'));
check('app writes canonical fields on edit profile',
  files.app.includes("_canonicalProfilePayload(updateData, 'profile-modal-update'") && files.app.includes('forceBranch: true'));
check('app uses canonical patch when marking quit from debt',
  files.app.includes("_canonicalProfilePatch({ status: 'quit'") && files.app.includes("'debt-handle-quit'"));
check('single-profile self-heal is only profile-scoped',
  files.boundary.includes('selfHealProfileCanonicalFields') && files.boundary.includes("'profiles', id") && !files.boundary.includes('getDocs('));
check('StudentService canonicalizes create/update/profile rename only when relevant',
  files.service.includes('_profileWriteNeedsCanonical') && files.service.includes('student-service-create-profile') && files.service.includes('student-service-rename-profile'));
check('payment-only profile updates are not forced through canonical branch default',
  files.service.includes('_profileWriteNeedsCanonical(data)') && files.boundary.includes('if (branchCode) patch.branchCode = branchCode'));
check('coach primary roster query prefers branchCode',
  files.profiles.includes("fbWhere('branchCode', '==', coachBranch)") && !files.profiles.includes("? fbQuery(profRef, fbWhere('branch', '==', coachBranch))"));
check('quit loader prefers canonical statusKind before legacy queries',
  files.profiles.includes("label: 'statusKind==quit'") && files.profiles.indexOf("statusKind==quit") < files.profiles.indexOf("status==quit"));
check('attendance branch extraction prefers branchCode',
  files.attendance.includes('return x.branchCode || x.branch || x.branchId'));
check('students debt branch filter uses canonical/alias matcher',
  files.students.includes('window.debtBranchMatchesFilter ? window.debtBranchMatchesFilter(p.branchCode || p.branch'));
check('canonical store prefers branchCode over branch',
  files.store.includes('return p.branchCode || p.branch ||'));
check('Firestore rules still allow Coach branchCode scoped profile reads',
  files.rules.includes('resource.data.keys().hasAll([\'branchCode\'])') && files.rules.includes('branchMatchesAssigned(resource.data.branchCode)'));
check('public mirrors are synced',
  files.publicBoundary.includes('4K-6V5-canonical-profile-status-branch-boundary') && files.publicApp.includes('4K-6V5-canonical-profile-status-branch-boundary'));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5-canonical-profile-status-branch-boundary] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5-canonical-profile-status-branch-boundary] PASS ${checks.length}/${checks.length}`);
