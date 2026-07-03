import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  rules: read('firestore.rules'),
  invalidation: read('js/ui/render/renderInvalidation.js'),
  studentsRenderer: read('js/ui/render/computation/studentsRenderer.js'),
  publicApp: read('public/app.js'),
  publicInvalidation: read('public/js/ui/render/renderInvalidation.js'),
  publicStudentsRenderer: read('public/js/ui/render/computation/studentsRenderer.js'),
  pkg: read('package.json'),
};

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });
const build = 'login-history-large-list-guard-20260703-v5h';
const patch = '4K-6V5H-login-history-large-list-guard-20260703';

check('V5H cache-bust marker is active', files.index.includes(build) && files.app.includes(patch));
check('login_history payload includes uid for rules ownership', files.app.includes('uid: user.uid ||') && files.rules.includes("request.resource.data.get('uid', '') == request.auth.uid"));
check('login_history permission-denied is fail-safe and not a blocking console error', files.app.includes("sessionStorage.setItem(sessionKey, 'permission-denied')") && files.app.includes('Bỏ qua ghi lịch sử đăng nhập'));
check('firestore rules expose top-level login_history boundary', files.rules.includes('match /login_history/{docId}') && files.rules.includes('function safeLoginHistoryCreate'));
check('login_history create is limited to signed-in own audit payload', files.rules.includes('allow create: if safeLoginHistoryCreate()') && files.rules.includes("'uid', 'email', 'clubId', 'role', 'loginAt', 'timestamp'") && files.rules.includes('&& (isSuperAdmin() || userEnabled())'));
check('login_history read/update/delete is SuperAdmin only', files.rules.includes('allow get, list, update, delete: if isSuperAdmin()'));
check('large-list metrics track rendered rows separately from total rows', files.invalidation.includes('totalRowsPerList') && files.invalidation.includes('renderedRows') && files.invalidation.includes('totalRows='));
check('large-list warning coalesces repeated identical warnings', files.invalidation.includes('largeListWarningSuppressed') && files.invalidation.includes('lastWarnSignaturePerList') && files.invalidation.includes('120000'));
check('student renderer reports rendered debt rows, not total matches', files.studentsRenderer.includes("window.trackLargeListRender('students.debtList', _debtRendered") && files.studentsRenderer.includes('totalRows: _debtTotalCount'));
check('student renderer keeps total debt count for dashboard/load-more', files.studentsRenderer.includes('debtTotalCount:    _debtTotalCount') && files.studentsRenderer.includes('debtRendered:      _debtRendered'));
check('public mirrors are synced', files.publicApp.includes(patch) && files.publicInvalidation.includes('renderedRows') && files.publicStudentsRenderer.includes("students.debtList', _debtRendered"));
check('V5H check is wired into package scripts', files.pkg.includes('check:v5h-login-history-large-list-guard'));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5h-login-history-large-list-guard] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5h-login-history-large-list-guard] PASS ${checks.length}/${checks.length}`);
