#!/usr/bin/env node
// Test-only actual production function execution: the RoleReadBoundary normalizer,
// Attendance guard and filter/offline eligibility are loaded from source into a VM.
// No Firebase emulator authorization is asserted by this harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const attendance=fs.readFileSync(new URL('../js/modules/attendance.js',import.meta.url),'utf8');
const roles=fs.readFileSync(new URL('../js/core/roleReadBoundary.js',import.meta.url),'utf8');
function fn(name){ const pos=attendance.indexOf('function '+name+'(');assert(pos>=0,`Missing actual function: ${name}`); const a=attendance.indexOf('{',pos);let depth=0;for(let i=a;i<attendance.length;i++){if(attendance[i]==='{')depth++;else if(attendance[i]==='}'&&!--depth)return attendance.slice(pos,i+1)}throw Error('Unterminated '+name) }
const names=['_captureAttendanceDailyContext','_renderAttCards','_attendanceCanonicalRole','_coachAttendanceWriteAuthorized','_resolveAttendanceWriteGuard','_getFilteredAttProfiles','_isOfflineAttendanceRecordAllowed'];
let pass=0,fail=0;
function fixture({ui='coach',store='coach',authRole='coach',ready=true,uid='UID1',gen=7,authGen=7,club='A',selected='A',branch='CS1',storeBranch='CS1',uiBranch='CS1',coachMetrics={},profiles=null,shiftId='S1',configReady=true,superSelected='A'}={}){
 const dom={att_branch:{value:'all'},att_belt:{value:'all'},att_date:{value:'2026-10-14'},att_shift:{value:shiftId},chk_show_all_att:{checked:true}};
 const verified={ready,uid,role:authRole,clubId:authRole==='super_admin'?'':club,coachBranch:branch,generation:gen};
 const metrics={activeOwnerUid:uid,role:'coach',coachBranch:branch,authorityClubId:club,authoritySessionEpoch:gen,coachRosterReadiness:'verified',coachPrimaryServerSeen:true,coachLegacyServerSeen:true,coachPrimaryFailed:false,coachLegacyFailed:false,activeListenerMounted:true,activeListenerKey:`students:profiles:active:${club}:coach:${branch}`,coachLegacyListenerKey:branch==='CS1'?'students:profiles:active:A:coach:CS1:legacy-primary':'',...coachMetrics};
 const window={userRole:ui,coachBranch:uiBranch,currentClubId:superSelected,__store:{userRole:store,coachBranch:storeBranch,clubId:selected,currentClubId:selected,currentUser:{uid},profiles:profiles||{'one':{branch:'CS1',status:'active'},'two':{branch:'CS2',status:'active'}}},__verifiedAuthContextState:verified,getProfilesListenerMetrics:()=>metrics,showToast(){sandbox.toasts++}};
 const sandbox={window,document:{getElementById:id=>dom[id]||null},console,Date,_currentShiftId:'ORIGINAL',_attendanceShiftAuthority:{selectedShiftId:'ORIGINAL',status:'ready',clubId:selected,authGeneration:gen,configured:true},_attendanceDailyState:{mutationRevision:17},_attendanceCache:{orig:1},_attCurrentProfiles:[['one',{branch:'CS1'}]],_attCurrentDate:'original',_captureAttendanceDailyContext:()=>Object.freeze({role:ui.toLowerCase(),clubId:selected,coachBranch:ui==='coach'?uiBranch:'',branch:ui==='coach'?uiBranch:'all',date:'2026-10-14',authGeneration:authGen,shiftId,key:'old'}),_resolveAttendanceShiftAuthority:ctx=>({allowed:true,mode:'explicit-shift',shiftId:ctx.shiftId,eligibleShifts:[{id:ctx.shiftId}]}),_normalizeAttendanceShiftDecision:(ctx,decision)=>{sandbox.normalized++;sandbox._currentShiftId=decision.shiftId;sandbox._attendanceShiftAuthority.selectedShiftId=decision.shiftId;return ctx},_canonicalAttendanceBranch:(b,f='')=>{if(!b)return f;return /^(Mặc định|mac dinh|default)$/i.test(b)?'CS1':b},_sameBranch:(a,b)=>String(a||'').replace('Mặc định','CS1')===String(b||'').replace('Mặc định','CS1'),_attendanceDebug:()=>({shiftRequiredBlockedWrites:0,blankShiftWritePrevented:0}),_captureAttendanceDailyToken:()=>({}),_renderAttendanceShiftBlocked:()=>{sandbox.gridClears++},_profiles:()=>window.__store.profiles,_clubId:()=>selected,_authGeneration:()=>gen,_getLocalToday:()=> '2026-10-14',isActiveProfileForAttendance:p=>p.status==='active',_clubShifts:[{id:'S1',branch:'CS1'},{id:'S2',branch:'CS2'}],toasts:0,normalized:0,gridClears:0};
 // Positive authorization cases include a displayed snapshot for this exact
 // principal/view; no pending or cross-branch fixture gains that authority.
 const snapshotBranch=authRole==='coach'?String(branch).replace('Mặc định','CS1'):'all';
 Object.assign(sandbox._attendanceDailyState,{cacheReady:true,currentSnapshotKey:[selected,'2026-10-14',snapshotBranch,shiftId].join('|'),currentSnapshotAuthGeneration:gen});
 vm.createContext(sandbox);vm.runInContext(roles,sandbox);
 vm.runInContext(names.map(fn).join('\n'),sandbox);
 return {sandbox,dom,verified,metrics,window,run:(name,arg)=>vm.runInContext(`${name}(${arg||''})`,sandbox)};
}
function t(label,run){try{run();pass++;console.log('PASS',label)}catch(err){fail++;console.error('FAIL',label,err.message)}}
function guard(label,opts,allow,{role,branch}={}){t(label,()=>{const f=fixture(opts);const before={shift:f.sandbox._currentShiftId,selection:f.sandbox._attendanceShiftAuthority.selectedShiftId,rev:f.sandbox._attendanceDailyState.mutationRevision,cache:JSON.stringify(f.sandbox._attendanceCache)};const result=f.run('_resolveAttendanceWriteGuard','"test"');assert.equal(!!result,allow);if(!allow){assert.equal(f.sandbox.normalized,0);assert.equal(f.sandbox.gridClears,0);assert.equal(f.sandbox._currentShiftId,before.shift);assert.equal(f.sandbox._attendanceShiftAuthority.selectedShiftId,before.selection);assert.equal(f.sandbox._attendanceDailyState.mutationRevision,before.rev);assert.equal(JSON.stringify(f.sandbox._attendanceCache),before.cache)}else{assert.equal(f.sandbox.normalized,1);if(role)assert.equal(result.context.role,role);if(branch)assert.equal(result.context.branch,branch)}})}
guard('R01 Coach pending blocks',{coachMetrics:{coachRosterReadiness:'pending'}},false);
guard('R02 UI hlv/store Coach/Auth Coach pending blocks',{ui:'hlv',coachMetrics:{coachRosterReadiness:'pending'}},false);
guard('R02 UI trainer/store Coach/Auth Coach pending blocks',{ui:'trainer',coachMetrics:{coachRosterReadiness:'pending'}},false);
guard('R02 UI hlv verified allows canonical Coach branch',{ui:'hlv'},true,{role:'coach',branch:'CS1'});
guard('R02 UI trainer verified allows canonical Coach branch',{ui:'trainer'},true,{role:'coach',branch:'CS1'});
guard('R03 UI admin/store Coach/Auth Coach blocks',{ui:'admin'},false);
guard('R03 UI viewer/store Coach/Auth Coach blocks',{ui:'viewer'},false);
guard('R03 UI unknown/store Coach/Auth Coach blocks',{ui:'stranger'},false);
guard('R04 UI coach/store admin/Auth Coach blocks',{store:'admin'},false);
guard('R04 canonical alias mirrors accept',{ui:'hlv',store:'trainer'},true,{role:'coach'});
guard('R05 auth not ready blocks',{ready:false},false);
guard('R05 missing UID blocks',{uid:''},false);
guard('R05 auth generation zero blocks',{gen:0},false);
guard('R05 noninteger generation blocks',{gen:1.5},false);
t('R05 stale captured generation is denied',()=>{const f=fixture();f.sandbox.stale={...f.run('_captureAttendanceDailyContext'),authGeneration:6};assert.equal(f.run('_coachAttendanceWriteAuthorized','stale'),false)});
guard('R05 matching currentUser allows',{coachMetrics:{},},true); // positive control
// Additional principal scenarios below assert credential mismatches by mutating the actual same auth/mirrors.
t('R05 currentUser UID different blocked',()=>{const f=fixture();f.window.__store.currentUser.uid='DIFFERENT';assert.equal(f.run('_resolveAttendanceWriteGuard','"test"'),null)});
guard('R06 verified Admin valid shift',{ui:'admin',store:'admin',authRole:'admin'},true,{role:'admin'});
guard('R06 verified SuperAdmin selected club',{ui:'superadmin',store:'super_admin',authRole:'super_admin',selected:'A',superSelected:'A'},true,{role:'super_admin'});
guard('R06 superadmin invalid club mirrors blocked',{ui:'superadmin',store:'super_admin',authRole:'super_admin',selected:'A',superSelected:'B'},false);
guard('R07 Coach wrong branch denied',{coachMetrics:{coachBranch:'CS2'}},false);
guard('R07 Coach cache unverified denied',{coachMetrics:{coachPrimaryServerSeen:false}},false);
guard('R07 Coach alias missing denied',{coachMetrics:{coachLegacyServerSeen:false}},false);
guard('R07 owner epoch mismatched denied',{coachMetrics:{authoritySessionEpoch:6}},false);

guard('R07 CS2 single-slot verified allows',{branch:'CS2',storeBranch:'CS2',uiBranch:'CS2',coachMetrics:{coachLegacyServerSeen:false,coachLegacyListenerKey:''}},true,{role:'coach',branch:'CS2'});
guard('R05 UI coach branch mirror stale blocked',{uiBranch:'CS2'},false);
guard('R05 Store coach branch mirror stale blocked',{storeBranch:'CS2'},false);
t('R05 no canonical RoleReadBoundary normalizer blocks',()=>{const f=fixture();delete f.window.RoleReadBoundary;assert.equal(f.run('_resolveAttendanceWriteGuard','"test"'),null);assert.equal(f.sandbox.normalized,0)});
t('R10 actual capture canonicalizes hlv and limits branch',()=>{const f=fixture({ui:'hlv',store:'coach'});const context=f.run('_captureAttendanceDailyContext');assert.equal(context.role,'coach');assert.equal(context.branch,'CS1');assert.equal(context.coachBranch,'CS1');assert.ok(context.key.includes('|CS1|'))});
t('R10 actual capture canonicalizes trainer and limits branch',()=>{const f=fixture({ui:'trainer',store:'coach'});const context=f.run('_captureAttendanceDailyContext');assert.equal(context.role,'coach');assert.equal(context.branch,'CS1')});
t('R10 UI hlv branch=all filtered to CS1',()=>{const f=fixture({ui:'hlv',store:'coach'});let ids=f.run('_getFilteredAttProfiles').map(row=>row[0]);assert.deepEqual(Array.from(ids),['one'])});
t('R10 UI trainer branch=all filtered to CS1',()=>{const f=fixture({ui:'trainer',store:'coach'});let ids=f.run('_getFilteredAttProfiles').map(row=>row[0]);assert.deepEqual(Array.from(ids),['one'])});
t('R13 Trainer pending roster warning is visible in existing grid',()=>{
 const f=fixture({ui:'trainer',store:'coach',coachMetrics:{coachRosterReadiness:'pending'}});
 const grid={innerHTML:''};f.sandbox._attCurrentProfiles=[];
 f.sandbox.document.getElementById=id=>id==='attendanceGrid'?grid:f.dom[id]||null;
 f.sandbox._updateAttSummary=()=>{};
 f.run('_renderAttCards');
 assert.match(grid.innerHTML,/Danh sách võ sinh đang chờ xác minh/);
});
t('R11 offline record wrong branch alias blocked',()=>{const f=fixture({ui:'hlv',store:'coach'});f.sandbox._resolveAttendanceShiftAuthority=ctx=>({allowed:ctx.role!=='coach'||ctx.branch==='CS1',mode:'explicit-shift',shiftId:'S1'});f.sandbox.record={clubId:'A',branch:'CS2',shiftId:'S1'};let res=f.run('_isOfflineAttendanceRecordAllowed','record');assert.equal(res.allowed,false)});
console.log(`D1C3B7R2R2 ATTENDANCE ROLE AUTHORITY: ${pass} PASS / ${fail} FAIL`);if(fail)process.exitCode=1;
