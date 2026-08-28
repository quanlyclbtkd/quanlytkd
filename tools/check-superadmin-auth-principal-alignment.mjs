#!/usr/bin/env node
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ` — ${detail}` : '')); }
};

const rules = read('firestore.rules');
const app = read('app.js');
const sa = read('js/modules/superadmin.js');
const authz = read('functions/src/authz.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

console.log('\n=== Phase 4K-6V5U4 — SuperAdmin Auth Principal Alignment ===\n');

check('Rules define narrow bootstrap identity', rules.includes('function isBootstrapSuperAdminIdentity(uid)'));
check('Bootstrap is self-UID only', rules.includes('request.auth.uid == uid'));
check('Bootstrap exact ROOT email is isolated to principal creation', rules.includes("request.auth.token.get('email', '') == 'admin@tstquynhon.com'"));
const principalHelperStart = rules.indexOf('function hasEnabledSuperAdminPrincipal()');
const isSuperBlock = rules.slice(principalHelperStart >= 0 ? principalHelperStart : rules.indexOf('function isSuperAdmin()'), rules.indexOf('function isClubMember'));
check('Rules principal branch requires enabled == true', isSuperBlock.includes('function hasEnabledSuperAdminPrincipal()') && isSuperBlock.includes("data.get('enabled', false) == true") && isSuperBlock.includes('hasEnabledSuperAdminPrincipal()'));
check('Canonical isSuperAdmin still supports custom claim + users role without email', isSuperBlock.includes("request.auth.token.get('role', '') == 'super_admin'") && isSuperBlock.includes("myRole() == 'super_admin'") && !isSuperBlock.includes('admin@tstquynhon.com'));
const principalBlock = rules.slice(rules.indexOf('match /super_admins/{uid}'), rules.indexOf('// Deny by default'));
check('Bootstrap can only get/create own principal', principalBlock.includes('allow get: if isSuperAdmin() || isBootstrapSuperAdminIdentity(uid)') && principalBlock.includes('allow create: if isSuperAdmin() || ('));
check('Principal create payload is strict', principalBlock.includes("hasOnly(['enabled', 'email', 'createdAt', 'source'])") && principalBlock.includes("source', '') == 'bootstrap-email-v1'"));
check('No broad authenticated write rule exists', !rules.includes('allow read, write: if request.auth != null') && !rules.includes('allow write: if request.auth != null'));
check('login_history remains SuperAdmin-only for read/delete', /match \/login_history\/\{docId\}[\s\S]*allow get, list, delete: if isSuperAdmin\(\)/.test(rules));

check('Client defines canonical bootstrap helper', app.includes('const _ensureSuperAdminPrincipal = async (user) =>'));
const fastStart = app.indexOf('// ── Phase 4K-6V5U4: SuperAdmin principal convergence');
const fastEnd = app.indexOf('// Cache is intentionally read only as a hint/diagnostic.', fastStart);
const fastBlock = app.slice(fastStart, fastEnd);
check('Client verifies/creates principal before canonical ROOT context commit', fastBlock.indexOf('await _ensureSuperAdminPrincipal(user)') >= 0 && fastBlock.indexOf('await _ensureSuperAdminPrincipal(user)') < fastBlock.indexOf('_commitVerifiedAuthContext(user'));
check('Bootstrap uses only one principal path', app.includes("doc(db, 'super_admins', uid)") && app.includes("source: 'bootstrap-email-v1'"));
const ensureStart=app.indexOf('const _ensureSuperAdminPrincipal = async (user) =>');
const ensureEnd=ensureStart>=0 ? app.indexOf('const _resolveCoachBranchContext',ensureStart) : -1;
const ensureBlock=ensureStart>=0 && ensureEnd>ensureStart ? app.slice(ensureStart,ensureEnd) : '';
check('Client existing enabled:true principal passes', /principalData\.enabled === true\) return true/.test(ensureBlock));
check('Client existing enabled:false principal fails closed', ensureBlock.includes("auth/superadmin-principal-disabled") && ensureBlock.includes('SuperAdmin principal đã bị vô hiệu hóa.'));
check('Client disabled principal is not rewritten enabled:true', ensureBlock.indexOf("auth/superadmin-principal-disabled") >= 0 && ensureBlock.indexOf("auth/superadmin-principal-disabled") < ensureBlock.indexOf('await setDoc(principalRef'));
check('Failed bootstrap fails closed through login error', fastBlock.includes('_showLoginError') && fastBlock.includes('return;'));
check('Unsafe login_history Rules copy guide removed', !app.includes('allow write: if request.auth != null;') && app.includes('Không mở Rules public'));
check('SuperAdmin permission UI points to V5U4 principal', sa.includes('canonical SuperAdmin principal') && sa.includes('firestore.rules V5U4'));
check('Functions authz requires principal enabled:true', authz.includes('super_admins/${uid}') && /superAdminSnap\.exists[\s\S]{0,100}enabled === true/.test(authz) && !authz.includes('admin@tstquynhon.com'));
check('App cache-bust keeps V5U4 compatibility and advances to V5U5', index.includes('app.js?v=attendance-excel-documentid-sdk-fix-20260801-v5u2e&p=superadmin-auth-principal-20260811-v5u4') && index.includes('app.js?v=canonical-security-truth-20260811-v5u5'));
check('Package exposes this gate', pkg.scripts?.['check:superadmin-auth-principal-alignment'] === 'node tools/check-superadmin-auth-principal-alignment.mjs');

if (ensureBlock) {
  const makeEnsure = new Function('db','_SUPER_ADMIN_BOOTSTRAP_EMAIL','doc','getDoc','setDoc', `${ensureBlock}; return _ensureSuperAdminPrincipal;`);
  const user={uid:'root-uid',email:'admin@tstquynhon.com'};
  let setCalls=0;
  const disabledFn=makeEnsure({},'admin@tstquynhon.com',()=>({}),async()=>({exists:()=>true,data:()=>({enabled:false})}),async()=>{setCalls++;});
  let disabledCode='';
  try { await disabledFn(user); } catch (e) { disabledCode=e?.code||''; }
  check('Dynamic disabled principal throws canonical code', disabledCode==='auth/superadmin-principal-disabled', disabledCode);
  check('Dynamic disabled principal performs zero setDoc', setCalls===0, `setCalls=${setCalls}`);
  setCalls=0;
  const enabledFn=makeEnsure({},'admin@tstquynhon.com',()=>({}),async()=>({exists:()=>true,data:()=>({enabled:true})}),async()=>{setCalls++;});
  check('Dynamic enabled principal returns true', await enabledFn(user)===true && setCalls===0);
}

console.log(`\nPASS ${pass}/${pass+fail}`);
if (fail) process.exit(1);
console.log('V5U4 SuperAdmin auth principal alignment PASS.\n');
