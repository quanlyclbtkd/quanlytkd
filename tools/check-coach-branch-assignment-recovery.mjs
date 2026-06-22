#!/usr/bin/env node
/** Phase 4K-6V4C1A — Coach Branch Assignment Recovery */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const app = read('app.js');
const profiles = read('js/listeners/profiles.listeners.js');
const resolverSource = read('js/core/coachBranchResolver.js');

let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4C1A — Coach Branch Assignment Recovery ===\n');

const build = 'coach-branch-recovery-20260622-v4c1a';
check('Resolver loads before RoleReadBoundary and app.js',
  index.includes(`coachBranchResolver.js?v=${build}`) &&
  index.indexOf('coachBranchResolver.js') < index.indexOf('roleReadBoundary.js') &&
  index.indexOf('coachBranchResolver.js') < index.indexOf(`app.js?v=${build}`));
check('Coach fast path validates authoritative assignment before init',
  app.includes("reason: 'auth-cache-coach-validation'") &&
  app.indexOf("await _resolveCoachBeforeBootstrap(user") < app.indexOf('initSaaSDatabase(_resolvedCoach.clubId)'));
check('Slow and fallback Coach paths use the same resolver',
  app.includes("reason: 'auth-slow-coach-validation'") &&
  app.includes("reason: 'auth-fallback-coach-validation'"));
check('Auth cache is cleared and login is blocked when branch remains missing',
  app.includes('_clearAuthCache();') &&
  app.includes('Tài khoản HLV chưa được gán cơ sở điểm danh'));
check('New Coach accounts require an explicit branch',
  app.includes("if (!branch) return alert('Vui lòng chọn cơ sở điểm danh cho HLV!") &&
  index.includes('-- Chọn cơ sở điểm danh (bắt buộc) --'));
check('Admin can repair existing Coach branch assignments',
  app.includes('window.updateCoachBranch = async') &&
  app.includes('💾 Lưu cơ sở') &&
  app.includes('CHƯA GÁN CƠ SỞ'));
check('Migration auto-recovers single-branch clubs but reports unresolved multi-branch Coaches',
  app.includes("if (!resolvedBranch && _coachBranchCount === 1) resolvedBranch = 'CS1'") &&
  app.includes('Chưa được gán cơ sở: ${unresolved} tài khoản'));
check('Profiles listener performs one branch recovery attempt and never full-reads',
  profiles.includes('CoachBranchResolver.recoverCurrentSession') &&
  profiles.includes('coachBranchRecoveryAttempted') &&
  profiles.includes('fail closed, no profiles query'));
check('Resolver uses Coach subdocument as authoritative source',
  resolverSource.includes("'clubs', clubId, 'coaches', uid") &&
  resolverSource.includes("source = branch ? 'club-coach-doc'"));
check('Resolver maps legacy branch names and auto-recovers CS1 only for one-branch clubs',
  resolverSource.includes("source = 'legacy-branch-name-mapped'") &&
  resolverSource.includes("source = 'single-branch-auto-recovery'"));

function makeRuntime({ userData=null, coachData=null, config=null }={}) {
  const writes=[];
  const docs = new Map();
  if (userData) docs.set('users/u1', userData);
  if (coachData) docs.set('clubs/c1/coaches/u1', coachData);
  if (config) docs.set('clubs/c1/settings/main_config', config);
  const elements = new Map();
  function selectElement() {
    const options=[];
    return {
      value:'', disabled:false, options,
      appendChild(opt){options.push(opt)},
      set innerHTML(v){options.length=0; this._html=v}, get innerHTML(){return this._html||''},
    };
  }
  elements.set('att_branch', selectElement());
  elements.set('att_month_branch', selectElement());
  elements.set('coach_att_info', {style:{},innerHTML:''});
  elements.set('attendanceGrid', {innerHTML:''});
  const context = {
    window: {
      __store:{db:{},currentClubId:'c1',clubId:'c1',currentUser:{uid:'u1'}},
      _db:{}, currentClubId:'c1', userRole:'coach', coachBranch:'',
      document:{
        getElementById(id){return elements.get(id)||null},
        createElement(){return {value:'',textContent:''}},
      },
      dispatchEvent(){}, showToast(){},
      _fb_init:{
        doc(_db,...parts){return {path:parts.join('/')}},
        async getDoc(ref){
          const data=docs.get(ref.path);
          return {exists(){return !!data},data(){return data}};
        },
        async setDoc(ref,data){writes.push({path:ref.path,data})},
      },
    },
    console:{log(){},info(){},warn(){},error(){},group(){},groupEnd(){},table(){}},
    Date, String, Number, Object, Array, Math, Set, Promise,
    CustomEvent: class { constructor(type,opts){this.type=type;this.detail=opts?.detail} },
    setTimeout(fn){fn();return 1}, clearTimeout(){},
  };
  context.window.window=context.window;
  context.window.console=context.console;
  context.window.CustomEvent=context.CustomEvent;
  context.window.setTimeout=context.setTimeout;
  vm.createContext(context);
  vm.runInContext(resolverSource, context, {filename:'coachBranchResolver.js'});
  return {api:context.window.CoachBranchResolver,window:context.window,writes,elements};
}

{
  const rt=makeRuntime({userData:{role:'coach',clubId:'c1',branch:''},coachData:{branch:'CS2'}});
  const result=await rt.api.resolveAssignment({db:{},uid:'u1',clubId:'c1',userData:{role:'coach',clubId:'c1',branch:''}});
  check('Dynamic: Coach subdocument branch repairs empty users branch', result.ok && result.branch==='CS2' && result.source==='club-coach-doc');
}
{
  const rt=makeRuntime({userData:{role:'coach',clubId:'c1',branch:'CS3'},coachData:{branch:''},config:{branchCount:3}});
  const result=await rt.api.resolveAssignment({db:{},uid:'u1',clubId:'c1',userData:{role:'coach',clubId:'c1',branch:'CS3'}});
  check('Dynamic: legacy users branch remains a safe fallback', result.ok && result.branch==='CS3' && result.source==='user-doc-legacy');
}
{
  const rt=makeRuntime({userData:{role:'coach',clubId:'c1'},coachData:{branch:'Nguyễn Trãi'},config:{branchCount:2,branchName1:'Hồng Bàng',branchName2:'Nguyễn Trãi'}});
  const result=await rt.api.resolveAssignment({db:{},uid:'u1',clubId:'c1',userData:{role:'coach',clubId:'c1'}});
  check('Dynamic: legacy display-name branch maps to canonical CS code', result.ok && result.branch==='CS2' && result.source==='legacy-branch-name-mapped');
}
{
  const rt=makeRuntime({userData:{role:'coach',clubId:'c1'},coachData:{branch:''},config:{branchCount:1,branchName1:'Cơ sở chính'}});
  const result=await rt.api.resolveAssignment({db:{},uid:'u1',clubId:'c1',userData:{role:'coach',clubId:'c1'}});
  check('Dynamic: one-branch club safely auto-recovers CS1', result.ok && result.branch==='CS1' && result.source==='single-branch-auto-recovery');
}
{
  const rt=makeRuntime({userData:{role:'coach',clubId:'c1'},coachData:{branch:''},config:{branchCount:3}});
  const result=await rt.api.resolveAssignment({db:{},uid:'u1',clubId:'c1',userData:{role:'coach',clubId:'c1'}});
  check('Dynamic: multi-branch club with no assignment remains fail-closed', !result.ok && result.needsAdminAssignment===true && result.reason==='branch-assignment-missing');
}
{
  const rt=makeRuntime({coachData:{branch:'CS2'}});
  const result={ok:true,branch:'CS2',clubId:'c1',source:'test'};
  const applied=rt.api.applyAssignment(result,{reason:'test'});
  check('Dynamic: applying resolved branch updates runtime and locks Attendance filters', applied && rt.window.coachBranch==='CS2' && rt.elements.get('att_branch').disabled===true && rt.elements.get('att_branch').value==='CS2');
}

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4C1A checks passed.\n');
