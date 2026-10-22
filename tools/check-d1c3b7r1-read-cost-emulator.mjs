#!/usr/bin/env node
// Count actual initial query/listener result documents in a local Emulator.
// Synthetic populations; not production usage, billed telemetry or owner consent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch} from 'firebase/firestore';
const host=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host || '',/^(127\.0\.0\.1|localhost):\d+$/,'Local Emulator required');
const projectId=process.env.GCLOUD_PROJECT || 'demo-b7-coach-proof';
assert.ok(projectId.startsWith('demo-'),'Demo project required');
const [hostname,port]=host.split(':');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const env=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
await env.clearFirestore(); // synthetic per-invocation fixture, no production endpoint
const fixtures={
  1000:{CS1:[200,50,175,75],'Mặc định':[75,25,75,75],CS2:[80,20,50,50],missing:50},
  1500:{CS1:[300,75,262,113],'Mặc định':[112,38,112,113],CS2:[120,30,75,75],missing:75}
};
function serverCount(q) {return new Promise((resolve,reject)=>{
  let stop=()=>{};
  const timeout=setTimeout(()=>{stop();reject(Error('server listener timeout'));},15000);
  stop=onSnapshot(q,{includeMetadataChanges:true},snapshot=>{
    if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)return;
    clearTimeout(timeout);stop();resolve(snapshot.size);
  },error=>{clearTimeout(timeout);stop();reject(error);});
});}
const rows=[];
try {
  for(const size of [1000,1500]) {
    const club=`v9-cost-${size}`;
    const population=[];
    let id=0;
    for(const [branch,counts] of Object.entries(fixtures[size])) {
      if(branch==='missing') {for(let i=0;i<counts;i++)population.push({id:`p${id++}`,status:'active'});continue;}
      for(let j=0;j<4;j++)for(let i=0;i<counts[j];i++)population.push({id:`p${id++}`,branch,...(j===2?(i%2?{status:'Đang tập'}:{}):{status:['active','trial','','quit'][j]})});
    }
    assert.equal(population.length,size);
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(const branch of ['CS1','CS2']){const data={clubId:club,role:'coach',branch,status:'active'};await setDoc(doc(db,`users/${club}-${branch}`),data);await setDoc(doc(db,`clubs/${club}/coaches/${club}-${branch}`),data);}
      await setDoc(doc(db,`clubs/${club}/settings/main_config`),{branchCount:2});
      for(let offset=0;offset<population.length;offset+=400) {
        const batch=writeBatch(db);
        for(const {id,...data} of population.slice(offset,offset+400))batch.set(doc(db,`clubs/${club}/profiles/${id}`),data);
        await batch.commit();
      }
    });
    for(const branch of ['CS1','CS2']) {
      const db=env.authenticatedContext(`${club}-${branch}`).firestore();
      const ref=collection(db,`clubs/${club}/profiles`);
      let oldCount=0,newCount=0;
      for(const slot of branch==='CS1'?['CS1','Mặc định']:['CS2']) {
        const oldQuery=query(ref,where('branch','==',slot),where('status','in',['active','trial']));
        const newQuery=query(ref,where('branch','==',slot));
        const old=(await getDocs(oldQuery)).size,current=await serverCount(newQuery);
        assert.equal(current,population.filter(p=>p.branch===slot).length);
        oldCount+=old;newCount+=current;
      }
      rows.push({population:size,scenario:'mixed',branch,oldStatusFilteredDocs:oldCount,newBranchOnlyDocs:newCount,incrementalInitialResultDocs:newCount-oldCount,listenerSlots:branch==='CS1'?2:1});
    }
    // Extreme case bounds the proposal: every profile belongs to CS1 and quit.
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(let offset=0;offset<population.length;offset+=400) {
        const batch=writeBatch(db);
        for(const p of population.slice(offset,offset+400))batch.set(doc(db,`clubs/${club}/profiles/${p.id}`),{branch:'CS1',status:'quit'});
        await batch.commit();
      }
    });
    const db=env.authenticatedContext(`${club}-CS1`).firestore(),ref=collection(db,`clubs/${club}/profiles`);
    const old=(await getDocs(query(ref,where('branch','==','CS1'),where('status','in',['active','trial'])))).size;
    const current=await serverCount(query(ref,where('branch','==','CS1')));
    assert.equal(old,0);assert.equal(current,size);
    rows.push({population:size,scenario:'all-quit-CS1',branch:'CS1',oldStatusFilteredDocs:old,newBranchOnlyDocs:current,incrementalInitialResultDocs:current-old,listenerSlots:2});
  }
} finally {await env.cleanup();}
const result={schemaVersion:1,kind:'synthetic-real-emulator-result-documents',rulesSha256:sha('firestore.rules'),sourceSha256:sha('js/listeners/profiles.listeners.js'),profilesMeasured1000:true,profilesMeasured1500:true,rows,maxIncrementalInitialDocs:Math.max(...rows.map(r=>r.incrementalInitialResultDocs)),limits:'Result documents only; excludes minimum query charges, dependent Rules reads, index reads, reconnects and ongoing updates. No production measurements.'};
if(process.env.D1C3B7_COST_EVIDENCE_OUTPUT)fs.writeFileSync(process.env.D1C3B7_COST_EVIDENCE_OUTPUT,JSON.stringify(result,null,2)+'\n');
console.log('V9_COST_EVIDENCE '+JSON.stringify(result));
console.log('V9 REAL EMULATOR READ COST: '+rows.length+' scenarios PASS');
