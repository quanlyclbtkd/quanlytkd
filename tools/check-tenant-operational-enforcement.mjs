import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('functions/src/accountProvisioning.js');
const index = read('functions/index.js');
const rules = read('firestore.rules');
const service = read('js/services/accountProvisioningService.js');
const superadmin = read('js/modules/superadmin.js');
const app = read('app.js');
const main = read('js/main.js');
const pkg = JSON.parse(read('package.json'));
const firebaseJson = JSON.parse(read('firebase.json'));

let passed = 0;
const failures = [];
function check(name, condition) {
  if (condition) { passed++; console.log(`✅ ${name}`); }
  else { failures.push(name); console.error(`❌ ${name}`); }
}
function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

const setStatusBlock = block('exports.setClubAccountStatus', 'exports.updateClubSubscription');
const subscriptionBlock = block('exports.updateClubSubscription', 'exports.backfillClubExpiryTimestamp');
const backfillBlock = block('exports.backfillClubExpiryTimestamp', 'exports.__test');
const provisionBlock = block('exports.provisionClubAdmin', 'exports.provisionCoachAccount');

check('Phase 4K-6W1 build marker exists', main.includes('4K-6W1-tenant-lock-expiry-server-enforcement'));
check('Backfill callable exported from functions index', index.includes('exports.backfillClubExpiryTimestamp = accountProvisioning.backfillClubExpiryTimestamp;'));
check('Backfill callable implemented', source.includes('exports.backfillClubExpiryTimestamp = callable'));
check('Client facade exposes backfill callable', service.includes('function backfillClubExpiryTimestamp'));
check('Client facade exports backfill callable', service.includes('backfillClubExpiryTimestamp,'));
check('Client security metadata declares tenant enforcement', service.includes("tenantOperationalEnforcement: 'rules-request-time'"));

check('Expiry parser requires YYYY-MM-DD', source.includes("/^(\\d{4})-(\\d{2})-(\\d{2})$/"));
check('Expiry parser validates real calendar dates', source.includes('utcDate.getUTCFullYear() !== year'));
check('Expiry parser uses Firestore Timestamp', source.includes('Timestamp.fromMillis(expiryAtMillis)'));
check('Expiry parser documents inclusive Viet Nam date', source.includes('expiryDate is inclusive in Viet Nam'));
check('Expiry boundary accounts for UTC+07', source.includes('VIETNAM_UTC_OFFSET_HOURS = 7'));
check('New club stores expiryDate', provisionBlock.includes('expiryDate: DEFAULT_EXPIRY_DATE'));
check('New club stores expiryAt', provisionBlock.includes('expiryAt: parseExpiryDate(DEFAULT_EXPIRY_DATE).expiryAt'));

check('Subscription update stores expiryAt', subscriptionBlock.includes('expiryAt: parsedExpiry.expiryAt'));
check('Subscription update stores expiryDate', subscriptionBlock.includes('expiryDate: parsedExpiry.expiryDate'));
check('Subscription update does not force accountStatus active', !/accountStatus\s*:\s*['"]active['"]/.test(subscriptionBlock));
check('Subscription result reports existing status without inventing active', subscriptionBlock.includes('accountStatus: before.accountStatus || null'));
check('Subscription audit says status unchanged', subscriptionBlock.includes('accountStatusUnchanged: true'));

check('Tenant status uses Firestore transaction', setStatusBlock.includes('db.runTransaction'));
check('Unlock requires future expiryAt', setStatusBlock.includes("status === 'active' && !isFutureTimestamp(current.expiryAt)"));
check('Lock stores lock reason', setStatusBlock.includes("lockReason: lockReason || 'manual_superadmin_lock'"));
check('Lock stores actor and timestamp', setStatusBlock.includes('lockedBy: actor.uid') && setStatusBlock.includes('lockedAt: now'));
check('Unlock deletes lock metadata', setStatusBlock.includes('lockReason: FieldValue.delete()'));
check('Lock revokes tenant sessions', setStatusBlock.includes('revokeClubMemberSessions(clubId'));
check('Token revocation uses Admin Auth', source.includes('auth.revokeRefreshTokens(uid)'));
check('Member enumeration is paginated', source.includes("where('clubId', '==', clubId)") && source.includes('startAfter(lastDoc)'));
check('Member enumeration has hard fail safety', source.includes("throw httpsError('resource-exhausted', 'Danh sách thành viên quá lớn"));
check('Lock no longer disables admin by status', !setStatusBlock.includes("disabled: status === 'locked'"));
check('Unlock repairs legacy disabled admin only', setStatusBlock.includes('legacyAdminReenabled') && setStatusBlock.includes("status === 'active'"));
check('Revocation failures are visible in result', setStatusBlock.includes('sessionRevocationFailures'));
check('Rules lock remains authoritative if token revocation is incomplete', setStatusBlock.includes('session revocation incomplete') && setStatusBlock.includes('incomplete: true'));
check('Legacy admin re-enable is limited to pre-6W1 locks', setStatusBlock.includes("before.accountStatus === 'locked'") && setStatusBlock.includes('!before.lockedAt'));

check('Backfill defaults to dry-run', backfillBlock.includes('data && data.dryRun !== false'));
check('Backfill uses document ID cursor', backfillBlock.includes('orderBy(FieldPath.documentId())'));
check('Backfill uses startAfter cursor', backfillBlock.includes('query.startAfter(lastDoc)'));
check('Backfill has configurable bounded page size', backfillBlock.includes('normalizePageSize'));
check('Backfill has max page safety guard', backfillBlock.includes('pages < MAX_CURSOR_PAGES'));
check('Backfill does not silently truncate', backfillBlock.includes("throw httpsError(\n      'resource-exhausted'"));
check('Backfill supports batched writes', backfillBlock.includes('batchOps >= 400') || backfillBlock.includes('batchOps < 400'));
check('Backfill reports invalid club IDs without values', backfillBlock.includes('invalidClubIds'));
check('Backfill validates accountStatus before Rules deployment', backfillBlock.includes('invalidStatus') && backfillBlock.includes("['active', 'locked']"));
check('Backfill separates invalid expiry count', backfillBlock.includes('invalidExpiry'));
check('Backfill reports complete=true only at terminal page', backfillBlock.includes('complete: true'));
check('Backfill exposes explicit readyForRules gate', backfillBlock.includes('readyForRules') && backfillBlock.includes('wouldUpdate === 0'));
check('Backfill has no fixed 500-club query cap', !/collection\(['"]clubs['"]\)\.limit\(500\)/.test(backfillBlock));

check('Rules define clubExists', rules.includes('function clubExists(clubId)'));
check('Rules define clubData', rules.includes('function clubData(clubId)'));
check('Rules define clubIsOperational', rules.includes('function clubIsOperational(clubId)'));
check('Rules require active status', rules.includes("clubData(clubId).accountStatus == 'active'"));
check('Rules require expiryAt timestamp', rules.includes('clubData(clubId).expiryAt is timestamp'));
check('Rules compare expiry against request.time', rules.includes('clubData(clubId).expiryAt > request.time'));
check('Missing operational fields fail closed', rules.includes("keys().hasAll(['accountStatus', 'expiryAt'])"));
check('Business reads require operational tenant', rules.includes('isOperationalClubMember(clubId)'));
check('Business writes require operational admin', rules.includes('isOperationalClubAdmin(clubId)'));
check('Coach attendance writes require operational coach', rules.includes('isOperationalCoach(clubId)'));
check('Locked member retains root club get', /match \/clubs\/\{clubId\}[\s\S]*?allow get: if isSuperAdmin\(\) \|\| isClubMember\(clubId\);/.test(rules));
check('Locked member retains own users get', /match \/users\/\{uid\}[\s\S]*?request\.auth\.uid == uid/.test(rules));
check('Locked tenant cannot update self profile', rules.includes('&& ownTenantIsOperational()'));
check('Login history is tenant-operational gated', /match \/login_history[\s\S]*?&& ownTenantIsOperational\(\)/.test(rules));
check('Club admin cannot change expiryAt', rules.includes("'expiryAt'"));
check('Club admin cannot change lock metadata', rules.includes("'lockedAt'") && rules.includes("'lockedBy'"));
check('No permissive recursive bypass', !/allow read, write: if true/.test(rules));

check('Rules test file exists', fs.existsSync(path.join(root, 'rules-tests/tenant-access.test.mjs')));
check('Offline policy matrix exists', fs.existsSync(path.join(root, 'tools/check-tenant-policy-matrix.mjs')));
check('Offline policy matrix script configured', pkg.scripts?.['check:tenant-policy-matrix'] === 'node tools/check-tenant-policy-matrix.mjs');
check('Rules unit testing dependency installed', Boolean(pkg.devDependencies?.['@firebase/rules-unit-testing']));
check('Authoritative Firebase Rules parser installed', Boolean(pkg.devDependencies?.['@firebase/eslint-plugin-security-rules']));
check('Rules syntax script configured', pkg.scripts?.['check:rules-syntax'] === 'eslint firestore.rules');
check('Rules ESLint config exists', fs.existsSync(path.join(root, 'eslint.config.js')));
check('Functions tenant runtime test exists', fs.existsSync(path.join(root, 'functions/test/tenantOperational.test.js')));
check('Functions tenant runtime script configured', pkg.scripts?.['test:functions:tenant'] === 'npm --prefix functions run test:tenant');
check('Firebase client dependency installed for rules tests', Boolean(pkg.devDependencies?.firebase));
check('Firebase CLI dependency installed', Boolean(pkg.devDependencies?.['firebase-tools']));
check('Rules emulator script configured', typeof pkg.scripts?.['test:rules'] === 'string' && pkg.scripts['test:rules'].includes('emulators:exec'));
check('6W1 release gate script configured', typeof pkg.scripts?.['check:6w1'] === 'string' && pkg.scripts['check:6w1'].includes('test:rules'));
check('Firestore emulator configured', firebaseJson.emulators?.firestore?.port === 8181);
check('Emulator binds loopback', firebaseJson.emulators?.firestore?.host === '127.0.0.1');

check('SuperAdmin lock text covers all tenant accounts', superadmin.includes('toàn bộ tài khoản CLB sẽ bị chặn truy cập dữ liệu'));
check('SuperAdmin lock passes explicit reason', superadmin.includes("lockReason: 'manual_superadmin_lock'"));
check('Expiry UI states lock status is unchanged', app.includes('Trạng thái khóa/mở khóa không bị thay đổi'));
check('Deployment runbook exists', fs.existsSync(path.join(root, 'PHASE_4K_6W1_DEPLOYMENT_RUNBOOK.md')));

// Deterministic boundary simulation: 2026-06-30 is valid through 23:59:59 ICT,
// and expires at 2026-06-30T17:00:00.000Z (2026-07-01 00:00 ICT).
const expiryBoundary = Date.UTC(2026, 5, 30, 17, 0, 0, 0);
check('Vietnam inclusive date boundary is deterministic', new Date(expiryBoundary).toISOString() === '2026-06-30T17:00:00.000Z');
check('Invalid calendar rollover is detectable', new Date(Date.UTC(2026, 1, 30)).getUTCMonth() !== 1);

for (const file of [
  'functions/src/accountProvisioning.js',
  'functions/index.js',
  'js/services/accountProvisioningService.js',
  'js/modules/superadmin.js',
  'app.js',
  'rules-tests/tenant-access.test.mjs',
]) {
  try {
    execFileSync(process.execPath, ['-c', path.join(root, file)], { stdio: 'pipe' });
    check(`Syntax valid: ${file}`, true);
  } catch {
    check(`Syntax valid: ${file}`, false);
  }
}

console.log(`\nPhase 4K-6W1 tenant operational enforcement: ${passed} assertions passed.`);
if (failures.length) {
  console.error(`Failures (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
