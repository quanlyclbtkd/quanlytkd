// Measured application document reads. Emulator is not billed telemetry.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),projectId='demo-v11-cas-cost',club='cost';
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
const out=path.resolve(process.env.V11_COST_OUTPUT||'../../evidence/cost');fs.mkdirSync(out,{recursive:true});
let reads=0,writes=0,commits=0;const results=[];
globalThis.window=globalThis;
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=sdk.writeBatch(db);b.set(sdk.doc(db,'users','coach'),{clubId:club,role:'coach',branch:'CS1'});for(let i=0;i<42;i++)b.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{branch:'CS1',status:'active'});await b.commit()});
 const db=env.authenticatedContext('coach').firestore();window.__store={db,clubId:club,userRole:'coach',coachBranch:'CS1',currentUser:{uid:'coach'}};window.userRole='coach';window.coachBranch='CS1';window.__verifiedAuthContextState={ready:true,uid:'coach',role:'coach',clubId:club,coachBranch:'CS1',generation:1};
 window._fb_init={...sdk,runTransaction:async(db,fn,options)=>{const r=await sdk.runTransaction(db,tx=>fn({get(...a){reads++;return tx.get(...a)},set(...a){writes++;return tx.set(...a)}}),options);commits++;return r}};
 const {AttendanceService:s}=await import('../../js/services/attendance.service.js');
 const intent=(i,base='absent',status=1)=>({id:crypto.randomUUID(),baseVersion:base,record:{clubId:club,docId:'P'+i+'_2026-10-20',name:'P'+i,profileId:'P'+i,date:'2026-10-20',month:'2026-10',branch:'CS1',status}});
 const measure=async(name,fn,expectedReads,expectedWrites)=>{const before=[reads,writes,commits];await fn();const r={name,documentReads:reads-before[0],writes:writes-before[1],transactions:commits-before[2]};assert.equal(r.documentReads,expectedReads);assert.equal(r.writes,expectedWrites);results.push(r)};
 const single=intent(0);await measure('single confirmed intent',()=>s.bulkSaveRecords([single]),1,1);
 await measure('lost ACK recovery for already committed UUID',()=>s.bulkSaveRecords([single]),1,0);
 const newer=intent(0,single.id,2);await measure('new status with expected version',()=>s.bulkSaveRecords([newer]),1,1);
 await measure('stale replay detected, no writes',()=>assert.rejects(s.bulkSaveRecords([single]),e=>e.code==='attendance/intent-conflict'),1,0);
 await measure('Coach bulk 41 intents in five serial chunks',()=>s.bulkSaveRecords(Array.from({length:41},(_,i)=>intent(i+1))),41,41);
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 fs.writeFileSync(path.join(out,'transaction-read-measurement.json'),JSON.stringify({projectId,kind:'real-emulator-synthetic-documents',results,retry:{maxAttempts:3,documentReadsPerIntentPerAttempt:1,upperBoundPerIntentPerInvocation:3},newCostScopeApproval:'PENDING; not included in initial roster approval',excluded:'Dependent Rules reads, minimum query charges, index reads, reconnects, production usage and billing',sourceHashes:Object.fromEntries(['firestore.rules','js/services/attendance.service.js','js/modules/attendance.js','js/data/attendanceJournal.js'].map(p=>[p,hash(p)]))},null,2));
}finally{await env.cleanup()}
console.log('V11 CAS READ COST PASS',results);
