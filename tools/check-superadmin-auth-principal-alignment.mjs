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
const isSuperBlock = rules.slice(rules.indexOf('function isSuperAdmin()'), rules.indexOf('function isClubMember'));
check('Canonical isSuperAdmin still uses role/users/super_admins, not email', isSuperBlock.includes("role', '') == 'super_admin'") && isSuperBlock.includes('super_admins') && !isSuperBlock.includes('admin@tstquynhon.com'));
const principalBlock = rules.slice(rules.indexOf('match /super_admins/{uid}'), rules.indexOf('// Deny by default'));
check('Bootstrap can only get/create own principal', principalBlock.includes('allow get: if isSuperAdmin() || isBootstrapSuperAdminIdentity(uid)') && principalBlock.includes('allow create: if isSuperAdmin() || ('));
check('Principal create payload is strict', principalBlock.includes("hasOnly(['enabled', 'email', 'createdAt', 'source'])") && principalBlock.includes("source', '') == 'bootstrap-email-v1'"));
check('No broad authenticated write rule exists', !rules.includes('allow read, write: if request.auth != null') && !rules.includes('allow write: if request.auth != null'));
check('login_history remains SuperAdmin-only for read/delete', /match \/login_history\/\{docId\}[\s\S]*allow get, list, delete: if isSuperAdmin\(\)/.test(rules));

check('Client defines canonical bootstrap helper', app.includes('const _ensureSuperAdminPrincipal = async (user) =>'));
const fastStart = app.indexOf('// ── Phase 4K-6V5U4: SuperAdmin principal convergence');
const fastEnd = app.indexOf('// Coach phải xác minh', fastStart);
const fastBlock = app.slice(fastStart, fastEnd);
check('Client verifies/creates principal before ROOT UI role', fastBlock.indexOf('await _ensureSuperAdminPrincipal(user)') >= 0 && fastBlock.indexOf('await _ensureSuperAdminPrincipal(user)') < fastBlock.indexOf("window.userRole = 'super_admin'"));
check('Bootstrap uses only one principal path', app.includes("doc(db, 'super_admins', uid)") && app.includes("source: 'bootstrap-email-v1'"));
check('Failed bootstrap fails closed through login error', fastBlock.includes('_showLoginError') && fastBlock.includes('return;'));
check('Unsafe login_history Rules copy guide removed', !app.includes('allow write: if request.auth != null;') && app.includes('Không mở Rules public'));
check('SuperAdmin permission UI points to V5U4 principal', sa.includes('canonical SuperAdmin principal') && sa.includes('firestore.rules V5U4'));
check('Cloud Functions remain canonical via super_admins principal', authz.includes('super_admins/${uid}') && !authz.includes('admin@tstquynhon.com'));
check('App cache-bust changed without breaking V5U2E lineage', index.includes('app.js?v=attendance-excel-documentid-sdk-fix-20260801-v5u2e&p=superadmin-auth-principal-20260811-v5u4'));
check('Package exposes this gate', pkg.scripts?.['check:superadmin-auth-principal-alignment'] === 'node tools/check-superadmin-auth-principal-alignment.mjs');

console.log(`\nPASS ${pass}/${pass+fail}`);
if (fail) process.exit(1);
console.log('V5U4 SuperAdmin auth principal alignment PASS.\n');
