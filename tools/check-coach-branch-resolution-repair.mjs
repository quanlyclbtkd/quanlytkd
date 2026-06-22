#!/usr/bin/env node
/** Phase 4K-6V4C2A — Coach Branch Resolution + Legacy Account Repair */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const resolverSource = read('js/core/coachBranchResolver.js');
const profiles = read('js/listeners/profiles.listeners.js');
const main = read('js/main.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4C2A — Coach Branch Resolution + Legacy Repair ===\n');

check('Coach branch resolver loads before role boundary and app.js',
  index.includes('coachBranchResolver.js?v=coach-branch-resolution-20260622-v4c2a') &&
  index.indexOf('coachBranchResolver.js') < index.indexOf('roleReadBoundary.js') &&
  index.indexOf('coachBranchResolver.js') < index.indexOf('app.js?v=coach-branch-resolution-20260622-v4c2a'));
check('main.js and profiles listener use the V4C2A cache key',
  index.includes("./js/main.js?v=coach-branch-resolution-20260622-v4c2a") &&
  main.includes("profiles.listeners.js?v=coach-branch-resolution-20260622-v4c2a"));
check('Coach creation requires a canonical branch and writes branchScope',
  app.includes("if (!branch) return alert('Vui lòng chọn cơ sở phụ trách cho HLV!')") &&
  app.includes("branchScope = branch === 'all' ? 'all' : 'specific'") &&
  app.includes('branchScope,'));
check('Admin can repair branch assignment for existing Coach accounts',
  app.includes('window.saveCoachBranchAssignment = async') &&
  app.includes('coach_branch_edit_') &&
  app.includes('💾 Lưu cơ sở') &&
  app.includes('HLV cần đăng nhập lại'));
check('Missing branch is visible and actionable instead of silently showing all branches',
  app.includes('Chưa gán cơ sở — HLV sẽ không tải được võ sinh') &&
  app.includes('window.showCoachBranchAssignmentError'));
check('Legacy migration recovers users branch, infers the only branch and leaves unsafe multi-branch accounts unresolved',
  app.includes("const legacyUserSnap = await getDoc(doc(db, 'users', uid))") &&
  app.includes("if (!branch && singleBranch) branch = resolver.SINGLE_DEFAULT") &&
  app.includes('let unresolved = 0') &&
  app.includes('Các HLV chưa gán cơ sở vẫn bị khóa'));
check('Coach auth cache never fast-boots without branch validation',
  app.includes("if (_cached && _cached.role !== 'coach')") &&
  app.includes('Coach cache detected — validating branch before bootstrap'));
check('Coach login reads authoritative coaches/{uid} and blocks missing branch before app bootstrap',
  app.includes("doc(db, 'clubs', clubId, 'coaches', uid)") &&
  app.includes('await _resolveCoachBranchForLogin') &&
  app.includes('await _showLoginError(_coachBranchMissingMessage())'));
check('Coach branch resolution diagnostics are available after login',
  app.includes('window.printCoachBranchResolution = function') && app.includes('window.__coachBranchResolution?.source'));
check('Single-branch login inference uses the legacy Mặc định storage value',
  app.includes("source = 'single-branch-inference'") &&
  app.includes('resolver.storageValueForIndex(1, config)'));
check('Profiles listener supports explicit all scope and merges every assigned-branch alias',
  profiles.includes('const coachAllBranches = isCoach && _coachAllBranches(context)') &&
  profiles.includes('CoachBranchResolver?.queryValues?.(coachBranch, config)') &&
  profiles.includes('mapsByQuery.forEach(map => Object.assign(activeMap, map))') &&
  profiles.includes("active-status-all-branches-query"));
check('Specific-branch fallback only queries canonical aliases of the assigned branch',
  profiles.includes('CoachBranchResolver?.queryValues?.(branch, config)') &&
  profiles.includes("fbQuery(ctx.profRef, fbWhere('branch', '==', alias))") &&
  profiles.includes("scope: allBranches ? 'all-explicit' : 'specific-aliases'"));
check('Missing branch remains fail-closed and raises a visible repair message',
  profiles.includes('Coach missing branch — fail closed, no profiles query') &&
  profiles.includes('window.showCoachBranchAssignmentError'));

// Dynamic resolver contract.
{
  const context = { window: {}, console, String, Number, Object, Array, Math, Set };
  vm.createContext(context);
  vm.runInContext(resolverSource, context, { filename: 'coachBranchResolver.js' });
  const api = context.window.CoachBranchResolver;
  const one = { branchCount: 1, branchName1: 'Cơ sở Nguyễn Trãi' };
  const two = { branchCount: 2, branchName1: 'Cơ sở Nguyễn Trãi', branchName2: 'Cơ sở Tùng Bách' };
  check('Dynamic: single-branch CS1 maps to Mặc định', api.normalize('CS1', one) === 'Mặc định');
  check('Dynamic: single-branch display name maps to Mặc định', api.normalize('Cơ sở Nguyễn Trãi', one) === 'Mặc định');
  check('Dynamic: multi-branch display name maps to CS2', api.normalize('Cơ sở Tùng Bách', two) === 'CS2');
  check('Dynamic: branch count can be inferred from legacy branchName fields', api.branchCount({ branchName1: 'A', branchName2: 'B' }) === 2);
  check('Dynamic: alternate legacy field assignedBranch is resolved', api.normalize({ assignedBranch: 'CS2' }, two) === 'CS2');
  check('Dynamic: explicit all branches remains explicit all', api.normalize('Tất cả cơ sở', two) === 'all' && api.isAll('all', two));
  check('Dynamic: blank branch remains missing', api.normalize('', two) === '' && api.isMissing('', two));
  check('Dynamic: display value Mặc định uses branchName1', api.display('Mặc định', one) === 'Cơ sở Nguyễn Trãi');
  check('Dynamic: single-branch query aliases cover Mặc định, CS1 and display label',
    ['Mặc định','CS1','Cơ sở Nguyễn Trãi'].every(value => api.queryValues('CS1', one).includes(value)));
  check('Dynamic: multi-branch query aliases stay inside the selected branch',
    api.queryValues('CS2', two).includes('CS2') && api.queryValues('CS2', two).includes('Cơ sở Tùng Bách') && !api.queryValues('CS2', two).includes('CS1'));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4C2A checks passed.\n');
