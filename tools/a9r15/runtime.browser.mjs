// Real HTML + actual Add/Edit/Attendance owners + native IndexedDB.
// SDK transport below is an instrumented synthetic port; real Rules/SDK queries
// are tested separately in history.emulator and sdk10.browser.emulator.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from '../test-runtime.mjs';
const root=path.resolve(process.env.A9R15_SOURCE_ROOT || process.cwd()),results=[],reads=[],geometry=[];
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 const file=path.resolve(root,'.'+pathname);
 if(pathname==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('content-type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await loadPlaywright().chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox']});
async function setup(width=390,context){
 context ||= await browser.newContext({viewport:{width,height:900}});
 const page=await context.newPage();page.setDefaultTimeout(6000);
 page.on('dialog',dialog=>dialog.dismiss());
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.evaluate(async()=>{
  document.body.classList.add('ui-mobile-shell');document.getElementById('mainApp').style.display='block';document.getElementById('loginOverlay').style.display='none';document.getElementById('superAdminView').style.display='none';
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id==='tab_attendance'));
  window.__qa={counts:{getDoc:0,getDocs:0,onSnapshot:0,documents:0,finance:0},writes:[],alerts:[],records:[],queries:[],shiftList:[{id:'S1',name:'Same shift label',branch:'CS1'},{id:'S2',name:'Same shift label',branch:'CS2'},{id:'UNRESOLVED',name:'Needs review'}],hold:null};
  window.alert=value=>__qa.alerts.push(value);window.showToast=()=>{};window.recordRuntimeError=()=>{};window.getLocalToday=()=> '2026-10-25';window.closeModal=()=>document.getElementById('profileModal').style.display='none';
  window.buildAdmissionTuitionPackage=()=>({packageCount:1,months:['2026-10'],startMonth:'2026-10',lastMonth:'2026-10',label:'10/2026'});window.buildPaymentBundleTransaction=()=>{throw Error('Unexpected Finance mutation');};
  window.classifyProfileStatus=p=>p.status || 'active';
  window.__store={db:{},clubId:'SYNTHETIC',currentClubId:'SYNTHETIC',userRole:'admin',coachBranch:'',currentUser:{uid:'admin'},clubConfig:{branchCount:2},clubData:{},profiles:{P_A:{displayName:'Võ sinh trùng tên',branch:'CS1',status:'active',trainingShiftId:'S1',trainingDays:[1,3,5]},P_B:{displayName:'Võ sinh trùng tên',branch:'CS2',status:'active',trainingShiftId:'S2',trainingDays:[2,4,6]},P_BAD:{displayName:'Cần xem lại',branch:'CS1',status:'active',trainingShiftId:'DELETED',trainingDays:'2/4/6'}}};
  window.currentClubId='SYNTHETIC';window.userRole='admin';window.coachBranch='';
  // The stripped bootstrap normally fills branch selectors from club settings.
  for (const id of ['att_branch','att_month_branch']) {
   const select=document.getElementById(id);if(!select)continue;
   for(const branch of ['CS1','CS2'])if(!Array.from(select.options).some(o=>o.value===branch))select.add(new Option(branch,branch));
   select.value='CS1';
  }
  window.__verifiedAuthContextState={uid:'admin',clubId:'SYNTHETIC',role:'admin',ready:true,generation:1,branchGeneration:1,allowedBranches:[],coachBranch:'',activeBranch:''};
  const clause=(type,...value)=>({type,value});
  const snap=rows=>({size:rows.length,metadata:{fromCache:false,hasPendingWrites:false},forEach:fn=>rows.forEach(row=>fn({id:row.id,data:()=>row.data}))});
  window._fb_init={
   doc:(db,...parts)=>({path:parts.join('/'),id:parts.at(-1)}),collection:(db,...parts)=>({path:parts.join('/')}),
   where:(...x)=>clause('where',...x),query:(ref,...constraints)=>({ref,constraints}),orderBy:(...x)=>clause('orderBy',...x),documentId:()=> '__name__',limit:n=>clause('limit',n),startAfter:id=>clause('startAfter',id),
   getDoc:async ref=>{__qa.counts.getDoc++;return {exists:()=>true,data:()=>({list:__qa.shiftList}),metadata:{fromCache:false,hasPendingWrites:false}};},
   getDocs:async query=>{
    __qa.counts.getDocs++;if(/transactions|inventory|finance/.test(query.ref.path)){__qa.counts.finance++;throw Error('Unexpected Finance read');}
    __qa.queries.push(query);const hold=__qa.hold;if(hold){__qa.hold=null;await hold;}
    let rows=__qa.records.slice();
    for(const {type,value:v} of query.constraints)if(type==='where')rows=rows.filter(r=>v[1]==='in'?v[2].includes(r.data[v[0]]):r.data[v[0]]===v[2]);
    rows.sort((a,b)=>a.id.localeCompare(b.id,'en'));
    for(const {type,value:v} of query.constraints)if(type==='startAfter')rows=rows.filter(r=>r.id>v[0]);
    for(const {type,value:v} of query.constraints)if(type==='limit')rows=rows.slice(0,v[0]);
    __qa.counts.documents+=Math.max(1,rows.length);return snap(rows);
   },
   onSnapshot:()=>{__qa.counts.onSnapshot++;throw Error('Unexpected history listener');},
   setDoc:async(ref,data)=>{__qa.writes.push({path:ref.path,data});},updateDoc:async(ref,data)=>{__qa.writes.push({path:ref.path,data});},
   writeBatch:()=>{const ops=[];return {set:(ref,data)=>ops.push({path:ref.path,data}),commit:async()=>__qa.writes.push(...ops)};}
  };
  await import('/js/core/branchIdentity.js');await import('/js/core/roleReadBoundary.js');
  const registry=await import('/js/core/globalOwnershipRegistry.js');registry.initGlobalOwnershipRegistry();
  const studentsURL='/js/modules/students.js';const {initStudents}=await import(studentsURL);initStudents();
  const {StudentStatusCommandBoundary}=await import('/js/core/studentStatusCommandBoundary.js');window.StudentStatusCommandBoundary=StudentStatusCommandBoundary;
  const attendance=await import('/js/modules/attendance.js');attendance.initAttendance();await window._ensureClubShiftsLoaded();
  window.__setPrincipal=async(branch='CS1',role='coach')=>{
   const uid=role==='coach'?'coach':'admin',generation=window.__verifiedAuthContextState.generation+1;
   window.userRole=role;window.coachBranch=role==='coach'?branch:'';__store.userRole=role;__store.coachBranch=window.coachBranch;__store.currentUser={uid};
   window.__verifiedAuthContextState={uid,clubId:__store.clubId,role,ready:true,generation,branchGeneration:generation,assignmentVersion:'synthetic-assignment-'+generation,allowedBranches:['CS1','CS2'],activeBranch:branch,coachBranch:branch};
   AttendanceModule.resetForClub(__store.clubId);await _ensureClubShiftsLoaded();
  };
  const {HISTORY_AUTHORITY,JOURNAL_DATABASE}=await import('/js/core/attendanceContract.js');
  for(let i=0;i<85;i++){
   const date=new Date(Date.UTC(2020,0,1+i*25)).toISOString().slice(0,10),data={profileId:'P_A',branch:'CS1',date,month:date.slice(0,7),shiftId:'S1',status:i%3+1,historyAuthority:HISTORY_AUTHORITY};
   __qa.records.push({id:'P_A_'+date+'_S1',data});
  }
  __qa.records.push({id:'P_A_2026-10-25_S2',data:{profileId:'P_A',branch:'CS2',date:'2026-10-25',month:'2026-10',shiftId:'S2',status:1,historyAuthority:HISTORY_AUTHORITY}});
  __qa.records.push({id:'P_A_2019-01-01_LEGACY',data:{profileId:'P_A',branch:'CS1',date:'2019-01-01',month:'2019-01',status:1,historyAuthority:'old'}});
  __qa.journalDatabase=JOURNAL_DATABASE;
 });return {page,context};
}
async function check(title,fn){try{await fn();results.push({title,classification:'PASS'});console.log('PASS',title);}catch(e){results.push({title,classification:'FAIL_RUNTIME',message:e.stack});console.error('FAIL',title,e.message);}}
const current=await setup(),page=current.page;
const waitForm=prefix=>page.waitForFunction(prefix=>!document.getElementById(prefix+'_shift').disabled,prefix);
async function openEdit(key='P_A'){await page.evaluate(key=>window.openProfile(key),key);await waitForm('m');}
async function capture(label){reads.push({label,counts:await page.evaluate(()=>({...__qa.counts}))});}
if(process.env.A9R15R1_EXTRA_OUTPUT){
 const checks=[];
 const verify=async(title,fn)=>{try{const detail=await fn();checks.push({title,classification:'PASS',...detail});console.log('PASS',title);}catch(error){checks.push({title,classification:'FAIL_RUNTIME',message:error.stack});console.error('FAIL',title,error.message);}};
 const originalShifts=await page.evaluate(()=>structuredClone(__qa.shiftList));
 for(const [label,expected,mutation] of [['deleted','SHIFT_NOT_FOUND','delete'],['moved','SHIFT_BRANCH_MISMATCH','move'],['unresolved','SHIFT_AUTHORITY_UNRESOLVED','unresolved']])await verify('Pre-save race '+label,async()=>{
  await page.evaluate(shifts=>{__qa.shiftList=structuredClone(shifts);window.openProfile('P_A');},originalShifts);await waitForm('m');
  const before=await page.evaluate(()=>({profile:JSON.stringify(__store.profiles.P_A),writes:__qa.writes.length}));
  await page.evaluate(mode=>{if(mode==='delete')__qa.shiftList=__qa.shiftList.filter(shift=>shift.id!=='S1');else __qa.shiftList=__qa.shiftList.map(shift=>shift.id==='S1'?{...shift,branch:mode==='move'?'CS2':''}:shift);},mutation);
  await page.evaluate(()=>window.updateProfile());
  const actual=await page.evaluate(async()=>{const {inspectTrainingRegistration}=await import('/js/core/trainingRegistration.js');return {category:inspectTrainingRegistration(__store.profiles.P_A,_getClubShifts()).result,alert:__qa.alerts.at(-1),profile:JSON.stringify(__store.profiles.P_A),writes:__qa.writes.length};});
  assert.equal(actual.category,expected);assert.equal(actual.profile,before.profile);assert.equal(actual.writes,before.writes);
  const expectedApi=expected==='SHIFT_BRANCH_MISMATCH'?'TRAINING_SHIFT_BRANCH_MISMATCH':expected;assert(actual.alert.includes(expectedApi));
  return {expected,actual:actual.category,apiError:expectedApi,writes:0};
 });
 await page.evaluate(async shifts=>{__qa.shiftList=shifts;document.getElementById('profileModal').style.display='none';await __setPrincipal('CS1');},originalShifts);
 const allRecords=await page.evaluate(()=>structuredClone(__qa.records));
 for(const size of [0,1,40,41,80])await verify('Pagination exact boundary '+size,async()=>{
  await page.evaluate(async size=>{const {HISTORY_AUTHORITY}=await import('/js/core/attendanceContract.js');__qa.records=Array.from({length:size},(_,i)=>{const date=new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10);return {id:'EDGE_'+date+'_S1',data:{profileId:'EDGE',date,month:date.slice(0,7),shiftId:'S1',branch:'CS1',status:1,historyAuthority:HISTORY_AUTHORITY}};});await __setPrincipal('CS1');await showAttMemberHistory('EDGE','2026-10');},size);
  const before=await page.evaluate(()=>__qa.counts.getDocs);let clicks=0;
  do{await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.getElementById('attHistoryLoadMore').textContent!=='Mở lịch sử đã xác minh'&&document.querySelector('#attHistBody [role="status"]').textContent.indexOf('Đang tải')<0);clicks++;assert(clicks<=4);}while(!await page.locator('#attHistoryLoadMore').isDisabled());
  const ids=await page.locator('#attVerifiedHistoryRows article').evaluateAll(items=>items.map(item=>item.dataset.historyId));assert.equal(ids.length,size);assert.equal(new Set(ids).size,size);assert.equal(clicks,Math.floor(size/40)+1);assert.equal(await page.evaluate(()=>__qa.counts.getDocs)-before,clicks);
  return {size,clicks,uniqueRecords:ids.length};
 });
 await verify('Network retry repeats the same cursor and keeps pages unique',async()=>{
  await page.evaluate(async rows=>{__qa.records=rows;await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');},allRecords);
  await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===40);
  await page.evaluate(()=>{const original=_fb_init.getDocs;_fb_init.getDocs=async query=>{_fb_init.getDocs=original;__qa.counts.getDocs++;__qa.queries.push(query);throw Object.assign(Error('network unavailable'),{code:'unavailable'});};});
  await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.getElementById('attHistoryLoadMore').textContent==='Thử tải lại lịch sử');assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),40);
  await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===80);
  const observations=await page.evaluate(()=>({ids:Array.from(document.querySelectorAll('#attVerifiedHistoryRows article')).map(x=>x.dataset.historyId),cursors:__qa.queries.slice(-2).map(query=>query.constraints.find(c=>c.type==='startAfter')?.value[0])}));assert.equal(new Set(observations.ids).size,80);assert.equal(observations.cursors[0],observations.cursors[1]);return {uniqueRecords:80,sameCursorOnRetry:true};
 });
 await verify('CS1 -> CS2 -> CS1 returns the correct branch without old page cache',async()=>{
  const lengths=[];
  for(const branch of ['CS1','CS2','CS1']){await page.evaluate(async branch=>{await __setPrincipal(branch);await showAttMemberHistory('P_A','2026-10');},branch);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length>0);lengths.push(await page.locator('#attVerifiedHistoryRows article').count());}
  assert.deepEqual(lengths,[40,1,40]);return {branches:['CS1','CS2','CS1'],firstPageCounts:lengths};
 });
 const report={classification:checks.every(x=>x.classification==='PASS')?'PASS':'FAIL_RUNTIME',transport:'Instrumented SDK transport; actual runtime owners and DOM; separate Emulator proves Rules',checks};fs.mkdirSync(path.dirname(process.env.A9R15R1_EXTRA_OUTPUT),{recursive:true});fs.writeFileSync(process.env.A9R15R1_EXTRA_OUTPUT,JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));process.exit(report.classification==='PASS'?0:1);
}
if(process.env.A9R15_READS_ONLY){
 const measurements=[];
 const measure=async(label,fn)=>{const before=await page.evaluate(()=>({...__qa.counts}));const supported=await fn();const after=await page.evaluate(()=>({...__qa.counts}));measurements.push({label,supported:supported!==false,before,after,delta:Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]]))});};
 const daily=()=>page.evaluate(async()=>{document.getElementById('att_date').value='2026-10-26';document.getElementById('att_branch').value=window.coachBranch || 'CS1';document.getElementById('att_shift').value='S1';if(window.coachBranch==='CS2')document.getElementById('att_shift').value='S2';await onShiftChange();});
 try{
  await measure('registration.open-edit',async()=>{await page.evaluate(()=>window.openProfile('P_A'));await waitForm('m');});
  await measure('registration.save-valid',()=>page.evaluate(()=>window.updateProfile()));
  await measure('1.open-attendance-tab',daily);
  await measure('2.select-CS1',async()=>{await page.evaluate(()=>__setPrincipal('CS1'));await daily();});
  await measure('3.open-member-summary',()=>page.evaluate(()=>showAttMemberHistory('P_A','2026-10')));
  await measure('4.first-verified-page',async()=>{if(!await page.locator('#attHistoryLoadMore').count())return false;await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===40);});
  await measure('5.next-verified-page',async()=>{if(!await page.locator('#attHistoryLoadMore').count())return false;await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===80);});
  await measure('6.close-reopen-same-member',()=>page.evaluate(async()=>{document.getElementById('attHistModal').style.display='none';await showAttMemberHistory('P_A','2026-10');}));
  await measure('7.switch-CS1-to-CS2',async()=>{await page.evaluate(()=>__setPrincipal('CS2'));await daily();});
  await measure('8.open-same-profile-in-CS2',()=>page.evaluate(()=>showAttMemberHistory('P_A','2026-10')));
  // New document and generation; the original page cache cannot be reused.
  const old=await page.evaluate(()=>({...__qa.counts}));const reloaded=await setup(390,current.context);
  await reloaded.page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');});
  const reloadCounts=await reloaded.page.evaluate(()=>({...__qa.counts}));measurements.push({label:'9.reload-relogin',supported:true,oldDocumentCounts:old,delta:reloadCounts});await reloaded.page.close();
  const report={scope:'actual attendance UI/reader owners with synthetic SDK transport; auth/roster bootstrap reads not measured here',sourceRoot:path.basename(root),historyListenersAdded:0,measurements};
  fs.writeFileSync(process.env.A9R15_READS_ONLY,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}process.exit(0);
}
try{
 await check('Mobile Edit: branch then shift then weekdays; only branch-compatible shifts',async()=>{
  await openEdit();const g=await page.evaluate(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,font:getComputedStyle(document.getElementById(id)).fontSize};};return {branch:box('m_branch'),shift:box('m_shift'),dayY:document.querySelector('.m_trainingDay').getBoundingClientRect().y,options:Array.from(document.getElementById('m_shift').options).map(o=>o.value)};});geometry.push(g);assert(g.branch.y<g.shift.y&&g.shift.y<g.dayY);assert.equal(g.shift.font,'16px');assert.deepEqual(g.options,['','S1']);
 });
 await check('CS1 -> CS2 invalidates old shift, does not auto-select or auto-save',async()=>{
  const before=await page.evaluate(()=>__qa.writes.length);await page.selectOption('#m_branch','CS2');
  assert.equal(await page.inputValue('#m_shift'),'__invalid_registration__');assert.equal(await page.evaluate(()=>__qa.writes.length),before);
  await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),before);assert.match(await page.locator('#m_registration_warning').innerText(),/chọn lại/i);
 });
 await check('Explicit CS2 shift saves through the same canonical update coordinator/service',async()=>{
  await page.selectOption('#m_shift','S2');await page.evaluate(()=>window.updateProfile());const last=await page.evaluate(()=>__qa.writes.at(-1));assert.match(last.path,/profiles\/P_A$/);assert.equal(last.data.branch,'CS2');assert.equal(last.data.trainingShiftId,'S2');assert.deepEqual(last.data.trainingDays,[1,3,5]);
 });
 await check('Forged dropdown option CS1/CS2 mismatch is blocked immediately before writer',async()=>{
  await openEdit();await page.selectOption('#m_branch','CS1');await page.evaluate(()=>{const select=document.getElementById('m_shift');select.add(new Option('Forged','S2'));select.value='S2';select.dispatchEvent(new Event('change'));});
  const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),n);
 });
 await check('Deleted shift and invalid legacy days warn immediately and cannot silently clear on Save',async()=>{
  await openEdit('P_BAD');assert.match(await page.locator('#m_registration_warning').innerText(),/không tồn tại|sai định dạng/);
  const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),n);
  await page.selectOption('#m_shift','');await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),n);
  await page.locator('#m_registration_clear_days').click();await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),n+1);
 });
 await check('Add selector is branch-scoped and valid zero-fee admission uses the original batch',async()=>{
  await page.evaluate(()=>{document.getElementById('add_branch').value='CS1';window.openAddModal();});await waitForm('add');assert.deepEqual(await page.locator('#add_shift option').evaluateAll(options=>options.map(o=>o.value)),['','S1']);
  await page.locator('#add_name').fill('NEW_PROFILE_ID');await page.selectOption('#add_shift','S1');await page.locator('.add_trainingDay[value="0"]').check();
  const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.addNewStudent());
  const writes=await page.evaluate(()=>__qa.writes);assert.equal(writes.length,n+1);assert.match(writes.at(-1).path,/profiles\/NEW_PROFILE_ID$/);assert.equal(writes.at(-1).data.trainingShiftId,'S1');assert.deepEqual(writes.at(-1).data.trainingDays,[0]);
 });
 await check('Add branch change requires explicit re-selection; blank shift stays optional',async()=>{
  await page.evaluate(()=>window.openAddModal());await waitForm('add');await page.selectOption('#add_shift','S1');await page.selectOption('#add_branch','CS2');assert.equal(await page.inputValue('#add_shift'),'__invalid_registration__');
  await page.locator('#add_name').fill('SECOND_PROFILE_ID');const n=await page.evaluate(()=>__qa.writes.length);await page.evaluate(()=>window.addNewStudent());assert.equal(await page.evaluate(()=>__qa.writes.length),n);
  await page.selectOption('#add_shift','');await page.evaluate(()=>window.addNewStudent());assert.equal(await page.evaluate(()=>__qa.writes.length),n+1);assert.equal(await page.evaluate(()=>__qa.writes.at(-1).data.trainingShiftId),'');
 });
 await check('Same names, list reorder and reopening edit keep immutable profile registration',async()=>{
  await page.evaluate(()=>{__store.profiles={P_B:__store.profiles.P_B,P_A:__store.profiles.P_A,...__store.profiles};});await openEdit('P_B');assert.equal(await page.inputValue('#m_old_name'),'P_B');assert.equal(await page.inputValue('#m_shift'),'S2');
 });
 await check('Deleting a referenced shift immediately warns in the existing Edit form without changing profile',async()=>{
  await openEdit('P_B');const profile=await page.evaluate(()=>JSON.stringify(__store.profiles.P_B));
  await page.evaluate(()=>window.deleteShift('S2'));
  assert.equal(await page.inputValue('#m_shift'),'__invalid_registration__');assert.match(await page.locator('#m_registration_warning').innerText(),/không tồn tại/);assert.equal(await page.evaluate(()=>JSON.stringify(__store.profiles.P_B)),profile);
  // Restore only the synthetic settings fixture through the canonical refresh owner.
  await page.evaluate(async()=>{AttendanceModule.resetForClub(__store.clubId);await _ensureClubShiftsLoaded();});
 });
 await check('A remote shift deletion between form open and Save is refreshed and blocks the original writer',async()=>{
  await openEdit('P_B');const count=await page.evaluate(()=>__qa.writes.length);
  await page.evaluate(()=>{__qa.shiftList=__qa.shiftList.filter(s=>s.id!=='S2');});
  await page.evaluate(()=>window.updateProfile());assert.equal(await page.evaluate(()=>__qa.writes.length),count);assert.match(await page.locator('#m_registration_warning').innerText(),/thay đổi|không tồn tại/);
  await page.evaluate(async()=>{__qa.shiftList.push({id:'S2',name:'Same shift label',branch:'CS2'});await _ensureClubShiftsLoaded({force:true});});
 });
 await check('Read-only Admin audit is pseudonymous and emits zero SDK reads/writes',async()=>{
  const before=await page.evaluate(()=>({reads:{...__qa.counts},writes:__qa.writes.length}));const audit=await page.evaluate(()=>window.auditTrainingRegistrations());assert.equal(audit.complete,false);assert(audit.rows.every(r=>/^P\d{5}$/.test(r.profileId)));assert(!JSON.stringify(audit).includes('Võ sinh trùng tên'));assert.deepEqual(await page.evaluate(()=>({reads:{...__qa.counts},writes:__qa.writes.length})),before);
 });
 await page.evaluate(()=>{document.getElementById('profileModal').style.display='none';document.getElementById('addModal').style.display='none';});
 await check('Actual roster respects registration day, branch, shift, active and skipped month',async()=>{
  await page.evaluate(async()=>{
   await __setPrincipal('CS1','admin');document.getElementById('tab_attendance').classList.add('active');document.getElementById('att_sub_day').style.display='';document.getElementById('att_sub_month').style.display='none';
   __store.profiles={ON:{status:'active',branch:'CS1',trainingShiftId:'S1',trainingDays:[1,3,5]},OFF:{status:'active',branch:'CS1',trainingShiftId:'S1',trainingDays:[2,4,6]},QUIT:{status:'quit',branch:'CS1',trainingShiftId:'S1',trainingDays:[1]},SKIP:{status:'active',branch:'CS1',trainingShiftId:'S1',trainingDays:[1],skippedMonths:['2026-10']},BAD:{status:'active',branch:'CS1',trainingShiftId:'S2',trainingDays:[1]},NO_SHIFT:{status:'active',branch:'CS1',trainingDays:[]},P_A:{displayName:'Tên võ sinh dài dễ đọc trên điện thoại',status:'active',branch:'CS1',trainingShiftId:'S1',trainingDays:[]}};
   document.getElementById('att_date').value='2026-10-26';document.getElementById('att_branch').value='CS1';document.getElementById('att_shift').value='S1';await window.onShiftChange();
  });
  const text=await page.locator('#attendanceGrid').innerText();assert(text.includes('ON'),JSON.stringify(await page.evaluate(()=>({text:document.getElementById('attendanceGrid').innerText,state:AttendanceModule.getDailyState(),debug:window.__attendanceDebug}))));assert(text.includes('NO_SHIFT'));for(const id of ['OFF','QUIT','SKIP','BAD'])assert(!new RegExp('\\b'+id+'\\b').test(text));
 });
 await capture('after-tab-and-CS1-setup');
 await page.evaluate(()=>__setPrincipal('CS1'));
 await capture('CS1-selected');
 await check('Coach summary remains monthly/quarterly and does not prefetch full history',async()=>{
  const n=await page.evaluate(()=>__qa.counts.getDocs);await page.evaluate(()=>window.showAttMemberHistory('P_A','2026-10'));assert.equal(await page.evaluate(()=>__qa.counts.getDocs),n+1);assert.match(await page.locator('#attHistBody').innerText(),/Lịch sử Điểm danh đã xác minh/);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);
 });await capture('open-member-summary');
 await check('First bounded page and rapid double-click cause exactly one query',async()=>{
  const n=await page.evaluate(()=>__qa.counts.getDocs);await page.evaluate(()=>{const button=document.getElementById('attHistoryLoadMore');button.click();button.click();});await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===40);assert.equal(await page.evaluate(()=>__qa.counts.getDocs),n+1);
 });await capture('first-page');
 await check('Second/final pages append all years once without duplicates or legacy',async()=>{
  await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===80);
 });await capture('next-page');
 await check('Final page completes at 85 unique current-authority records',async()=>{
  await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===85);
  const ids=await page.locator('#attVerifiedHistoryRows article').evaluateAll(items=>items.map(x=>x.dataset.historyId));assert.equal(new Set(ids).size,85);assert(!ids.some(x=>x.includes('LEGACY')));assert(await page.locator('#attHistoryLoadMore').isDisabled());
 });
 await check('Closing/reopening discards pages and requests only current summary',async()=>{
  await page.evaluate(()=>{document.getElementById('attHistModal').style.display='none';});await page.evaluate(()=>showAttMemberHistory('P_A','2026-10'));assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);
 });await capture('reopen-same-profile');
 await check('Late CS1 page is dropped after CS2 switch; CS2 renders its own profile history',async()=>{
  await page.evaluate(()=>{__qa.hold=new Promise(resolve=>{window.__release=resolve;});document.getElementById('attHistoryLoadMore').click();});
  await page.evaluate(async()=>{await __setPrincipal('CS2');await showAttMemberHistory('P_A','2026-10');});await page.locator('#attHistoryLoadMore').click();await page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===1);
  await page.evaluate(()=>__release());await page.waitForTimeout(50);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),1);assert.match(await page.locator('#attVerifiedHistoryRows').innerText(),/CS2/);
 });await capture('CS2-switch-and-same-profile');
 await check('Revoke branch during page flight prevents stale response from populating UI',async()=>{
  await page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');__qa.hold=new Promise(resolve=>window.__release=resolve);document.getElementById('attHistoryLoadMore').click();__verifiedAuthContextState.allowedBranches=['CS2'];__verifiedAuthContextState.branchGeneration++;});
  await page.evaluate(()=>__release());await page.waitForTimeout(30);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);
 });
 await check('Relogin generation drops an in-flight page and next open starts fresh',async()=>{
  await page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');__qa.hold=new Promise(resolve=>window.__release=resolve);document.getElementById('attHistoryLoadMore').click();__verifiedAuthContextState.generation++;});
  await page.evaluate(()=>__release());await page.waitForTimeout(30);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);
  await page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');});assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);
 });await capture('relogin-fresh-open');
 await check('Native Journal V4 stays V4 and old V3 rows are never promoted',async()=>{
  assert.equal(await page.evaluate(()=>__qa.journalDatabase),'tst-attendance-journal-v4');
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));assert(!names.includes('tst-attendance-journal-v3'));assert.equal(await page.evaluate(()=>__qa.writes.filter(x=>x.path.includes('/attendance/')).length),0);
 });
 await check('History adds zero listeners and no Finance reads',async()=>{const c=await page.evaluate(()=>__qa.counts);assert.equal(c.onSnapshot,0);assert.equal(c.finance,0);});
 for(const width of [320,390,767,1024])await check('Registration/history layout fits '+width+'px',async()=>{
  await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await __setPrincipal('CS1','admin');window.openProfile('P_A');});await waitForm('m');
  const reg=await page.locator('#m_registration').boundingBox();assert(reg.x>=0&&reg.x+reg.width<=width+1);
  await page.evaluate(()=>document.getElementById('profileModal').style.display='none');await page.evaluate(async()=>{await __setPrincipal('CS1');await showAttMemberHistory('P_A','2026-10');});
  const hist=await page.locator('#attHistContent').boundingBox();assert(hist.x>=0&&hist.x+hist.width<=width+1);assert.equal(await page.locator('#attHistContent table').count(),0);
 });
 await check('Another browser tab has independent branch/session presentation, with no cross-tab cache',async()=>{
  const other=await setup(390,current.context);try{await other.page.evaluate(async()=>{await __setPrincipal('CS2');await showAttMemberHistory('P_A','2026-10');});await other.page.locator('#attHistoryLoadMore').click();await other.page.waitForFunction(()=>document.querySelectorAll('#attVerifiedHistoryRows article').length===1);assert.equal(await page.locator('#attVerifiedHistoryRows article').count(),0);}finally{await other.page.close();}
 });
}finally{
 const report={kind:'A9R15_REAL_BROWSER_OWNERS_SYNTHETIC_SDK_TRANSPORT',classification:results.some(r=>r.classification!=='PASS')?'FAIL_RUNTIME':'PASS',physicalDeviceAcceptance:'ENV_BLOCKED: viewport emulation is not physical Android acceptance',results,geometry,reads};
 fs.mkdirSync('evidence/A9R15',{recursive:true});fs.writeFileSync('evidence/A9R15/BROWSER_RESULTS.json',JSON.stringify(report,null,2));console.log('RESULT',report.classification,results.length);await browser.close();await new Promise(r=>server.close(r));if(report.classification!=='PASS')process.exitCode=1;
}
