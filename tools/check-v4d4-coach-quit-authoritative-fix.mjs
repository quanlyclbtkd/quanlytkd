#!/usr/bin/env node
/** Phase 4K-6V4D4 — Coach login + Quit authoritative list regression gate. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const build = 'coach-attendance-auth-roster-final-recovery-20260630-v4d8';
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  rules: read('firestore.rules'),
  branchIdentity: read('js/core/branchIdentity.js'),
  coachRepair: read('js/core/coachBranchRuntimeRepair.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  store: read('js/data/studentProfileStore.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  students: read('js/modules/students.js'),
  attendance: read('js/modules/attendance.js'),
};
let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V4D4 — Coach login + Quit authoritative list ===\n');

check('index/app/main cache bust updated to V4D4',
  files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) &&
  files.main.includes(`renderStudents.js?v=${build}`) && files.main.includes(`attendance.js?v=${build}`));
check('APP_PATCH_VERSION marks V4D4 runtime',
  (files.main.includes("APP_PATCH_VERSION = '4K-6V4D4-coach-quit-authoritative-fix-20260630'") || (files.main.includes("APP_PATCH_VERSION = '4K-6V4D7-coach-quit-attendance-full-recovery-20260630'") || files.main.includes("APP_PATCH_VERSION = '4K-6V4D8-coach-attendance-auth-roster-final-recovery-20260630'"))) &&
  (files.main.includes("window.APP_PATCH_VERSION = '4K-6V4D4-coach-quit-authoritative-fix-20260630'") || (files.main.includes("window.APP_PATCH_VERSION = '4K-6V4D7-coach-quit-attendance-full-recovery-20260630'") || files.main.includes("window.APP_PATCH_VERSION = '4K-6V4D8-coach-attendance-auth-roster-final-recovery-20260630'"))));

check('Quit render merges quitProfiles + local journal + compat store',
  files.renderStudents.includes('getQuitProfiles') &&
  files.renderStudents.includes('_localQuitProfiles') &&
  files.renderStudents.includes('getAllProfilesCompat') &&
  files.renderStudents.includes('Object.assign(merged, storeQuit, localQuit)'));
check('Quit render uses force-all for web/mobile full access',
  files.renderStudents.includes('options.forceAll === true') &&
  files.renderStudents.includes('options.fullList === true') &&
  files.renderStudents.includes('options.mobileFull === true') &&
  files.renderStudents.includes('_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true') &&
  files.renderStudents.includes("'Đã hiển thị đủ ' + count"));
check('Quit mobile detection covers tablets/landscape/coarse pointer',
  files.renderStudents.includes("'(max-width: 1024px)'") &&
  files.renderStudents.includes("'(pointer: coarse)'") &&
  files.renderStudents.includes('Android|iPhone|iPad|iPod|Mobile'));
check('Local status change syncs newly quit student into split store and local quit journal',
  files.students.includes('studentProfileStore.mergeProfile(key, nextProfile') &&
  files.students.includes('window.__store._localQuitProfiles[key] = nextProfile') &&
  files.students.includes("renderQuitList({ reason: reason + ':immediate-quit-repaint' })"));
check('Quit completeness is not marked true before full fallback succeeds',
  files.profiles.includes("const ok = await loadFullProfilesFallback('quit-tab-authoritative-reconcile:") &&
  files.profiles.includes('_state.quitCompletenessReconciled = !!ok') &&
  !files.profiles.includes('_state.quitCompletenessReconciled = true;\n            const ok = await loadFullProfilesFallback'));
check('Authoritative quit ensure API is exported and exposed globally',
  files.profiles.includes('export async function ensureQuitProfilesAuthoritative') &&
  files.store.includes('ensureQuitProfilesAuthoritative') &&
  files.main.includes('window.ensureQuitProfilesAuthoritative = ensureQuitProfilesAuthoritative'));

check('Coach branch aliases include configured branch display names',
  files.branchIdentity.includes("'branchName' + idx") &&
  files.branchIdentity.includes('global.__store?.clubConfig') &&
  files.branchIdentity.includes('if (display && !out.some'));
check('Coach active listener reads branch aliases without using where-in on branch',
  (files.profiles.includes('_coachBranchAliases(context)') || files.profiles.includes('function _coachProfileQuerySpecs')) &&
  (files.profiles.includes('coach-branch-alias-compat') || files.profiles.includes('coach-branch-field-alias-compat')) &&
  (files.profiles.includes("fbWhere('branch', '==', alias)") || files.profiles.includes("fbWhere(spec.field, '==', spec.value)")) &&
  files.profiles.includes('coachAliasListenerKeys') &&
  files.profiles.includes('coachAliasActiveMaps') &&
  !files.profiles.includes("fbWhere('branch', 'in'") &&
  !files.profiles.includes("where('branch', 'in'"));
check('Coach alias cleanup removes every alias listener and avoids stale alias rows',
  files.profiles.includes('_state.coachAliasListenerKeys.forEach') &&
  files.profiles.includes('_state.coachAliasActiveMaps[aliasKey] = aliasMap') &&
  files.profiles.includes('Object.values(_state.coachAliasActiveMaps || {})'));
check('Attendance profile source uses full compat merge for HLV attendance list',
  files.attendance.includes('getAllProfilesCompat') &&
  files.attendance.includes('Object.assign(merged, compat)') &&
  files.attendance.includes('Object.assign(merged, window.allProfiles || {})'));

check('Coach runtime repair writes canonical users mirror fields from Admin assignment',
  (files.coachRepair.includes("version:'4K-6V4D4'") || files.coachRepair.includes("version:'4K-6V4D8'")) &&
  files.coachRepair.includes('every Coach login must self-heal') &&
  files.coachRepair.includes("role: 'coach'") &&
  files.coachRepair.includes('coachBranch: assignedBranch') &&
  files.coachRepair.includes('auth/coach-branch-mirror-sync-failed'));
check('Firestore rules permit only safe self coach mirror repair from exact assignment',
  files.rules.includes('function safeSelfCoachMirrorUpdate(uid)') &&
  files.rules.includes('selfCoachMirrorMatches(uid, request.resource.data)') &&
  files.rules.includes("'role', 'clubId', 'branch', 'coachBranch', 'email', 'updatedAt'") &&
  !files.rules.includes("resource.data.role == 'coach'\n        && request.resource.data.clubId == resource.data.clubId"));
check('Firestore rules authorize coach branch display-name data reads',
  (files.rules.includes('function branchNameMatchesAssigned') || files.rules.includes('function branchNameMatchesCode')) &&
  files.rules.includes("cfg.get('branchName2'") &&
  (files.rules.includes('|| branchNameMatchesAssigned(myClubId(), branchValue)') || files.rules.includes('branchValueMatchesCode(myClubId(), branchValue, myBranch())')));
check('Legacy Admin coach creation/migration stores coachBranch too',
  files.app.includes('coachBranch: branch') &&
  (files.app.includes("version: '4K-6V4D4'") || files.app.includes("COACH_BRANCH_RUNTIME_VERSION='4K-6V4D8'")) );
check('No new broad write APIs added to render/attendance-only files',
  !/(setDoc|updateDoc|deleteDoc|writeBatch|addDoc)\s*\(/.test([files.renderStudents, files.attendance].join('\n')));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D4 checks passed.\n');
