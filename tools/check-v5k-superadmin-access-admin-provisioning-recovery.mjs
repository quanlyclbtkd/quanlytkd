import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  rules: read('firestore.rules'),
  app: read('app.js'),
  superadmin: read('js/modules/superadmin.js'),
  main: read('js/main.js'),
  index: read('index.html'),
  publicApp: read('public/app.js'),
  publicSuperadmin: read('public/js/modules/superadmin.js'),
  pkg: read('package.json'),
};
const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });
check('V5K-or-later cache-bust marker is active', (files.index.includes('role-runtime-audit-profiler-20260704-v5o') || files.index.includes('debt-zalo-feature-off-20260704-v5n') || files.index.includes('quit-authoritative-data-boundary-20260704-v5p')) && (files.app.includes('4K-6V5O-role-runtime-audit-profiler-20260704') || files.app.includes('4K-6V5N-debt-zalo-feature-off-20260704') || files.app.includes('4K-6V5M-attendance-status-quit-sync-20260704') || files.app.includes('4K-6V5L-superadmin-revenue-cache-fallback-20260704') || files.app.includes('4K-6V5K-superadmin-access-admin-provisioning-recovery-20260704') || files.app.includes('4K-6V5P-quit-authoritative-data-boundary-20260704')));
check('Rules accepts SuperAdmin role aliases', files.rules.includes('function isSuperAdminRoleValue') && ['super_admin','superadmin','root','root_admin','admin_root'].every(x => files.rules.includes(`'${x}'`)));
check('Rules accepts trusted SuperAdmin email fast path', files.rules.includes('function isTrustedSuperAdminEmail') && files.rules.includes('admin@tstquynhon.com'));
check('Rules inspects role/userRole/adminRole custom claims', ['request.auth.token.get(\'role\'','request.auth.token.get(\'userRole\'','request.auth.token.get(\'adminRole\''].every(x => files.rules.includes(x)));
check('Rules recognizes users doc role aliases', files.rules.includes('(hasUserDoc() && isSuperAdminRoleValue(myRole()))'));
check('Rules recognizes super_admins marker document', files.rules.includes('exists(/databases/$(database)/documents/super_admins/$(request.auth.uid))'));
check('super_admins self get diagnostic allowed but list/write restricted', files.rules.includes('allow get: if (signedIn() && request.auth.uid == uid) || isSuperAdmin();') && files.rules.includes('allow list, create, update, delete: if isSuperAdmin();'));
check('SuperAdmin can create admin user docs', files.rules.includes('allow create: if isSuperAdmin()') && files.superadmin.includes('setDoc(doc(db, "users", newUid)'));
check('forceReplaceAdmin preflights Firestore before Auth user creation', files.superadmin.indexOf('_assertSuperAdminFirestoreAccess(\'forceReplaceAdmin-preflight\')') > -1 && files.superadmin.indexOf('_assertSuperAdminFirestoreAccess(\'forceReplaceAdmin-preflight\')') < files.superadmin.indexOf('createUserWithEmailAndPassword(secondaryAuth'));
check('forceReplaceAdmin stops before orphan Auth user when rules are not ready', files.superadmin.includes('Thao tác đã dừng trước khi tạo Auth user'));
check('forceReplaceAdmin writes active admin status and timestamps', files.superadmin.includes('status: "active"') && files.superadmin.includes('createdAt: new Date().toISOString()') && files.superadmin.includes('updatedAt: new Date().toISOString()'));
check('SuperAdmin dashboard marks Firestore ready on successful clubs list', files.superadmin.includes('window.__superAdminFirestoreReady = true') && files.superadmin.includes('loadSuperAdminData'));
check('SuperAdmin permission-denied is warn/friendly instead of raw console.error', files.superadmin.includes("console.warn('[SuperAdmin] Firestore Rules chưa cấp quyền SuperAdmin:'") && !files.superadmin.includes('console.error(e);\n            _m().lastError'));
check('login_history read permission-denied is warn/friendly', files.app.includes("console.warn('[login_history] Firestore Rules chưa cấp quyền đọc lịch sử cho SuperAdmin:'"));
check('Public mirrors are synced', (files.publicApp.includes('4K-6V5O-role-runtime-audit-profiler') || files.publicApp.includes('4K-6V5N-debt-zalo-feature-off') || files.publicApp.includes('4K-6V5M-attendance-status-quit-sync') || files.publicApp.includes('4K-6V5K-superadmin-access-admin-provisioning-recovery') || files.publicApp.includes('4K-6V5L-superadmin-revenue-cache-fallback') || files.publicApp.includes('4K-6V5P-quit-authoritative-data-boundary')) && files.publicSuperadmin.includes('forceReplaceAdmin-preflight'));
check('Package exposes V5K check', files.pkg.includes('check:v5k-superadmin-access-admin-provisioning-recovery'));
let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5k-superadmin-access-admin-provisioning-recovery] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5k-superadmin-access-admin-provisioning-recovery] PASS ${checks.length}/${checks.length}`);
