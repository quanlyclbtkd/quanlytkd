import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {validate,activate,digest,canonical,restrictiveRollback} from './cutover.mjs';import {demoDecision} from './decision-fixture.mjs';import {backup,recoveryPlan} from './legacy-recovery.mjs';
import os from 'node:os';
const root=process.cwd(),out='handoff/V11R2/evidence';fs.mkdirSync(out,{recursive:true});const fixture=demoDecision(root),results=[];
const ok=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS',name)};
const clone=()=>structuredClone({bundle:fixture.bundle,evidence:fixture.evidence});
function reject(name,change,code,{resign=false}={}){ok(name,()=>{const x=clone();change(x);if(resign){x.evidence.approval.planSHA256=digest(x.bundle.plan);x.evidence.approval.scanSHA256=digest(x.evidence.scan);x.evidence.approval.indexProofSHA256=digest(x.evidence.indexes);x.evidence.signature=fixture.sign(x.evidence.approval)}assert.throws(()=>validate(x.bundle,x.evidence),e=>e.code===code,code)})}
try{
 ok('complete signed demo evidence validates as DEMO only',()=>assert.equal(validate(fixture.bundle,fixture.evidence).status,'DEMO_VERIFIED_NOT_RELEASE'));
 reject('pending owner decision cannot open access',x=>x.evidence.approval.decision='pending','OWNER_DECISION_PENDING');
 reject('a plain edited approved JSON is not authority',x=>x.evidence.approval.maxCASDocumentGetsPerIntentPerInvocation=1000,'OWNER_SIGNATURE_INVALID');
 reject('unknown/unpinned signing key rejected',x=>x.evidence.trustedOwnerKeySHA256='0'.repeat(64),'OWNER_KEY_NOT_PINNED');
 reject('missing signature rejected',x=>x.evidence.signature='','OWNER_SIGNATURE_INVALID');
 reject('forged current-candidate marker cohort blocks activation',x=>x.evidence.scan.cohorts[0].count=1,'COHORT_NOT_ZERO',{resign:true});
 reject('old cached clients must be quiesced',x=>x.evidence.scan.oldClientsQuiesced=false,'OLD_CLIENTS_NOT_QUIESCED',{resign:true});
 reject('inflight writes must settle before scan',x=>x.evidence.scan.inflightWritesSettled=false,'OLD_CLIENTS_NOT_QUIESCED',{resign:true});
 reject('candidate nonce must be prepared after maintenance observation',x=>x.evidence.scan.maintenanceObservedAt=new Date(x.evidence.now-2500).toISOString(),'SCAN_ORDER_INVALID',{resign:true});
 reject('incomplete pagination blocks activation',x=>x.evidence.scan.finalCursor='next-page','SCAN_INCOMPLETE',{resign:true});
 reject('cached/pending snapshot blocks activation',x=>x.evidence.scan.serverConfirmed=false,'SCAN_INCOMPLETE',{resign:true});
 reject('different project scan rejected',x=>x.evidence.scan.projectId='demo-other','SCAN_IDENTITY_MISMATCH',{resign:true});
 reject('different database scan rejected',x=>x.evidence.scan.databaseId='other','SCAN_IDENTITY_MISMATCH',{resign:true});
 reject('wrong observed maintenance Rules rejected',x=>x.evidence.scan.maintenanceRulesSHA256='f'.repeat(64),'SCAN_IDENTITY_MISMATCH',{resign:true});
 reject('stale cohort scan rejected',x=>x.evidence.scan.finishedAt=new Date(x.evidence.now-400000).toISOString(),'SCAN_ORDER_INVALID',{resign:true});
 reject('scan age beyond approved window rejected',x=>{x.bundle.plan.createdAt=new Date(x.evidence.now-500000).toISOString();x.evidence.scan.maintenanceObservedAt=new Date(x.evidence.now-550000).toISOString();x.evidence.scan.startedAt=new Date(x.evidence.now-440000).toISOString();x.evidence.scan.finishedAt=new Date(x.evidence.now-400000).toISOString()},'SCAN_STALE',{resign:true});
 reject('index BUILDING blocks activation',x=>x.evidence.indexes.entries[0].state='CREATING','INDEX_NOT_READY',{resign:true});
 reject('wrong index SHA blocks activation',x=>x.evidence.indexes.indexesSHA256='0'.repeat(64),'INDEX_IDENTITY_MISMATCH',{resign:true});
 reject('different database index proof rejected',x=>x.evidence.indexes.databaseId='other','INDEX_IDENTITY_MISMATCH',{resign:true});
 reject('new read scope not approved blocks activation',x=>x.evidence.approval.newCASVersionReadsApproved=false,'NEW_SCOPE_NOT_APPROVED',{resign:true});
 reject('missing backup blocks activation',x=>x.evidence.approval.backupSHA256='','BACKUP_REQUIRED',{resign:true});
 reject('missing monitoring threshold blocks activation',x=>delete x.evidence.approval.monitoring,'MONITORING_REQUIRED',{resign:true});
 reject('expired decision blocks activation',x=>x.evidence.approval.validUntil=new Date(x.evidence.now-1).toISOString(),'APPROVAL_EXPIRED',{resign:true});
 reject('tampered active Rules cannot use signed plan',x=>x.bundle.activeRules+='\n//tamper','CANDIDATE_TAMPERED');
 reject('demo approval cannot approve real project',x=>{x.bundle.plan.projectId='real-project';x.evidence.approval.projectId='real-project'},'DEMO_EVIDENCE_NOT_REAL_APPROVAL');
 ok('validator does not change pending source decision',()=>assert.equal(JSON.parse(fs.readFileSync('handoff/V11/TRANSACTION_READS_DECISION.json')).decision,'pending'));
 ok('activation creates only an isolated local demo candidate',()=>{const parent=fs.mkdtempSync(path.join(os.tmpdir(),'r6-demo-gates-')),target=path.join(parent,'candidate');try{const proof=activate(fixture.bundle,fixture.evidence,target,root);assert.equal(proof.status,'DEMO_VERIFIED_NOT_RELEASE');assert(fs.readFileSync(target+'/firestore.rules','utf8').includes('return true;'));}finally{fs.rmSync(parent,{recursive:true,force:true})}});
 ok('rollback denies Coach but preserves the active epoch and V3 database',()=>{const r=restrictiveRollback(fixture.bundle);assert(r.rules.includes('function coachAttendanceCutoverOpen() {\n          return false;'));assert(r.rules.includes(fixture.bundle.plan.authority));assert(r.runtimeOverrides['js/core/attendanceContract.js'].includes("tst-attendance-journal-v3"));assert(r.runtimeOverrides['js/core/attendanceContract.js'].includes('HISTORY_COACH_ACCESS = false'));assert.equal(r.noJournalDeletion,true)});
 ok('rollback has a distinct cache identity without changing source',()=>{const before=fs.readFileSync('firestore.rules','utf8'),r=restrictiveRollback(fixture.bundle);assert(r.runtimeOverrides['js/main.js'].includes(fixture.bundle.plan.activeBuildTag+'-hold'));assert.equal(fs.readFileSync('firestore.rules','utf8'),before)});
 const raw=JSON.stringify({clubId:'A',date:'2026-10-20',records:{a:{name:'P',profileId:'P',branch:'CS1',status:1}}}),snapshot={origin:'https://example.test',localStorage:[{key:'offline_att_A_2026-10-20',raw}],journalRows:[]},before=canonical(snapshot),saved=backup(snapshot);
 ok('backup is stable and raw bytes unchanged',()=>{assert.equal(saved.sha256,backup(snapshot).sha256);assert.equal(canonical(snapshot),before)});
 ok('orphan legacy cannot be assigned from same club/branch',()=>{const p=recoveryPlan(snapshot);assert.equal(p.rows[0].principal,null);assert.equal(p.newIntentsCreated,0);assert.equal(p.rawDeleted,false);assert.equal(canonical(snapshot),before)});
 ok('verified mapping still cannot replay or create V3 without separate approval',()=>{const sourceDigest=cryptoHash('offline_att_A_2026-10-20\n'+raw),p=recoveryPlan(snapshot,{mappings:[{sourceDigest,rowIndex:0,principal:{uid:'CoachA',role:'coach',clubId:'A',coachBranch:'CS1'},ownerEvidenceRef:'manual-evidence-owner',branchAtAttendanceEvidenceRef:'manual-attendance-register'}],serverRecords:[{clubId:'A',docId:'P_2026-10-20',serverConfirmed:true,observedAt:new Date().toISOString(),data:{attendanceVersion:'newer-server',status:2}}]});assert.equal(p.rows[0].expectedServerVersion,'newer-server');assert.equal(p.rows[0].state,'QUARANTINE');assert.equal(p.newIntentsCreated,0)});
 ok('imported legacy snapshots are inventoried without assigning owner',()=>{const x={...snapshot,journalRows:[{id:'legacy-old',legacySource:{key:'older',raw}},{id:'v3-existing',principal:{uid:'CoachA'},state:'pending'}]},p=recoveryPlan(x);assert.equal(p.rows.length,2);assert.equal(p.existingV3RowsPreserved,1);assert(p.rows.every(r=>r.principal===null));assert.equal(p.newIntentsCreated,0)});
 ok('same raw snapshot imported in IDB is deduplicated for review',()=>{const p=recoveryPlan({...snapshot,journalRows:[{legacySource:{key:snapshot.localStorage[0].key,raw}}]});assert.equal(p.rows.length,1)});
 ok('contradictory snapshots never select a timestamp winner',()=>{const newer=JSON.parse(raw);newer.records.a.status=2;const p=recoveryPlan({...snapshot,journalRows:[{legacySource:{key:snapshot.localStorage[0].key,raw:JSON.stringify(newer)}}]});assert.equal(p.rows.length,2);assert(p.rows.every(x=>x.reason==='ambiguous-legacy-order-requires-evidence'))});
 ok('forged target identity remains quarantined',()=>{const r=JSON.parse(raw);r.records.a.docId='OTHER_2026-10-20';const p=recoveryPlan({...snapshot,localStorage:[{key:'offline_att_bad',raw:JSON.stringify(r)}]});assert.equal(p.rows[0].reason,'identity-mismatch');assert.equal(p.rows[0].principal,null)});
}catch(e){results.push({name:'test failure',status:'FAIL',actual:e.stack});throw e}finally{fs.writeFileSync(out+'/cutover-gates.json',JSON.stringify({command:process.argv.join(' '),sourceSHA256:digest(fs.readFileSync('js/core/attendanceContract.js','utf8')),rulesSHA256:digest(fs.readFileSync('firestore.rules','utf8')),results,evidenceScope:'DEMO_ONLY; no owner approval inferred'},null,2))}
function cryptoHash(text){return digest(text)}
console.log('CUTOVER/RECOVERY GATES PASS',results.length);
