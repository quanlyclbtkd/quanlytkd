#!/usr/bin/env node
/** Phase 4K-6V4D7 — Quit full sync + Coach login + Attendance branch access */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  renderer: read('js/ui/render/computation/studentsRenderer.js'),
  students: read('js/modules/students.js'),
  attendance: read('js/modules/attendance.js'),
  app: read('app.js'),
  coachRepair: read('js/core/coachBranchRuntimeRepair.js'),
  rules: read('firestore.rules'),
  statusConfig: read('js/data/profileStatusConfig.js'),
  store: read('js/data/studentProfileStore.js'),
};
const build = 'coach-attendance-fallback-stability-20260630-v4d7';
let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}
console.log('\n=== Phase 4K-6V4D7 — Quit / Coach / Attendance checks ===\n');

check('index cache-busts app.js, main.js and coach runtime to V4D7',
  files.index.includes(`app.js?v=${build}`) &&
  files.index.includes(`./js/main.js?v=${build}`) &&
  files.index.includes(`coachBranchRuntimeRepair.js?v=${build}`));
check('main imports quit/attendance-critical modules with V4D7 cache bust',
  files.main.includes(`profiles.listeners.js?v=${build}`) &&
  files.main.includes(`modules/students.js?v=${build}`) &&
  files.main.includes(`modules/attendance.js?v=${build}`) &&
  files.main.includes(`renderStudents.js?v=${build}`));
check('profiles listener has single-flight authoritative quit sync',
  files.profiles.includes('quitAuthoritativePromise') &&
  files.profiles.includes('ensureQuitProfilesAuthoritative') &&
  files.profiles.includes('forceQuitAuthoritative'));
check('targeted quit query cannot overwrite completed/in-flight authoritative sync',
  files.profiles.includes('delayed targeted preview overwrite') &&
  files.profiles.includes('_state.quitAuthoritativePromise') &&
  files.profiles.includes('quit-profiles-lazy-targeted-preview'));
check('quit completeness is only true after full fallback success',
  files.profiles.includes('if (forceQuitAuthoritative) _state.quitCompletenessReconciled = true') &&
  !files.profiles.includes('_state.quitCompletenessReconciled = true;\n            const ok = await loadFullProfilesFallback'));
check('renderQuitIsland blocks partial rows until authoritative sync is ready',
  files.renderStudents.includes('data-quit-authoritative-loading') &&
  files.renderStudents.includes('_quitAuthoritativeReady') &&
  files.renderStudents.includes('ensureQuitProfilesAuthoritative'));
check('Đã nghỉ renders full list on web and mobile without load-more',
  files.renderStudents.includes('const forceAll = true') &&
  files.renderStudents.includes('const limit = entries.length') &&
  files.renderer.includes('Number.MAX_SAFE_INTEGER') &&
  files.renderer.includes('no Load More for Đã nghỉ'));
check('local quit updates sync into split store and local quit journal',
  files.students.includes('studentProfileStore.mergeProfile') &&
  files.students.includes('_localQuitProfiles') &&
  files.students.includes('renderQuitList'));
check('status classifier covers Vietnamese pause/quit aliases',
  ['bao_nghi','tam_nghi','tam_dung','dung_tap'].every(v => files.statusConfig.includes(v)) &&
  files.statusConfig.includes("status.includes('dừng')") && files.statusConfig.includes("status.includes('dung')"));
check('coach login can recover from coach_login_index fallback',
  files.app.includes('_readCoachLoginIndexContext') &&
  files.app.includes("getDoc(doc(db, 'coach_login_index', user.uid))") &&
  files.app.includes('if (!_freshContext) _freshContext = await _readCoachLoginIndexContext(user)'));
check('coach creation/sync writes users and coach_login_index mirrors',
  files.app.includes("setDoc(doc(db, 'coach_login_index', uid), mirrorPayload") &&
  files.app.includes("coach_login_index thất bại") &&
  files.app.includes("deleteDoc(doc(db, 'coach_login_index', uid))"));
check('coach runtime repair writes both mirrors and exposes V4D7',
  files.coachRepair.includes("version:'4K-6V4D7'") &&
  files.coachRepair.includes("coach_login_index") &&
  files.coachRepair.includes('setDoc(doc(firestore, \'users\''));
check('firestore rules allow safe coach login index recovery only for matching coach assignment',
  files.rules.includes('match /coach_login_index/{uid}') &&
  files.rules.includes('safeSelfCoachLoginIndexWrite') &&
  files.rules.includes('selfCoachMirrorMatches(uid, request.resource.data)'));
check('coach mirror rules allow uid field required by runtime mirrors',
  files.rules.includes("'uid', 'photoURL'") && files.rules.includes("'email', 'uid', 'updatedAt'"));
check('attendance list reads full in-memory profile union for coach branch filtering',
  files.attendance.includes('getAllProfilesCompat') &&
  files.attendance.includes('emptyCoachBranch') &&
  files.attendance.includes('profileSourceCount'));
check('main exposes authoritative quit APIs globally',
  files.main.includes('window.ensureQuitProfilesAuthoritative') &&
  files.main.includes('window.isQuitProfilesAuthoritativeReady'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 checks passed.\n');
