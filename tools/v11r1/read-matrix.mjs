// Local synthetic SDK delivery/CAS measurement, never a production bill.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'').split(':');assert.equal(host,'127.0.0.1');const projectId='demo-v11r1-reads';
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}}),results=[];let reads=0,writes=0,transactions=0;
const out='handoff/V11R1/evidence/read-matrix.json';
async function roster(size){
 const club='reads-'+size;await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await sdk.setDoc(sdk.doc(db,'users',club),{clubId:club,role:'coach',branch:'CS1'});for(let offset=0;offset<size;offset+=400){const b=sdk.writeBatch(db);for(let i=offset;i<Math.min(size,offset+400);i++)b.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{branch:i%2?'Mặc định':'CS1',status:'quit'});await b.commit()}});
 const db=env.authenticatedContext(club).firestore();let initial=0,reconnect=0;const snapshots=[];
 for(const branch of ['CS1','Mặc định']){
  const q=sdk.query(sdk.collection(db,'clubs',club,'profiles'),sdk.where('branch','==',branch));const old=sdk.query(sdk.collection(db,'clubs',club,'profiles'),sdk.where('branch','==',branch),sdk.where('status','in',['active','trial']));assert.equal((await sdk.getDocsFromServer(old)).size,0);
  let resolveServer,rejectServer,deadline;const waitServer=()=>new Promise((resolve,reject)=>{resolveServer=resolve;rejectServer=reject;deadline=setTimeout(()=>reject(Error('server snapshot timeout')),15000)});let wait=waitServer();
  const stop=sdk.onSnapshot(q,{includeMetadataChanges:true},s=>{if(!s.metadata.fromCache&&!s.metadata.hasPendingWrites){snapshots.push({branch,resultDocuments:s.size});clearTimeout(deadline);resolveServer(s.size)}},e=>{clearTimeout(deadline);rejectServer(e)});
  try{initial+=await wait;await sdk.disableNetwork(db);wait=waitServer();await sdk.enableNetwork(db);reconnect+=await wait}finally{stop();clearTimeout(deadline)}
 }
 assert.equal(initial,size);assert.equal(reconnect,size);return {profiles:size,fixture:'worst initial delta: all quit, half CS1/half legacy alias',oldStatusFilteredDocuments:0,initialResultDocuments:initial,initialIncrementalResultDocuments:initial,reconnectServerSnapshotDocuments:reconnect,listenerSlots:2,snapshots,billedReconnectReads:'NOT_MEASURED'};
}
try{
 for(const size of [10,100,1000,1500]){results.push({kind:'roster',status:'PASS',...await roster(size)});console.log('PASS roster+reconnect',size)}
 const club='cas-cost';await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=sdk.writeBatch(db);b.set(sdk.doc(db,'users','cas'),{clubId:club,role:'coach',branch:'CS1'});for(let i=0;i<400;i++)b.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{branch:'CS1',status:'active'});await b.commit()});
 globalThis.window=globalThis;const db=env.authenticatedContext('cas').firestore();window.__store={db,clubId:club,userRole:'coach',currentUser:{uid:'cas'},coachBranch:'CS1'};window.userRole='coach';window.coachBranch='CS1';window.__verifiedAuthContextState={ready:true,uid:'cas',role:'coach',clubId:club,coachBranch:'CS1',generation:1};
 window._fb_init={...sdk,runTransaction:async(db,fn,options)=>{assert.equal(options.maxAttempts,3);const result=await sdk.runTransaction(db,tx=>fn({get(...a){reads++;return tx.get(...a)},set(...a){writes++;return tx.set(...a)}}),options);transactions++;return result}};
 const {AttendanceService:service}=await import('../../js/services/attendance.service.js');
 for(const [index,n]of [1,10,11,20,21,400].entries()){
  const date='2026-10-0'+(index+1),intents=Array.from({length:n},(_,i)=>({id:crypto.randomUUID(),baseVersion:'absent',record:{clubId:club,docId:'P'+i+'_'+date,profileId:'P'+i,name:'P'+i,date,month:'2026-10',branch:'CS1',status:1}}));
  const before=[reads,writes,transactions];await service.bulkSaveRecords(intents);const row={kind:'CAS',intents:n,documentGets:reads-before[0],writes:writes-before[1],transactions:transactions-before[2],status:'PASS'};assert.equal(row.documentGets,n);assert.equal(row.writes,n);assert.equal(row.transactions,Math.ceil(n/10));results.push(row);
  const pre=[reads,writes];await service.bulkSaveRecords(intents);assert.equal(reads-pre[0],n);assert.equal(writes-pre[1],0);results.push({kind:'lost-ACK UUID replay',intents:n,documentGets:n,writes:0,status:'PASS'});console.log('PASS CAS/replay',n);
 }
}catch(e){results.push({kind:'failure',status:'FAIL',actual:e.stack});throw e}finally{
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(out,JSON.stringify({command:process.argv.join(' '),projectId,kind:'synthetic local Emulator, actual SDK result deliveries and CAS document gets',sourceHashes:Object.fromEntries(['js/data/attendanceJournal.js','js/services/attendance.service.js','js/listeners/profiles.listeners.js','firestore.rules'].map(p=>[p,sha(p)])),results,rulesDependentReads:'NOT_MEASURED: separate from instrumented SDK get counts; Emulator is not billing',retry:{getsPerIntentPerAttempt:1,maxAttempts:3,excludes:'Rules-dependent reads, index reads, failed invocations/retries across invocations and reconnect billing'},ownerDecision:'PENDING new CAS/V3/cutover scope; old initial roster scope unchanged',staging:'BLOCKED missing authorized staging identity/account',twentyClubWorkload:'NOT_PROVIDED: only parameterized formula, no actual-usage claim'},null,2));await env.cleanup();
}
console.log('V11R1 READ MATRIX PASS',results.length);
