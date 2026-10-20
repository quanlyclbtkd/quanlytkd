import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export const root=path.resolve(process.env.V10_SOURCE_ROOT || process.cwd());
export const output=path.resolve(process.env.V10_OUTPUT || '../../evidence/coach-join');fs.mkdirSync(output,{recursive:true});
const require=createRequire(path.join(root,'package.json'));
export const sdk=require('firebase/firestore');
export const rulesTest=require('@firebase/rules-unit-testing');
export const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const sourceHash=rel=>hash(fs.readFileSync(path.join(root,rel)));
export const save=(name,data)=>fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2)+'\n');
export const tick=()=>new Promise(resolve=>setImmediate(resolve));
export async function until(fn,label){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timeout: '+label);}
export class Element {
 constructor(id){this.id=id;this.value='';this.checked=false;this.disabled=false;this.innerHTML='';this.textContent='';this.dataset={};this.hidden=false;this.style={display:'',removeProperty(){}};const names=new Set();this.classList={contains:x=>names.has(x),add:(...xs)=>xs.forEach(x=>names.add(x)),remove:(...xs)=>xs.forEach(x=>names.delete(x))};}
 addEventListener(){} querySelector(){return null;}querySelectorAll(){return [];}closest(){return null;}setAttribute(){}removeAttribute(){}appendChild(){}removeChild(){}
}
export async function createRuntime(){
 globalThis.window=globalThis;
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 for(const id of ['tab_attendance','att_sub_day','att_sub_month','att_date','att_branch','att_belt','att_shift','chk_show_all_att','attendanceGrid','attendanceSummary','admin_daily_branch_summary','admin_daily_branch_body','shiftModal','shiftList','shift_name','shift_start','shift_end','att_bulk_btn'])el(id);
 el('tab_attendance').classList.add('active','tab-content');el('att_sub_month').style.display='none';el('att_date').value='2026-10-20';el('att_branch').value='all';el('att_belt').value='all';el('chk_show_all_att').checked=true;
 globalThis.document={getElementById:id=>elements.get(id)||null,querySelector:s=>s==='.tab-content.active'?el('tab_attendance'):null,querySelectorAll:()=>[],createElement:()=>new Element('created'),body:{appendChild(){},removeChild(){}}};
 const storage=new Map();const hooks={get:null,remove:null};
 globalThis.localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i]||null,getItem(k){const v=storage.get(k)??null;hooks.get?.(k,v);return v;},setItem:(k,v)=>storage.set(k,String(v)),removeItem(k){hooks.remove?.(k);storage.delete(k);}};
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 window.addEventListener=()=>{};window.removeEventListener=()=>{};window.dispatchEvent=()=>{};
 window.innerWidth=1024;window.scrollTo=()=>{};window.getLocalToday=()=> '2026-10-20';window.getBranchNameDisplay=x=>x;window.confirm=()=>true;window.alert=()=>{};
 const toasts=[],issues=[];window.showToast=(message)=>toasts.push(String(message));window.recordRuntimeError=(...args)=>issues.push(args);
 vm.runInThisContext(fs.readFileSync(path.join(root,'js/core/branchIdentity.js'),'utf8'),{filename:'actual-BranchIdentity.js'});
 vm.runInThisContext(fs.readFileSync(path.join(root,'js/core/roleReadBoundary.js'),'utf8'),{filename:'actual-RoleReadBoundary.js'});
 const serviceSpecifier=fs.readFileSync(path.join(root,'js/modules/attendance.js'),'utf8').match(/import \{ AttendanceService \} from '([^']+)'/)[1];
 const service=(await import(new URL(serviceSpecifier,pathToFileURL(path.join(root,'js/modules/attendance.js'))))).AttendanceService;
 const profiles=(await import(pathToFileURL(path.join(root,'js/data/studentProfileStore.js'))));
 const registry=await import(pathToFileURL(path.join(root,'js/utils/listeners.js')));
 const listener=await import(pathToFileURL(path.join(root,'js/listeners/profiles.listeners.js')));
 window.studentProfileStore=profiles.studentProfileStore;window.getProfileScaleMetrics=profiles.getProfileScaleMetrics;window.__profileScaleMetrics={};
 window.getProfilesListenerMetrics=listener.getProfilesListenerMetrics;
 window._syncAllProfilesLegacy=()=>{window.__store.profiles=profiles.studentProfileStore.getAllProfilesCompat();};
 window.hasListener=registry.hasListener;window.removeListener=registry.removeListener;window.safeRegisterSnapshot=registry.safeRegisterSnapshot;window.markListenerSnapshot=registry.markListenerSnapshot;
 window.invalidateLists=()=>{};window.invalidateByDomain=()=>{};window.invalidateDashboard=()=>{};window.getAppContext=()=>({});
 window.__store={db:{},clubId:'r2-A',currentClubId:'r2-A',userRole:'coach',coachBranch:'CS1',profiles:{},clubConfig:{},clubData:{}};
 window.userRole='coach';window.coachBranch='CS1';window.currentClubId='r2-A';window.__verifiedAuthContextState={ready:true,uid:'r2-c1',clubId:'r2-A',role:'coach',coachBranch:'CS1',generation:1};window._fb_init={...sdk};
 (await import(pathToFileURL(path.join(root,'js/core/globalOwnershipRegistry.js')))).initGlobalOwnershipRegistry();
 const module=await import(pathToFileURL(path.join(root,'js/modules/attendance.js')));
 const api=module.initAttendance();await window.syncOfflineAttendance();
 const batches=[];let commitHook=null;
 function installSdk(db){window._fb_init={...sdk,writeBatch(database){const batch=sdk.writeBatch(database);const rows=[];return {set(ref,data){rows.push({ref,data,kind:'set'});batch.set(ref,data);},delete(ref){rows.push({ref,kind:'delete'});batch.delete(ref);},async commit(){const entry={sequence:batches.length+1,count:rows.length,kinds:rows.map(x=>x.kind),committed:false};batches.push(entry);await commitHook?.('before',entry,rows);await batch.commit();entry.committed=true;await commitHook?.('after',entry,rows);}};}};}
 async function auth(db,{role='coach',branch='CS1',uid='r2-c1',club='r2-A',generation=1}={}){
  listener.resetProfilesListeners('r2-test-reset');registry.cleanupAllListeners('r2-test-reset');profiles.resetStudentProfileStore('r2-test-reset');
  window.__store={db,clubId:club,currentClubId:club,userRole:role,coachBranch:branch,currentUser:{uid},profiles:{},clubConfig:{},clubData:{}};
  window.userRole=role;window.coachBranch=branch;window.currentClubId=club;window.__verifiedAuthContextState={ready:true,uid,clubId:club,role,coachBranch:branch,generation};
  window.RoleReadBoundary.setContext?.({role,clubId:club,coachBranch:branch});
  installSdk(db);storage.clear();hooks.get=null;hooks.remove=null;toasts.length=0;issues.length=0;batches.length=0;commitHook=null;
  api.resetForClub(club);await api.ensureShiftsLoaded({force:true});
 }
 return {api,service,listener,profiles,registry,elements,el,storage,hooks,toasts,issues,batches,auth,installSdk,setCommitHook:fn=>{commitHook=fn;},resetBatches:()=>{batches.length=0;commitHook=null;},getCommitHook:()=>commitHook};
}
