import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const flush = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
export const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const slice = (s, a, b) => { const start=s.indexOf(a), end=s.indexOf(b,start); if(start<0||end<0) throw Error('SOURCE_EXTRACTION_BOUNDARY_MISSING: '+a); return s.slice(start,end); };
const snapshot = data => ({ exists:()=>data!==null, data:()=>data, metadata:{fromCache:false,hasPendingWrites:false} });
export const principals = {
  A:{uid:'SYNTHETIC_UID_A',email:'a@example.invalid'},
  B:{uid:'SYNTHETIC_UID_B',email:'b@example.invalid'},
  S:{uid:'SYNTHETIC_UID_S',email:''},
};

// Execute the exact observer, commit/reset, history, Coach resolver, club-root
// authority and complete initSaaSDatabase bodies. Only SDK/network/DOM adapters
// are synthetic. This is not a real Firebase or real browser acceptance run.
export function createHarness(root, {coach=false, sameClub=false, traceName='tab-1'}={}) {
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const bootstrapEmail=app.match(/const _SUPER_ADMIN_BOOTSTRAP_EMAIL = ('[^']*');/)[1];
  const A={...principals.A}, B={...principals.B}, S={...principals.S,email:JSON.parse(bootstrapEmail.replaceAll("'",'"'))};
  const profile=(who, branch) => ({role:coach?'coach':'admin',clubId:sameClub?'CLUB_SHARED':'CLUB_'+who,...(coach?{branch,coachBranch:branch,primaryCoachBranch:branch,allowedBranches:[branch],assignmentVersion:'synthetic-'+who}:{})});
  const docs=new Map([[`users/${A.uid}`,profile('A','CS1')],[`users/${B.uid}`,profile('B','CS2')],[`super_admins/${S.uid}`,{enabled:true}]]);
  for(const [who,user,branch] of [['A',A,'CS1'],['B',B,'CS2']]) {const data=profile(who,branch);docs.set(`clubs/${data.clubId}/coaches/${user.uid}`,data);}
  const control={}, pending=new Map(), reads=[], writes=[], events=[], timers=[], subscriptions=[], nodes=new Map();
  let time=0, observer, nextTimer=1;
  const listeners=new Map();
  const expected=()=>{const u=auth.currentUser;return u?(u.uid===S.uid?{uid:u.uid,role:'super_admin',clubId:'',coachBranch:''}:{uid:u.uid,...docs.get('users/'+u.uid),coachBranch:coach?docs.get('users/'+u.uid).coachBranch:''}):null;};
  const event=(type, detail={})=>events.push({index:events.length,type,tab:traceName,...detail});
  const storage=()=>{const d={};Object.defineProperties(d,{getItem:{value:k=>d[k]??null},setItem:{value:(k,v)=>{d[k]=String(v)}},removeItem:{value:k=>{delete d[k]}}});return d;};
  class Node {
    constructor(id){this.id=id;this.style={display:'none'};this.dataset={};this.value=id==='filterMonth'?'2026-11':'';this.children=[];this._text='';this.disabled=false;this.isConnected=true;const c=new Set();this.classList={add:(...xs)=>xs.forEach(x=>c.add(x)),remove:(...xs)=>xs.forEach(x=>c.delete(x)),contains:x=>c.has(x)};}
    set textContent(v){this._text=String(v);event('dom-text',{id:this.id,hasA:this._text.includes('CLUB_A_ONLY_MARKER'),hasB:this._text.includes('CLUB_B_ONLY_MARKER')});}
    get textContent(){return this._text;}
    set innerText(v){this.textContent=v;} get innerText(){return this.textContent;}
    set innerHTML(v){this.textContent=v;} get innerHTML(){return this.textContent;}
    appendChild(n){this.children.push(n);return n;} append(...ns){this.children.push(...ns);} prepend(n){this.children.unshift(n);} replaceChildren(...ns){this.children=ns;this._text='';}
    remove(){nodes.delete(this.id);this.isConnected=false;} focus(){event('focus',{id:this.id});} closest(){return this;} querySelectorAll(){return [];} querySelector(){return null;} setAttribute(k,v){this[k]=v;} removeAttribute(k){delete this[k];}
  }
  const ids=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  ids.forEach(id=>nodes.set(id,new Node(id)));
  const document={getElementById:id=>nodes.get(id)||null,createElement:()=>new Node('created-'+nodes.size),querySelector:()=>null,querySelectorAll:s=>s==='.tab-content'?[...nodes.values()].filter(n=>n.id.startsWith('tab_')):s==='.tab-btn'?[...nodes.values()].filter(n=>n.id.startsWith('btn_')):[],addEventListener(){}};
  const store=new Proxy({db:{synthetic:true},profiles:{},transactions:[],inventory:[]},{set(target,k,v){if(['clubId','currentClubId','currentUser','profiles','transactions','inventory','clubData','clubConfig'].includes(k))event('store-set',{key:k,uid:k==='currentUser'?v?.uid:null,clubId:['clubId','currentClubId'].includes(k)?v:null,hasA:JSON.stringify(v??null).includes('CLUB_A_ONLY_MARKER'),hasB:JSON.stringify(v??null).includes('CLUB_B_ONLY_MARKER')});target[k]=v;return true;}});
  const window={__appLoaded:true,__store:store,__dataHydrationMetrics:{},userRole:'viewer',coachBranch:'',__loginPerfMetrics:{},__inventoryReadMetrics:{},addEventListener:(n,fn)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(fn);},removeEventListener:(n,fn)=>listeners.get(n)?.delete(fn),dispatchEvent:e=>{event('event',{name:e.type});for(const fn of [...(listeners.get(e.type)||[])])fn(e);},showToast:()=>event('toast'),AttendanceModule:{closeMemberHistory(){},resetForClub:()=>event('attendance-reset')},resetProfilesListeners:()=>event('profiles-reset'),resetStudentProfileStore:()=>{store.profiles={}},resetReportsModuleState(){},_moduleDashboard:{resetFreshness(){}},_destroyDashboardCharts(){},switchTab(){},resetAutomaticCanonicalTransactionOptimization(){},resetDebtProfileReadBoundary(){},mountActiveProfilesListener:({clubId})=>{const who=clubId==='CLUB_SHARED'?(auth.currentUser?.uid===A.uid?'A':'B'):clubId.endsWith('A')?'A':'B';const marker=`CLUB_${who}_ONLY_MARKER`;store.profiles={[marker]:{marker}};nodes.get('activeList').textContent=marker;event('profile-mount',{clubId,uid:auth.currentUser?.uid});},listenToData:()=>event('finance-mount'),renderAttendanceList:()=>event('attendance-render'),loadInvCategories:async()=>event('inventory-categories-load'),_checkMonthlyReminder:()=>event('reminder'),setupNotifListener:()=>event('notification-mount'),SuperAdminModule:{loadSuperAdminDashboard:()=>event('superadmin-render')},resetStore:()=>{event('store-reset');Object.assign(store,{profiles:{},transactions:[],inventory:[],clubData:{},clubConfig:{},colRef:null,profRef:null,invRef:null});},__moduleResetStore:()=>event('module-store-reset')};
  const auth={currentUser:null};
  const ref=(db,...parts)=>({path:parts.join('/')});
  const sdk={doc:ref,collection:ref,where:(...a)=>a,limit:x=>x,orderBy:(...a)=>a,query:(r,...constraints)=>({...r,constraints}),getDoc:r=>{reads.push(r.path);event('read',{path:r.path});const delayed=pending.get(r.path);if(delayed)pending.delete(r.path);return delayed?delayed.promise:Promise.resolve(snapshot(docs.get(r.path)??null));},addDoc:async(r,data)=>{writes.push({path:r.path,data,currentUid:auth.currentUser?.uid});event('write',{path:r.path,clubId:data.clubId,uid:auth.currentUser?.uid});return{id:'synthetic-history'};},setDoc:async(r,data)=>{writes.push({path:r.path,data,currentUid:auth.currentUser?.uid});event('write',{path:r.path,uid:auth.currentUser?.uid});},onSnapshot:(r,...args)=>{const callback=args.find(x=>typeof x==='function'),error=args.filter(x=>typeof x==='function')[1];const sub={path:r.path,callback,error,active:true,ownerUid:auth.currentUser?.uid};subscriptions.push(sub);event('listener-mount',{path:r.path,uid:sub.ownerUid});if(r.path.split('/').length===2&&r.path.startsWith('clubs/')){const delay=pending.get('root:'+r.path);if(delay)pending.delete('root:'+r.path);const run=()=>callback(snapshot({clubName:r.path.endsWith('A')?'CLUB_A_ONLY_MARKER':'CLUB_B_ONLY_MARKER',accountStatus:'active',expiryDate:'2027-12-31'}));if(delay)delay.promise.then(run);else Promise.resolve().then(run);}return()=>{sub.active=false;event('listener-stop',{path:r.path});};},signOut:async()=>{event('signOut',{uid:auth.currentUser?.uid});if(control.signOutFailure)throw Error('synthetic-signout-failure');await emit(null);if(control.signOutCompletion)await control.signOutCompletion.promise;},onAuthStateChanged:(a,fn)=>{if(observer)throw Error('SECOND_AUTH_OBSERVER');observer=fn;}};
  window._fb_init=sdk;
  const context=vm.createContext({window,document,auth,db:store.db,...sdk,console:Object.fromEntries(['log','warn','error','info','debug','group','groupEnd','table'].map(k=>[k,(...args)=>event('console-'+k,{message:String(args[0]).slice(0,100)})])),localStorage:storage(),sessionStorage:storage(),navigator:{userAgent:'Synthetic Harness'},setTimeout:(fn,ms)=>{const id=nextTimer++;timers.push({id,fn,ms});return id;},clearTimeout:id=>{const t=timers.find(x=>x.id===id);if(t)t.cancelled=true;},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},getLocalToday:()=> '2026-11-10',formatDate:x=>x,loadLogoForReceipt(){},scheduleRender(){},applyClubConfigUI:()=>event('settings-render'),_updateHydrationMetrics:patch=>Object.assign(window.__dataHydrationMetrics,patch),dispatchAppContextReady:()=>event('context-ready'),_resetTransactionCoverage:()=>{},_receiptPrincipalFingerprint:()=>auth.currentUser?.uid||'',_acceptReceiptSettingsSnapshot(){},_legacyEscapeHtmlFailClosed:x=>String(x),markLoginPerf:()=>{},Date,URL,Blob:globalThis.Blob,Option:class{constructor(t,v){this.text=t;this.value=v;}}});
  const run=(code,name)=>vm.runInContext(code,context,{filename:name});
  run("let currentClubId='', clubData={}, allProfiles={}, allTransactions=[], allInventory=[], inventoryStats={}, clubConfig={}, colRef=null, profRef=null, invRef=null, currentTxUnsub=null, activeListeners=[], financeChartInstance=null, memberChartInstance=null, logoLoaded=false; const _SUPER_ADMIN_BOOTSTRAP_EMAIL = "+bootstrapEmail+";",'harness-state');
  for(const file of ['js/core/branchIdentity.js','js/core/roleReadBoundary.js','js/core/coachBranchRuntimeRepair.js'])run(fs.readFileSync(path.join(root,file),'utf8'),file);
  run(fs.readFileSync(path.join(root,'js/utils/listeners.js'),'utf8').replace(/^export /gm,''),'js/utils/listeners.js');
  run('Object.assign(window,{safeRegisterSnapshot,registerListener,removeListener,cleanupAllListeners,getListenerMetrics,markListenerSnapshot});','existing-registry-exports');
  const setContext=window.RoleReadBoundary.setContext;
  // RoleReadBoundary is frozen; inspect its actual state at checkpoints instead.
  void setContext;
  run(slice(app,'const _canonicalBranch =','const _branchAliases ='),'canonical-branch');
  run(slice(app,'function _setLoginError(msg)','window.handleLogin ='),'login-error-ui');
  run(slice(app,app.includes('// R1A: private callback freshness')?'// R1A: private callback freshness':'// ── Ghi nhận lịch sử đăng nhập','// Exactly one users/{uid} verification promise'),'auth-context-helpers');
  run(slice(app,'// Phase 4K-6V5U6B — ONE clubs/{clubId} authority','    //  SUPER ADMIN: NÂNG CẤP'),'club-authority-and-complete-init');
  run(slice(app,'// Exactly one users/{uid} verification promise','    // Phase 4K-6V3A compatibility: 4K-6V3A-firestore-read-attribution'),'actual-auth-observer');
  function emit(user){auth.currentUser=user;event('auth-event',{uid:user?.uid||null});return observer(user);}
  function delay(key){const d=deferred();pending.set(key,d);return {resolve:(data)=>{pending.delete(key);d.resolve(key.startsWith('root:')?undefined:snapshot(data??docs.get(key)??null));},reject:(error=Object.assign(new Error('synthetic-denied'),{code:'permission-denied'}))=>{pending.delete(key);d.reject(error);}};}
  const state=()=>({firebaseUid:auth.currentUser?.uid||'',verified:{...window.__verifiedAuthContextState},localClubId:run('currentClubId','inspect-local-club'),windowClubId:window.currentClubId||'',role:window.userRole,branch:window.coachBranch,store:{uid:store.currentUser?.uid||'',clubId:store.clubId||'',currentClubId:store.currentClubId||'',role:store.userRole||'',profiles:structuredClone(store.profiles)},boundary:window.RoleReadBoundary.readContext(),activeListeners:subscriptions.filter(x=>x.active).map(x=>({path:x.path,ownerUid:x.ownerUid})),mainVisible:nodes.get('mainApp').style.display!=='none',loginError:nodes.get('loginErrorMsg')?.textContent||'',visibleA:nodes.get('mainApp').style.display!=='none'&&[...nodes.values()].some(x=>x.textContent.includes('CLUB_A_ONLY_MARKER')),visibleB:nodes.get('mainApp').style.display!=='none'&&[...nodes.values()].some(x=>x.textContent.includes('CLUB_B_ONLY_MARKER'))});
  const runTimers=async()=>{const list=timers.splice(0);for(const t of list){if(!t.cancelled)t.fn();await flush();}};
  return {A,B,S,control,window,context,auth,docs,reads,writes,events,subscriptions,timers,pending,nodes,emit,delay,state,expected,runTimers,flush,run};
}
