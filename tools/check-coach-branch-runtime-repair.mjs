#!/usr/bin/env node
/** Phase 4K-6V4B1 — Coach Branch Assignment + Runtime Repair */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const main = read('js/main.js');
const rules = read('firestore.rules');
const profiles = read('js/listeners/profiles.listeners.js');
const attendance = read('js/modules/attendance.js');
const branchIdentity = read('js/core/branchIdentity.js');
const repair = read('js/core/coachBranchRuntimeRepair.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4B1 — Coach Branch Runtime Repair ===\n');

check('Production entrypoints keep V4B1 branch repair and load current quit-tab cache marker',
  (index.match(/coach-branch-runtime-repair-20260627-v4b1/g) || []).length >= 5 &&
  index.includes('app.js?v=debt-month-five-vietnamese-word-20260627-v4b9') &&
  index.includes('./js/main.js?v=debt-month-five-vietnamese-word-20260627-v4b9') &&
  main.includes("profiles.listeners.js?v=debt-month-five-vietnamese-word-20260627-v4b9") &&
  main.includes("attendance.js?v=coach-branch-runtime-repair-20260627-v4b1"));
check('Coach creation requires one concrete branch',
  repair.includes("if (!name || !email || !branch || pass.length < 6)") &&
  /id="coach_branch"[\s\S]{0,500}<option value="CS1">/.test(index) &&
  !/id="coach_branch"[\s\S]{0,500}value=""[^>]*>[^<]*Tất cả cơ sở/.test(index));
check('Coach creation mirrors branch into both authorization documents',
  repair.includes('branch, coachBranch:branch') &&
  repair.includes("setDoc(doc(db(), 'users', uid)"));
check('Existing Coach accounts expose an explicit branch repair control',
  repair.includes('async function updateCoachBranch(uid)') &&
  repair.includes('coach_assigned_branch_') &&
  repair.includes('💾 Lưu cơ sở'));
check('Admin branch repair writes coach doc and user mirror atomically',
  repair.includes('const { doc, getDoc, writeBatch } = sdk()') &&
  repair.includes('batch.set(coachRef') &&
  repair.includes("batch.set(doc(db(), 'users', uid)") &&
  repair.includes('await batch.commit()'));
check('Migration never silently defaults a missing Coach branch to CS1',
  repair.includes('if (!branch) { needsAssignment++; continue; }') &&
  repair.includes('Chưa được Admin gán cơ sở'));
check('Migration synchronizes branch and coachBranch on both documents',
  repair.includes('userFix') &&
  repair.includes('coachBranch:branch') &&
  repair.includes('Không đồng bộ được'));

check('Coach cache is not mounted before exact assignment verification',
  app.includes("if (_cached && _cached.role !== 'coach')") &&
  app.includes('Coach phải xác minh exact Admin assignment trước khi mount listener'));
check('Runtime reads only the exact Admin Coach assignment document',
  repair.includes("getDoc(doc(firestore, 'clubs', result.clubId, 'coaches', result.uid))") &&
  !app.includes('auth fallback clubs scan'));
check('Runtime repairs users/{uid} only from Admin assignment data',
  repair.includes('const assignedBranch = canonical(assigned.branch || assigned.coachBranch') &&
  repair.includes("await setDoc(doc(firestore, 'users', result.uid)") &&
  repair.includes('auth/coach-branch-mirror-sync-failed'));
check('Missing/invalid Coach branch remains fail-closed',
  app.includes("fresh.role === 'coach' && !fresh.coachBranch") &&
  profiles.includes('Coach missing branch — fail closed, no profiles query'));
check('No full-club profile fallback is introduced for Coach repair',
  profiles.includes("loadCoachBranchProfilesFallback('redirected-from-full:") &&
  profiles.includes("fbWhere('branch', '==', alias)") &&
  /không quét clubs/i.test(app));

check('Profile listener query is server-scoped to assigned branch',
  profiles.includes("fbQuery(profRef, statusConstraint, fbWhere('branch', '==', coachBranch))") &&
  profiles.includes("':coach:' + coachBranch"));
check('Primary branch keeps scoped legacy Mặc định compatibility',
  profiles.includes("coachBranch === 'CS1'") &&
  profiles.includes("fbWhere('branch', '==', 'Mặc định')"));
check('Attendance client filtering uses canonical branch equality',
  attendance.includes('function _sameBranch(left, right)') &&
  attendance.includes("_sameBranch(p.branch, selBranch)") &&
  attendance.includes("_sameBranch(s.branch, coachBr)"));
check('Coach daily and monthly services always receive assigned branch',
  attendance.includes("window.userRole === 'coach' && window.coachBranch") &&
  attendance.includes('branch: _dailyBranch') &&
  attendance.includes("branch: selBranch === 'all' ? '' : selBranch"));
check('Attendance branch selectors are locked by app config for Coach',
  app.includes("['att_branch', 'att_month_branch']") &&
  app.includes('selEl.disabled = true') &&
  app.includes("selEl.value    = window.coachBranch"));

check('Rules let Coach read only their own Admin assignment mirror',
  rules.includes('request.auth.uid == coachUid') &&
  rules.includes("resource.data.get('clubId', '') == clubId"));
check('Rules permit self mirror repair only when exact Admin assignment matches',
  rules.includes('function selfCoachMirrorMatches(uid, data)') &&
  rules.includes('safeSelfCoachMirrorCreate(uid)') &&
  rules.includes('safeSelfCoachMirrorUpdate(uid)') &&
  rules.includes('assignedBranch(get(/databases/$(database)/documents/clubs/$(clubId)/coaches/$(uid)).data) == assignedBranch(data)'));
check('Rules still block arbitrary self role, tenant or branch selection',
  rules.includes("request.resource.data.get('role', '') == resource.data.get('role', '')") &&
  rules.includes("request.resource.data.get('clubId', '') == resource.data.get('clubId', '')") &&
  rules.includes("affectedKeys().hasOnly([\n          'branch', 'coachBranch', 'email', 'updatedAt'"));

// Dynamic exact-assignment repair contract.
{
  const writes = [], reads = [];
  const context = { window: { __appLoaded: true }, console, String, Object, Array, Set, Date, Error, Promise, alert(){}, document:{ getElementById(){ return null; } }, setTimeout(){} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(branchIdentity, context, { filename: 'branchIdentity.js' });
  context.window._fb_init = {
    doc(_db, ...parts) { return parts.join('/'); },
    async getDoc(ref) { reads.push(ref); return { exists(){ return true; }, data(){ return { role:'coach', clubId:'club-a', branch:'CS2', email:'coach@example.com' }; } }; },
    async setDoc(ref, data, options) { writes.push({ ref, data, options }); }
  };
  vm.runInContext(repair, context, { filename: 'coachBranchRuntimeRepair.js' });
  const result = await context.window.CoachBranchRuntimeRepair.resolveAuthContext({
    user:{ uid:'coach-1', email:'coach@example.com' }, context:{ role:'coach', clubId:'club-a', branch:'' }, db:{}
  });
  check('Dynamic: missing mirror branch is resolved from one exact Coach assignment read',
    reads.length === 1 && reads[0] === 'clubs/club-a/coaches/coach-1' && result.coachBranch === 'CS2');
  check('Dynamic: repair writes only the current users/{uid} authorization mirror',
    writes.length === 1 && writes[0].ref === 'users/coach-1' && writes[0].data.branch === 'CS2' && writes[0].data.coachBranch === 'CS2');
}

// Dynamic branch identity contract.
{
  const context = { window: {}, console, String, Object, Array, Set };
  vm.createContext(context);
  vm.runInContext(branchIdentity, context, { filename: 'branchIdentity.js' });
  const api = context.window.BranchIdentity;
  check('Dynamic: legacy primary values normalize to CS1',
    api.normalize('Mặc định', { fallback: '' }) === 'CS1' &&
    api.normalize('CS01', { fallback: '' }) === 'CS1');
  check('Dynamic: empty authorization branch stays invalid',
    api.normalize('', { fallback: '' }) === '');
  check('Dynamic: CS1 and Mặc định compare as the same branch',
    api.isSameBranch('CS1', 'Mặc định') === true &&
    api.isSameBranch('CS1', 'CS2') === false);
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B1 coach branch runtime repair checks passed.\n');
