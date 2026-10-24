// Actual attendance UI/service + native IndexedDB. Controlled storage/SDK
// failures reproduce lifecycle races without using any live project.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
const root=process.cwd(),out=process.env.A9R13_OUTPUT||'evidence/A9R13';fs.mkdirSync(out,{recursive:true});
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
  window.showToast=text=>__qa.notices.push(String(text));window.recordRuntimeError=(source,error,extra)=>(__qa.errors||=[]).push({source,code:error.code,extra});window.getLocalToday=()=> '2026-10-20';window.confirm=()=>true;window.getBranchNameDisplay=x=>x;
  await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');RoleReadBoundary.setContext({role:'admin',clubId:'A'});(await import('/js/core/globalOwnershipRegistry.js')).initGlobalOwnershipRegistry();
  document.querySelector('.app-container').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('tab_attendance').classList.add('active');document.getElementById('att_sub_month').style.display='none';document.getElementById('att_date').value='2026-10-20';document.getElementById('att_belt').value='all';document.getElementById('chk_show_all_att').checked=true;
  __qa.journal=(await import('/js/data/attendanceJournal.js')).AttendanceJournal;__qa.service=(await import('/js/services/attendance.service.js')).AttendanceService;__qa.api=(await import('/js/modules/attendance.js')).initAttendance();
  await window.syncOfflineAttendance();await __qa.api.ensureShiftsLoaded({force:true});document.getElementById('att_shift').value='S1';await __qa.api.requestDailyRefresh('a5-setup',{force:true});
 });
 return {context,page};
}
async function check(name,fn){const {context,page}=await open();try{await fn(page);results.push({name,status:'PASS'});console.log('PASS '+name)}catch(error){results.push({name,status:'FAIL',error:error.stack});console.log('FAIL '+name+' '+error.message)}finally{await context.close()}}

async function asCoach(page) {
 await page.evaluate(async()=>{
  __qa.api.resetForClub('A');
  Object.assign(__store,{userRole:'coach',coachBranch:'CS1',currentUser:{uid:'Coach'}});
  window.userRole='coach';window.coachBranch='CS1';
  window.__verifiedAuthContextState={uid:'Coach',role:'coach',clubId:'A',ready:true,generation:2,coachBranch:'CS1',activeBranch:'CS1',allowedBranches:['CS1','CS2'],branchGeneration:1,branchSelectionPending:false};
  window.getProfilesListenerMetrics=()=>({activeOwnerUid:'Coach',role:'coach',coachBranch:'CS1',authorityClubId:'A',authoritySessionEpoch:2,coachRosterReadiness:'verified',coachPrimaryServerSeen:true,coachLegacyServerSeen:true,coachPrimaryFailed:false,coachLegacyFailed:false,activeListenerMounted:true,activeListenerKey:'students:profiles:active:A:coach:CS1',coachLegacyListenerKey:'students:profiles:active:A:coach:CS1:legacy-primary'});
  RoleReadBoundary.setContext({role:'coach',clubId:'A',coachBranch:'CS1'});
  __qa.shifts=[{id:'S1',name:'Chiều',branch:'CS1'}];
  await __qa.api.ensureShiftsLoaded({force:true});document.getElementById('att_shift').value='S1';
  await __qa.api.requestDailyRefresh('coach-test',{force:true});
 });
}
try {
 await check('Name click opens Coach history once and never queues a mark',async page=>{
  await asCoach(page);
  await page.evaluate(()=>{__qa.historyQueries=[];__qa.historyHook=q=>{
   __qa.historyQueries.push(q);const branch=q.constraints.find(x=>x.field==='branch')?.value;
   if(branch!=='CS1')throw Object.assign(Error('Alias forbidden'),{code:'permission-denied'});
   return __qa.querySnap([{id:'Alice_2026-10-20_S1',data:{name:'Alice',profileId:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',status:1}}]);
  }});
  await page.locator('#attendanceGrid [data-hidx="0"]').click();
  await page.waitForFunction(()=>document.getElementById('attHistBody')?.textContent.includes('Alice'));
  const state=await page.evaluate(async()=>({queries:__qa.historyQueries.length,rows:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes.length,body:document.getElementById('attHistBody').textContent}));
  assert.equal(state.queries,1);assert.equal(state.rows.length,0);assert.equal(state.writes,0);assert(!state.body.includes('Lỗi tải dữ liệu'));
 });
 await check('Permission failure in a history request is reported without a mark',async page=>{
  await asCoach(page);const state=await page.evaluate(async()=>{
   __qa.historyHook=()=>{throw Object.assign(Error('History forbidden'),{code:'permission-denied'})};await showAttMemberHistory('Alice','2026-10');
   return {body:document.getElementById('attHistBody').textContent,errors:__qa.errors,rows:await __qa.journal.list(__verifiedAuthContextState)};
  });assert.match(state.body,/Không đủ quyền/);assert.equal(state.errors.at(-1).source,'attendance.member-history');assert.equal(state.rows.length,0);
 });
 await check('Denied version read preserves native Journal intent and shows a permission label',async page=>{
  await asCoach(page);const state=await page.evaluate(async()=>{
   __qa.transactionReadHook=()=>{throw Object.assign(Error('Version read denied'),{code:'permission-denied'})};__qa.online=true;
   const result=await toggleAttendance('Alice');return {result,rows:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes.length,notices:__qa.notices,errors:__qa.errors,card:document.getElementById('att_card_0').textContent};
  });assert.equal(state.result.error,'permission-denied');assert.equal(state.rows.length,1);assert.equal(state.rows[0].state,'needs-review');assert.equal(state.rows[0].record.status,1);assert.equal(state.writes,0);assert.match(state.card,/Bị chặn quyền lưu/);assert.equal(state.errors.at(-1).extra.stage,'intent-version-read');assert(state.notices.some(x=>x.includes('Nhật ký được giữ')));
  await page.evaluate(()=>__qa.api.openPendingReview());assert.match(await page.locator('body').textContent(),/Có thể trùng lịch sử cũ bị khóa hoặc Rules chưa đồng bộ/);
 });
 await check('Repeated sync cannot silently replay a permission-blocked intent',async page=>{
  await asCoach(page);const result=await page.evaluate(async()=>{
   let attempts=0;__qa.transactionReadHook=()=>{attempts++;throw Object.assign(Error('Denied'),{code:'permission-denied'})};__qa.online=true;
   await toggleAttendance('Alice');const before=await __qa.journal.list(__verifiedAuthContextState);await syncOfflineAttendance();await syncOfflineAttendance();
   return {before,after:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes.length,attempts};
  });assert.equal(result.attempts,1);assert.equal(result.writes,0);assert.equal(result.after[0].id,result.before[0].id);assert.equal(result.after[0].state,'needs-review');
 });
 await check('Admin exact-ID audit uses one inspector read and no month scan or write',async page=>{
  await page.evaluate(async()=>{__qa.records=[{id:'Alice_2026-10-20_S1',data:{profileId:'Alice',name:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',status:1,historyAuthority:'old-history',attendanceVersion:'old-version-00001'}}];await __qa.api.openHistoryAudit();__qa.reads=0;__qa.monthScans=0;const old=_fb_init.getDocs;_fb_init.getDocs=q=>{__qa.monthScans++;return old(q)}});
  await page.getByLabel('Mã bản ghi điểm danh cần kiểm tra',{exact:true}).fill('Alice_2026-10-20_S1');await page.getByRole('button',{name:'Tải tháng để đối soát',exact:true}).click();
  await page.getByRole('button',{name:'Xác minh bản ghi này',exact:true}).waitFor();const state=await page.evaluate(()=>({reads:__qa.reads,scans:__qa.monthScans,writes:__qa.writes.length}));assert.equal(state.reads,1);assert.equal(state.scans,0);assert.equal(state.writes,0);
 });
 await check('After Admin verification explicit user review can safely rebase and ACK',async page=>{
  await asCoach(page);await page.evaluate(async()=>{
   __qa.online=true;__qa.transactionReadHook=()=>{throw Object.assign(Error('Hidden legacy row'),{code:'permission-denied'})};await toggleAttendance('Alice');
   __qa.transactionReadHook=null;__qa.records=[{id:'Alice_2026-10-20_S1',data:{profileId:'Alice',name:'Alice',branch:'CS1',date:'2026-10-20',month:'2026-10',shiftId:'S1',status:2,historyAuthority:'attendance-history-1aedda93-9437-4132-9694-35c2e6234d55',attendanceVersion:'admin-verified-version'}}];
   await __qa.api.openPendingReview();
  });
  await page.getByRole('button',{name:'Xem máy chủ để đối soát',exact:true}).click();await page.getByRole('button',{name:'Áp dụng trạng thái trên thiết bị',exact:true}).click();
  await page.waitForFunction(()=>__qa.writes.length===1);
  const state=await page.evaluate(async()=>({rows:await __qa.journal.list(__verifiedAuthContextState),writes:__qa.writes,card:document.getElementById('att_card_0').textContent}));
  assert.equal(state.rows.find(x=>x.reviewedFrom)?.baseVersion,'admin-verified-version');assert.equal(state.rows.find(x=>x.reviewedFrom)?.state,'acked');assert.equal(state.writes[0].data.status,1);
 });
} finally {
 await browser.close();await new Promise(r=>server.close(r));
 fs.writeFileSync(path.join(out,'HISTORY_JOURNAL_BROWSER.json'),JSON.stringify({scope:'Actual UI/service/native IndexedDB, SDK failure injection; no live project or physical device',pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,total:results.length,results},null,2));
}
console.log('A9R13_BROWSER '+results.filter(x=>x.status==='PASS').length+'/'+results.length+' PASS');if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
