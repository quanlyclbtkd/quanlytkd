import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.userRole='coach';
window.coachBranch='CS1';
window.currentClubId='CLB_TEST';
window.__verifiedAuthContextState={ready:true,uid:'coach-1',role:'coach',clubId:'CLB_TEST',coachBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],generation:1,branchGeneration:1,branchSelectionPending:false};
window.__store={db:{kind:'mockdb'},clubId:'CLB_TEST',currentClubId:'CLB_TEST',userRole:'coach',coachBranch:'CS1',currentUser:{uid:'coach-1'}};
window.RoleReadBoundary={isCoachAttendanceOnly:()=>true,canMount:()=>true};
window.BranchIdentity={normalize:v=>String(v||'').trim()==='Mặc định'?'CS1':String(v||'').trim(),aliases:v=>String(v||'').trim()==='CS1'?['CS1','Mặc định']:[String(v||'').trim()]};
window.recordFirestoreReadAttribution=()=>{};

let txGetCount=0, txSetPayloads=[], historyQueries=[];
const mkSnap=data=>({exists:()=>data!=null,data:()=>data});
function where(field,op,value){return {type:'where',field,op,value}}
function query(collectionRef,...constraints){return {collectionRef,constraints}}
function collection(db,...segments){return {db,segments}}
function doc(db,...segments){return {db,segments,path:segments.join('/')}}
async function runTransaction(db,fn){
  const tx={
    async get(ref){txGetCount++; return mkSnap({profileId:'Student A',name:'Student A',branch:'CS1',date:'2026-10-24',month:'2026-10',shiftId:'shift_1',status:1,attendanceVersion:'server-v-1234567890',historyAuthority:'attendance-history-1aedda93-9437-4132-9694-35c2e6234d55'});},
    set(ref,payload){txSetPayloads.push({ref,payload});}
  };
  return fn(tx);
}
async function getDocs(q){historyQueries.push(q);return {forEach(){},size:0,docs:[],metadata:{fromCache:false,hasPendingWrites:false}}}
window._fb_init={runTransaction,doc,getDocs,query,where,collection,limit:n=>({type:'limit',n}),startAfter:x=>({type:'startAfter',x})};

const {AttendanceService}=await import('../../js/services/attendance.service.js');

const baseRecord={clubId:'CLB_TEST',docId:'Student A_2026-10-24_shift_1',name:'Student A',profileId:'Student A',branch:'CS1',date:'2026-10-24',month:'2026-10',shiftId:'shift_1',status:1,belt:'white'};

// New attendance: no transaction.get, previousVersion must be absent.
txGetCount=0;txSetPayloads=[];
await AttendanceService.bulkSyncOffline('CLB_TEST','',[{id:'intent-create-1234567890',baseVersion:'absent',record:baseRecord}]);
assert.equal(txGetCount,0,'new attendance must not BatchGet a missing target');
assert.equal(txSetPayloads.length,1);
assert.equal(txSetPayloads[0].payload.attendancePreviousVersion,'absent');

// Existing attendance: read + CAS remains mandatory.
txGetCount=0;txSetPayloads=[];
await AttendanceService.bulkSyncOffline('CLB_TEST','',[{id:'intent-update-1234567890',baseVersion:'server-v-1234567890',record:{...baseRecord,status:2}}]);
assert.equal(txGetCount,1,'existing attendance must retain transaction read');
assert.equal(txSetPayloads.length,1);
assert.equal(txSetPayloads[0].payload.attendancePreviousVersion,'server-v-1234567890');

// Coach member-history must issue exactly one canonical branch query; never legacy Mặc định.
historyQueries=[];
await AttendanceService.loadMemberHistory('Student A',['2026-10','2026-11','2026-12']);
assert.equal(historyQueries.length,1,'Coach member history must use one canonical branch query');
const branchFilters=historyQueries[0].constraints.filter(x=>x.type==='where'&&x.field==='branch');
assert.deepEqual(branchFilters,[{type:'where',field:'branch',op:'==',value:'CS1'}]);
assert.equal(historyQueries[0].constraints.some(x=>x.type==='where'&&x.field==='historyAuthority'),true);

console.log('A9R13_RUNTIME_BEHAVIOR {"pass":3,"fail":0,"total":3}');
