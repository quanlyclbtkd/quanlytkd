#!/usr/bin/env node
/** Phase 4K-6V4D8 — Coach Attendance Auth + Roster Final Recovery */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  branchIdentity: read('js/core/branchIdentity.js'),
  coachRepair: read('js/core/coachBranchRuntimeRepair.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  attendance: read('js/modules/attendance.js'),
  rules: read('firestore.rules'),
  publicBranchIdentity: read('public/js/core/branchIdentity.js'),
  publicCoachRepair: read('public/js/core/coachBranchRuntimeRepair.js'),
  publicProfiles: read('public/js/listeners/profiles.listeners.js'),
};
let pass = 0, fail = 0;
function check(name, ok, detail='') { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); } }
console.log('\n=== Phase 4K-6V4D8 — Coach Attendance Auth + Roster Final Recovery ===\n');
const build = 'canonical-profile-status-branch-boundary-20260701-v5';
check('Entrypoints use V4D8 cache bust', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`));
check('Main imports attendance/profiles/students/render with V4D8 cache bust',
  ['profiles.listeners.js','modules/attendance.js','modules/students.js','ui/render.js','ui/render/renderStudents.js'].every(x => files.main.includes(`${x}?v=${build}`)));
check('BranchIdentity upgrades stale V4D4 runtime and exposes V4D8 seedConfig',
  files.branchIdentity.includes("const VERSION = '4K-6V4D8'") && files.branchIdentity.includes('seedConfig') && !files.branchIdentity.includes("version === '4K-6V4D4'"));
check('Coach repair reads settings/main_config to map display-name assignments',
  files.coachRepair.includes("'settings', 'main_config'") && files.coachRepair.includes('codeFromConfig') && files.coachRepair.includes('assignedRaw'));
check('Coach repair writes users mirror with canonical assignedBranch',
  files.coachRepair.includes('branch: assignedBranch, coachBranch: assignedBranch') && files.coachRepair.includes('auth/coach-branch-mirror-sync-failed'));
check('Profile listener can recover context from window.__store/global runtime',
  files.profiles.includes('function _effectiveContext') && files.profiles.includes('window.profRef') && files.profiles.includes('contextOverride'));
check('Coach fallback accepts late context and merges existing active roster',
  files.profiles.includes('loadCoachBranchProfilesFallback(reason, contextOverride)') && files.profiles.includes('mergedActive = Object.assign({}, existing, activeMap)'));
check('Coach branch query fields cover extended legacy branch fields',
  ['branchId','branchLabel','clubBranch','studentBranch','trainingBranch','classBranch','campus','campusName','site','trainingBase','trainingLocation','co_so','coSoTap','noiTap','diaDiemTap'].every(x => files.profiles.includes(`'${x}'`)));
check('Attendance filter accepts extended legacy branch fields',
  ['branchId','branchLabel','clubBranch','studentBranch','trainingBranch','classBranch','campus','campusName','site','trainingBase','trainingLocation','co_so','coSoTap','noiTap','diaDiemTap'].every(x => files.attendance.includes(`x.${x}`)));
check('Main retries coach roster after attendance renderer is initialized',
  files.main.includes('post-attendance roster recovery') && files.main.includes('ensureCoachBranchProfilesReady(reason, ctx)') && files.main.includes('renderAttendanceList'));
check('Rules allow bootstrap settings read from own coach assignment doc',
  files.rules.includes('function hasCoachAssignmentDoc(clubId)') && files.rules.includes('hasCoachAssignmentDoc(clubId)) && settingId'));
check('Rules allow self-repair when coach assignment stores branch display name',
  files.rules.includes('function branchValueMatchesCode') && files.rules.includes('branchNameMatchesCode') && files.rules.includes('branchValueMatchesCode(clubId,\n             assignedBranch'));
check('Rules keep profile reads branch-scoped across legacy branch fields',
  ['branchCode','branchName','coSo','branchId','campus','trainingLocation','diaDiemTap'].every(x => files.rules.includes(`resource.data.${x}`)));
check('Public mirror is synced for deploy builds',
  files.publicBranchIdentity.includes('4K-6V4D8') && files.publicCoachRepair.includes('4K-6V4D8') && files.publicProfiles.includes('function _effectiveContext'));

// Dynamic: stale V4D4 BranchIdentity is replaced and display names map to canonical code.
{
  const context = { window: { BranchIdentity: { version:'4K-6V4D4', normalize(){ return ''; } }, __store:{ clubConfig:{ branchName2:'Nguyễn Trãi' } } }, console, String, Object, Array, Set };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(files.branchIdentity, context, { filename:'branchIdentity.js' });
  const api = context.window.BranchIdentity;
  check('Dynamic: BranchIdentity replaces stale V4D4 object', api.version === '4K-6V4D8');
  check('Dynamic: configured display branch maps to CS2', api.normalize('Nguyễn Trãi', { fallback:'' }) === 'CS2' && api.isSameBranch('Nguyễn Trãi', 'CS2'));
}

// Dynamic: Coach repair maps display-name assignment to CS2 after reading settings.
{
  const reads = [], writes = [];
  const context = { window:{}, console, String, Object, Array, Set, Date, Error, Promise, alert(){}, document:{ getElementById(){ return null; } }, setTimeout(){} };
  context.window.window = context.window;
  context.window._fb_init = {
    doc(_db, ...parts) { return parts.join('/'); },
    async getDoc(ref) {
      reads.push(ref);
      if (ref === 'clubs/club-a/coaches/coach-1') return { exists(){ return true; }, data(){ return { role:'coach', clubId:'club-a', branch:'Nguyễn Trãi', email:'coach@example.com' }; } };
      if (ref === 'clubs/club-a/settings/main_config') return { exists(){ return true; }, data(){ return { branchName2:'Nguyễn Trãi' }; } };
      return { exists(){ return false; }, data(){ return {}; } };
    },
    async setDoc(ref, data, options) { writes.push({ ref, data, options }); }
  };
  vm.createContext(context);
  vm.runInContext(files.branchIdentity, context, { filename:'branchIdentity.js' });
  vm.runInContext(files.coachRepair, context, { filename:'coachBranchRuntimeRepair.js' });
  const result = await context.window.CoachBranchRuntimeRepair.resolveAuthContext({ user:{ uid:'coach-1', email:'coach@example.com' }, context:{ role:'coach', clubId:'club-a', branch:'' }, db:{} });
  check('Dynamic: Coach display-name assignment self-repairs to canonical CS2', result.coachBranch === 'CS2' && writes.length === 1 && writes[0].data.branch === 'CS2' && writes[0].data.coachBranch === 'CS2');
  check('Dynamic: Coach repair reads only assignment + main_config', reads.length === 2 && reads.includes('clubs/club-a/coaches/coach-1') && reads.includes('clubs/club-a/settings/main_config'));
}

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D8 coach attendance auth/roster checks passed.\n');
