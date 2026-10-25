// Exact candidate Rules + real runtime query, isolated demo project only.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {AttendanceService as service} from '../../js/services/attendance.service.js';
import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'';assert.match(endpoint,/^127\.0\.0\.1:\d+$/);
const [host,port]=endpoint.split(':'),club='REGISTRATION_HISTORY_TEST',projectId='demo-a9r15-history';
const rules=fs.readFileSync('firestore.rules','utf8'),results=[],queries=[],reads=[];
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules}});
const dbs=Object.fromEntries(['one','multi','admin','outsider'].map(uid=>[uid,env.authenticatedContext(uid).firestore()]));
const expected=[];
let activeCase='',paginationEvidence=null;
function bind(uid='multi',branch='CS1',allowed=uid==='one'?['CS1']:['CS1','CS2']){
 const role=uid==='admin'?'admin':'coach';
 const shapes=new WeakMap(),constraints=new WeakMap();
 const remember=(value,shape)=>{constraints.set(value,shape);return value;};
 const bridge={...sdk,
  where:(field,op,value)=>remember(sdk.where(field,op,value),{type:'where',field,op,value}),
  orderBy:(field,direction)=>remember(sdk.orderBy(field,direction),{type:'orderBy',field:typeof field==='string'?field:field.isEqual(sdk.documentId())?'__name__':'unknown-field-path',direction}),
  limit:value=>remember(sdk.limit(value),{type:'limit',value}),
  startAfter:value=>remember(sdk.startAfter(value),{type:'startAfter',value}),
  query:(ref,...parts)=>{const query=sdk.query(ref,...parts);shapes.set(query,{path:ref.path,constraints:parts.map(part=>constraints.get(part))});return query;},
  getDocs:async query=>{const entry={case:activeCase,query:shapes.get(query),role,uid,activeBranch:branch,allowedBranches:allowed.slice(),sdkVersion:'12.15.0'};queries.push(entry);try{const snap=await sdk.getDocs(query);entry.documents=snap.size;entry.success=true;return snap;}catch(error){entry.success=false;entry.errorCode=error.code;throw error;}}
 };
 globalThis.window={_fb_init:bridge,
  __store:{db:dbs[uid],clubId:club,currentClubId:club,currentUser:{uid},userRole:role,coachBranch:branch},currentClubId:club,userRole:role,coachBranch:branch,
  __verifiedAuthContextState:{uid,clubId:club,role,ready:true,generation:1,branchGeneration:1,assignmentVersion:'assignment-a9r15-0001',activeBranch:branch,coachBranch:branch,allowedBranches:allowed},
  recordFirestoreReadAttribution:(key,n,extra)=>reads.push({key,n,...extra})};
}
const col=db=>sdk.collection(db,'clubs',club,'attendance');
const record=(profileId,date,shiftId='S1',branch='CS1',extra={})=>({name:profileId,profileId,date,month:date.slice(0,7),shiftId,branch,status:1,historyAuthority:HISTORY_AUTHORITY,attendanceVersion:crypto.randomUUID(),...extra});
const docId=r=>r.profileId+'_'+r.date+'_'+r.shiftId;
const page=(options={})=>service.loadMemberHistory('P001',null,{page:true,branch:window.coachBranch,pageSize:7,...options});
async function check(title,fn){activeCase=title;try{await fn();results.push({title,classification:'PASS'});console.log('PASS',title);}catch(e){results.push({title,classification:'FAIL_RUNTIME',code:e.code,message:e.stack});console.error('FAIL',title,e);}}
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db);
  b.set(sdk.doc(db,'clubs',club),{coachAclEpoch:1});b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  for(const uid of ['one','multi','outsider']){
   const tenant=uid==='outsider'?'OTHER':club;
   const acl={role:'coach',clubId:tenant,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:uid==='one'?['CS1']:['CS1','CS2'],assignmentVersion:'assignment-a9r15-0001'};
   b.set(sdk.doc(db,'users',uid),acl);b.set(sdk.doc(db,'clubs',tenant,'coaches',uid),acl);
  }
  b.set(sdk.doc(db,'users','admin'),{role:'admin',clubId:club,status:'active'});
  b.set(sdk.doc(db,'clubs',club,'profiles','P001'),{status:'active',branch:'CS2',displayName:'Same name'});
  b.set(sdk.doc(db,'clubs',club,'profiles','P002'),{status:'active',branch:'CS1',displayName:'Same name'});
  const list=[record('P001','2020-02-29'),record('P001','2023-12-31'),record('P001','2023-12-31','S2'),record('P001','2024-01-01'),record('P001','2024-02-29')];
  for(let n=0;n<81;n++){const d=new Date(Date.UTC(2025,0,1+n)).toISOString().slice(0,10);list.push(record('P001',d));}
  list.push(record('P001','2026-10-24','S1','CS1',{status:0}));
  for(const row of list){b.set(sdk.doc(col(db),docId(row)),row);if(row.status)expected.push(docId(row));}
  for(const row of [record('P001','2026-10-25','S2','CS2'),record('P001','2020-01-01','LEGACY','CS1',{historyAuthority:'old-untrusted'}),record('P002','2026-10-25'),record('P001','2026-10-25','S3','CS3')])b.set(sdk.doc(col(db),docId(row)),row);
  for(let n=1;n<=4;n++){const row=record('TOMBSTONES','2024-01-0'+n,'S1','CS1',{status:n<=2?0:1});b.set(sdk.doc(col(db),docId(row)),row);}
  await b.commit();expected.sort();
 });
 await check('CS1-only Coach: exact runtime first page has current authority, profile and branch',async()=>{bind('one');const p=await page();assert.equal(p.rawCount,7);assert(p.rows.every(r=>r.data.branch==='CS1'&&r.data.profileId==='P001'&&r.data.historyAuthority===HISTORY_AUTHORITY));});
 await check('CS1-only Coach cannot forge CS2 locally to pass server ACL',async()=>{bind('one','CS2',['CS1','CS2']);await assert.rejects(page(),e=>e.code==='permission-denied');});
 await check('Multi-branch Coach exhausts all verified years without gaps or duplicate boundaries',async()=>{
  bind();let cursor=null,complete=false,ids=[],calls=0;const pageSizes=[];
  do{const p=await page({cursor});ids.push(...p.rows.map(r=>r.id));pageSizes.push(p.rawCount);cursor=p.cursor;complete=p.complete;assert(p.rawCount<=7);calls++;assert(calls<20);}while(!complete);
  assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,ids.length);assert(ids.includes('P001_2020-02-29_S1'));assert(ids.includes('P001_2023-12-31_S1'));assert(ids.includes('P001_2023-12-31_S2'));assert(ids.includes('P001_2024-01-01_S1'));assert(ids.includes('P001_2024-02-29_S1'));paginationEvidence={visibleRecords:ids.length,rawPageSizes:pageSizes,pages:calls,uniqueRecords:new Set(ids).size,firstId:ids[0],lastId:ids.at(-1)};
 });
 await check('CS2 switch reads only historical CS2 portion of the same immutable profile',async()=>{bind('multi','CS2');const p=await page();assert.equal(p.rows.length,1);assert.equal(p.rows[0].data.branch,'CS2');assert(p.complete);});
 await check('History branch at attendance remains CS1 after current profile moves to CS2',async()=>{bind();const p=await page();assert(p.rows.every(r=>r.data.branch==='CS1'));});
 await check('Cursor cannot cross branch, authority or session generation',async()=>{
  bind();const p=await page();bind('multi','CS2');await assert.rejects(page({cursor:p.cursor}),e=>e.code==='attendance/history-cursor-scope');
  bind();window.__verifiedAuthContextState.generation=2;await assert.rejects(page({cursor:p.cursor}),e=>e.code==='attendance/history-cursor-scope');
 });
 await check('Empty profile history ends successfully without searching the club',async()=>{bind();const p=await service.loadMemberHistory('EMPTY',null,{page:true,branch:'CS1'});assert.deepEqual(p.rows,[]);assert(p.complete);assert.equal(p.cursor,null);});
 await check('An all-tombstone page advances by raw cursor without hiding the following visible page',async()=>{
  bind();const first=await service.loadMemberHistory('TOMBSTONES',null,{page:true,branch:'CS1',pageSize:2});assert.equal(first.rows.length,0);assert.equal(first.rawCount,2);assert(!first.complete);assert(first.cursor);
  const next=await service.loadMemberHistory('TOMBSTONES',null,{page:true,branch:'CS1',pageSize:2,cursor:first.cursor});assert.equal(next.rows.length,2);assert(!next.complete);
  const end=await service.loadMemberHistory('TOMBSTONES',null,{page:true,branch:'CS1',pageSize:2,cursor:next.cursor});assert.equal(end.rawCount,0);assert(end.complete);assert.equal(end.cursor,null);
 });
 await check('Same display names never merge P001 and P002 identities',async()=>{bind();const p=await service.loadMemberHistory('P002',null,{page:true,branch:'CS1'});assert.equal(p.rows.length,1);assert.equal(p.rows[0].data.profileId,'P002');});
 await check('Page size above 40 or missing branch is rejected before any query',async()=>{bind();const n=queries.length;await assert.rejects(page({pageSize:41}));await assert.rejects(page({branch:'all'}));assert.equal(queries.length,n);});
 await check('History cannot omit or forge a profile path scope before querying',async()=>{bind();const n=queries.length;for(const id of ['',null,'P001/forged'])await assert.rejects(service.loadMemberHistory(id,null,{page:true,branch:'CS1'}),e=>e.code==='attendance/history-scope-required');assert.equal(queries.length,n);});
 await check('Query without current historyAuthority is DENY, even with profile and branch',async()=>{await assertFails(sdk.getDocs(sdk.query(col(dbs.one),sdk.where('profileId','==','P001'),sdk.where('branch','==','CS1'),sdk.limit(7))));});
 await check('Query without branch is DENY, even with profile and authority',async()=>{await assertFails(sdk.getDocs(sdk.query(col(dbs.one),sdk.where('profileId','==','P001'),sdk.where('historyAuthority','==',HISTORY_AUTHORITY),sdk.limit(7))));});
 await check('Raw legacy history query remains DENY for Coach',async()=>{await assertFails(sdk.getDocs(sdk.query(col(dbs.one),sdk.where('profileId','==','P001'),sdk.where('branch','==','CS1'),sdk.where('historyAuthority','==','old-untrusted'),sdk.limit(7))));});
 await check('Admin retains exact legacy inspection and current-authority pagination',async()=>{bind('admin');const snap=await sdk.getDoc(sdk.doc(col(dbs.admin),'P001_2020-01-01_LEGACY'));assert.equal(snap.data().historyAuthority,'old-untrusted');assert((await page()).rows.length>0);});
 await check('Cross-club Coach runtime query is DENY',async()=>{bind('outsider');await assert.rejects(page(),e=>e.code==='permission-denied');});
 await check('Coach Finance read remains DENY',async()=>{await assertFails(sdk.getDoc(sdk.doc(dbs.multi,'clubs',club,'transactions','tx1')));});
 await check('Coach physical Attendance delete remains DENY',async()=>{await assertFails(sdk.deleteDoc(sdk.doc(col(dbs.multi),expected[0])));});
 await check('Forged branch/profile write is DENY by canonical profile guard',async()=>{const r=record('P001','2026-10-25','S1','CS1',{attendancePreviousVersion:'absent'});await assertFails(sdk.setDoc(sdk.doc(col(dbs.multi),docId(r)),r));});
 await check('A late response is rejected after allowedBranches changes in place',async()=>{
  bind();const real=window._fb_init.getDocs;window._fb_init.getDocs=async q=>{const snap=await real(q);window.__verifiedAuthContextState.allowedBranches=['CS1'];return snap;};
  await assert.rejects(page(),e=>e.code==='attendance/stale-bulk-context'||e.code==='attendance/stale-history-context');
 });
 await check('A late response is rejected after CS1 to CS2 switch',async()=>{
  bind();const real=window._fb_init.getDocs;window._fb_init.getDocs=async q=>{const snap=await real(q);window.coachBranch='CS2';window.__verifiedAuthContextState.activeBranch='CS2';return snap;};
  await assert.rejects(page(),e=>e.code==='attendance/stale-bulk-context'||e.code==='attendance/stale-history-context');
 });
 await check('Server-revoked assignment denies the same runtime query despite stale client mirror',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{const b=sdk.writeBatch(ctx.firestore());for(const ref of [sdk.doc(ctx.firestore(),'users','multi'),sdk.doc(ctx.firestore(),'clubs',club,'coaches','multi')])b.update(ref,{allowedBranches:['CS1'],assignmentVersion:'assignment-a9r15-0002'});await b.commit();});
  bind('multi','CS2');await assert.rejects(page(),e=>e.code==='permission-denied');
 });
}finally{
 const report={kind:'A9R15_EXACT_RUNTIME_QUERY_EMULATOR',classification:results.some(r=>r.classification!=='PASS')?'FAIL_RUNTIME':'PASS',projectId,rulesSHA256:crypto.createHash('sha256').update(rules).digest('hex'),historyAuthority:HISTORY_AUTHORITY,queryShape:{path:'clubs/{clubId}/attendance',where:['profileId == immutableProfileId','historyAuthority == currentAuthority','branch == activeAuthorizedBranch'],orderBy:'__name__ ASC',limit:'1..40',cursor:'scoped startAfter(documentId)'},indexValidation:'No index error from Emulator; production index readiness is not established by Emulator',results,queries,paginationEvidence,attributedDocumentReads:reads.reduce((n,r)=>n+r.n,0),onSnapshotDelta:0};
 fs.mkdirSync('evidence/A9R15',{recursive:true});fs.writeFileSync('evidence/A9R15/A9R15_EMULATOR_RESULTS.json',JSON.stringify(report,null,2));console.log('RESULT',report.classification,results.length);await env.cleanup();if(report.classification!=='PASS')process.exitCode=1;
}
