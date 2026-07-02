import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  rules: read('firestore.rules'),
  publicApp: read('public/app.js'),
  publicIndex: read('public/index.html'),
  pkg: read('package.json')
};
let pass=0, fail=0;
function check(name, ok){ if(ok){pass++; console.log('✅',name);} else {fail++; console.error('❌',name);} }
console.log('\n=== Phase 4K-6V5D — Coach Runtime Recovery + Login History Cache Guard ===\n');
const build='coach-runtime-recovery-login-history-cache-guard-20260703-v5d';
check('entrypoint cache-bust is V5D', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`));
check('public entrypoint cache-bust is V5D', files.publicIndex.includes(`app.js?v=${build}`) && files.publicIndex.includes(`./js/main.js?v=${build}`));
check('app patch version is V5D', files.app.includes("APP_PATCH_VERSION = '4K-6V5D-coach-runtime-recovery-login-history-cache-guard-20260703'"));
check('resolveActiveDataSource has coach-scoped skip before full-club probes', files.app.includes('function _isCoachScopedRuntimeSession') && files.app.indexOf("source: 'coach-scoped'") < files.app.indexOf("_hasDoc('clubs/' + _clubId + '/profiles')"));
check('runRuntimeDataRecovery hard-skips coach full-club recovery probes', files.app.includes("state.activeDataSource = 'coach-scoped'") && files.app.includes("[RuntimeRecovery] Coach scoped session") && files.app.indexOf("if (_isCoachScopedRuntimeSession())") < files.app.indexOf("const src = await window.resolveActiveDataSource"));
check('coach skip still triggers branch-scoped roster hydration retry', files.app.includes("loadCoachBranchProfilesFallback('runtime-recovery-coach-skip')") || files.app.includes("mountActiveProfilesListenerIfNeeded('runtime-recovery-coach-skip')"));
check('login_history payload includes uid', files.app.includes('uid: user.uid ||') && files.rules.includes('request.resource.data.uid == request.auth.uid'));
check('login_history permission-denied is info-level and de-spammed', files.app.includes('Bỏ qua ghi lịch sử đăng nhập do quyền hiện tại') && files.app.includes('sessionStorage.setItem(sessionKey, \'1\')'));
check('firestore rules include login_history self-create rule', files.rules.includes('match /login_history/{docId}') && files.rules.includes("'uid', 'email', 'clubId', 'role'") && files.rules.includes("'coach', 'hlv'"));
check('firestore rules keep login_history read restricted to SuperAdmin', files.rules.includes('allow read, update, delete: if isSuperAdmin();'));
check('SuperAdmin alias helper retained for login_history read access', files.rules.includes('function isSuperAdminRoleValue') && files.rules.includes("'superadmin', 'root', 'root_admin', 'admin_root'"));
check('public app mirror synced for V5D coach runtime skip', files.publicApp.includes("state.activeDataSource = 'coach-scoped'") && files.publicApp.includes('Bỏ qua ghi lịch sử đăng nhập do quyền hiện tại'));
check('package exposes V5D regression check', files.pkg.includes('check:v5d-coach-runtime-recovery-login-history-cache-guard'));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
console.log('Phase 4K-6V5D checks passed.\n');
