#!/usr/bin/env node
/** Phase 4K-6V4B — Security-Enforced Coach Boundary + Canonical Branch Identity */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const rules = read('firestore.rules');
const branchIdentity = read('js/core/branchIdentity.js');
const roleBoundary = read('js/core/roleReadBoundary.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendance = read('js/services/attendance.service.js');
const students = read('js/modules/students.js');
const authz = read('functions/src/authz.js');
const debtFn = read('functions/src/debtCalculation.js');
const statsFn = read('functions/src/statsAggregation.js');
const summaryFn = read('functions/src/superAdminSummary.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4B — Security + Branch Boundary ===\n');

const branchPos = index.lastIndexOf('./js/core/branchIdentity.js?v=');
const rolePos = index.lastIndexOf('./js/core/roleReadBoundary.js?v=');
const appPos = index.lastIndexOf('app.js?v=');
check('Canonical branch identity loads before role boundary and app kernel',
  branchPos >= 0 && rolePos > branchPos && appPos > rolePos);
check('All 6V4B runtime entry assets share one cache-bust marker',
  ((index.match(/coach-attendance-fallback-stability-20260630-v4d7/g) || []).length >= 5 || (index.match(/coach-branch-runtime-repair-20260627-v4b1/g) || []).length >= 5));
check('Coach account selector has no unrestricted/all-branch option',
  /id="coach_branch"[\s\S]{0,600}<option value="CS1">/.test(index) &&
  !/id="coach_branch"[\s\S]{0,600}Tất cả cơ sở \(không giới hạn\)/.test(index));

check('Auth cache is versioned and treated as a hint',
  app.includes("const _AUTH_CACHE_KEY = '_qlclb_auth_v3'") &&
  app.includes('cache chỉ là bootstrap hint, không phải nguồn cấp quyền'));
check('Verified auth changes trigger listener cleanup and atomic runtime rebind',
  app.includes('_rebindVerifiedAuthContext') &&
  app.includes("cleanupAllListeners?.('auth-context-rebind')") &&
  app.includes("resetProfilesListeners?.('auth-context-rebind')") &&
  app.includes('window.location.reload()'));
check('Missing users authorization doc fails closed without full-club scan',
  /fail closed/i.test(app) && /không quét clubs/i.test(app) && !app.includes('auth fallback clubs scan'));
check('Coach login requires a canonical assigned branch',
  app.includes("fresh.role === 'coach' && !fresh.coachBranch") &&
  app.includes('Tài khoản HLV chưa được gán cơ sở'));
check('Parent portal never recommends public Firestore reads',
  app.includes('Không được dùng <code>allow read: if true</code>') &&
  !app.includes('thêm quyền đọc cho bộ sưu tập "clubs", "profiles", "settings"'));

check('New single-branch student writes use CS1 rather than legacy Mặc định',
  app.includes("isSingleBranch ? 'CS1'") && students.includes("isSingleBranch ? 'CS1'") &&
  !/branch\s*:\s*['"]Mặc định['"]/.test(app + '\n' + students));
check('Coach CS1 profile listener reads legacy Mặc định in a separate scoped listener',
  profiles.includes("coachBranch === 'CS1'") &&
  profiles.includes("fbWhere('branch', '==', 'Mặc định')") &&
  profiles.includes('coachLegacyActiveMap'));
check('Coach fallback queries only assigned branch aliases and de-duplicates results',
  profiles.includes('_coachBranchAliases(ctx)') &&
  profiles.includes("fbWhere('branch', '==', alias)") &&
  profiles.includes('snapshots.forEach'));
check('Attendance reads are branch-scoped and missing Coach branch fails closed',
  attendance.includes('_branchConstraint(where, branch, isCoach)') &&
  attendance.includes('attendance/coach-branch-required'));
check('Attendance writes canonicalize branch at one service boundary',
  attendance.includes('function _prepareWriteData') &&
  attendance.includes("return { ...source, branch: canonical }") &&
  (attendance.match(/_prepareWriteData\(/g) || []).length >= 4);

check('Rules identify the 6V4B security phase', rules.includes('Phase 4K-6V4B'));
check('Rules require an enabled user authorization document',
  rules.includes('function userEnabled()') && rules.includes("['disabled', 'locked', 'suspended']"));
const selfFieldFn = (rules.match(/function safeSelfUserFieldsOnly\(\) \{([\s\S]*?)\n    \}/) || [,''])[1];
check('Self user updates use a strict safe-field diff whitelist',
  selfFieldFn.includes('affectedKeys().hasOnly') &&
  !['role','clubId','branch','coachBranch','status','isSuperAdmin'].some(field => selfFieldFn.includes(`'${field}'`)));
check('User cannot self-update role, clubId, branch or status',
  rules.includes('request.auth.uid == uid') && rules.includes('safeSelfUserFieldsOnly()') &&
  rules.includes('safeSelfCoachMirrorUpdate(uid)') && !rules.includes('request.auth.uid == uid || isSuperAdmin'));
check('Club Admin may provision/repair only same-tenant Coach users with a valid branch',
  rules.includes("data.get('role', '') == 'coach'") &&
  rules.includes("data.get('clubId', '') == myClubId()") &&
  rules.includes('function targetIsValidCoachInMyClub(data)') &&
  rules.includes('isAllowedCoachBranch(assignedBranch(data))'));
check('Coach profile reads are enforced by Firestore branch authorization',
  /match \/profiles\/\{profileId\}[\s\S]{0,350}isCoach\(clubId\)[\s\S]{0,120}resourceBranchMatchesCoach/.test(rules));
check('Coach attendance create/update/delete are branch-scoped in Rules',
  /match \/attendance\/\{attendanceId\}[\s\S]{0,900}requestBranchMatchesCoach/.test(rules) &&
  /resourceBranchMatchesCoach\(\)[\s\S]{0,150}requestBranchMatchesCoach\(\)/.test(rules));
check('Coach notes and notifications are restricted to own coachId',
  rules.includes('coachOwnsResource()') && rules.includes('coachOwnsRequest()') &&
  /match \/attendanceNotes\//.test(rules) && /match \/adminNotifications\//.test(rules));
check('Coach cannot read transactions, inventory or stats',
  /match \/transactions\/[\s\S]{0,220}isAdminOrViewer/.test(rules) &&
  /match \/inventory\/[\s\S]{0,220}isAdminOrViewer/.test(rules) &&
  /match \/stats\/[\s\S]{0,220}isAdminOrViewer/.test(rules));
check('Unknown tenant subcollections are deny-by-default',
  /match \/\{subcollection\}\/\{documentId\}[\s\S]{0,120}allow read, write: if false/.test(rules));
check('Coach settings access is limited to main_config and shifts compatibility docs',
  rules.includes("settingId in ['main_config', 'shifts']"));
check('CS1 and Mặc định compatibility exists only as an explicit primary alias',
  rules.includes("branchValue in ['CS1', 'Mặc định']") &&
  branchIdentity.includes("code === 'CS1' ? ['CS1', 'Mặc định']"));

check('Callable authorization uses Firestore role/tenant data, not email allowlists',
  authz.includes("['admin', 'owner'].includes(userRole)") &&
  !authz.includes('admin@tstquynhon.com'));
check('Debt recalculation callable is Admin-only',
  debtFn.includes('await requireClubAdmin({ db, functions, context, clubId })'));
check('Stats rebuild callable is Admin-only',
  statsFn.includes('await requireClubAdmin({ db, functions, context, clubId })'));
check('Summary refresh callable is Admin-only',
  summaryFn.includes('await requireClubAdmin({ db, functions, context, clubId })'));
check('No callable keeps the legacy hard-coded superadmin email check',
  ![debtFn, statsFn, summaryFn].some(src => src.includes('admin@tstquynhon.com')));

// Dynamic canonical branch contract.
{
  const context = { window: {}, console, String, Object, Array, Set };
  vm.createContext(context);
  vm.runInContext(branchIdentity, context, { filename: 'branchIdentity.js' });
  const api = context.window.BranchIdentity;
  check('Dynamic: Mặc định/CS01/Cơ sở 2 normalize to canonical codes',
    api.normalize('Mặc định', { fallback: '' }) === 'CS1' &&
    api.normalize('CS01', { fallback: '' }) === 'CS1' &&
    api.normalize('Cơ sở 2', { fallback: '' }) === 'CS2');
  check('Dynamic: empty branch remains invalid when fallback is empty',
    api.normalize('', { fallback: '' }) === '');
  check('Dynamic: primary branch aliases are exactly CS1 and Mặc định',
    JSON.stringify(Array.from(api.aliases('CS1'))) === JSON.stringify(['CS1', 'Mặc định']));
}

// Dynamic role boundary contract with canonical branch identity loaded.
{
  const context = { window: {}, Date, String, Object, Array, Set, console: { info(){}, log(){}, group(){}, groupEnd(){}, table(){} } };
  context.window.console = context.console;
  vm.createContext(context);
  vm.runInContext(branchIdentity, context, { filename: 'branchIdentity.js' });
  vm.runInContext(roleBoundary, context, { filename: 'roleReadBoundary.js' });
  const api = context.window.RoleReadBoundary;
  api.setContext({ role: 'coach', coachBranch: 'Mặc định', clubId: 'club-a' });
  check('Dynamic: legacy Coach branch becomes CS1 before authorization',
    api.readContext().coachBranch === 'CS1' && api.canMount('profiles.active') === true);
  api.setContext({ role: 'coach', coachBranch: '', clubId: 'club-a' });
  check('Dynamic: missing Coach branch blocks active profiles', api.canMount('profiles.active') === false);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B security/branch checks passed.\n');
