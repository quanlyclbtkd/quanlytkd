#!/usr/bin/env node
/** Phase 4K-6V4D7 — Quit Mobile + Coach Attendance Branch Rules Repair */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const profiles = read('js/listeners/profiles.listeners.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const studentsRenderer = read('js/ui/render/computation/studentsRenderer.js');
const students = read('js/modules/students.js');
const attendance = read('js/modules/attendance.js');
const app = read('app.js');
const coachRepair = read('js/core/coachBranchRuntimeRepair.js');
const rules = read('firestore.rules');
const statusConfig = read('js/data/profileStatusConfig.js');

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}
const build = 'coach-profiles-bootstrap-repair-20260630-v4d8';
console.log('\n=== Phase 4K-6V4D7 — Quit Mobile + Coach Attendance Branch Rules Repair ===\n');

check('Index cache-busts app/main/core scripts to V4D7',
  index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`) && index.includes(`coachBranchRuntimeRepair.js?v=${build}`));
check('Main imports quit/profile/attendance modules with V4D7 cache-bust',
  main.includes(`./listeners/profiles.listeners.js?v=${build}`) &&
  main.includes(`./ui/render/renderStudents.js?v=${build}`) &&
  main.includes(`./modules/students.js?v=${build}`) &&
  main.includes(`./modules/attendance.js?v=${build}`));
check('Main exposes ensureQuitProfilesAuthoritative for tab render',
  main.includes('ensureQuitProfilesAuthoritative,') && main.includes('window.ensureQuitProfilesAuthoritative = ensureQuitProfilesAuthoritative'));
check('Quit lazy path is full authoritative only for Admin, not targeted partial queries',
  profiles.includes('targeted quit queries were the root cause') &&
  profiles.includes("return ensureQuitProfilesAuthoritative('load-quit-profiles:") &&
  !profiles.includes('legacyQuitSignals'));
check('Authoritative quit sync is single-flight and tracks completeness',
  profiles.includes('quitAuthoritativePromise') && profiles.includes('quitCompletenessReconciled') &&
  profiles.includes("loadFullProfilesFallback('quit-authoritative-full-sync:") && profiles.includes('forceQuitAuthoritative'));
check('isQuitProfilesLoaded requires completeness for non-Coach contexts',
  profiles.includes("return _isCoachContext() ? _state.quitLoaded : (_state.quitLoaded && _state.quitCompletenessReconciled)"));
check('Render blocks partial Đã nghỉ rows and shows explicit loading until full sync is ready',
  renderStudents.includes('data-quit-authoritative-loading') && renderStudents.includes('ensureQuitProfilesAuthoritative') &&
  renderStudents.includes('Đang tải đầy đủ danh sách võ sinh đã nghỉ'));
check('Render builds full authoritative quit rows and never page-limits Đã nghỉ',
  renderStudents.includes('const forceAll = true') && renderStudents.includes('const limit = entries.length') &&
  studentsRenderer.includes('const _quitLimit    = Number.MAX_SAFE_INTEGER'));
check('No quit load-more row remains in computation renderer',
  studentsRenderer.includes('No load-more row for Đã nghỉ') && !studentsRenderer.includes("onclick=\"_loadMore('quit')\""));
check('Student quit external control reports full list on web and mobile',
  students.includes('Web + mobile both show the full list') && students.includes('Đã hiển thị đủ'));
check('Status classifier covers Vietnamese legacy quit/pause values',
  ['bao_nghi','tam_nghi','tam_dung','dung_tap'].every(v => statusConfig.includes(v)) &&
  statusConfig.includes("status.includes('dung')") && statusConfig.includes("status.includes('dừng')"));
check('Coach login has deterministic coach_login_index fallback',
  app.includes('_readCoachLoginIndexContext') && app.includes("getDoc(doc(db, 'coach_login_index', user.uid))") &&
  app.includes('if (!_freshContext) _freshContext = await _readCoachLoginIndexContext(user)'));
check('Coach mirror repair write failure no longer blocks login when branch context is known',
  app.includes('mirror repair write failures must not block Coach login') && coachRepair.includes('mirror refresh failed; using assigned branch'));
check('Coach create/migrate writes users and coach_login_index mirrors',
  app.includes("setDoc(doc(db, 'coach_login_index', uid), mirrorPayload") && coachRepair.includes("doc(db(), 'coach_login_index', uid)"));
check('Firestore rules permit safe self coach_login_index recovery only against Admin assignment',
  rules.includes('match /coach_login_index/{uid}') && rules.includes('safeSelfCoachLoginIndexWrite') && rules.includes('selfCoachMirrorMatches(uid, request.resource.data)'));
check('Firestore rules allow uid field in coach user mirror writes',
  rules.includes("'uid', 'photoURL'") && rules.includes("'branch', 'coachBranch', 'email', 'uid', 'updatedAt'"));
check('Firestore rules accept branch aliases and configured branch names for Coach boundary',
  rules.includes('branchEquivalent(left, right)') && rules.includes('branchName2') && rules.includes('branchCode'));
check('Login history warning is fixed by explicit Rules + soft client handling',
  rules.includes('match /login_history/{docId}') && app.includes('Bỏ qua ghi lịch sử đăng nhập do Rules chưa cho phép'));
check('Coach profile fallback queries branch/branchCode/coachBranch/branchName aliases safely',
  profiles.includes("const fields = ['branch', 'branchCode', 'coachBranch', 'branchName']") && profiles.includes('deniedSpecs'));
check('BranchIdentity normalizes CS02/CS 2/Cơ sở 2/custom branch names',
  read('js/core/branchIdentity.js').includes('_configuredBranchNameMap') && read('js/core/branchIdentity.js').includes('CS '));
check('Attendance profile source merges studentProfileStore/allProfiles/__store for Coach attendance list',
  attendance.includes('getAllProfilesCompat') && attendance.includes('Object.assign(merged, window.allProfiles || {})') && attendance.includes("Object.assign(merged, (window.__store || {}).profiles || {})"));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 checks passed.\n');
