import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const service = read('js/services/accountProvisioningService.js');
const superadmin = read('js/modules/superadmin.js');
const functionsIndex = read('functions/index.js');
const functionsSource = read('functions/src/accountProvisioning.js');
const rules = read('firestore.rules');
const html = read('index.html');

let passed = 0;
const failures = [];
function check(name, condition) {
  if (condition) { passed++; console.log(`✅ ${name}`); }
  else { failures.push(name); console.error(`❌ ${name}`); }
}
function lacks(source, pattern) { return !pattern.test(source); }

check('Build marker 4K-6W exists', main.includes("4K-6W-secure-account-provisioning-rules-lockdown"));
check('Account provisioning service imported', main.includes("./services/accountProvisioningService.js"));
check('Account provisioning service initialized', main.includes('initAccountProvisioningService();'));
check('Client service uses asia-southeast1', service.includes("const REGION = 'asia-southeast1'"));
check('Client service uses callable Functions', service.includes('fb.httpsCallable(_getFunctions(), action)'));
check('Client service has shared in-flight guard', service.includes('const _inFlight = new Map()'));
check('Client service generates idempotency requestId', service.includes('requestId: payload.requestId || _requestId(action)'));
check('Client service does not accept password payload', lacks(service, /password\s*:/i));
check('Client service does not log email', service.includes('Deliberately do not log email'));
check('Client sends password setup/reset email', service.includes('sendPasswordResetEmail'));

for (const fn of [
  'provisionClubAdmin','provisionCoachAccount','replaceClubAdmin','removeCoachAccount',
  'migrateCoachAccounts','repairCurrentAccountMembership','purgeLegacyCredentialFields',
  'setClubAccountStatus','updateClubSubscription'
]) {
  check(`Function exported: ${fn}`, functionsIndex.includes(`exports.${fn} = accountProvisioning.${fn};`));
  check(`Function implemented: ${fn}`, functionsSource.includes(`exports.${fn} = callable`));
}

check('Functions require authenticated context', functionsSource.includes('function requireAuth(context)'));
check('SuperAdmin server verification exists', functionsSource.includes('function requireSuperAdmin(actor)'));
check('Club admin server verification exists', functionsSource.includes('function requireClubAdmin(actor, clubId)'));
check('Server validates email', functionsSource.includes('SAFE_EMAIL_RE'));
check('Server validates clubId', functionsSource.includes('SAFE_CLUB_ID_RE'));
check('Server validates requestId', functionsSource.includes('SAFE_REQUEST_ID_RE'));
check('Server uses Admin Auth', functionsSource.includes("const auth = admin.auth()"));
check('Server creates account without plaintext password', /auth\.createUser\(\{[\s\S]*?email,[\s\S]*?displayName:[\s\S]*?emailVerified:[\s\S]*?disabled:[\s\S]*?\}\)/.test(functionsSource));
check('Server does not pass password to createUser', lacks(functionsSource, /auth\.createUser\(\{[\s\S]{0,500}?password\s*:/));
check('Server writes audit logs', functionsSource.includes("db.collection('audit_logs').doc()"));
check('Server tracks idempotent requests', functionsSource.includes('account_provisioning_requests'));
check('Server rollback deletes newly-created auth user', functionsSource.includes('if (createdAuth && authRecord)'));
check('Admin replacement disables old Auth user', functionsSource.includes("auth.updateUser(oldAdminUid, { disabled: true })"));
check('Credential purge uses FieldValue.delete', functionsSource.includes('adminPassword: FieldValue.delete()'));
check('Credential purge never logs credential values', functionsSource.includes('credentialValuesLogged: false'));
check('Secure repair verifies adminEmail server-side', functionsSource.includes("where('adminEmail', '==', email)"));
check('Secure repair verifies coach email server-side', functionsSource.includes("collectionGroup('coaches').where('email', '==', email)"));

check('Legacy app no longer creates Firebase users', lacks(app, /createUserWithEmailAndPassword\s*\(/));
check('Legacy app no longer writes users documents', lacks(app, /setDoc\(doc\(db,\s*['\"]users['\"]/));
check('Legacy app no longer deletes users documents', lacks(app, /deleteDoc\(doc\(db,\s*['\"]users['\"]/));
check('Legacy app no longer writes adminPassword', lacks(app, /adminPassword\s*:/));
check('SuperAdmin module no longer writes adminPassword', lacks(superadmin, /adminPassword\s*:/));
check('SuperAdmin module no longer reads adminPassword', lacks(superadmin, /data\.adminPassword/));
check('SuperAdmin module no longer reveals password toggle', lacks(superadmin, /data-pw=/));
check('Create club delegates to secure service', app.includes('service.provisionClubAdmin'));
check('Create coach delegates to secure service', app.includes('service.provisionCoachAccount'));
check('Delete coach delegates to secure service', app.includes('service.removeCoachAccount'));
check('Coach migration delegates to secure service', app.includes('service.migrateCoachAccounts'));
check('Replace admin delegates to secure service', superadmin.includes('AccountProvisioningService.replaceClubAdmin'));
check('Lock account delegates to secure service', /setClubAccountStatus\(\{\s*clubId,\s*status:\s*'locked'/.test(superadmin));
check('Unlock account delegates to secure service', superadmin.includes("setClubAccountStatus({ clubId, status: 'active' })"));
check('Expiry update delegates to secure service', app.includes('service.updateClubSubscription'));
check('Change password stays Auth-only', app.includes('Firebase Auth is the only credential authority'));
check('Login repair delegates to verified callable', app.includes("'repairCurrentAccountMembership'"));

check('Admin password input removed', !html.includes('id="nc_adminPass"'));
check('Coach password input removed', !html.includes('id="coach_pass"'));
check('Club UI explains no credential storage', html.includes('Mật khẩu không được lưu trong Firestore'));
check('Coach UI explains no credential storage', html.includes('Hệ thống không lưu mật khẩu'));

check('Rules deny club creation from client', /match \/clubs\/\{clubId\}[\s\S]*?allow create, delete: if false;/.test(rules));
check('Rules protect sensitive club fields', rules.includes("'adminPassword'") && rules.includes("'accountStatus'") && rules.includes('clubAdminRootUpdateIsSafe'));
check('Rules deny users create/delete', /match \/users\/\{uid\}[\s\S]*?allow create, delete: if false;/.test(rules));
check('Rules self-update uses allowlist', rules.includes('selfUserUpdateIsSafe()'));
check('Rules do not allow self role update', rules.includes("'displayName'") && !/selfUserUpdateIsSafe\(\)[\s\S]{0,300}'role'/.test(rules));
check('Rules deny client coach writes', /match \/coaches\/\{coachId\}[\s\S]*?allow create, update, delete: if false;/.test(rules));
check('Rules have no permissive subcollection catch-all bypass', !rules.includes('match /{subcollection}/{docId}'));
check('Rules deny provisioning-request access', /match \/account_provisioning_requests\/\{requestId\}[\s\S]*?allow read, write: if false;/.test(rules));
check('Rules make audit logs server-only write', /match \/audit_logs\/\{auditId\}[\s\S]*?allow create, update, delete: if false;/.test(rules));
check('Login history requires matching uid', rules.includes('request.resource.data.uid == request.auth.uid'));
check('App writes uid to login history', /collection\(db, "login_history"\), \{\s*uid: user\.uid,/.test(app));

try {
  execFileSync(process.execPath, ['-c', path.join(root, 'functions/src/accountProvisioning.js')], { stdio: 'pipe' });
  check('Cloud Functions provisioning syntax', true);
} catch { check('Cloud Functions provisioning syntax', false); }
try {
  execFileSync(process.execPath, ['-c', path.join(root, 'functions/index.js')], { stdio: 'pipe' });
  check('Cloud Functions index syntax', true);
} catch { check('Cloud Functions index syntax', false); }

console.log(`\nPhase 4K-6W secure provisioning: ${passed} assertions passed.`);
if (failures.length) {
  console.error(`Failures (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
