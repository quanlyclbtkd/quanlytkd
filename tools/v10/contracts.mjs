// Test-only contracts for historical gates. Executes production function bodies.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {HISTORY_AUTHORITY} from '../../js/core/attendanceContract.js';
export const read = p => fs.readFileSync(p,'utf8');
export function expression(source, marker, method=false) {
  const start=source.indexOf(marker); assert(start>=0,marker);
  const tail=source.slice(start); const body=method?tail:tail.slice(tail.indexOf('=')+1);
  for(let end=body.indexOf('}');end>=0;end=body.indexOf('}',end+1)){
    const candidate=body.slice(0,end+1), wrapped='('+candidate+')';
    try{new vm.Script(wrapped);return wrapped;}catch{}
  }
  throw Error('Cannot parse production function '+marker);
}
const loadCode=async code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const importsToAbsolute=(code,file)=>code.replace(/from\s+['"]([^'"]+)['"]/g,(all,spec)=>spec.startsWith('.')?"from '"+new URL(spec,pathToFileURL(path.resolve(file))).href+"'":all);

export async function dailyContract(change=x=>x){
  const code=change(read('js/services/attendance.service.js'));
  const service=(await loadCode(importsToAbsolute(code,'js/services/attendance.service.js'))).AttendanceService;
  const data=[...Array.from({length:141},(_,i)=>({id:'p'+String(i).padStart(3,'0'),data:{date:'2026-10-20',shiftId:'S1',branch:'CS1'}})),
    ...['S2','S3'].map((shiftId,i)=>({id:'shift'+i,data:{date:'2026-10-20',shiftId,branch:'CS1'}})),
    {id:'foreign',data:{date:'2026-10-20',shiftId:'S1',branch:'CS2'}},
    {id:'yesterday',data:{date:'2026-10-19',shiftId:'S1',branch:'CS1'}}];
  data.forEach(r=>r.data.historyAuthority=HISTORY_AUTHORITY);
  data.push({id:'unverified',data:{date:'2026-10-20',shiftId:'S1',branch:'CS1'}});
  let calls=0, current=true; const queries=[];
  globalThis.window={__store:{db:{},clubId:'A'},userRole:'coach',coachBranch:'CS1',__scaleConfig:{attendanceDailyPageSize:100},RoleReadBoundary:{canMount:()=>true},_fb_init:{
    collection:(db,...parts)=>parts.join('/'), where:(field,op,value)=>({field,op,value}),limit:limit=>({limit}),startAfter:cursor=>({cursor}),query:(ref,...constraints)=>({ref,constraints}),
    async getDocs(q){calls++;queries.push(q);assert.equal(q.ref,'clubs/A/attendance');let rows=data.filter(r=>q.constraints.every(c=>!c.field||(c.op==='in'?c.value.includes(r.data[c.field]):r.data[c.field]===c.value)));
      const cursor=q.constraints.find(c=>c.cursor)?.cursor;if(cursor)rows=rows.slice(rows.findIndex(r=>r.id===cursor.id)+1);
      rows=rows.slice(0,q.constraints.find(c=>c.limit)?.limit);const docs=rows.map(r=>({id:r.id,data:()=>r.data}));return {size:docs.length,docs,metadata:{fromCache:false,hasPendingWrites:false},forEach:fn=>docs.forEach(fn)};
    }
  }};
  const rows=await service.loadByDate('2026-10-20',{shiftId:'S1',branch:'CS1',requireShift:true,isCurrent:()=>current});
  assert.equal(rows.length,141);assert.equal(new Set(rows.map(r=>r.id)).size,141);assert.equal(calls,2);
  assert(rows.every(r=>r.data.shiftId==='S1'&&r.data.branch==='CS1'&&r.data.date==='2026-10-20'));
  assert(queries.every(q=>q.constraints.some(c=>c.field==='shiftId'&&c.value==='S1')));
  calls=0; await assert.rejects(()=>service.loadByDate('2026-10-20',{requireShift:true}),e=>e.code==='attendance/explicit-shift-required');assert.equal(calls,0);
  current=false;assert.equal((await service.loadByDate('2026-10-20',{shiftId:'S1',isCurrent:()=>current})).length,0);assert.equal(calls,0);
  window.__scaleConfig.attendanceDailySafetyCeiling=100;
  await assert.rejects(()=>service.loadByDate('2026-10-20',{shiftId:'S1'}),e=>e.code==='attendance/daily-coverage-incomplete');
  return true;
}

export async function financeContract(change=x=>x){
  const code=change(read('js/modules/finance.js'));
  const fn=expression(code,'async function _doLoad',true);
  for(const message of ['failed-precondition: The query requires an index https://console.firebase.google.com/test','permission-denied']){
    const tx={innerHTML:'OLD'}, state={isLoading:false,currentItems:[{id:'old'}]};let processed=0;
    const sandbox={pgState:state,_injectControls:()=>{},_getCurrentMonth:()=> '2026-10',_getCurrentSearch:()=>'',_currentPaginationContextKey:()=> 'A|2026-10',PAGE_SIZE:30,
      FinanceService:{getTransactionsPage:async()=>{throw Error(message)}},processPage:()=>{processed++;},document:{getElementById:()=>tx},console:{error(){},info(){},warn(){}},window:{},store:{pagination:{}}};
    vm.createContext(sandbox); const f=vm.runInContext(fn,sandbox);await f(null,'first');
    assert.equal(state.isLoading,false);assert.equal(state._loadError,true);assert.equal(processed,0);assert.equal(state.currentItems[0].id,'old');
    if(message.startsWith('failed'))assert.match(tx.innerHTML,/index|chỉ mục/i);
  }
  return true;
}

export async function examContract(change=x=>x){
  const expr=expression(change(read('js/modules/finance.js')),'window.quickCollectExam =');
  const writes=[],prompts=[];const key="Nguyễn 'A' & <B>",display='Nguyễn Văn Mới';
  const sandbox={window:{__store:{},BELT_NEXT:{},getClubExamFee:()=>345000,buildCanonicalExamPaymentLedger:()=>({byName:{}}),mergeTransactionIntoRuntimeStore(){},showToast(){},ProfileCanonicalStore:{resolveDisplayName:()=>display}},document:{getElementById:id=>({value:id==='filterMonth'?'2026-10':'250000'})},
    _profiles:()=>({[key]:{branch:'CS1',displayName:display}}),_clubId:()=> 'A',_vMonth:()=>true,_positiveAmount:x=>x>0?x:null,_guardAllowed:()=>true,getLocalToday:()=> '2026-10-20',prompt:(text,fee)=>{prompts.push(fee);return String(fee)},FinanceService:{addTransaction:async tx=>writes.push(tx)},console};
  vm.createContext(sandbox);sandbox.window.quickCollectExam=vm.runInContext(expr,sandbox);
  assert.equal(await sandbox.window.quickCollectExam(key,'CS1'),true);assert.equal(prompts[0],345000);assert.equal(writes[0].amount,345000);
  assert.equal(writes[0].profileId,key);assert.equal(writes[0].studentName,display);assert.equal(writes[0].profileName,display);
  assert.equal(sandbox.window.quickCollectExam.__inFlight,false);return true;
}

export async function displayContract(change=x=>x){
  globalThis.window={ProfileCanonicalStore:{resolveDisplayName:(key,p)=>p.displayName||key},formatMonthCompact:x=>x,formatDate:x=>x||'',formatTuitionMonthList:x=>x,calculateTuitionSettlement:()=>({})};
  const file='js/ui/render/computation/studentsRenderer.js';const m=await loadCode(importsToAbsolute(change(read(file)),file));
  for(const key of ["Nguyễn 'A' & <B>",'Đào "C" \\ D','Na 🥋']){
    const p={displayName:'Tên hiển thị mới',branch:'CS1',tuitionFee:500000};
    const debt=m.renderDebtRow(key,p,{isAdmin:true,unpaidMonthsCount:1,owedMonthsStr:'2026-10',selMonth:'2026-10'}),quit=m.renderQuitRow(key,p,{isAdmin:true});
    for(const html of [debt,quit]){
      assert(html.includes('Tên hiển thị mới'));const calls=[];const box={decodeURIComponent,event:{},window:{markStudentQuitFromDebt:(...a)=>calls.push(a.slice(1)),skipDebtMonthFromDebt:(...a)=>calls.push(a.slice(1))}};
      for(const n of ['openProfile','openQuickPayModal','generateMultiMonthPaymentRequest','copyAndOpenZalo'])box[n]=(...args)=>calls.push(args);
      vm.createContext(box);
      for(const match of html.matchAll(/onclick="([^"]+)"/g))vm.runInContext(match[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'),box);
      assert(calls.length>0);assert(calls.every(args=>args[0]===key));
    }
  }
  await examContract();return true;
}

export async function listenerContract(kind='hydrate',change=x=>x){
  globalThis.window=globalThis;
  const store=await import('../../js/data/studentProfileStore.js');store.resetStudentProfileStore('v10-contract');
  let callbacks=[],reads=0;const regs=new Map();
  Object.assign(window,{__store:{clubId:'A',currentClubId:'A',userRole:'admin',profiles:{}},userRole:'admin',coachBranch:'',__verifiedAuthContextState:{ready:true,uid:'u',role:'admin',clubId:'A',coachBranch:'',generation:1},__profileScaleMetrics:{},studentProfileStore:store.studentProfileStore,getAppContext:()=>({}),_syncAllProfilesLegacy(){},invalidateLists(){},invalidateList(){},invalidateStudents(){},invalidateByDomain(){},invalidateDashboard(){},scheduleAutomaticDebtProfileCoverage(){},
    hasListener:k=>regs.has(k),removeListener:k=>regs.delete(k),safeRegisterSnapshot:(key,create)=>{if(regs.has(key))return false;regs.set(key,create());return true},markListenerSnapshot(){},
    _fb_init:{query:(ref,...parts)=>({ref,parts}),where:(...where)=>({where}),onSnapshot(q,opt,cb,err){callbacks.push({q,cb,err,opt});return()=>{}},getDocs:async()=>{reads++;throw Error('Unexpected fallback reader')}}});
  const file='js/listeners/profiles.listeners.js';const owner=await loadCode(importsToAbsolute(change(read(file)),file));
  const snap=(data,fromCache=false,hasPendingWrites=false,changes)=>({size:Object.keys(data).length,empty:!Object.keys(data).length,metadata:{fromCache,hasPendingWrites},forEach:fn=>Object.entries(data).forEach(([id,p])=>fn({id,data:()=>p})),docChanges:()=>changes??Object.entries(data).map(([id,p])=>({type:'added',doc:{id,data:()=>p}}))});
  const mount=(role='admin',branch='')=>owner.mountActiveProfilesListener({clubId:'A',role,coachBranch:branch,profRef:{path:'clubs/A/profiles'},db:{}});
  try{
    if(kind==='coach'){
      window.userRole='coach';Object.assign(window.__store,{userRole:'coach',coachBranch:'CS1'});Object.assign(window.__verifiedAuthContextState,{role:'coach',coachBranch:'CS1'});window.coachBranch='CS1';mount('coach','CS1');
      assert.equal(callbacks.length,2);assert(callbacks.every(c=>!c.q.parts.some(p=>p.where?.[0]==='status')));
      callbacks[0].cb(snap({legacy:{branch:'CS1',status:'Đang tập'}}));assert.notEqual(owner.getProfilesListenerMetrics().coachRosterReadiness,'verified');
      callbacks[1].cb(snap({alias:{branch:'Mặc định'}}));assert.equal(owner.getProfilesListenerMetrics().coachRosterReadiness,'verified');
      assert.equal(owner.getProfilesListenerMetrics().clubId,'A');assert.equal(owner.getProfilesListenerMetrics().authorityClubId,'');
      assert.equal(Object.keys(store.getActiveProfiles()).length,2);
      assert.equal(owner.getProfilesListenerMetrics().coachOfflineRosterReady,true);
      callbacks[0].cb(snap({legacy:{branch:'CS1',status:'Đang tập'}},true,false,[]));
      assert.notEqual(owner.getProfilesListenerMetrics().coachRosterReadiness,'verified');
      assert.equal(owner.getProfilesListenerMetrics().coachOfflineRosterReady,true);
      callbacks[1].cb(snap({alias:{branch:'Mặc định'}},true,false,[]));
      assert.equal(owner.getProfilesListenerMetrics().coachOfflineRosterReady,true);
      callbacks[0].cb(snap({changed:{branch:'CS1'}},true,true));
      assert.equal(owner.getProfilesListenerMetrics().coachOfflineRosterReady,false);
    }else{
      mount();assert.equal(callbacks.length,1);const cb=callbacks[0];assert.equal(cb.opt.includeMetadataChanges,true);
      cb.cb(snap({a:{status:'active'}},true));assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,false);
      cb.cb(snap({a:{status:'active'}},false,true));assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,false);
      cb.cb(snap({a:{status:'active'},b:{status:'quit'},c:{status:'Đang tập'},d:{branch:'CS1'}}));
      assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,true);assert.equal(Object.keys(store.getActiveProfiles()).length,3);assert.deepEqual(Object.keys(store.getQuitProfiles()),['b']);
      if(kind==='zero'){cb.cb(snap({},false,false,['a','b','c','d'].map(id=>({type:'removed',doc:{id}}))));assert.equal(Object.keys(store.getAllProfilesCompat()).length,0);assert.equal(owner.getProfilesListenerMetrics().fullAuthorityComplete,true);assert.equal(reads,0);}
      if(kind==='partial'){
        store.syncLegacyAllProfiles({x:{status:'active'}},'partial-test',{complete:false});assert(store.getQuitProfiles().b);assert(store.getActiveProfiles().x);
        const students=read('js/modules/students.js');const a=students.indexOf('function _hydrateCanonicalProfileFromPagination');
        assert(!students.includes("window.syncProfilesToStudentStore(st.profiles, reason || 'pagination-profile-hydrate')"));
      }
      window.__verifiedAuthContextState.generation=2;cb.cb(snap({stale:{status:'active'}}));assert(!store.getAllProfilesCompat().stale);
    }
    assert.equal(reads,0);return true;
  }finally{owner.resetProfilesListeners('v10-contract-end');regs.clear();}
}

export async function authContract(change=x=>x){
  const app=change(read('app.js')),commit=expression(app,'const _commitVerifiedAuthContext ='),reset=expression(app,'const _resetVerifiedAuthContext =');
  const box={currentClubId:'',window:{__store:{},__verifiedAuthContextState:{generation:1}},_normalizeAuthContext:x=>x,_saveAuthCache(){}};vm.createContext(box);
  const f=vm.runInContext(commit,box),r=vm.runInContext(reset,box);
  f({uid:'u'},{role:'coach',clubId:'A',coachBranch:'CS1'});assert.equal(box.window.currentClubId,'A');assert.equal(box.window.__store.clubId,'A');assert.equal(box.window.__verifiedAuthContextState.ready,true);
  assert.throws(()=>f({uid:'u'},{role:'coach',clubId:'A',coachBranch:''}));
  r('test');assert.equal(box.window.currentClubId,'');assert.equal(String(box.window.__store.clubId||''),'');assert.equal(box.window.__verifiedAuthContextState.ready,false);return true;
}

export async function paginationContract(change=x=>x){
  const src=change(read('js/modules/students.js')),start=src.indexOf('function _paginationContext()'),end=src.indexOf('// ── Core: thực sự load một trang profiles',start);assert(start>=0&&end>start);
  const block=src.slice(start,end)+';this.project=_mergePaginationProfilesIntoStore;';
  for(const mode of ['same','wrong-role','wrong-club','wrong-epoch','pending']){
    const store={clubId:'A',currentClubId:'A',userRole:'admin',profiles:{p:{paidUntil:'2026-10',secret:99}}};
    const metrics={authorityClubId:mode==='wrong-club'?'B':'A',role:'admin',authoritySessionEpoch:mode==='wrong-epoch'?1:2,authorityServerConfirmed:true,authorityFreshness:mode==='pending'?'pending':'fresh',fullAuthorityComplete:true,lastProfilesMode:'full-profiles-authoritative'};
    const w={__store:store,userRole:mode==='wrong-role'?'coach':'admin',__verifiedAuthContextState:{ready:true,role:'admin',clubId:'A',generation:2,uid:'u'},getProfilesListenerMetrics:()=>metrics,studentProfileStore:{quitComplete:true}};
    const b={window:w,store};vm.createContext(b);vm.runInContext(block,b);const item={id:'p',paidUntil:'2026-08'};b.project([item]);
    assert.equal(item.paidUntil,mode==='same'?'2026-10':'2026-08');assert.equal(store.profiles.p.paidUntil,'2026-10');
  }return true;
}

const contracts={scale:dailyContract,search:dailyContract,shift:dailyContract,finance:financeContract,exam:examContract,display:displayContract,auth:authContract,hydrate:()=>listenerContract('hydrate'),zero:()=>listenerContract('zero'),coach:()=>listenerContract('coach'),partial:async()=>{await listenerContract('partial');return paginationContract();}};
const cache=new Map();
export async function contract(name){try{if(!cache.has(name))cache.set(name,contracts[name]());await cache.get(name);return true;}catch(e){console.error('V10 CONTRACT FAILED',name,e.stack);return false;}}
