#!/usr/bin/env node
/** Phase 4K-6V4C1A — Coach Branch Resolution + Attendance Recovery */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const resolverSource = read('js/core/coachBranchResolver.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendanceService = read('js/services/attendance.service.js');
const attendanceModule = read('js/modules/attendance.js');
const main = read('js/main.js');
const students = read('js/modules/students.js');
const finance = read('js/modules/finance.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}
function same(a,b){ return JSON.stringify(a) === JSON.stringify(b); }

console.log('\n=== Phase 4K-6V4C1A — Coach Branch Resolution + Attendance Recovery ===\n');

const build = 'coach-branch-recovery-20260622-v4c1a';
check('Resolver loads before app.js and main.js uses current build key',
  index.includes(`./js/core/coachBranchResolver.js?v=${build}`) &&
  index.indexOf('coachBranchResolver.js') < index.indexOf(`app.js?v=${build}`) &&
  index.includes(`./js/main.js?v=${build}`));
check('Auth cache version was bumped so blank legacy branch is not trusted for seven days',
  app.includes("const _AUTH_CACHE_KEY = '_qlclb_auth_v3'"));
check('Coach auth resolves branch before initSaaSDatabase in cache, users and fallback paths',
  app.indexOf("await _resolveCoachBranchForAuth({\n                            user, clubId: currentClubId") < app.indexOf('initSaaSDatabase(currentClubId)', app.indexOf('const _cached')) &&
  app.indexOf('const _coachResolution = await _resolveCoachBranchForAuth({', app.indexOf('if (userDocSnap && userDocSnap.exists())')) < app.indexOf('initSaaSDatabase(currentClubId)', app.indexOf('if (userDocSnap && userDocSnap.exists())')) &&
  app.includes("coachData: _coachData"));
check('Authoritative coaches fields are checked before users/cache fields',
  app.indexOf("source: 'coaches.branch'") < app.indexOf("source: 'users.branch'") &&
  app.indexOf("source: 'users.branch'") < app.indexOf("source: 'auth-cache'"));
check('Resolved coach branch repairs users/{uid} best-effort without blocking login',
  app.includes('[CoachBranch] Không thể tự sửa users/{uid}') &&
  app.includes("role: 'coach', clubId, branch: resolution.branch"));
check('Unresolved Coach remains fail-closed and receives actionable UI instead of all branches',
  app.includes('⚠️ Tài khoản chưa được gán cơ sở') &&
  app.includes('⚠️ Chưa được gán cơ sở') &&
  profiles.includes('Coach missing branch — fail closed, no profiles query'));
check('Coach creation requires one concrete branch and writes all canonical branch fields',
  app.includes('Không thể tạo HLV ở chế độ “Tất cả cơ sở”') &&
  app.includes('branch: branch,') && app.includes('coachBranch: branch') && app.includes('assignedBranch: branch'));
check('Admin has an explicit per-coach branch repair action',
  app.includes('window.updateCoachBranch = async') &&
  app.includes('💾 Lưu cơ sở') &&
  app.includes("doc(db, 'clubs', currentClubId, 'coaches', uid)"));
check('Legacy migration reports unresolved multi-branch accounts instead of silently widening access',
  app.includes('Chưa gán được cơ sở') &&
  app.includes('Admin cần chọn cơ sở thủ công cho') &&
  app.includes('unresolvedNames'));
check('Single-branch new writes use CS1 rather than legacy Mặc định',
  !app.includes("isSingleBranch ? 'Mặc định'") &&
  !students.includes("isSingleBranch ? 'Mặc định'") &&
  !finance.includes("isSingleBranch ? 'Mặc định'"));
check('Profile listener receives resolver scope metadata from both bootstrap paths',
  app.includes('coachSingleBranch: window.CoachBranchResolver?.isSingleBranchScope?.()') &&
  app.includes('coachBranchAliases: window.CoachBranchResolver?.diagnostics?.().aliases') &&
  main.includes('coachBranchAliases: window.CoachBranchResolver?.diagnostics?.().aliases'));
check('Multi-branch Coach profiles are server-scoped by branch aliases and status classified locally',
  profiles.includes("fbWhere('branch', 'in', aliases)") &&
  profiles.includes('classifyProfileStatus(data)') &&
  profiles.includes('active-branch-alias-query'));
check('Single-branch Coach uses status-only query to recover legacy Mặc định/CS1 profiles safely',
  profiles.includes('A one-branch club may contain legacy branch values') &&
  profiles.includes('active-status-single-branch-query'));
check('Coach fallback cannot widen a multi-branch account to full-club profiles',
  profiles.includes("loadCoachBranchProfilesFallback('redirected-from-full:") &&
  profiles.includes("fbWhere('branch', 'in', aliases)") &&
  profiles.includes('coachSingleBranch'));
check('Zero probe follows the same single/multi branch scope',
  profiles.includes('if (!isCoach || coachSingleBranch)') &&
  profiles.includes("fbWhere('branch', 'in', aliases)"));
check('Attendance daily/monthly/history/notes fail closed when branch is unresolved',
  (attendanceService.match(/attendance\/coach-branch-required/g) || []).length >= 4);
check('Attendance omits branch filter only for resolved single-branch scope',
  attendanceService.includes("shouldFilterBranch: !!branch && branch !== 'all' && !(isCoach && resolution.resolved && resolution.singleBranch)") &&
  attendanceService.includes('if (scope.shouldFilterBranch)'));
check('Attendance UI local filtering uses canonical resolver matching',
  attendanceModule.includes('CoachBranchResolver?.matchesBranch') &&
  attendanceModule.includes('_branchMatches'));

function resolverRuntime() {
  const context = {
    window: { console: { log(){}, info(){}, warn(){}, error(){}, table(){} }, __store:{}, RoleReadBoundary:{ setContext(v){ this.last=v; } } },
    console: { log(){}, info(){}, warn(){}, error(){}, table(){} },
    Date, String, Number, Object, Array, Set, Math, JSON
  };
  vm.createContext(context);
  vm.runInContext(resolverSource, context, {filename:'coachBranchResolver.js'});
  return context.window.CoachBranchResolver;
}

{
  const api = resolverRuntime();
  const multi = { branchCount: 3, branchName1:'Nguyễn Trãi', branchName2:'Tùng Bách', branchName3:'Hồng Bàng' };
  check('Dynamic: blank multi-branch assignment stays unresolved',
    api.resolve({config:multi,candidates:[{source:'coaches.branch',value:''}]}).resolved === false);
  const one = api.resolve({config:{branchCount:1,branchName1:'Tùng Bách'},candidates:[{source:'coaches.branch',value:''}]});
  check('Dynamic: blank single-branch assignment safely auto-recovers to CS1', one.resolved && one.branch === 'CS1' && one.singleBranch);
  check('Dynamic: legacy Mặc định maps to CS1 in one-branch club', api.normalize('Mặc định',{branchCount:1}) === 'CS1');
  check('Dynamic: configured branch name maps to canonical code', api.normalize('Tùng Bách',multi) === 'CS2');
  check('Dynamic: Cơ sở 3 and cs 03 map to CS3', api.normalize('Cơ sở 3',multi) === 'CS3' && api.normalize('cs 03',multi) === 'CS3');
  const conflict = api.resolve({config:multi,candidates:[
    {source:'coaches.branch',value:'CS2'}, {source:'users.branch',value:'CS1'}
  ]});
  check('Dynamic: authoritative coaches branch wins and conflict is exposed', conflict.branch === 'CS2' && conflict.conflict === true);
  const aliases = api.aliasesFor('CS1',{branchCount:1,branchName1:'Tùng Bách'});
  check('Dynamic: single-branch aliases include CS1, configured name and Mặc định',
    aliases.includes('CS1') && aliases.includes('Tùng Bách') && aliases.includes('Mặc định'));
  api.apply(one);
  check('Dynamic: apply publishes canonical branch and single-branch diagnostics',
    api.diagnostics().branch === 'CS1' && api.isSingleBranchScope() === true && api.matchesBranch('Mặc định') === true);
}

async function attendanceRuntime({branch='CS2', singleBranch=false}={}) {
  const calls=[];
  const fakeSnap = { size:0, empty:true, docs:[], forEach(){}, docChanges(){return[]} };
  const context = {
    window: {
      userRole:'coach', coachBranch:branch,
      __store:{db:{},clubId:'club-x'}, __scaleConfig:{},
      CoachBranchResolver:{ diagnostics(){return {resolved:!!branch,branch,singleBranch};} },
      RoleReadBoundary:{ isCoachAttendanceOnly(){return true}, canMount(){return true} },
      _fb_init:{
        collection(...parts){return {kind:'collection',parts}},
        where(field,op,value){return {kind:'where',field,op,value}},
        limit(value){return {kind:'limit',value}},
        startAfter(value){return {kind:'startAfter',value}},
        query(ref,...constraints){return {ref,constraints}},
        async getDocs(q){calls.push(q); return fakeSnap},
      }
    }, console, Date, String, Number, Object, Array, Math, Error, Promise
  };
  vm.createContext(context);
  vm.runInContext(attendanceService.replace('export const AttendanceService =','window.AttendanceService ='), context, {filename:'attendance.service.js'});
  return {api:context.window.AttendanceService,calls,context};
}

{
  const {api,calls} = await attendanceRuntime({branch:'CS2',singleBranch:false});
  await api.loadByDate('2026-06-22',{shiftId:'ca-1'});
  const wheres = calls[0].constraints.filter(x=>x.kind==='where');
  check('Dynamic: multi-branch Coach daily query contains date + canonical branch + shift',
    wheres.some(x=>x.field==='date'&&x.value==='2026-06-22') &&
    wheres.some(x=>x.field==='branch'&&x.value==='CS2') &&
    wheres.some(x=>x.field==='shiftId'&&x.value==='ca-1'));
}
{
  const {api,calls} = await attendanceRuntime({branch:'CS1',singleBranch:true});
  await api.loadByDate('2026-06-22');
  const wheres = calls[0].constraints.filter(x=>x.kind==='where');
  check('Dynamic: resolved one-branch Coach omits branch predicate to include legacy Mặc định rows',
    wheres.some(x=>x.field==='date') && !wheres.some(x=>x.field==='branch'));
}
{
  const {api,calls} = await attendanceRuntime({branch:'',singleBranch:false});
  let blocked=false;
  try { await api.loadByDate('2026-06-22'); } catch(e) { blocked=e.code==='attendance/coach-branch-required'; }
  check('Dynamic: unresolved multi-branch Coach performs zero attendance queries', blocked && calls.length===0);
}

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4C1A checks passed.\n');
