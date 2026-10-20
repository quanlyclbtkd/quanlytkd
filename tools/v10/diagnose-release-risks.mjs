// Diagnostic counterexamples, not safety PASS assertions or a release gate.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {sdk,rulesTest,createRuntime,save,sourceHash} from './runtime.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;assert.match(host||'',/^127\.0\.0\.1:\d+$/);const [hostname,port]=host.split(':');
const env=await rulesTest.initializeTestEnvironment({projectId:'demo-v10-risk-diagnostic',firestore:{host:hostname,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
const results=[],club='r2-A',date='2026-10-20',record=(name,status=1)=>({profileId:name,name,branch:'CS1',date,month:'2026-10',status});
const dbAs=uid=>env.authenticatedContext(uid).firestore();
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),batch=sdk.writeBatch(db);for(const [uid,role] of [['r2-c1','coach'],['r2-admin','admin']])batch.set(sdk.doc(db,'users',uid),{role,branch:'CS1',clubId:club,status:'active'});batch.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[]});for(let i=0;i<11;i++)batch.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{branch:'CS1',status:'active'});batch.set(sdk.doc(db,'clubs',club,'profiles','foreign'),{branch:'CS2',status:'active'});batch.set(sdk.doc(db,'clubs',club,'attendance','forged'),record('foreign'));await batch.commit();});
 const r=await createRuntime(),coach=dbAs('r2-c1'),admin=dbAs('r2-admin');await r.auth(coach);
 const leaked=(await sdk.getDoc(sdk.doc(coach,'clubs',club,'attendance','forged'))).exists();
 const readers=[];for(const [name,fn] of [['date',()=>r.service.loadByDate(date,{branch:'CS1'})],['month',()=>r.service.loadByMonth('2026-10',{branch:'CS1'})],['memberHistory',()=>r.service.loadMemberHistory('foreign',['2026-10'],{branch:'CS1'})]])readers.push({reader:name,forgedReturned:(await fn()).some(x=>x.id==='forged')});
 assert.equal(leaked,true);assert(readers.every(x=>x.forgedReturned));results.push({id:'S01',status:'OPEN_REPRODUCED',kind:'server read authorization',forgedGetAllowed:leaked,readers});
 await r.auth(coach);const key='offline_att_'+club+'_'+date,payload={clubId:club,date,records:Object.fromEntries(Array.from({length:11},(_,i)=>['P'+i,record('P'+i)]))},raw=JSON.stringify(payload);r.storage.set(key,raw);
 r.setCommitHook((stage,entry)=>{if(stage==='before'&&entry.sequence===2)throw Object.assign(Error('simulated transport loss'),{code:'unavailable'})});
 const first=await window.syncOfflineAttendance();assert.equal(first.synced,0);assert.equal(r.storage.get(key),raw);
 await r.service.saveRecord('P0_'+date,record('P0',2));
 const v2={version:2,clubId:club,date,month:'2026-10',name:'P0',profileId:'P0',branch:'CS1',docId:'P0_'+date,shiftMode:'legacy-no-shift',shiftId:'',status:2,operation:'set',queuedAt:1,lastUpdatedAt:1,revision:1};
 const v2key='offline_att_v2_'+[club,date,'legacy-no-shift',v2.docId].map(encodeURIComponent).join('~');r.storage.set(v2key,JSON.stringify(v2));r.resetBatches();await window.syncOfflineAttendance();
 const after=(await sdk.getDoc(sdk.doc(admin,'clubs',club,'attendance','P0_'+date))).data().status;assert.equal(after,1);results.push({id:'O01-replay',status:'OPEN_REPRODUCED',beforeNewerOnline:2,afterRetry:after,newerV2Pending:r.storage.has(v2key)});
 await r.auth(coach);const raceRecord={...v2,status:1};const raceRaw=JSON.stringify(raceRecord);r.storage.set(v2key,raceRaw);let armed=false,injected=false;
 r.setCommitHook(stage=>{if(stage==='after')armed=true});r.hooks.get=(k,value)=>{if(armed&&!injected&&k===v2key&&value===raceRaw){injected=true;r.storage.set(k,JSON.stringify({...raceRecord,status:3,lastUpdatedAt:2}))}};
 await window.syncOfflineAttendance();assert.equal(injected,true);assert.equal(r.storage.has(v2key),false);results.push({id:'O01-cross-tab',status:'OPEN_REPRODUCED',layer:'controlled localStorage interleaving, not physical multi-tab',newerJournalLost:true});
}finally{await env.cleanup();save('V10_KNOWN_RELEASE_RISKS.json',{rulesSha256:sourceHash('firestore.rules'),attendanceSha256:sourceHash('js/modules/attendance.js'),serviceSha256:sourceHash('js/services/attendance.service.js'),safetyDecision:'BLOCK_PRODUCTION_RELEASE',results});}
console.log('OPEN RELEASE RISKS REPRODUCED',JSON.stringify(results));
