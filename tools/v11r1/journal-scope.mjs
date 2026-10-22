import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
// Real Chromium pages, one origin and native IndexedDB. No Firestore or production I/O.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=loadPlaywright();
const root=path.resolve(process.env.JOURNAL_SOURCE_ROOT||process.cwd());
const source=fs.readFileSync(path.join(root,'js/data/attendanceJournal.js'),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const baseline=process.argv.includes('--baseline');
const out=path.resolve(process.env.V11R1_OUTPUT||'handoff/V11R1/evidence/journal');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Journal isolation test</title>');return;}
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true,args:['--no-sandbox']});
const coach={uid:'CoachA',role:'coach',clubId:'A',coachBranch:'CS1'};
const admin={uid:'AdminA',role:'admin',clubId:'A',coachBranch:''};
const results=[];
async function pageIn(context,scope){
 const page=await context.newPage();await page.goto(origin);
 await page.evaluate(async scope=>{
  window.setTestAuth=scope=>{
   window.userRole=scope.role;window.currentClubId=scope.clubId;window.coachBranch=scope.coachBranch||'';
   window.__store={clubId:scope.clubId,currentClubId:scope.clubId,userRole:scope.role,coachBranch:scope.coachBranch||'',currentUser:{uid:scope.uid}};
   window.__verifiedAuthContextState={...scope,ready:scope.ready!==false,generation:scope.generation||1};
   window.testScope={...scope,authGeneration:scope.generation||1};
  };window.setTestAuth(scope);
  await import('/js/core/branchIdentity.js');
  window.j=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;
  window.rec=(name='PRIVATE-CoachA',status=1)=>({clubId:'A',docId:name+'_2026-10-20',date:'2026-10-20',month:'2026-10',profileId:name,name,branch:'CS1',status,baseVersion:'absent',shiftId:'',shiftMode:'legacy-no-shift'});
  window.dump=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('tst-attendance-journal-v3',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('intents'),q=tx.objectStore('intents').getAll();q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>reject(q.error)}});
  window.inject=rows=>new Promise((resolve,reject)=>{const r=indexedDB.open('tst-attendance-journal-v3',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('intents','readwrite');rows.forEach(row=>tx.objectStore('intents').put(row));tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 },scope);return page;
}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name)}
async function fresh(fn,code=source){const context=await browser.newContext();await context.route('**/js/data/attendanceJournal.js',r=>r.fulfill({body:code,contentType:'text/javascript'}));try{await fn(context)}finally{await context.close()}}
async function foreign(context,owner,visitor,operation){
 const a=await pageIn(context,owner),b=await pageIn(context,visitor);
 const row=await a.evaluate(async()=> (await j.enqueue([rec()],testScope))[0]);
 const before=await a.evaluate(()=>dump());
 const actual=await b.evaluate(async({id,operation})=>{
  try{
   if(operation==='list')return {count:(await j.list(testScope)).length};
   if(operation==='claim')return {count:(await j.claim(testScope,'tab-B')).length};
   if(operation==='keepServer')return {allowed:await j.keepServer(id,testScope)};
   if(operation==='rebase')return {allowed:!!(await j.rebase(id,'server-new',testScope))};
  }catch(e){return {denied:true,code:e.code||'',message:e.message}}
 },{id:row.id,operation});
 return {a,b,before,after:await a.evaluate(()=>dump()),actual};
}
try{
 if(baseline){
  for(const operation of ['list','claim','keepServer','rebase'])await fresh(async context=>{
   const r=await foreign(context,coach,{...admin,uid:'AdminB'},operation);
   const safe=operation==='list'||operation==='claim'?r.actual.count===0:r.actual.denied===true;
   results.push({name:'AdminB_sameClub_CoachA_pending/'+operation,expected:operation==='list'||operation==='claim'?{count:0}:{denied:true},actual:r.actual,mutated:JSON.stringify(r.before)!==JSON.stringify(r.after),status:safe?'PASS':'FAIL'});
  });
  assert.equal(results.filter(r=>r.status==='FAIL').length,3,'baseline must reproduce the three reported vulnerable APIs');
 }else{
  for(const owner of [coach,admin,{...admin,uid:'SuperA',role:'super_admin'}])await check('own V3 lifecycle: '+owner.role,()=>fresh(async context=>{
   const p=await pageIn(context,owner);
   assert.equal(await p.evaluate(async()=>{
    const [a]=await j.enqueue([rec('Own')],testScope);const claims=await j.claim(testScope,'own');
    if(claims[0]?.id!==a.id)return false;await j.release(claims,{code:'unavailable'});
    await j.keepServer(a.id,testScope);
    const [b]=await j.enqueue([rec('Review')],testScope);const rebased=await j.rebase(b.id,'confirmed-version',testScope);
    const c=await j.claim(testScope,'own');return rebased.id!==b.id&&await j.acknowledge(c,c.map(x=>x.id))===1;
   }),true);
  }));
  const visitors=[{...admin,uid:'AdminB'},{...coach,uid:'CoachB'},{...coach,role:'admin',coachBranch:''},{...coach,clubId:'B'},{...coach,coachBranch:'CS2'}];
  for(const visitor of visitors)for(const op of ['list','claim','keepServer','rebase'])await check('foreign isolation '+JSON.stringify(visitor)+' '+op,()=>fresh(async context=>{
   const r=await foreign(context,coach,visitor,op);
   assert(op==='list'||op==='claim'?r.actual.count===0:r.actual.denied===true,JSON.stringify(r.actual));assert.deepEqual(r.after,r.before,'foreign action cannot mutate rows');
  }));
  for(const op of ['list','claim','keepServer','rebase'])await check('Admin B cannot use Admin A '+op,()=>fresh(async context=>{
   const r=await foreign(context,admin,{...admin,uid:'AdminB'},op);assert(op==='list'||op==='claim'?r.actual.count===0:r.actual.denied===true);assert.deepEqual(r.after,r.before);
  }));
  await check('Coach CS1 alias + Admin unrestricted branch within own rows',()=>fresh(async context=>{
   const p=await pageIn(context,coach);
   assert.equal(await p.evaluate(async()=>{await j.enqueue([{...rec('Alias'),branch:'Mặc định'}],testScope);return (await j.claim(testScope,'alias')).length}),1);
   await p.evaluate(scope=>setTestAuth(scope),admin);
   assert.equal(await p.evaluate(async()=>{await j.enqueue([{...rec('Admin-CS2'),branch:'CS2'}],testScope);return (await j.list(testScope)).length}),1);
  }));
  await check('ACK/release cannot cross UID or role; no foreign ACK pruning',()=>fresh(async context=>{
   const a=await pageIn(context,coach),b=await pageIn(context,{...admin,uid:'AdminB'});
   const claims=await a.evaluate(async()=>{await j.enqueue([rec()],testScope);const c=await j.claim(testScope,'A');await inject([{...c[0],id:'foreign-old-ack',state:'acked',ackedAt:0}]);return c});
   const before=await a.evaluate(()=>dump());
   assert.equal(await b.evaluate(c=>j.acknowledge(c,c.map(x=>x.id)),claims),0);await b.evaluate(c=>j.release(c,{code:'unavailable'}),claims);
   assert.deepEqual(await a.evaluate(()=>dump()),before);
  }));
  await check('no cross-principal dependency or child rewrite',()=>fresh(async context=>{
   const a=await pageIn(context,coach),b=await pageIn(context,admin);
   const first=await a.evaluate(async()=> (await j.enqueue([rec()],testScope))[0]);
   const own=await b.evaluate(async()=> (await j.enqueue([rec()],testScope))[0]);assert.equal(own.dependsOn,'');assert.equal(own.baseVersion,'absent');
   await a.evaluate(async other=>{const rows=await dump(),r=rows.find(r=>r.id===other);await inject([{...r,dependsOn:rows.find(r=>r.id!==other).id}])},own.id);
   const before=(await b.evaluate(()=>dump())).find(r=>r.id===own.id);
   await a.evaluate(id=>j.keepServer(id,testScope),first.id);
   assert.deepEqual((await b.evaluate(()=>dump())).find(r=>r.id===own.id),before);
  }));
  await check('legacy/orphan lane is non-writable and does not reveal payload',()=>fresh(async context=>{
   const p=await pageIn(context,coach);
   const result=await p.evaluate(async()=>{
    const raw=JSON.stringify({clubId:'A',date:'2026-10-20',records:{private:rec('LEGACY-PRIVATE')}}),key='offline_att_A_2026-10-20';localStorage.setItem(key,raw);
    await j.importLegacy(testScope);await j.importLegacy(testScope);const [legacy]=await dump();
    await inject([{...legacy,id:'orphan-without-source',legacySource:undefined},{...legacy,id:'legacy-with-principal',principal:{...testScope}}]);
    const before=JSON.stringify(await dump()),summary=await j.legacyReviewSummary(testScope),errors=[];
    for(const row of await dump()){
     for(const method of ['keepServer','rebase']){try{if(method==='keepServer')await j.keepServer(row.id,testScope);else await j.rebase(row.id,'server',testScope);errors.push(method+' accepted')}catch{}}
    }
    const claims=(await dump()).map(r=>({...r,state:'inflight',claimId:'forged'}));
    return {before,after:JSON.stringify(await dump()),summary,rows:await j.list(testScope),claimed:await j.claim(testScope,'legacy'),ack:await j.acknowledge(claims,claims.map(r=>r.id)),errors,rawKept:localStorage.getItem(key)===raw};
   });
   assert.equal(result.before,result.after);assert.deepEqual(result.rows,[]);assert.deepEqual(result.claimed,[]);assert.equal(result.ack,0);assert.equal(result.rawKept,true);assert.deepEqual(result.errors,[]);assert.equal(result.summary.count,3);
   assert(!JSON.stringify(result.summary).includes('PRIVATE'));assert(!JSON.stringify(result.summary).includes('offline_att_'));
  }));
  await check('same principal two tabs: concurrent enqueue, expired lease, stale ACK',()=>fresh(async context=>{
   const a=await pageIn(context,coach),b=await pageIn(context,coach);
   const enqueue=(p,status)=>p.evaluate(async s=>(await j.enqueue([rec('Race',s)],testScope))[0],status);
   const [r1,r2]=await Promise.all([enqueue(a,1),enqueue(b,2)]);assert.notEqual(r1.id,r2.id);
   const all=await a.evaluate(()=>j.list(testScope));assert.equal(all.length,2);assert.equal(all[1].dependsOn,all[0].id);
   const old=await a.evaluate(()=>j.claim(testScope,'A',10,100)),freshClaims=await b.evaluate(()=>j.claim(testScope,'B',10,60200));assert.equal(freshClaims.length,1);
   assert.equal(await a.evaluate(c=>j.acknowledge(c,c.map(x=>x.id)),old),0);
   assert.equal(await b.evaluate(c=>j.acknowledge(c,c.map(x=>x.id)),freshClaims),1);
   assert.equal((await a.evaluate(()=>j.claim(testScope,'A')))[0].id,all[1].id);
  }));
  await check('auth switch while IndexedDB read is awaiting: all APIs fail closed',async()=>{
   for(const action of ['list','claim','keepServer','rebase','acknowledge','release','enqueue','importLegacy','legacyReviewSummary'])await fresh(async context=>{
    const p=await pageIn(context,coach);await p.evaluate(async()=>{await j.enqueue([rec()],testScope);await j.claim(testScope,'A')});
    const result=await p.evaluate(async action=>{
     const rows=await dump(),before=JSON.stringify(rows),scope={...testScope};
     const original=IDBObjectStore.prototype.getAll,desc=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');let once=true;
     IDBObjectStore.prototype.getAll=function(...args){const req=original.apply(this,args);if(once){once=false;Object.defineProperty(req,'onsuccess',{configurable:true,set(fn){desc.set.call(req,event=>{setTestAuth({...scope,uid:'AdminB',role:'admin',generation:2});fn.call(req,event)})}})}return req};
     let rejected=false;try{
      if(action==='list'||action==='legacyReviewSummary')await j[action](scope);
      if(action==='claim')await j.claim(scope,'B');
      if(action==='keepServer')await j.keepServer(rows[0].id,scope);
      if(action==='rebase')await j.rebase(rows[0].id,'latest',scope);
      if(action==='acknowledge')await j.acknowledge(rows,rows.map(r=>r.id));
      if(action==='release')await j.release(rows,{code:'unavailable'});
      if(action==='enqueue')await j.enqueue([rec('New')],scope);
      if(action==='importLegacy')await j.importLegacy(scope);
     }catch(e){rejected=e.code==='attendance/journal-context-changed'}finally{IDBObjectStore.prototype.getAll=original}
     return {rejected,before,after:JSON.stringify(await dump())};
    },action);assert.equal(result.rejected,true,action);assert.equal(result.after,result.before,action);
   });
  });
  await check('caller cannot forge scope or reuse previous generation after logout',()=>fresh(async context=>{
   const p=await pageIn(context,coach);assert.equal(await p.evaluate(async()=>{
    const old={...testScope};setTestAuth({...old,generation:2});let errors=0;
    for(const scope of [old,{...testScope,uid:'AdminA',role:'admin'}])try{await j.list(scope)}catch{errors++}
    __verifiedAuthContextState.ready=false;try{await j.enqueue([rec()],testScope)}catch{errors++}return errors;
   }),3);
  }));
  // This negative control removes exactly the UID condition in the shared V3 predicate.
  const mutant=source.replace('row.principal?.uid===scope.uid &&','');assert.notEqual(mutant,source);
  let caught=false;try{await fresh(async context=>{const r=await foreign(context,admin,{...admin,uid:'AdminB'},'list');assert.equal(r.actual.count,0)},mutant)}catch{caught=true}
  assert(caught,'UID mutation survived the actual IndexedDB API gate');results.push({name:'mutation: shared predicate UID removed',status:'CAUGHT'});
 }
}catch(error){results.push({name:'uncaught test failure',status:'FAIL',actual:error.stack});throw error;}finally{
 const status=baseline?'RED_REPRODUCED':results.some(r=>r.status==='FAIL')?'FAIL':'PASS';
 fs.writeFileSync(path.join(out,baseline?'red.json':'green.json'),JSON.stringify({command:process.argv.join(' '),mode:baseline?'unmodified-baseline':'patched',nativeIndexedDB:true,twoRealPagesSameOrigin:true,sourceSha256:sha('js/data/attendanceJournal.js'),rulesSha256:sha('firestore.rules'),status,results},null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
console.log(baseline?'BASELINE RED REPRODUCED':'JOURNAL SCOPE GREEN',results.length);
