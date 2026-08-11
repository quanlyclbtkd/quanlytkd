#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const app = read('app.js');
const index = read('index.html');
const superadmin = read('js/modules/superadmin.js');
const rules = read('firestore.rules');
const authz = read('functions/src/authz.js');
const pkg = JSON.parse(read('package.json'));

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name, detail); }
}
function count(src, re) { return [...src.matchAll(re)].length; }

console.log('Phase 4K-6V5U4 — SuperAdmin Verified Authorization Contract');

check('1. Hard-coded email alone cannot grant SuperAdmin',
  !/admin@tstquynhon\.com/i.test(app) && !/admin@tstquynhon\.com/i.test(rules));
check('2. users/{uid}.role super_admin is a frontend verification source',
  /userData\?\.role[\s\S]{0,120}super_admin/.test(app) && /source: 'users_doc'/.test(app));
check('3. Custom Claim role=super_admin is supported with modular getIdTokenResult',
  index.includes('getIdTokenResult') && app.includes("tokenResult?.claims?.role") && app.includes("source: 'custom_claim'"));
check('4. super_admins/{uid} marker remains supported',
  app.includes("doc(db, 'super_admins', uid)") && app.includes("source: 'super_admin_marker'"));
check('5. Cached super_admin is verified before ROOT initialization', (() => {
  const i = app.indexOf("if (_cached?.role === 'super_admin')");
  const v = app.indexOf('resolveVerifiedSuperAdminContext(user)', i);
  const a = app.indexOf('_activateVerifiedSuperAdmin', v);
  return i >= 0 && v > i && a > v;
})());
check('6. Unverified session blocks clubs query in SuperAdmin loader', (() => {
  const guard = superadmin.indexOf('if (!_hasVerifiedSuperAdmin())');
  const query = superadmin.indexOf('collection(db, "clubs")');
  return guard >= 0 && query > guard;
})());
check('7. Unverified session blocks login_history query', (() => {
  const start = app.indexOf('window.loadLoginHistory = async');
  const guard = app.indexOf('window.isVerifiedSuperAdminSession', start);
  const query = app.indexOf('collection(db, "login_history")', start);
  return start >= 0 && guard > start && query > guard;
})());
check('8. Verified SuperAdmin may proceed to both privileged loaders',
  app.includes('window.isVerifiedSuperAdminSession') && superadmin.includes('_hasVerifiedSuperAdmin') && app.includes('getDocs(q)'));
check('9. Login History has 45s TTL + single-flight + manual force bypass',
  app.includes('_LOGIN_HISTORY_CACHE_TTL_MS = 45 * 1000') && app.includes('_loginHistoryLoadPromise')
  && app.includes('options?.force === true') && index.includes('window.loadLoginHistory({force:true})'));
check('10. Logout resets verified authorization state',
  app.includes("_resetVerifiedSuperAdminState('logout')") && app.includes("window.userRole = 'viewer'"));
check('11. Admin/Viewer/Coach canonical auth behavior remains present',
  app.includes("_cached.role !== 'coach'") && app.includes('_resolveCoachBranchContext') && app.includes("fresh.role === 'coach'"));
check('12. No stale email allowlist in login_history guidance',
  !/request\.auth\.token\.email[\s\S]{0,100}admin@tstquynhon\.com/i.test(app));
check('13. Firestore Rules remain fail-closed / no public-read patch',
  !/allow\s+(?:get,\s*list|read)\s*:\s*if\s+true/.test(rules)
  && !/allow\s+read\s*:\s*if\s+request\.auth\s*!=\s*null\s*;/.test(rules));
check('14. Firestore canonical isSuperAdmin contract still has claim + user doc + marker',
  rules.includes("request.auth.token.get('role', '') == 'super_admin'")
  && rules.includes("myRole() == 'super_admin'")
  && rules.includes('super_admins/$(request.auth.uid)'));
check('15. clubs + login_history privileged list use isSuperAdmin()',
  /match \/clubs\/\{clubId\}[\s\S]{0,220}allow list: if isSuperAdmin\(\)/.test(rules)
  && /match \/login_history\/\{docId\}[\s\S]{0,500}allow get, list, delete: if isSuperAdmin\(\)/.test(rules));
check('16. Exactly one canonical onAuthStateChanged lifecycle remains',
  count(app, /onAuthStateChanged\s*\(\s*auth\s*,/g) === 1, `found ${count(app, /onAuthStateChanged\s*\(\s*auth\s*,/g)}`);
check('17. Functions authz uses the same three SuperAdmin evidence sources',
  authz.includes("tokenRole === 'super_admin'") && authz.includes("userRole === 'super_admin'") && authz.includes('superAdminSnap.exists'));
check('18. No privileged authorization trusts LocalStorage/window.userRole/email', (() => {
  const start = app.indexOf('async function resolveVerifiedSuperAdminContext');
  const end = app.indexOf('window.resolveVerifiedSuperAdminContext', start);
  const body = app.slice(start, end);
  return !/localStorage|window\.userRole|\.email/i.test(body);
})());
check('19. firestore.rules was not relaxed for Coach/tenant boundaries',
  rules.includes("myRole() in ['admin', 'owner']") && rules.includes('existingCoachBelongsToMyClub') && rules.includes('targetIsValidCoachInMyClub'));
check('20. V5U3 search regression script remains wired',
  !!pkg.scripts?.['check:student-name-search-priority'] && fs.existsSync(path.join(ROOT, 'tools/check-student-name-search-priority.mjs')));
check('21. V5U4 auth contract script is wired',
  pkg.scripts?.['check:superadmin-auth-contract'] === 'node tools/check-superadmin-auth-contract.mjs');

console.log(`\nSuperAdmin Auth Contract: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
