import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,query,collection,where,setDoc,updateDoc,writeBatch,arrayUnion,increment,runTransaction} from 'firebase/firestore';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'';
assert(/^127\.0\.0\.1:\d+$/.test(endpoint),'LOCAL_EMULATOR_REQUIRED');const [host,port]=endpoint.split(':');
const source=fs.readFileSync('firestore.rules','utf8');assert(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/.test(source),'Source must remain maintenance');
const originalMarker=source.match(/return data.get\('historyAuthority', ''\) == '([^']+)'/)[1];
const results=[];
async function test(profile,name,fn){try{await fn();results.push({profile,name,status:'PASS'});console.log('PASS '+profile+' '+name)}catch(e){results.push({profile,name,status:'FAIL',error:e.code||e.message});console.error('FAIL '+profile+' '+name+': '+(e.code||e.message))}}
const acl=(branches,primary=branches[0]||'')=>({role:'coach',clubId:'A',branch:primary,coachBranch:primary,defaultBranch:primary,allowedBranches:branches,status:'active',assignmentVersion:'initial-authority-version-0001'});
for(const active of [false,true]){
 const profile=active?'ACTIVE_DEMO_ONLY':'MAINTENANCE',marker=active?'qa-history-'+randomUUID():originalMarker;
 let rules=active?source.replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )false;/,'$1true;').replaceAll(originalMarker,marker):source;
 const env=await initializeTestEnvironment({projectId:'demo-a6-'+(active?'active':'maintenance'),firestore:{host,port:Number(port),rules}});
 const admin=env.authenticatedContext('admin').firestore(),dual=env.authenticatedContext('dual').firestore(),one=env.authenticatedContext('one').firestore(),c23=env.authenticatedContext('c23').firestore(),revoked=env.authenticatedContext('revoked').firestore(),stale=env.authenticatedContext('stale').firestore(),locked=env.authenticatedContext('locked').firestore(),anonymous=env.unauthenticatedContext().firestore();
 const values=[['admin',{role:'admin',clubId:'A',status:'active'}],['dual',acl(['CS1','CS2'])],['one',{role:'coach',clubId:'A',branch:'CS1',status:'active'}],['c23',acl(['CS2','CS3'])],['revoked',acl([])],['stale',acl(['CS1','CS2'])],['locked',{...acl(['CS1','CS2']),status:'locked'}]];
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),batch=writeBatch(db);batch.set(doc(db,'clubs','A'),{clubName:'QA'});batch.set(doc(db,'clubs','B'),{clubName:'QB'});batch.set(doc(db,'clubs','A','settings','main_config'),{branchCount:3});batch.set(doc(db,'clubs','A','settings','shifts'),{list:[]});
  for(const [uid,data]of values){batch.set(doc(db,'users',uid),data);if(data.role==='coach')batch.set(doc(db,'clubs','A','coaches',uid),uid==='stale'?acl(['CS1']):data)}
  for(const [id,branch]of [['P1','CS1'],['P2','CS2'],['P3','CS3'],['Legacy','Mặc định']])batch.set(doc(db,'clubs','A','profiles',id),{branch,status:'active'});
  batch.set(doc(db,'clubs','B','profiles','P1'),{branch:'CS1'});
  for(const branch of ['CS1','CS2','CS3']){const pid='P'+branch.slice(2);batch.set(doc(db,'clubs','A','attendance',pid+'_2026-10-22'),{profileId:pid,name:pid,date:'2026-10-22',month:'2026-10',branch,status:1,attendanceVersion:'attendance-version-initial-0001',historyAuthority:marker})}
  batch.set(doc(db,'clubs','A','attendance','Legacy_2026-10-22'),{profileId:'Legacy',name:'Legacy',date:'2026-10-22',month:'2026-10',branch:'Mặc định',status:1,attendanceVersion:'legacy-alias-version-0001',historyAuthority:marker});
  batch.set(doc(db,'clubs','A','attendance','Forged_2026-10-20'),{profileId:'P3',name:'P3',date:'2026-10-20',month:'2026-10',branch:'CS1',status:1,attendanceVersion:'forged-before-cutover-0001',historyAuthority:originalMarker});await batch.commit();
 });
 const ref=(db,path)=>doc(db,'clubs','A',...path.split('/'));
 const good=(pid,branch)=>({profileId:pid,name:pid,date:'2026-10-23',month:'2026-10',branch,status:1,attendanceVersion:randomUUID(),attendancePreviousVersion:'legacy',historyAuthority:marker});
 try{
  await test(profile,'dual get CS1',()=>assertSucceeds(getDoc(ref(dual,'profiles/P1'))));
  await test(profile,'dual get CS2',()=>assertSucceeds(getDoc(ref(dual,'profiles/P2'))));
  await test(profile,'dual list exactly CS2',()=>assertSucceeds(getDocs(query(collection(dual,'clubs','A','profiles'),where('branch','==','CS2')))));
  await test(profile,'dual cannot get CS3',()=>assertFails(getDoc(ref(dual,'profiles/P3'))));
  await test(profile,'dual cannot list all profiles',()=>assertFails(getDocs(collection(dual,'clubs','A','profiles'))));
  await test(profile,'dual cross club denied',()=>assertFails(getDoc(doc(dual,'clubs','B','profiles','P1'))));
  await test(profile,'CS2+CS3 works without CS1',()=>assertSucceeds(getDoc(ref(c23,'profiles/P3'))));
  await test(profile,'CS2+CS3 cannot read CS1',()=>assertFails(getDoc(ref(c23,'profiles/P1'))));
  await test(profile,'legacy scalar CS1 reads Mặc định',()=>assertSucceeds(getDoc(ref(one,'profiles/Legacy'))));
  await test(profile,'single branch cannot read CS2',()=>assertFails(getDoc(ref(one,'profiles/P2'))));
  for(const [name,db]of [['revoked',revoked],['mismatched mirror',stale],['locked',locked],['anonymous',anonymous]])await test(profile,name+' profile denied',()=>assertFails(getDoc(ref(db,'profiles/P1'))));
  for(const target of ['transactions','inventory','exams','stats'])await test(profile,'sensitive '+target+' get/list denied',async()=>{await assertFails(getDoc(ref(dual,target+'/X')));await assertFails(getDocs(collection(dual,'clubs','A',target)))});
  await test(profile,'Coach cannot add allowedBranches',()=>assertFails(updateDoc(doc(dual,'users','dual'),{allowedBranches:arrayUnion('CS3')})));
  await test(profile,'Coach cannot change primary or club',async()=>{await assertFails(updateDoc(doc(dual,'users','dual'),{defaultBranch:'CS2'}));await assertFails(updateDoc(doc(dual,'users','dual'),{clubId:'B'}));await assertFails(updateDoc(doc(dual,'users','dual'),{role:'admin'}))});
  await test(profile,'Coach cannot change canonical assignment',()=>assertFails(updateDoc(ref(dual,'coaches/dual'),{allowedBranches:['CS1','CS2','CS3']})));
  await test(profile,'Admin half assignment update denied',()=>assertFails(updateDoc(ref(admin,'coaches/dual'),{allowedBranches:['CS1']})));
  await test(profile,'Admin half mirror update denied',()=>assertFails(updateDoc(doc(admin,'users','dual'),{allowedBranches:['CS1']})));
  await test(profile,'Admin cannot grant branch outside config',async()=>{const b=writeBatch(admin),d=acl(['CS4']);b.set(ref(admin,'coaches/outside'),{...d,assignmentVersion:randomUUID(),assignmentPreviousVersion:'absent'});b.set(doc(admin,'users','outside'),d);await assertFails(b.commit())});
  for(const [label,branches]of [['duplicate',['CS1','CS1']],['unsorted',['CS2','CS1']],['non-string',['CS1',2]],['alias-in-array',['Mặc định']],['unknown',['CS11']]])await test(profile,'Admin rejects '+label+' ACL',async()=>{const b=writeBatch(admin),data={...acl(branches),assignmentVersion:randomUUID(),assignmentPreviousVersion:'absent'};b.set(ref(admin,'coaches/invalid-'+label),data);b.set(doc(admin,'users','invalid-'+label),data);b.set(doc(admin,'clubs','A'),{coachAclEpoch:increment(1)},{merge:true});await assertFails(b.commit())});
  await test(profile,'valid atomic ACL pair and revision',async()=>{const b=writeBatch(admin),d={...acl(['CS1']),assignmentVersion:randomUUID(),assignmentPreviousVersion:'initial-authority-version-0001'};b.set(ref(admin,'coaches/dual'),d);b.set(doc(admin,'users','dual'),d);b.set(doc(admin,'clubs','A'),{coachAclEpoch:increment(1)},{merge:true});await assertSucceeds(b.commit())});
  await test(profile,'confirmed revocation immediately denies CS2',()=>assertFails(getDoc(ref(dual,'profiles/P2'))));
  await test(profile,'stale Admin rollback cannot restore revoked CS2',async()=>{const b=writeBatch(admin),d={...acl(['CS1','CS2']),assignmentVersion:randomUUID(),assignmentPreviousVersion:'initial-authority-version-0001'};b.set(ref(admin,'coaches/dual'),d);b.set(doc(admin,'users','dual'),d);b.set(doc(admin,'clubs','A'),{coachAclEpoch:increment(1)},{merge:true});await assertFails(b.commit())});
  // Use the independent CS2+CS3 principal for Attendance after dual revocation.
  const expect=active?assertSucceeds:assertFails;
  await test(profile,'Attendance get obeys profile mode',()=>expect(getDoc(ref(c23,'attendance/P2_2026-10-22'))));
  await test(profile,'Attendance branch query obeys profile mode',()=>expect(getDocs(query(collection(c23,'clubs','A','attendance'),where('branch','==','CS2'),where('historyAuthority','==',marker)))));
  await test(profile,'Attendance valid create obeys profile mode',()=>expect(setDoc(ref(c23,'attendance/P2_2026-10-23'),good('P2','CS2'))));
  await test(profile,'dual-authorized branch spoof still denied',()=>assertFails(setDoc(ref(c23,'attendance/P3_2026-10-23'),good('P3','CS2'))));
  await test(profile,'inverse dual-authorized spoof denied',()=>assertFails(setDoc(ref(c23,'attendance/P2_2026-10-24'),{...good('P2','CS3'),date:'2026-10-24'})));
  await test(profile,'old pre-cutover marker cannot be read',()=>assertFails(getDoc(ref(one,'attendance/Forged_2026-10-20'))));
  await test(profile,'CAS stale version denied',()=>assertFails(updateDoc(ref(c23,'attendance/P2_2026-10-22'),{attendanceVersion:randomUUID(),attendancePreviousVersion:'wrong'})));
  await test(profile,'CAS correct version obeys profile mode',()=>expect(updateDoc(ref(c23,'attendance/P2_2026-10-22'),{attendanceVersion:randomUUID(),attendancePreviousVersion:'attendance-version-initial-0001'})));
  await test(profile,'CS1 alias CAS normalization obeys mode',()=>expect(updateDoc(ref(one,'attendance/Legacy_2026-10-22'),{branch:'CS1',attendanceVersion:randomUUID(),attendancePreviousVersion:'legacy-alias-version-0001'})));
  await test(profile,'profile transfer cannot rewrite historical branch',async()=>{await env.withSecurityRulesDisabled(c=>updateDoc(ref(c.firestore(),'profiles/P2'),{branch:'CS3'}));await assertFails(updateDoc(ref(c23,'attendance/P2_2026-10-22'),{attendanceVersion:randomUUID(),attendancePreviousVersion:'attendance-version-initial-0001',branch:'CS3'}))});
  await test(profile,'10 authorized branches use canonical order and chosen default',async()=>{
   await updateDoc(doc(admin,'clubs','A','settings','main_config'),{branchCount:10});
   const branches=Array.from({length:10},(_,i)=>'CS'+(i+1)),data={...acl(branches,'CS10'),assignmentVersion:randomUUID(),assignmentPreviousVersion:'absent'},b=writeBatch(admin);
   b.set(ref(admin,'coaches/ten'),data);b.set(doc(admin,'users','ten'),data);b.set(doc(admin,'clubs','A'),{coachAclEpoch:increment(1)},{merge:true});await assertSucceeds(b.commit());
   await updateDoc(doc(admin,'clubs','A','settings','main_config'),{branchCount:3});
  });
  await test(profile,'10 distinct Coach CAS writes fit Rules access and expression limits',async()=>{
   await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=writeBatch(db);for(let i=0;i<10;i++)b.set(ref(db,'profiles/Batch'+i),{branch:'CS2',status:'active'});await b.commit()});
   const transact=()=>runTransaction(c23,async tx=>{const refs=Array.from({length:10},(_,i)=>ref(c23,'attendance/Batch'+i+'_2026-10-25'));for(const r of refs)await tx.get(r);for(let i=0;i<refs.length;i++)tx.set(refs[i],{...good('Batch'+i,'CS2'),date:'2026-10-25'})},{maxAttempts:3});
   await expect(transact());
  });

 }finally{await env.cleanup()}
}
if(process.env.A6_OUTPUT){fs.mkdirSync(process.env.A6_OUTPUT,{recursive:true});fs.writeFileSync(process.env.A6_OUTPUT+'/rules.json',JSON.stringify({results,productionWrites:0,syntheticHistoryOnly:true},null,2))}
console.log('A6 RULES '+results.filter(r=>r.status==='PASS').length+'/'+results.length);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
