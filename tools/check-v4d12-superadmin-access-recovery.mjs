import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const rules = read('firestore.rules');
const app = read('app.js');
const publicApp = read('public/app.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['cache bust v4d12 in index', index.includes('superadmin-access-recovery-20260630-v4d12')],
  ['rules contain SuperAdmin role alias helper', /function\s+isSuperAdminRoleValue\s*\(roleValue\)/.test(rules)],
  ['rules accept legacy superadmin alias', rules.includes("'superadmin'") && rules.includes("'root_admin'") && rules.includes("'admin_root'")],
  ['rules accept trusted root email fast path', rules.includes('function isTrustedSuperAdminEmail') && rules.includes('admin@tstquynhon.com')],
  ['rules inspect role/userRole/adminRole custom claims', rules.includes("request.auth.token.get('role', '')") && rules.includes("request.auth.token.get('userRole', '')") && rules.includes("request.auth.token.get('adminRole', '')")],
  ['rules inspect users/{uid}.role through alias helper', rules.includes('(hasUserDoc() && isSuperAdminRoleValue(myRole()))')],
  ['rules preserve super_admins marker document support', rules.includes('exists(/databases/$(database)/documents/super_admins/$(request.auth.uid))')],
  ['rules login_history read guarded by SuperAdmin', /match \/login_history\/\{docId\}[\s\S]*allow read, update, delete: if isSuperAdmin\(\);/.test(rules)],
  ['rules login_history create allows root aliases', rules.includes("'super_admin', 'superadmin', 'root', 'root_admin', 'admin_root'")],
  ['rules allow own super_admin marker get for diagnostics only', rules.includes('allow get: if (signedIn() && request.auth.uid == uid) || isSuperAdmin();')],
  ['app normalizes root aliases to super_admin', app.includes("role === 'superadmin' || role === 'root' || role === 'root_admin' || role === 'admin_root'")],
  ['public app synchronized', publicApp.includes("role === 'superadmin' || role === 'root' || role === 'root_admin' || role === 'admin_root'")],
  ['login history guide updated for v4d12', app.includes('V4D12: SuperAdmin phải được nhận diện giống runtime')],
  ['package exposes v4d12 check', !!pkg.scripts['check:v4d12-superadmin-access-recovery']],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`✅ ${name}`);
  else { console.error(`❌ ${name}`); failed++; }
}
if (failed) {
  console.error(`\n[check-v4d12-superadmin-access-recovery] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v4d12-superadmin-access-recovery] PASS ${checks.length}/${checks.length}`);
