import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
// Test driver only: actual existing journal + CAS service, native tabs and local Emulator.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
const {chromium}=loadPlaywright();
const root=process.cwd(),projectId='demo-v11r1-cas-idb',club='r1',out=path.resolve('handoff/V11R1/evidence/cas-idb');fs.mkdirSync(out,{recursive:true});
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'').split(':');assert(host&&port);
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:fs.readFileSync('firestore.rules','utf8')}});
const imports={};for(const name of ['@firebase/app','@firebase/firestore','@firebase/util','@firebase/component','@firebase/logger','idb','re2js']){const p=JSON.parse(fs.readFileSync('node_modules/'+name+'/package.json'));imports[name]='/vendor/'+name+'/'+p.module.replace(/^\.\//,'');}for(const n of ['bloom','webchannel'])imports['@firebase/webchannel-wrapper/'+n+'-blob']='/vendor/@firebase/webchannel-wrapper/dist/'+n+'-blob/esm/'+n+'_blob_es2018.js';
const html='<!doctype html><script type="importmap">'+JSON.stringify({imports})+'</script><title>CAS journal Emulator test</title>';
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const vendor=u.pathname.startsWith('/vendor/'),base=vendor?path.resolve(root,'node_modules'):root,file=path.resolve(base,'.'+(vendor?u.pathname.slice(7):u.pathname));if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;const results=[];
const admin=env.authenticatedContext('Admin').firestore();
const serverDoc=async rec=>{const snap=await sdk.getDoc(sdk.doc(admin,'clubs',club,'attendance',rec.docId));return snap.exists()?{docId:snap.id,status:snap.data().status,version:snap.data().attendanceVersion}:null};
async function open(context,uid='CoachA'){
 const page=await context.newPage();await page.goto(origin);
 await page.evaluate(async({projectId,port,club,uid})=>{
  const a=await import('@firebase/app'),s=await import('@firebase/firestore');const db=s.initializeFirestore(a.initializeApp({projectId,apiKey:'demo',appId:'demo'},crypto.randomUUID()),{experimentalForceLongPolling:true});s.connectFirestoreEmulator(db,'127.0.0.1',port,{mockUserToken:{sub:uid,user_id:uid}});
  window.userRole='coach';window.coachBranch='CS1';window.currentClubId=club;window.__store={db,clubId:club,currentClubId:club,userRole:'coach',coachBranch:'CS1',currentUser:{uid}};window.__verifiedAuthContextState={ready:true,uid,role:'coach',clubId:club,coachBranch:'CS1',generation:1};window.scope={...__verifiedAuthContextState};
  window.trace={attempts:0,reads:0,writes:0,commits:[],hook:null};window._fb_init={...s,runTransaction:async(db,fn,options)=>{const n=++trace.attempts;await trace.hook?.('before',n);let writes=0;const result=await s.runTransaction(db,tx=>fn({get(...a){trace.reads++;return tx.get(...a)},set(...a){trace.writes++;writes++;return tx.set(...a)}}),options);trace.commits.push({n,writes});await trace.hook?.('after',n);return result}};
  await import('/js/core/branchIdentity.js');window.j=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;window.service=(await import('/js/services/attendance.service.js')).AttendanceService;
  window.record=(i,date,status=1,baseVersion='absent',shiftId='')=>({clubId:club,docId:'P'+i+'_'+date+(shiftId?'_'+shiftId:''),profileId:'P'+i,name:'P'+i,date,month:date.slice(0,7),branch:'CS1',status,baseVersion,operation:status===0?'delete':'set',shiftId,shiftMode:shiftId?'explicit-shift':'legacy-no-shift'});
  // Mirrors the existing worker's public API contract; this is not product code.
  window.testDrain=async()=>{let iterations=0;while(iterations++<500){const claims=await j.claim(scope,'test-tab-'+uid,10);if(!claims.length)break;try{const result=await service.bulkSyncOffline(club,'',claims);await j.acknowledge(claims,result.acknowledgedIds)}catch(error){await j.acknowledge(claims,error.acknowledgedIds||[]);await j.release(claims,error);return {error:error.code||error.message}}}return {error:null}};
 },{projectId,port:Number(port),club,uid});return page;
}
async function check(name,fn){const actual=await fn();results.push({name,expected:'no overwrite, exact UUID/claim ACK and retained journal',actual,status:'PASS'});console.log('PASS',name)}
async function rows(page,date){return page.evaluate(async date=>(await j.list(scope)).filter(x=>x.record.date===date).map(x=>({id:x.id,docId:x.record.docId,status:x.record.status,state:x.state,base:x.baseVersion,dependsOn:x.dependsOn})),date)}
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=sdk.writeBatch(db);for(const [uid,role]of [['CoachA','coach'],['CoachB','coach'],['Admin','admin']])b.set(sdk.doc(db,'users',uid),{clubId:club,role,branch:'CS1',status:'active'});for(let i=0;i<400;i++)b.set(sdk.doc(db,'clubs',club,'profiles','P'+i),{branch:'CS1',status:'active'});await b.commit()});
 browser=await chromium.launch({executablePath:browserExecutable(),headless:true,args:['--no-sandbox']});const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const a=await open(context),b=await open(context,'CoachB'),same=await open(context);
 for(const [index,n]of [1,10,11,21,40,400].entries())await check('native journal / CAS drain '+n+' intents',async()=>{
  const date='2026-10-0'+(index+1),saved=await a.evaluate(async({n,date})=>j.enqueue(Array.from({length:n},(_,i)=>record(i,date)),scope),{n,date});
  const before=await a.evaluate(()=>trace.reads);assert.deepEqual(await a.evaluate(()=>testDrain()),{error:null});const after=await rows(a,date);assert.equal(after.length,n);assert(after.every(x=>x.state==='acked'));for(const row of saved){const doc=await serverDoc(row.record);assert.equal(doc.version,row.id);assert.equal(doc.status,1)}return {count:n,states:{acked:n},transactionDocumentReads:await a.evaluate(()=>trace.reads)-before,server:(await serverDoc(saved.at(-1).record))};
 });
 await check('commit 1 PASS, commit 2 FAIL; newer server status survives retry',async()=>{
  const date='2026-10-07',saved=await a.evaluate(async date=>{trace.attempts=0;trace.hook=(stage,n)=>{if(stage==='before'&&n===2)throw Object.assign(Error('second commit unavailable'),{code:'unavailable'})};return j.enqueue(Array.from({length:11},(_,i)=>record(i,date)),scope)},date);
  assert.equal((await a.evaluate(()=>testDrain())).error,'unavailable');const partial=await rows(a,date);assert.equal(partial.filter(x=>x.state==='acked').length,10);assert.equal(partial.filter(x=>x.state==='pending').length,1);
  const [newer]=await b.evaluate(async({date,base})=>j.enqueue([record(0,date,2,base)],scope),{date,base:saved[0].id});await b.evaluate(()=>testDrain());await a.evaluate(()=>{trace.hook=null;return testDrain()});
  const doc=await serverDoc(saved[0].record);assert.equal(doc.status,2);assert.equal(doc.version,newer.id);assert((await rows(a,date)).every(x=>x.state==='acked'));return {partial,server:doc};
 });
 await check('lost ACK then newer V3 intent: stale pending becomes conflict, never ACK',async()=>{
  const date='2026-10-08',[old]=await a.evaluate(async date=>{trace.attempts=0;trace.hook=(stage,n)=>{if(stage==='after'&&n===1)throw Object.assign(Error('ACK lost'),{code:'unavailable'})};return j.enqueue([record(0,date)],scope)},date);
  assert.equal((await a.evaluate(()=>testDrain())).error,'unavailable');assert.equal((await rows(a,date))[0].state,'pending');assert.equal((await serverDoc(old.record)).version,old.id);
  const [newer]=await b.evaluate(async({date,base})=>j.enqueue([record(0,date,2,base)],scope),{date,base:old.id});await b.evaluate(()=>testDrain());
  const result=await a.evaluate(()=>{trace.hook=null;return testDrain()});assert.equal(result.error,'attendance/intent-conflict');assert.equal((await rows(a,date))[0].state,'conflict');const doc=await serverDoc(old.record);assert.equal(doc.status,2);assert.equal(doc.version,newer.id);return {journal:await rows(a,date),server:doc};
 });
 await check('lost ACK without concurrent edit: UUID recovered with zero additional write',async()=>{
  const date='2026-10-09',[old]=await a.evaluate(async date=>{trace.attempts=0;trace.hook=(stage,n)=>{if(stage==='after'&&n===1)throw Object.assign(Error('ACK lost'),{code:'unavailable'})};return j.enqueue([record(0,date)],scope)},date);await a.evaluate(()=>testDrain());
  const writes=await a.evaluate(()=>trace.writes);await a.evaluate(()=>{trace.hook=null;return testDrain()});assert.equal(await a.evaluate(()=>trace.writes),writes);assert.equal((await rows(a,date))[0].state,'acked');return {journal:await rows(a,date),server:await serverDoc(old.record),retryWrites:0};
 });
 await check('double click, reversed replay attempt, status=0 tombstone, shift/date identity',async()=>{
  const date='2026-10-10',otherDate='2026-10-11';const first=await a.evaluate(async date=>(await j.enqueue([record(0,date)],scope))[0],date);
  const second=await same.evaluate(async date=>(await j.enqueue([record(0,date,0)],scope))[0],date);assert.equal(second.dependsOn,first.id);
  const claims=await same.evaluate(()=>j.claim(scope,'reverse',10));assert.equal(claims[0].id,first.id);await same.evaluate(async claims=>{const r=await service.bulkSyncOffline(scope.clubId,'',claims);await j.acknowledge(claims,r.acknowledgedIds)},claims);await a.evaluate(()=>testDrain());
  const doc=await serverDoc(first.record);assert.equal(doc.status,0);assert.equal(doc.version,second.id);
  const others=await a.evaluate(async date=>j.enqueue([record(0,date,1,'absent','S1'),record(0,date,2,'absent','S2')],scope),otherDate);await a.evaluate(()=>testDrain());for(const row of others)assert.equal((await serverDoc(row.record)).version,row.id);return {tombstone:doc,distinctShiftTargets:others.map(x=>x.record.docId),journal:await rows(a,date)};
 });
 await check('different UID tabs own independent rows; CAS rejects concurrent stale base',async()=>{
  const date='2026-10-12',ra=await a.evaluate(async date=>(await j.enqueue([record(0,date)],scope))[0],date),rb=await b.evaluate(async date=>(await j.enqueue([record(0,date,2)],scope))[0],date);assert.equal(rb.dependsOn,'');
  assert.equal((await b.evaluate(()=>j.list(scope))).some(x=>x.id===ra.id),false);await a.evaluate(()=>testDrain());assert.equal((await b.evaluate(()=>testDrain())).error,'attendance/intent-conflict');assert.equal((await serverDoc(ra.record)).version,ra.id);assert.equal((await rows(b,date))[0].state,'conflict');return {CoachA:await rows(a,date),CoachB:await rows(b,date),server:await serverDoc(ra.record)};
 });
 await context.close();
}catch(error){results.push({name:'test failure',status:'FAIL',actual:error.stack});throw error}finally{
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({command:process.argv.join(' '),environment:'local demo Emulator + real Chromium tabs + native IndexedDB + existing service',schema:'unchanged V3',sourceHashes:Object.fromEntries(['js/data/attendanceJournal.js','js/services/attendance.service.js','js/modules/attendance.js','firestore.rules'].map(p=>[p,sha(p)])),results},null,2));await browser?.close();await env.cleanup();await new Promise(r=>server.close(r));
}
console.log('V11R1 CAS IDB MATRIX PASS',results.length);
