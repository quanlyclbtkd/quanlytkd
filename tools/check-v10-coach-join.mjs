import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sdk,rulesTest,createRuntime,until,save,sourceHash} from './v10/runtime.mjs';
const host=process.env.FIRESTORE_EMULATOR_HOST;assert.match(host||'',/^(127\.0\.0\.1|localhost):\d+$/);
const [hostname,port]=host.split(':');
const env=await rulesTest.initializeTestEnvironment({projectId:'demo-coach-v10',firestore:{host:hostname,port:Number(port),rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});
const red=process.env.V10_EXPECT_BLOCKED==='1',rows=[];
try{
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore(),batch=sdk.writeBatch(db);
    for(const branch of ['CS1','CS2']){
      const club='v10-'+branch;
      batch.set(sdk.doc(db,'users',club),{clubId:club,role:'coach',branch,status:'active'});
      batch.set(sdk.doc(db,'clubs',club,'settings','shifts'),{list:[]});
      for(let i=0;i<36;i++)batch.set(sdk.doc(db,'clubs',club,'profiles','F'+i),{branch:branch==='CS1'&&i%2?'Mặc định':branch,status:'active',trainingDays:[],admissionDate:'2026-01-01'});
    }await batch.commit();
  });
  const r=await createRuntime();
  for(const branch of ['CS1','CS2']){
    const club='v10-'+branch,db=env.authenticatedContext(club).firestore();await r.auth(db,{uid:club,club,branch});
    r.listener.mountActiveProfilesListener({clubId:club,role:'coach',coachBranch:branch,profRef:sdk.collection(db,'clubs',club,'profiles'),db});
    await until(()=>r.listener.getProfilesListenerMetrics().coachRosterReadiness==='verified','server roster');
    await r.api.renderDailyFromRam('v10-join');assert.equal(Object.keys(window.__store.profiles).length,36);
    const toggle=await window.toggleAttendance(0),bulk=await window.bulkCheckIn();
    if(red){assert.equal(toggle?.blocked,true);assert.equal(bulk?.blocked,true);assert.equal(r.batches.length,0);rows.push({branch,expected:'RED_REPRODUCED',firstFalse:'METRICS_CLUB_MATCH',writers:0});continue;}
    const m=r.listener.getProfilesListenerMetrics();assert.equal(m.clubId,club);assert.equal(m.authorityClubId,'');
    const data=await sdk.getDocs(sdk.query(sdk.collection(db,'clubs',club,'attendance'),sdk.where('branch','==',branch)));
    assert.equal(data.size,36);assert(data.docs.every(d=>d.data().status===1));
    const positives=r.batches.map(b=>b.count);const negative=[];
    for(const [name,mutate] of [
      ['cache-primary',m=>({...m,coachPrimaryServerSeen:false,coachRosterReadiness:'pending'})],
      ['cache-alias',m=>({...m,coachLegacyServerSeen:false,coachRosterReadiness:'pending'})],
      ['provisional',m=>({...m,coachRosterReadiness:'provisional'})],['pending',m=>({...m,coachRosterReadiness:'pending'})],
      ['wrong-epoch',m=>({...m,authoritySessionEpoch:99})],['wrong-uid',m=>({...m,activeOwnerUid:'other'})],
      ['wrong-club',m=>({...m,clubId:'other'})],['wrong-role',m=>({...m,role:'admin'})],['wrong-branch',m=>({...m,coachBranch:branch==='CS1'?'CS2':'CS1'})],
      ['missing-slot',m=>({...m,activeListenerKey:''})],['failed-slot',m=>({...m,coachPrimaryFailed:true})]
    ]){
      if(branch==='CS2'&&name==='cache-alias')continue;
      const before=r.batches.length;window.getProfilesListenerMetrics=()=>mutate(r.listener.getProfilesListenerMetrics());
      assert.equal((await window.toggleAttendance(0))?.blocked,true);assert.equal((await window.bulkCheckIn())?.blocked,true);assert.equal(r.batches.length,before);negative.push(name);
    }
    window.getProfilesListenerMetrics=r.listener.getProfilesListenerMetrics;
    // Existing journal + real service, no alternate offline writer.
    Object.defineProperty(navigator,'onLine',{value:false,configurable:true});
    await window.toggleAttendance(0);assert.equal(r.storage.size,1);
    Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
    const ack=await window.syncOfflineAttendance();assert.equal(r.storage.size,0);assert.equal(ack.pending,0);
    rows.push({branch,status:'PASS_ACTUAL_JOIN',profiles:36,onlineCommitSizes:positives,negativeControls:negative,offlinePendingAfterAck:0});
    r.listener.resetProfilesListeners('branch-done');r.registry.cleanupAllListeners('branch-done');
  }
}finally{await env.cleanup();save(red?'COACH_JOIN_RED.json':'COACH_JOIN_GREEN.json',{source:sourceHash('js/listeners/profiles.listeners.js'),red,rows,environment:'Node actual modules + synthetic DOM + authenticated Firestore Emulator, not physical phone'});}
console.log('V10 COACH JOIN',red?'RED_CONFIRMED':'PASS',JSON.stringify(rows));
