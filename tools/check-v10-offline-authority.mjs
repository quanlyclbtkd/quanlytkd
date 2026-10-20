import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {expression,listenerContract} from './v10/contracts.mjs';
const src=fs.readFileSync('js/modules/attendance.js','utf8'),role=fs.readFileSync('js/core/roleReadBoundary.js','utf8');
const cases=[
 ['online fresh',true,{},true],
 ['offline previously verified metadata-only demotion',false,{coachRosterReadiness:'provisional',coachPrimaryServerSeen:false,coachLegacyServerSeen:false},true],
 ['navigator online with Firestore demotion may enqueue using same-session proof',true,{coachRosterReadiness:'provisional',coachPrimaryServerSeen:false},true],
 ['offline cache-only initial',false,{coachRosterReadiness:'pending',coachPrimaryServerSeen:false,coachLegacyServerSeen:false,coachOfflineRosterReady:false},false],
 ['offline changed/pending data revokes proof',false,{coachRosterReadiness:'provisional',coachPrimaryServerSeen:false,coachOfflineRosterReady:false},false],
 ...Object.entries({activeOwnerUid:'different',authoritySessionEpoch:2,clubId:'different',role:'admin',coachBranch:'CS2',activeListenerKey:'wrong',activeListenerMounted:false,coachPrimaryFailed:true,coachLegacyFailed:true,coachLegacyListenerKey:null})
  .map(([key,value])=>['offline reject '+key,false,{[key]:value},false])
];
for(const [label,online,delta,allowed] of cases){
 const metrics={role:'coach',clubId:'A',authorityClubId:'',coachBranch:'CS1',authoritySessionEpoch:1,activeOwnerUid:'u',coachRosterReadiness:'verified',coachPrimaryServerSeen:true,coachLegacyServerSeen:true,coachPrimaryFailed:false,coachLegacyFailed:false,coachOfflineRosterReady:true,activeListenerMounted:true,activeListenerKey:'students:profiles:active:A:coach:CS1',coachLegacyListenerKey:'students:profiles:active:A:coach:CS1:legacy-primary',...delta};
 const w={__verifiedAuthContextState:{ready:true,uid:'u',clubId:'A',role:'coach',coachBranch:'CS1',generation:1},__store:{clubId:'A',userRole:'coach',coachBranch:'CS1',currentUser:{uid:'u'}},userRole:'coach',coachBranch:'CS1',getProfilesListenerMetrics:()=>metrics};
 const b={window:w,navigator:{onLine:online},_canonicalAttendanceBranch:x=>x,_sameBranch:(x,y)=>x===y};vm.createContext(b);vm.runInContext(role,b);
 b._attendanceCanonicalRole=vm.runInContext(expression(src,'function _attendanceCanonicalRole(',true),b);
 const guard=vm.runInContext(expression(src,'function _coachAttendanceWriteAuthorized(',true),b);
 assert.equal(guard({role:'coach',clubId:'A',coachBranch:'CS1',authGeneration:1}),allowed,label);console.log('PASS',label);
}
await listenerContract('coach');
console.log('V10 OFFLINE AUTHORITY:',cases.length,'guard cases + actual listener metadata/revocation PASS');
