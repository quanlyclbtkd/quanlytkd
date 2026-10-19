#!/usr/bin/env node
// Executes the unmodified actual guard function body from attendance.js in an isolated VM.
// No SDK/Firestore requests; validates write-side mutation boundary, not Firebase authorization.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/modules/attendance.js',import.meta.url),'utf8');
const start=source.indexOf('function _resolveAttendanceWriteGuard(reason)');assert(start>=0);
let i=source.indexOf('{',start), depth=0, end=-1;for(;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth){end=i+1;break;}}assert(end>start);
const helperStart=source.indexOf('function _attendanceCanonicalRole(value)');const actualFn=(helperStart>=0?source.slice(helperStart,start):'')+source.slice(start,end);
const roleSource=fs.readFileSync(new URL('../js/core/roleReadBoundary.js',import.meta.url),'utf8');
let pass=0,fail=0;function runTest(label,ready,role='coach',change={}){
 const metrics={role:'coach',coachBranch:'CS1',authorityClubId:'A',authoritySessionEpoch:2,activeOwnerUid:'uid1',coachRosterReadiness:ready,coachPrimaryServerSeen:true,coachLegacyServerSeen:true,coachPrimaryFailed:false,coachLegacyFailed:false,activeListenerMounted:true,activeListenerKey:'students:profiles:active:A:coach:CS1',coachLegacyListenerKey:'students:profiles:active:A:coach:CS1:legacy-primary',...change};
 const auth={ready:true,generation:2,uid:'uid1',clubId:'A',role,coachBranch:'CS1'};
 const context={role,clubId:'A',coachBranch:'CS1',authGeneration:2,shiftId:'S1'};
 const sandbox={window:{__verifiedAuthContextState:auth,__store:{clubId:'A',userRole:role,coachBranch:'CS1'},userRole:role,coachBranch:'CS1',getProfilesListenerMetrics:()=>metrics,showToast:()=>{sandbox.toast++}},_currentShiftId:'OLD',_attendanceShiftAuthority:{selectedShiftId:'OLD'},_captureAttendanceDailyContext:()=>context,_resolveAttendanceShiftAuthority:()=>({allowed:true,shiftId:'S1',mode:'explicit-shift'}),_normalizeAttendanceShiftDecision:(a,d)=>{sandbox._attendanceShiftAuthority.selectedShiftId=d.shiftId;sandbox._currentShiftId=d.shiftId;return a},_captureAttendanceDailyToken:()=>({}),_attendanceDebug:()=>({shiftRequiredBlockedWrites:0,blankShiftWritePrevented:0}),_renderAttendanceShiftBlocked:()=>{sandbox.renderClears++},_canonicalAttendanceBranch:(v)=>v,_sameBranch:(a,b)=>a===b,toast:0,renderClears:0};
 vm.createContext(sandbox);vm.runInContext(roleSource,sandbox);vm.runInContext(actualFn+';globalThis.out=_resolveAttendanceWriteGuard("test");',sandbox);
 const allow=role!=='coach'||(ready==='verified'&&Object.keys(change).length===0);
 try{assert.equal(!!sandbox.out,allow);if(!allow){assert.equal(sandbox._currentShiftId,'OLD');assert.equal(sandbox._attendanceShiftAuthority.selectedShiftId,'OLD');assert.equal(sandbox.renderClears,0)}else{assert.equal(sandbox._currentShiftId,'S1')}pass++;console.log('PASS',label)}catch(e){fail++;console.error('FAIL',label,e.message)}
}
runTest('Coach pending must not mutate shift','pending');runTest('Coach provisional must not mutate shift','provisional');runTest('Coach error must not mutate shift','error');runTest('Coach undefined metrics fail closed',undefined);runTest('Coach verified same UID/session allowed','verified');runTest('Coach UID mismatch blocked','verified','coach',{activeOwnerUid:'different'});runTest('Coach branch mismatch blocked','verified','coach',{coachBranch:'CS2'});runTest('Coach generation mismatch blocked','verified','coach',{authoritySessionEpoch:1});runTest('Admin existing shift behavior','pending','admin');
console.log(`R2 ATTENDANCE ACTUAL GUARD: ${pass} PASS / ${fail} FAIL`);if(fail)process.exitCode=1;
