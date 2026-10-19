#!/usr/bin/env node
// Actual production entrypoint functions, extracted without changing their code.
// Mocks only window/Shift/Auth dependencies; tests stop before journal/DOM/writer.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../js/modules/attendance.js',import.meta.url),'utf8');
const begin=s.indexOf('function _attendanceCanonicalRole(value)');const end=s.indexOf('function _attendanceOfflineKeyPart(',begin);
const toggleBegin=s.indexOf('    window.toggleAttendance = async (idxOrName) =>');const toggleEnd=s.indexOf('    window.toggleAttendanceStatus = window.toggleAttendance;',toggleBegin)+'    window.toggleAttendanceStatus = window.toggleAttendance;'.length;
const bulkBegin=s.indexOf('    window.bulkCheckIn = async () =>');const bulkEnd=s.indexOf('    // ── Offline sync',bulkBegin);
assert(begin>=0&&end>begin&&toggleBegin>=0&&toggleEnd>toggleBegin&&bulkBegin>=0&&bulkEnd>bulkBegin);
const roleSource=fs.readFileSync(new URL('../js/core/roleReadBoundary.js',import.meta.url),'utf8');
const actual=s.slice(begin,end)+'\n'+s.slice(toggleBegin,toggleEnd)+'\n'+s.slice(bulkBegin,bulkEnd);
let p=0,f=0;
for(const scenario of [
 {state:'pending'}, {state:'provisional'}, {state:'error'},
 {state:'pending',ui:'hlv'}, {state:'pending',ui:'trainer'},
 {state:'verified',ui:'admin'}, {state:'verified',store:'admin'}
]){
 const {state,ui='coach',store='coach'}=scenario;
 const sandbox={toast:0,mutations:0,writes:0,journal:0,_currentShiftId:'ORIGINAL',_attendanceShiftAuthority:{selectedShiftId:'ORIGINAL'},
 window:{userRole:ui,currentClubId:'A',__store:{userRole:store,clubId:'A',currentClubId:'A',coachBranch:'CS1',currentUser:{uid:'u1'}},__verifiedAuthContextState:{ready:true,uid:'u1',clubId:'A',role:'coach',coachBranch:'CS1',generation:3},showToast:()=>{sandbox.toast++},getProfilesListenerMetrics:()=>({role:'coach',authorityClubId:'A',coachBranch:'CS1',authoritySessionEpoch:3,activeOwnerUid:'u1',coachRosterReadiness:state,coachPrimaryServerSeen:true,coachLegacyServerSeen:true,coachLegacyListenerKey:'key:alias',activeListenerKey:'students:profiles:active:A:coach:CS1',activeListenerMounted:true}),currentAttendanceData:{student:2}},
 _captureAttendanceDailyContext:()=>({clubId:'A',role:ui,coachBranch:'CS1',shiftId:'SHIFT',authGeneration:3,date:'2026-10-14'}),_resolveAttendanceShiftAuthority:()=>({allowed:true,shiftId:'SHIFT',mode:'explicit-shift'}),_normalizeAttendanceShiftDecision:(c,d)=>{sandbox._currentShiftId=d.shiftId;sandbox._attendanceShiftAuthority.selectedShiftId=d.shiftId;return c},
 _sameBranch:(a,b)=>a===b,_canonicalAttendanceBranch:(v)=>v};
 vm.createContext(sandbox);vm.runInContext(roleSource,sandbox);vm.runInContext(actual,sandbox);
 for(const [action,invoke] of [['toggle',()=>sandbox.window.toggleAttendance(0)],['alias',()=>sandbox.window.toggleAttendanceStatus(0)],['bulk',()=>sandbox.window.bulkCheckIn()]]){
  try{const res=await invoke();assert.equal(res?.blocked,true);assert.equal(sandbox._currentShiftId,'ORIGINAL');assert.equal(sandbox._attendanceShiftAuthority.selectedShiftId,'ORIGINAL');assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.currentAttendanceData)),{student:2});p++;console.log('PASS',state,ui,store,action,'no mutations')}catch(e){f++;console.error('FAIL',state,ui,store,action,e.message)}
 }
}
console.log(`R2 ATTENDANCE ENTRYPOINTS ${p} PASS / ${f} FAIL`);if(f)process.exitCode=1;
