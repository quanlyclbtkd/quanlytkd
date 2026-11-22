import fs from 'node:fs';
import path from 'node:path';
import {createHarness, flush, deferred} from './auth-harness.mjs';

const root=path.resolve(process.argv[2]||process.cwd());
const output=path.resolve(process.argv[3]||'evidence/isolation-candidate.json');
const results=[];
const json=v=>JSON.stringify(v);

function assertions(h, winner, barrier=0, transition=null) {
  const s=h.state(), user=winner?h[winner]:null;
  const data=user?(winner==='S'?{role:'super_admin',clubId:'',coachBranch:''}:h.docs.get('users/'+user.uid)):{};
  const uid=user?.uid||'', club=data.clubId||'', role=data.role||'viewer', branch=data.coachBranch||'';
  const oldMarker=winner==='A'?'hasB':'hasA';
  const after=h.events.slice(barrier);
  const wrongClubEvent=e=>e.clubId&&e.clubId!==club;
  const tests={
    firebaseUid:s.firebaseUid===uid,
    verifiedUid:s.verified.uid===uid,
    verifiedReady:s.verified.ready===!!user,
    role:s.role===role && s.store.role===role && (!user||s.verified.role===role),
    club:s.localClubId===club && s.windowClubId===club && s.store.clubId===club && s.store.currentClubId===club && s.verified.clubId===club,
    coachBranch:s.branch===branch && (!user||s.verified.coachBranch===branch),
    coachAssignment:!branch || (s.verified.allowedBranches?.join(',')===data.allowedBranches.join(',') && s.verified.assignmentVersion===data.assignmentVersion),
    roleReadBoundary:s.boundary.role===role && s.boundary.clubId===club && s.boundary.coachBranch===branch,
    storeUser:s.store.uid===uid,
    zeroOldListener:s.activeListeners.every(x=>x.ownerUid===uid && (!x.path.startsWith('clubs/')||x.path.split('/')[1]===club)),
    zeroOldDerivedState:!JSON.stringify({debts:h.window.__completeInventoryDebts,stock:h.window._liveInvMap,config:h.window.__store.clubConfig}).includes(winner==='A'?'CLUB_B_ONLY_MARKER':'CLUB_A_ONLY_MARKER'),
    zeroOldStoreMerge:after.every(e=>e.type!=='store-set'||(!e[oldMarker]&&!wrongClubEvent(e)&&(!e.uid||e.uid===uid))),
    zeroOldDomRender:after.every(e=>e.type!=='dom-text'||!e[oldMarker]),
    zeroVisibleOldMarker:winner==='A'?!s.visibleB:winner==='B'?!s.visibleA:!s.visibleA&&!s.visibleB,
    zeroOldToastOrError:!s.loginError&&!after.some(e=>['toast','console-error','console-warn'].includes(e.type)),
    zeroOldHistoryWrite:after.every(e=>e.type!=='write'||e.path!=='login_history'||!wrongClubEvent(e)),
    zeroOldSignOut:!after.some(e=>e.type==='signOut'),
    zeroWrongClubWrite:after.every(e=>e.type!=='write'||!e.path.startsWith('clubs/')||e.path.split('/')[1]===club),
    nullHidesProtected:!!user||!s.mainVisible,
    transitionNeutral:!transition||(!transition.mainVisible&&Object.keys(transition.store.profiles).length===0&&transition.activeListeners.length===0),
    nullClearsTenantRefs:!!user||(!h.window.__store.colRef&&!h.window.__store.profRef&&!h.window.__store.invRef),
  };
  return {assertions:tests, failed:Object.keys(tests).filter(k=>!tests[k]), state:s};
}

async function run(id, description, fn, options={}) {
  const h=createHarness(root,options);
  try {
    const r=await fn(h);
    await flush();
    const checked=assertions(h,r.winner,r.barrier??h.events.length,r.transition??null);
    if(r.checks){Object.assign(checked.assertions,r.checks);checked.failed=Object.keys(checked.assertions).filter(k=>!checked.assertions[k]);}
    results.push({id,description,status:checked.failed.length?'FAIL':'PASS',...checked,events:h.events,reads:h.reads,writes:h.writes.map(w=>({path:w.path,currentUid:w.currentUid,clubId:w.data?.clubId||'',role:w.data?.role||''})),...(r.extra?{extra:r.extra}:{})});
  } catch(e) {results.push({id,description,status:'HARNESS_ERROR',error:String(e.stack),events:h.events});}
}

const normal=winner=>async h=>{await h.emit(h[winner]);await flush();return {winner};};
const direct=(first,last)=>async h=>{await h.emit(h[first]);await flush();const p=h.emit(h[last]);const transition=h.state();await p;await flush();return {winner:last,transition};};
const late=(kind,{coach=false,superadmin=false,reverse=false,logout=false,sameClub=false}={})=>async h=>{
  const first=superadmin?'S':reverse?'B':'A', winner=logout?null:reverse?'A':'B';
  const u=h[first], data=h.docs.get('users/'+u.uid);
  const key=kind==='coach'?`clubs/${data.clubId}/coaches/${u.uid}`:kind==='root'?`root:clubs/${data.clubId}`:superadmin?`super_admins/${u.uid}`:`users/${u.uid}`;
  const gate=h.delay(key);const initial=h.emit(u);await flush();
  const p=h.emit(winner?h[winner]:null);const transition=h.state();await p;await flush();const barrier=h.events.length;
  if(kind==='error'||kind==='coach-error'||kind==='super-error')gate.reject();else gate.resolve();
  await flush();
  // A removed root listener can leave its original firstSnapshot promise
  // unresolved. Do not pretend that Promise completion is required for safe drop.
  let originalSettled=false;initial.then(()=>{originalSettled=true},()=>{originalSettled=true});
  await flush();await h.runTimers();
  return {winner,barrier,transition:kind==='root'||logout?transition:null,extra:{originalCallbackSettled:originalSettled,delay:key}};
};

await run('I01','A normal login',normal('A'));
await run('I02','B normal login',normal('B'));
await run('I03','A → null → B',async h=>{await h.emit(h.A);await h.emit(null);const transition=h.state();await h.emit(h.B);return {winner:'B',transition};});
await run('I04','direct A → B without null',direct('A','B'));
await run('I05','A users read delayed, B current',late('user'));
await run('I06','A Coach authority delayed, B current',late('coach'),{coach:true});
await run('I07','A club-init first snapshot delayed, B current',late('root'));
await run('I08','A stale users error cannot sign out B',late('error'));
await run('I09','A stale success cannot overwrite B',late('user'));
await run('I10','direct B → A',direct('B','A'));
await run('I11','restored authenticated A',normal('A'));
await run('I12','previous local cache A with authenticated B',async h=>{h.context.localStorage.setItem('_qlclb_auth_v3',json({...h.A,role:'admin',clubId:'CLUB_A',ts:Date.now()}));await h.emit(h.B);return {winner:'B'};});
await run('I13','auth null while A verification pending',late('user',{logout:true}));
await run('I14','two isolated tab runtimes receive a shared A → B auth event',async h=>{
  const other=createHarness(root,{traceName:'tab-2'});
  const delay=h.delay('users/'+h.A.uid);h.emit(h.A);await other.emit(other.A);await flush();
  const p1=h.emit(h.B),p2=other.emit(other.B);const transition=h.state();await Promise.all([p1,p2]);const barrier=h.events.length;delay.resolve();await flush();await h.runTimers();
  const second=assertions(other,'B',other.events.length);
  const secondTabSafe=second.failed.length===0;
  return {winner:'B',barrier,transition:null,checks:{secondTabSafe},extra:{secondTabAssertions:second.assertions,transport:'SYNTHETIC_SHARED_AUTH_EVENT_BUS; not real Firebase persistence'}};
});
await run('I15','Coach A CS1 → Coach B CS2',direct('A','B'),{coach:true});
await run('I16','stale SuperAdmin principal read → tenant Admin B',late('user',{superadmin:true}));
await run('I17','stale tenant Admin A → SuperAdmin',async h=>{const d=h.delay('users/'+h.A.uid);h.emit(h.A);await flush();await h.emit(h.S);await flush();const barrier=h.events.length;d.resolve();await flush();await h.runTimers();return {winner:'S',barrier};});
await run('X01','A → B → A invalidates the oldest callback for the same UID',async h=>{const d=h.delay('users/'+h.A.uid);h.emit(h.A);await flush();await h.emit(h.B);await h.emit(h.A);const barrier=h.events.length;d.reject();await flush();await h.runTimers();return {winner:'A',barrier};});
await run('X02','delayed login user-agent hints do not write old login history',async h=>{const hints=deferred();h.context.navigator.userAgentData={getHighEntropyValues:()=>hints.promise};await h.emit(h.A);delete h.context.navigator.userAgentData;await h.emit(h.B);const barrier=h.events.length;hints.resolve({model:'Synthetic'});await flush();return {winner:'B',barrier};});
await run('X03','same-club A init completes after B authority',late('root'),{sameClub:true});
await run('X04','stale missing SuperAdmin principal cannot bootstrap-write under B',async h=>{h.docs.delete('super_admins/'+h.S.uid);const d=h.delay('super_admins/'+h.S.uid);h.emit(h.S);await flush();await h.emit(h.B);const barrier=h.events.length;d.resolve();await flush();await h.runTimers();const extra=h.writes.filter(w=>w.path.startsWith('super_admins/'));const r={winner:'B',barrier,extra:{staleSuperAdminWrites:extra.length}};if(extra.length)h.events.push({type:'console-error',message:'STALE_SUPERADMIN_WRITE'});return r;});
await run('X05','SuperAdmin error after B current is silently dropped',late('super-error',{superadmin:true}));
await run('X06','A delayed init notification/reminder must not run as B work',async h=>{await h.emit(h.A);await h.emit(h.B);const barrier=h.events.length;await h.runTimers();const after=h.events.slice(barrier);const notificationCount=after.filter(e=>e.type==='notification-mount').length;const reminderCount=after.filter(e=>e.type==='reminder').length;if(notificationCount>1||reminderCount>1)h.events.push({type:'console-error',message:'OLD_DEFERRED_CALLBACK_EXECUTED'});return {winner:'B',barrier,extra:{notificationCount,reminderCount}};});

await run('X07','same UID fresh auth event preserves working listener ownership',async h=>{await h.emit(h.A);await h.emit(h.A);const current=h.subscriptions.filter(s=>s.active&&s.path.endsWith('/settings/main_config'));const fresh=current.at(-1);if(fresh)fresh.callback({exists:()=>true,data:()=>({marker:'CURRENT_A_CONFIG'}),metadata:{fromCache:false,hasPendingWrites:false}});return {winner:'A',checks:{currentListenerCanPublish:h.window.__store.clubConfig?.marker==='CURRENT_A_CONFIG',oneActiveSettingsListener:current.length===1}};});
await run('X08','old settings/debt callbacks cannot merge after B owns runtime',async h=>{await h.emit(h.A);const old=h.subscriptions.filter(s=>s.path.endsWith('/settings/main_config')||s.path.endsWith('/settings/inventory_stats')||s.path.endsWith('/inventory'));await h.emit(h.B);const barrier=h.events.length;const snap={exists:()=>true,data:()=>({marker:'CLUB_A_ONLY_MARKER'}),docs:[{id:'CLUB_A_ONLY_MARKER',data:()=>({marker:'CLUB_A_ONLY_MARKER',unpaid:true})}],metadata:{fromCache:false,hasPendingWrites:false}};for(const s of old)s.callback(snap);return {winner:'B',barrier};});
await run('X09','A error signOut completion cannot overlay new B',async h=>{const d=h.delay('users/'+h.A.uid);h.control.signOutCompletion=deferred();h.emit(h.A);await flush();d.reject();await flush();await h.emit(h.B);const barrier=h.events.length;h.control.signOutCompletion.resolve();await flush();await h.runTimers();return {winner:'B',barrier};});
await run('X10','SuperAdmin loader A result cannot render after tenant B',async h=>{const load=deferred();delete h.window.SuperAdminModule;h.window.ensureSuperAdminModule=()=>load.promise;h.emit(h.S);await flush();const retry=h.timers.find(t=>t.ms===150);if(retry){retry.cancelled=true;retry.fn();}await flush();await h.emit(h.B);const barrier=h.events.length;h.window.SuperAdminModule={loadSuperAdminDashboard:()=>h.events.push({type:'dom-text',hasA:true,id:'sysClubListMain'})};load.resolve(true);await flush();return {winner:'B',barrier};});

const total=results.reduce((n,r)=>n+Object.keys(r.assertions||{}).length,0);
const failed=results.reduce((n,r)=>n+(r.failed?.length||0)+(r.status==='HARNESS_ERROR'?1:0),0);
const report={kind:'EXACT_SOURCE_VM_HARNESS',sourceRoot:root,productionNetworkAccess:0,realBrowser:false,realFirebaseAuth:false,totalCases:results.length,passedCases:results.filter(r=>r.status==='PASS').length,totalAssertions:total,failedAssertions:failed,status:failed?'FAIL':'PASS',results};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,totalCases:report.totalCases,passedCases:report.passedCases,totalAssertions:total,failedAssertions:failed,failures:results.filter(x=>x.status!=='PASS').map(x=>({id:x.id,failed:x.failed,error:x.error}))},null,2));
if(failed)process.exitCode=1;
