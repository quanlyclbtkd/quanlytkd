// Actual browser Firebase 10.7.1 + actual AttendanceService + local Rules.
// This complements the Node SDK and fault-injected native Journal suites.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(endpoint,/^127\.0\.0\.1:\d+$/);
const [host,port]=endpoint.split(':'),projectId='demo-a9r13-sdk10',club='CLB_TEST',date='2026-10-24';
const rules=fs.readFileSync('firestore.rules','utf8'),root=process.cwd(),results=[];
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules}});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html><body>Isolated SDK test</body></html>');return;}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try {let text=fs.readFileSync(file,'utf8');if(file.endsWith('/firebase-firestore.js'))text=text.replaceAll('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js','./firebase-app.js');res.setHeader('content-type','text/javascript');res.end(text);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
const page=await browser.newPage(),network=[];
page.on('request',request=>{if(request.url().includes('127.0.0.1:'+port))network.push({method:request.method(),path:new URL(request.url()).pathname});});
try {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore(),b=sdk.writeBatch(db),acl={role:'coach',clubId:club,status:'active',branch:'CS1',coachBranch:'CS1',defaultBranch:'CS1',allowedBranches:['CS1','CS2'],assignmentVersion:'a9r13-sdk10-assignment'};
  b.set(sdk.doc(db,'clubs',club),{coachAclEpoch:1});b.set(sdk.doc(db,'clubs',club,'settings','main_config'),{branchCount:2});
  b.set(sdk.doc(db,'users','coach'),acl);b.set(sdk.doc(db,'clubs',club,'coaches','coach'),acl);
  for(const name of ['Alice','Bob','Legacy'])b.set(sdk.doc(db,'clubs',club,'profiles',name),{branch:'CS1',status:'active'});
  for(const name of ['Alice','Legacy'])b.set(sdk.doc(db,'clubs',club,'attendance',name+'_'+date+'_S1'),{name,profileId:name,date,month:'2026-10',shiftId:'S1',branch:'CS1',status:1,historyAuthority:name==='Alice'?HISTORY_AUTHORITY:'old-history',attendanceVersion:'initial-version-000001'});
  await b.commit();
 });
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(origin);
 await page.evaluate(async({projectId,port,club,date})=>{
  const appSDK=await import('/tools/a9r13/vendor/firebase-10.7.1/firebase-app.js');
  const sdk=await import('/tools/a9r13/vendor/firebase-10.7.1/firebase-firestore.js');
  const app=appSDK.initializeApp({projectId,apiKey:'demo-sdk10-key',appId:'demo-sdk10-app'});
  const db=sdk.initializeFirestore(app,{experimentalForceLongPolling:true});
  sdk.connectFirestoreEmulator(db,'127.0.0.1',Number(port),{mockUserToken:{sub:'coach',user_id:'coach'}});
  window._fb_init=sdk;window.__store={db,clubId:club,currentClubId:club,currentUser:{uid:'coach'},userRole:'coach',coachBranch:'CS1'};
  window.userRole='coach';window.coachBranch='CS1';window.currentClubId=club;
  window.__verifiedAuthContextState={uid:'coach',clubId:club,role:'coach',ready:true,generation:1,coachBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2']};
  window.__test={sdk,db,appSDK,club,date,service:(await import('/js/services/attendance.service.js')).AttendanceService};
 },{projectId,port,club,date});
 const cases=await page.evaluate(async()=>{
  const {service,sdk,db,club,date,appSDK}=__test,results=[];
  const attempt=async(title,fn)=>{try{await fn();results.push({title,result:'PASS'});}catch(error){results.push({title,result:'FAIL',code:error.code,message:error.message});}};
  const ensure=(ok,message)=>{if(!ok)throw Error(message);};
  const record=name=>({clubId:club,docId:name+'_'+date+'_S1',name,profileId:name,branch:'CS1',date,month:'2026-10',shiftId:'S1',status:1});
  await attempt('Browser runs the same Firebase SDK 10.7.1 as production',async()=>ensure(appSDK.SDK_VERSION==='10.7.1','SDK version mismatch'));
  await attempt('Real SDK10 individual history CS1 succeeds',async()=>ensure((await service.loadMemberHistory('Alice',['2026-10','2026-11','2026-12'])).length===1,'History count'));
  let first={id:crypto.randomUUID(),baseVersion:'absent',record:record('Bob')};
  await attempt('Real SDK10 BatchGet transaction creates an absent mark',async()=>ensure((await service.bulkSaveRecords([first])).committed===1,'Create ACK'));
  await attempt('Real SDK10 replay of the same intent is idempotent',async()=>ensure((await service.bulkSaveRecords([first])).acknowledgedIds[0]===first.id,'Retry ACK'));
  await attempt('Real SDK10 CAS updates and rejects a stale intent',async()=>{
   const update={id:crypto.randomUUID(),baseVersion:first.id,record:{...first.record,status:2}};await service.bulkSaveRecords([update]);
   let denied=false;try{await service.bulkSaveRecords([{id:crypto.randomUUID(),baseVersion:first.id,record:{...first.record,status:3}}]);}catch(error){denied=error.code==='attendance/intent-conflict';}ensure(denied,'Stale CAS must conflict');
  });
  await attempt('Real SDK10 legacy collision reproduces denied BatchGet without any ACK',async()=>{
   let denied=false;try{await service.bulkSaveRecords([{id:crypto.randomUUID(),baseVersion:'absent',record:record('Legacy')}]);}catch(error){denied=error.code==='permission-denied'&&error.attendanceDiagnostic?.stage==='intent-version-read'&&error.committed===0;}ensure(denied,'Must retain a denied read as permission error');
  });
  await attempt('Real SDK10 Coach finance reads remain denied',async()=>{
   let denied=false;try{await sdk.getDoc(sdk.doc(db,'clubs',club,'transactions','tx1'));}catch(error){denied=error.code==='permission-denied';}ensure(denied,'Finance must remain denied');
  });
  return results;
 });
 results.push(...cases);
} finally {
 await browser.close();await new Promise(r=>server.close(r));await env.cleanup();
 const report={kind:'A9R13_REAL_BROWSER_FIREBASE_10_7_1',projectId,sdkVersion:'10.7.1',rulesSha256:crypto.createHash('sha256').update(rules).digest('hex'),total:results.length,pass:results.filter(x=>x.result==='PASS').length,fail:results.filter(x=>x.result==='FAIL').length,results,network};
 fs.mkdirSync('evidence/A9R13',{recursive:true});fs.writeFileSync('evidence/A9R13/SDK_10_7_1_BROWSER_EMULATOR.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({pass:report.pass,fail:report.fail,total:report.total,results},null,2));if(report.fail||report.total!==7)process.exitCode=1;
}
