// Actual attendance UI/service + native IndexedDB. Controlled storage/SDK
// failures reproduce lifecycle races without using any live project.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
const root=process.cwd(),out=process.env.A5_OUTPUT||'handoff/A5/evidence';fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https:[^>]*>/gi,'');
const nativeJournal=fs.readFileSync('js/data/attendanceJournal.js','utf8');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('content-type',url.pathname==='/'?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript');
 if(url.pathname==='/'){res.end(html);return}
 if(url.pathname==='/js/data/attendanceJournal.js'){res.end(`import {AttendanceJournal as j} from './attendanceJournal.native.js';export const AttendanceJournal=Object.freeze({...j,enqueue(...args){return window.__qa.enqueueHook?window.__qa.enqueueHook(()=>j.enqueue(...args),args):j.enqueue(...args)},list(...args){return window.__qa.listHook?window.__qa.listHook(()=>j.list(...args),args):j.list(...args)}});`);return}
 if(url.pathname==='/js/data/attendanceJournal.native.js'){res.end(nativeJournal);return}
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 try{res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),browser=await pw.chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
const results=[];
async function open(){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  window.__qa={online:false,records:[],writes:[],reads:0,metadata:{fromCache:false,hasPendingWrites:false},shifts:[{id:'S1',name:'Chiều'}],enqueueHook:null,historyHook:null,queued:[],history:[],notices:[]};
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>__qa.online});
  window.__store={db:{},clubId:'A',currentClubId:'A',userRole:'admin',currentUser:{uid:'Admin'},profiles:{Alice:{branch:'CS1',status:'active',displayName:'Alice'},Bob:{branch:'CS1',status:'active',displayName:'Bob'}},clubConfig:{branchCount:1},clubData:{}};
  window.__verifiedAuthContextState={uid:'Admin',role:'admin',clubId:'A',ready:true,generation:1};window.userRole='admin';window.currentClubId='A';window.coachBranch='';
  const snap=data=>({exists:()=>!!data,data:()=>data,metadata:{...__qa.metadata}});
  const querySnap=rows=>({docs:rows.map(row=>({id:row.id,data:()=>row.data})),size:rows.length,metadata:{fromCache:false,hasPendingWrites:false},forEach(fn){this.docs.forEach(fn)}});
  window.__qa.querySnap=querySnap;
  window._fb_init={doc:(_db,...parts)=>parts.join('/'),collection:(_db,...parts)=>parts.join('/'),where:(field,op,value)=>({field,op,value}),limit:value=>({limit:value}),startAfter:cursor=>({cursor}),query:(collection,...constraints)=>({collection,constraints}),
   getDoc:async()=>{__qa.reads++;return snap(__qa.shifts===null?null:{list:__qa.shifts})},
   getDocs:async query=>{
    __qa.reads++;if(query.constraints.some(x=>x.field==='profileId')&&__qa.historyHook)return __qa.historyHook(query);
    if(query.collection.endsWith('attendanceNotes'))return querySnap([]);
    return querySnap(__qa.records.filter(row=>query.constraints.filter(x=>x.field).every(x=>x.op==='in'?x.value.includes(row.data[x.field]):row.data[x.field]===x.value)));
   },
   runTransaction:async(_db,fn)=>{
    const writes=[];const result=await fn({get:async ref=>{__qa.reads++;const row=__qa.records.find(x=>x.id===ref.split('/').at(-1));await __qa.transactionReadHook?.();return snap(row?.data)},set:(ref,data)=>writes.push({id:ref.split('/').at(-1),data})});
    for(const row of writes){__qa.records=__qa.records.filter(x=>x.id!==row.id);__qa.records.push(row);__qa.writes.push(row)}return result;
   }};
  window.showToast=text=>__qa.notices.push(String(text));window.getLocalToday=()=> '2026-10-20';window.confirm=()=>true;window.getBranchNameDisplay=x=>x;
  await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');RoleReadBoundary.setContext({role:'admin',clubId:'A'});(await import('/js/core/globalOwnershipRegistry.js')).initGlobalOwnershipRegistry();
  document.querySelector('.app-container').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('tab_attendance').classList.add('active');document.getElementById('att_sub_month').style.display='none';document.getElementById('att_date').value='2026-10-20';document.getElementById('att_belt').value='all';document.getElementById('chk_show_all_att').checked=true;
  __qa.journal=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;__qa.service=(await import('/js/services/attendance.service.js')).AttendanceService;__qa.api=(await import('/js/modules/attendance.js')).initAttendance();
  await window.syncOfflineAttendance();await __qa.api.ensureShiftsLoaded({force:true});document.getElementById('att_shift').value='S1';await __qa.api.requestDailyRefresh('a5-setup',{force:true});
 });
 return {context,page};
}
async function check(name,fn){const {context,page}=await open();try{await fn(page);results.push({name,status:'PASS'});console.log('PASS '+name)}catch(error){results.push({name,status:'FAIL',error:error.stack});console.log('FAIL '+name+' '+error.message)}finally{await context.close()}}
const deferEnqueue=page=>page.evaluate(()=>{__qa.enqueueHook=(run,args)=>new Promise((resolve,reject)=>__qa.queued.push({run,args,resolve,reject}));window.__first=window.toggleAttendance('Alice')});
try{
 for(const [name,metadata,shifts,code]of [
  ['cached empty shifts cannot authorize legacy writes',{fromCache:true,hasPendingWrites:false},[],'attendance/shift-config-unverified'],
  ['pending shifts cannot authorize legacy writes',{fromCache:false,hasPendingWrites:true},[],'attendance/shift-config-unverified'],
  ['malformed shifts cannot silently become an empty list',{fromCache:false,hasPendingWrites:false},{bad:true},'attendance/shift-config-invalid'],
  ['duplicate shift identities are rejected',{fromCache:false,hasPendingWrites:false},[{id:'S1'},{id:'S1'}],'attendance/shift-config-invalid']
 ])await check(name,async page=>{
  const result=await page.evaluate(async({metadata,shifts})=>{Object.assign(__qa,{metadata,shifts});try{await __qa.api.ensureShiftsLoaded({force:true});return {error:null,authority:__qa.api.getShiftAuthority()}}catch(e){return {error:e.code,authority:__qa.api.getShiftAuthority()}}},{metadata,shifts});
  assert.equal(result.error,code);assert.equal(result.authority.status,'error');assert.equal(result.authority.configured,null);
 });
 await check('confirmed absent settings still support the legacy no-shift club',async page=>{
  const state=await page.evaluate(async()=>{__qa.shifts=null;await __qa.api.ensureShiftsLoaded({force:true});return __qa.api.resolveShiftAuthority()});assert.equal(state.allowed,true);assert.equal(state.mode,'legacy-no-shift');
 });
 await check('late enqueue failure cannot roll back a different date',async page=>{
  await deferEnqueue(page);await page.waitForFunction(()=>__qa.queued.length===1);
  await page.evaluate(async()=>{__qa.records.push({id:'Alice_2026-10-21_S1',data:{profileId:'Alice',name:'Alice',branch:'CS1',date:'2026-10-21',month:'2026-10',shiftId:'S1',status:3,attendanceVersion:'server-new'}});document.getElementById('att_date').value='2026-10-21';await __qa.api.requestDailyRefresh('date-change',{force:true});});
  assert.equal(await page.evaluate(()=>currentAttendanceData.Alice),3);
  await page.evaluate(async()=>{__qa.queued[0].reject(Object.assign(Error('storage full'),{code:'QuotaExceededError'}));await __first});assert.equal(await page.evaluate(()=>currentAttendanceData.Alice),3);
 });
 await check('two failed rapid taps leave no phantom attendance',async page=>{
  await deferEnqueue(page);await page.evaluate(()=>{window.__second=window.toggleAttendance('Alice')});await page.waitForFunction(()=>__qa.queued.length===2);
  await page.evaluate(async()=>{__qa.queued[0].reject(Error('storage failure one'));await __first});assert.equal(await page.evaluate(()=>currentAttendanceData.Alice),2,'newer tap must remain projected while it is saving');
  await page.evaluate(async()=>{__qa.queued[1].reject(Error('storage failure two'));await __second});assert.equal(await page.evaluate(()=>currentAttendanceData.Alice),0);assert.equal(await page.evaluate(async()=>(await __qa.journal.list(__verifiedAuthContextState)).length),0);
 });
 await check('older successful save survives a newer failed tap',async page=>{
  await deferEnqueue(page);await page.evaluate(()=>{window.__second=window.toggleAttendance('Alice')});await page.waitForFunction(()=>__qa.queued.length===2);
  await page.evaluate(async()=>{const q=__qa.queued[0];q.resolve(await q.run());await __first;__qa.queued[1].reject(Error('second failure'));await __second});
  assert.equal(await page.evaluate(()=>currentAttendanceData.Alice),1);assert.equal(await page.evaluate(async()=>(await __qa.journal.list(__verifiedAuthContextState))[0].record.status),1);
 });
 await check('two successful rapid taps keep journal causality and final server status',async page=>{
  await deferEnqueue(page);await page.evaluate(()=>{window.__second=window.toggleAttendance('Alice')});await page.waitForFunction(()=>__qa.queued.length===2);
  const state=await page.evaluate(async()=>{for(let i=0;i<2;i++){const q=__qa.queued[i];q.resolve(await q.run());await (i?__second:__first)}__qa.enqueueHook=null;__qa.online=true;await syncOfflineAttendance();return {rows:await __qa.journal.list(__verifiedAuthContextState),status:currentAttendanceData.Alice,writes:__qa.writes}});
  assert.equal(state.rows.length,2);assert.equal(state.rows[1].dependsOn,state.rows[0].id);assert(state.rows.every(row=>row.state==='acked'));assert.equal(state.status,2);assert.deepEqual(state.writes.map(row=>row.data.status),[1,2]);
 });
 await check('another tab ACK cannot sever causality of a locally displayed intent',async page=>{
  const state=await page.evaluate(async()=>{await toggleAttendance('Alice');const first=(await __qa.journal.list(__verifiedAuthContextState))[0];const claims=await __qa.journal.claim(__verifiedAuthContextState,'other-tab');const ack=await __qa.service.bulkSyncOffline('A','',claims);await __qa.journal.acknowledge(claims,ack.acknowledgedIds);await toggleAttendance('Alice');const pending=(await __qa.journal.list(__verifiedAuthContextState)).find(x=>x.state==='pending');__qa.online=true;await syncOfflineAttendance();return {first,pending,rows:await __qa.journal.list(__verifiedAuthContextState),status:currentAttendanceData.Alice}});
  assert.equal(state.pending.baseVersion,state.first.id);assert(state.rows.every(row=>row.state==='acked'));assert.equal(state.status,2);
 });
 await check('a server version is not promoted before its matching view is accepted',async page=>{
  await page.evaluate(()=>{let first=true;__qa.listHook=(run,args)=>{if(!first)return run();first=false;return new Promise(resolve=>{__qa.heldList={run,resolve}})};__qa.records=[{id:'Alice_2026-10-20_S1',data:{profileId:'Alice',name:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',status:2,attendanceVersion:'unseen-remote-version'}}];window.__refresh=__qa.api.requestDailyRefresh('remote-refresh',{force:true})});await page.waitForFunction(()=>!!__qa.heldList);
  const state=await page.evaluate(async()=>{await bulkCheckIn();__qa.heldList.resolve(await __qa.heldList.run());await __refresh;const rows=await __qa.journal.list(__verifiedAuthContextState);return {base:rows.find(x=>x.record.name==='Alice').baseVersion,versions:__qa.api.getDailyState().serverVersionCount}});
  assert.equal(state.base,'absent','unseen query results must not authorize a stale UI mutation');assert.equal(state.versions,0);
 });
 await check('a new branch view cannot write the roster left from the previous branch',async page=>{
  const result=await page.evaluate(async()=>{const branch=document.getElementById('att_branch');branch.add(new Option('CS2','CS2'));branch.value='CS2';const result=await bulkCheckIn();return {result,rows:await __qa.journal.list(__verifiedAuthContextState)}});
  assert.equal(result.result.blocked,true);assert.equal(result.rows.length,0);
 });
 await check('failed first tap cannot become the base of a successful newer tap',async page=>{
  await deferEnqueue(page);await page.evaluate(()=>{window.__second=window.toggleAttendance('Alice')});await page.waitForFunction(()=>__qa.queued.length===2);
  const state=await page.evaluate(async()=>{__qa.queued[0].reject(Error('first failure'));await __first;const q=__qa.queued[1];q.resolve(await q.run());await __second;return {rows:await __qa.journal.list(__verifiedAuthContextState),status:currentAttendanceData.Alice}});
  assert.equal(state.rows.length,1);assert.equal(state.rows[0].baseVersion,'absent');assert.equal(state.rows[0].record.status,2);assert.equal(state.status,2);
 });
 await check('failed bulk enqueue cannot erase a newer single-student edit',async page=>{
  await page.evaluate(()=>{__qa.enqueueHook=(run,args)=>new Promise((resolve,reject)=>__qa.queued.push({run,args,resolve,reject}));window.__bulk=bulkCheckIn();window.__single=toggleAttendance('Alice')});await page.waitForFunction(()=>__qa.queued.length===2);
  const state=await page.evaluate(async()=>{__qa.queued[0].reject(Error('bulk failure'));await __bulk;const waiting={...currentAttendanceData};const q=__qa.queued[1];q.resolve(await q.run());await __single;return {waiting,status:{...currentAttendanceData},rows:await __qa.journal.list(__verifiedAuthContextState)}});
  assert.equal(state.waiting.Alice,2);assert.equal(state.waiting.Bob,0);assert.equal(state.status.Alice,2);assert.equal(state.status.Bob,0);assert.equal(state.rows.length,1);assert.equal(state.rows[0].record.name,'Alice');
 });
 await check('same-session verified shifts remain available offline without extra reads',async page=>{
  const state=await page.evaluate(async()=>{const before=__qa.reads;__qa.metadata={fromCache:true,hasPendingWrites:false};await __qa.api.ensureShiftsLoaded();await toggleAttendance('Alice');return {reads:__qa.reads-before,rows:await __qa.journal.list(__verifiedAuthContextState),authority:__qa.api.getShiftAuthority()}});
  assert.equal(state.reads,0);assert.equal(state.rows[0].state,'pending');assert.equal(state.authority.status,'ready');
 });
 await check('reconnect revalidates changed shifts before claiming offline intents',async page=>{
  const result=await page.evaluate(async()=>{await toggleAttendance('Alice');__qa.shifts=[];const before=__qa.reads;__qa.online=true;window.dispatchEvent(new Event('online'));await syncOfflineAttendance();return {rows:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes,reads:__qa.reads-before}});
  assert.equal(result.writes.length,0);assert.equal(result.rows[0].state,'needs-review');assert.equal(result.reads,1,'one settings read on reconnect; no transaction reads for the invalid intent');
 });
 await check('old history success cannot replace the latest selected student',async page=>{
  await page.evaluate(()=>{__qa.historyHook=q=>new Promise((resolve,reject)=>__qa.history.push({resolve,reject,q}));window.__ha=showAttMemberHistory('Alice','2026-10');window.__hb=showAttMemberHistory('Bob','2026-10')});await page.waitForFunction(()=>__qa.history.length===2);
  await page.evaluate(async()=>{__qa.history[1].resolve(__qa.querySnap([]));await __hb;__qa.history[0].resolve(__qa.querySnap([]));await __ha});assert.match(await page.locator('#attHistBody').textContent(),/Bob/);assert.doesNotMatch(await page.locator('#attHistBody').textContent(),/Alice/);
 });
 await check('old history error cannot replace a newer successful history',async page=>{
  await page.evaluate(()=>{__qa.historyHook=q=>new Promise((resolve,reject)=>__qa.history.push({resolve,reject,q}));window.__ha=showAttMemberHistory('Alice','2026-10');window.__hb=showAttMemberHistory('Bob','2026-10')});await page.waitForFunction(()=>__qa.history.length===2);
  await page.evaluate(async()=>{__qa.history[1].resolve(__qa.querySnap([]));await __hb;__qa.history[0].reject(Error('late unavailable'));await __ha});assert.match(await page.locator('#attHistBody').textContent(),/Bob/);
 });
 await check('principal reset removes the history modal and its previous content',async page=>{
  await page.evaluate(()=>showAttMemberHistory('Alice','2026-10'));assert.equal(await page.locator('#attHistModal').count(),1);await page.evaluate(()=>__qa.api.resetForClub('A'));assert.equal(await page.locator('#attHistModal').count(),0);
 });
 await check('late history after principal reset cannot recreate prior-user content',async page=>{
  await page.evaluate(()=>{__qa.historyHook=q=>new Promise(resolve=>__qa.history.push({resolve,q}));window.__ha=showAttMemberHistory('Alice','2026-10')});await page.waitForFunction(()=>__qa.history.length===1);
  await page.evaluate(async()=>{__qa.api.resetForClub('A');__verifiedAuthContextState={...__verifiedAuthContextState,uid:'Other',generation:2};__store.currentUser={uid:'Other'};__qa.history[0].resolve(__qa.querySnap([]));await __ha});assert.equal(await page.locator('#attHistModal').count(),0);
 });
 await check('repeated server inspection rebases against the latest displayed version',async page=>{
  await page.evaluate(async()=>{await __qa.journal.enqueue([{version:3,clubId:'A',name:'Alice',profileId:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',shiftMode:'explicit-shift',docId:'Alice_2026-10-20_S1',status:1,operation:'set',baseVersion:'absent'}],__verifiedAuthContextState);__qa.records=[{id:'Alice_2026-10-20_S1',data:{profileId:'Alice',name:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',status:2,attendanceVersion:'version-one'}}];await __qa.api.openPendingReview()});
  const inspect=page.getByRole('button',{name:'Xem máy chủ để đối soát',exact:true});await inspect.click();await page.getByRole('button',{name:'Áp dụng trạng thái trên thiết bị',exact:true}).waitFor();
  await page.evaluate(()=>{__qa.records[0].data.attendanceVersion='version-two'});await inspect.click();await page.getByRole('button',{name:'Áp dụng trạng thái trên thiết bị',exact:true}).click();
  const rows=await page.evaluate(async()=>__qa.journal.list(__verifiedAuthContextState));assert.equal(rows.find(x=>x.reviewedFrom)?.baseVersion,'version-two');assert.equal(await page.evaluate(()=>__qa.writes.length),0);
 });
 await check('invalid queued record does not block independent valid intents',async page=>{
  const state=await page.evaluate(async()=>{const rec=name=>({version:3,clubId:'A',name,profileId:name,branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',shiftMode:'explicit-shift',docId:name+'_2026-10-20_S1',status:1,operation:'set',baseVersion:'absent'});await __qa.journal.enqueue([{...rec('Invalid'),date:'bad'},rec('Alice'),rec('Bob')],__verifiedAuthContextState);__qa.online=true;await syncOfflineAttendance();return {rows:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes}});
  assert.equal(state.rows.find(x=>x.record.name==='Invalid').state,'needs-review');assert.equal(state.rows.filter(x=>x.state==='acked').length,2);assert.equal(state.writes.length,2);
 });
 await check('store principal changing during a CAS read cannot authorize a write',async page=>{
  const result=await page.evaluate(async()=>{__qa.transactionReadHook=()=>{__store.currentUser={uid:'Other'}};try{await __qa.service.bulkSaveRecords([{id:crypto.randomUUID(),baseVersion:'absent',record:{clubId:'A',docId:'Alice_2026-10-20_S1',name:'Alice',profileId:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',shiftMode:'explicit-shift',status:1}}]);return {error:null,writes:__qa.writes.length}}catch(e){return {error:e.code,writes:__qa.writes.length}}});assert.equal(result.error,'attendance/stale-bulk-context');assert.equal(result.writes,0);
 });
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'attendance-lifecycle.json'),JSON.stringify({scope:'Actual maintenance Admin UI, native IDB, controlled SDK/storage failures; no live or physical-device acceptance',results},null,2))}
console.log('A5 ATTENDANCE LIFECYCLE '+results.filter(x=>x.status==='PASS').length+'/'+results.length+' PASS');if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
