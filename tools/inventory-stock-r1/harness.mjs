import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {parse} from '../v11r2/vendor/acorn.mjs';

export const clone=x=>x===undefined?undefined:structuredClone(x);
export const statsPath='clubs/A/settings/inventory_stats';
export const base='Võ phục|||170';
export function barrier(count){let release;const promise=new Promise(r=>release=r);let arrived=0;return async()=>{if(++arrived===count)release();await promise;};}
export class Store {
 constructor(balance){this.docs=new Map();this.version=new Map();this.events=[];this.id=0;this.afterRead=null;this.beforeCommit=null;this.afterAck=null;this.rejectCommit=null;this.seed(statsPath,balance===undefined?{}:{[base+'_balance']:balance,[base+'_in']:10,[base+'_out']:10-balance});}
 seed(p,data){this.docs.set(p,clone(data));this.version.set(p,(this.version.get(p)||0)+1);}
 data(p){return clone(this.docs.get(p));}
 balance(sku=base){return this.docs.get(statsPath)?.[sku+'_balance'];}
 rows(part){return [...this.docs].filter(([p])=>p.includes('/'+part+'/'));}
 apply(client,ops,reads=null,attempt=0){
  if(reads&&[...reads].some(([p,v])=>(this.version.get(p)||0)!==v)){this.events.push({kind:'conflict',client,attempt});return false;}
  if(this.rejectCommit?.(client,ops))throw Error('injected primary failure');
  const next=new Map([...this.docs].map(([p,d])=>[p,clone(d)]));
  const field=(old,v)=>v&&v.__increment!==undefined?(typeof old==='number'?old:0)+v.__increment:v&&v.__arrayUnion?[...new Set([...(old||[]),...v.__arrayUnion])]:clone(v);
  for(const [kind,ref,data,opt]of ops){const p=ref.path;if(kind==='delete'){next.delete(p);continue;}if(kind==='update'&&!next.has(p))throw Error('missing doc '+p);const prior=next.get(p)||{},target=(kind==='update'||opt?.merge)?clone(prior):{};for(const [k,v]of Object.entries(data||{}))target[k]=field(prior[k],v);next.set(p,target);}
  this.docs=next;for(const p of new Set(ops.map(x=>x[1].path)))this.version.set(p,(this.version.get(p)||0)+1);
  this.events.push({kind:'commit',client,attempt,writes:ops.map(([kind,ref,data])=>({kind,path:ref.path,data:clone(data)}))});return true;
 }
 sdk(client){
  const store=this,ref=p=>({path:p,id:p.split('/').at(-1)});
  const makeWriter=(ops,onWrite=()=>{})=>({set(r,d,o){onWrite();ops.push(['set',r,clone(d),o]);return this;},update(r,d){onWrite();ops.push(['update',r,clone(d)]);return this;},delete(r){onWrite();ops.push(['delete',r]);return this;}});
  const snapshot=r=>{const data=store.data(r.path);return{id:r.id,exists:()=>data!==undefined,data:()=>clone(data),metadata:{fromCache:false,hasPendingWrites:false}};};
  return {
   collection:(_db,...parts)=>ref(parts.join('/')),
   doc:(db,...parts)=>parts.length?ref((db?.path?db.path+'/':'')+parts.join('/')):ref(db.path+'/auto-'+client+'-'+(++store.id)),
   increment:n=>({__increment:n}),arrayUnion:(...x)=>({__arrayUnion:x}),
   getDoc:async r=>{store.events.push({kind:'getDoc',client,path:r.path});return snapshot(r);},
   writeBatch:()=>{const ops=[];return{...makeWriter(ops),commit:async()=>{store.events.push({kind:'batch-attempt',client});await store.beforeCommit?.({client,attempt:0,ops});store.apply(client,ops);await store.afterAck?.({client,ops});}};},
   runTransaction:async(_db,callback)=>{
    const started=performance.now();
    for(let attempt=1;attempt<=5;attempt++){
     const reads=new Map(),ops=[];let wrote=false;
     const tx={...makeWriter(ops,()=>wrote=true),get:async r=>{if(wrote)throw Error('Firestore transaction read after write');const v=store.version.get(r.path)||0,snap=snapshot(r);reads.set(r.path,v);store.events.push({kind:'tx-read',client,attempt,path:r.path,version:v,data:snap.data()});await store.afterRead?.({client,attempt,path:r.path,version:v});return snap;}};
     try{const result=await callback(tx);await store.beforeCommit?.({client,attempt,ops});if(!store.apply(client,ops,reads,attempt))continue;await store.afterAck?.({client,attempt,ops});store.events.push({kind:'transaction-end',client,attempts:attempt,durationMs:performance.now()-started,status:'COMMIT'});return result;}
     catch(error){store.events.push({kind:'transaction-end',client,attempts:attempt,durationMs:performance.now()-started,status:'DENY',code:error.code||error.message});throw error;}
    }throw Error('transaction max attempts');
   },
  };
 }
}
const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
const ast=source=>parse(source,{ecmaVersion:'latest',sourceType:'module'});
function assignment(source,object,property){let found;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object?.name===object&&n.left.property?.name===property)found=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);};walk(ast(source));if(!found)throw Error('Missing actual assignment '+object+'.'+property);return source.slice(found.start,found.end)+';';}
function prelude(source){const t=ast(source),end=t.body.find(n=>n.type.startsWith('Export'))?.start??source.length;return t.body.filter(n=>n.end<=end&&n.type!=='ImportDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');}
export function client(root,store,id='A',role='admin'){
 const events=[],elements=new Map(),debtChecks=[];
 const element=(key,value='')=>({id:key,value,style:{display:'flex'},dataset:{},options:[],checked:false,addEventListener(){},focus(){},reset(){events.push({kind:'reset'});},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k]??null;},replaceChildren(){},classList:{add(){},remove(){}}});
 const doc={getElementById:key=>elements.get(key)||null,querySelectorAll:s=>s==='.mi-inv-debt-check:checked'?debtChecks:[],querySelector:()=>null,createElement:t=>element(t)};
 const put=(key,value='',more={})=>{const el=Object.assign(element(key,value),more);elements.set(key,el);return el;};
 const sdk=store.sdk(id),w={userRole:role,currentClubId:'A',currentUserEmail:'qa@example.invalid',__verifiedAuthContextState:{ready:true,uid:'qa',clubId:'A',generation:1,sessionEpoch:1,authGeneration:1},__store:{db:{},clubId:'A',invRef:{path:'clubs/A/inventory'},colRef:{path:'clubs/A/transactions'},profiles:{},clubConfig:{branchCount:1}},_fb_init:sdk,showToast:m=>events.push({kind:'toast',message:String(m)}),mergeInventoryIntoRuntimeStore:x=>events.push({kind:'inventory-project',item:clone(x)}),removeInventoryFromRuntimeStore:x=>events.push({kind:'inventory-remove',id:x}),notifyInventoryMutation:()=>events.push({kind:'notify'}),mergeTransactionIntoRuntimeStore:x=>events.push({kind:'finance-project',item:clone(x)}),guardFinancialWriteIntent:()=>({ok:true}),isFinancialWriteAllowed:()=>true,recordFinancialActionAudit(){},_getClubShifts:()=>[],_ensureClubShiftsLoaded:async()=>{},getLocalToday:()=> '2026-11-08',getBranchNameDisplay:x=>x,formatMonthCompact:x=>x,formatTuitionMonthList:x=>x.join(','),invalidateByDomain(){},exportReceipt:async()=>({ok:true}),closeAddModal(){},buildAdmissionTuitionPackage:(date,count)=>({packageCount:count,months:[date.slice(0,7)],startMonth:date.slice(0,7),lastMonth:date.slice(0,7),label:date.slice(0,7)}),buildPaymentBundleTransaction:x=>({...x,type:'Thu gộp',amount:x.components.reduce((s,c)=>s+c.amount,0),components:x.components.map(c=>({...c}))})};
 const context=()=>({...w.__verifiedAuthContextState,clubId:w.__store.clubId}),current=c=>c&&c.clubId===w.__store.clubId&&c.generation===w.__verifiedAuthContextState.generation&&c.uid===w.__verifiedAuthContextState.uid;
 const finance={captureFinancialWriteContext:context,isFinancialWriteContextCurrent:current,prepareTransactionMutation:(payload,reason,ref)=>{const r=ref||sdk.doc(w.__store.colRef);return{ref:r,payload:clone(payload),runtimeTx:{id:r.id,...clone(payload)}};},_arrayUnion:sdk.arrayUnion};w.FinanceService=finance;
 const sandbox={window:w,document:doc,console:{error:(...x)=>events.push({kind:'error',message:String(x[0])}),warn(){},log(){}},alert:m=>events.push({kind:'alert',message:String(m)}),confirm:()=>true,prompt:()=>'',setTimeout,clearTimeout,Date,Math,Number,Object,Map,Set,Promise,Option:class{},getLocalToday:w.getLocalToday,formatDate:x=>x,formatMonth:x=>x,formatMonthCompact:x=>x,normalizeYYYYMM:x=>String(x||'').slice(0,7),trainingBranch:x=>x,trainingDaysValid:()=>true,isShiftEligibleForBranch:()=>true,resolveTrainingShift:()=>null,inspectTrainingRegistration:()=>({issues:[]}),registrationMessage:()=>'',assertTrainingRegistration:x=>x,auditTrainingRegistrations:()=>[],escapeHtml:x=>x,FinanceService:finance,db:w.__store.db,currentClubId:'A',arrayUnion:sdk.arrayUnion,doc:sdk.doc,collection:sdk.collection,writeBatch:sdk.writeBatch,allProfiles:w.__store.profiles,clubConfig:w.__store.clubConfig,_canonicalTxPayload:x=>x};
 const c=vm.createContext(sandbox);vm.runInContext('window.InventoryService=(()=>{'+read(root,'js/services/inventory.service.js').replace('export const InventoryService','const InventoryService')+';return InventoryService;})();',c);
 const svc=w.InventoryService;const turn=()=>new Promise(setImmediate);
 function form({qty=1,type='Xuất bán',unpaid=false}={}){for(const[k,v]of Object.entries({inventoryForm:'',inv_category:'Võ phục',inv_size:'170',inv_size_text:'',inv_type:type,inv_qty:String(qty),inv_desc:'Student',inv_totalActual:'100',inv_date:'2026-11-08',inv_priceActual:'100'}))put(k,v);put('inv_unpaid','',{checked:unpaid});sandbox.InventoryService=svc;const s=read(root,'js/modules/inventory.js');vm.runInContext('(()=>{'+prelude(s)+";const _invFormEl=document.getElementById('inventoryForm');"+assignment(s,'_invFormEl','onsubmit')+'})();',c);return ()=>doc.getElementById('inventoryForm').onsubmit({preventDefault(){},target:doc.getElementById('inventoryForm')});}
 function admission(name='New Student'){
  const fields={add_name:name,add_date:'2026-11-08',add_memberId:'',add_belt:'Trắng',add_dob:'2010-01-01',add_gender:'Nam',add_phone:'',add_cccd:'',add_notes:'',add_nickname:'',add_package:'1',add_fee_default_actual:'100',add_fee_default_display:'100',add_fee_actual:'100',add_fee_display:'100',add_uniform_size:'170',add_uniform_actual:'200',add_uniform_display:'200',add_branch:'CS1',add_shift:'',add_discount_pct:'10',add_registration_warning:'',addModal:''};for(const[k,v]of Object.entries(fields))put(k,v);put('add_discount');put('add_uniform_gift');elements.get('add_uniform_size').options=[{value:'170'}];
  sandbox.InventoryService=svc;sandbox.StudentService={prepareProfileMutation:(key,data)=>({profileRef:sdk.doc(w.__store.db,'clubs','A','profiles',key),profilePayload:clone(data)})};
  const s=read(root,'js/modules/students.js');vm.runInContext('(()=>{'+prelude(s)+";_registrationForms.set('add',{context:_registrationContext(),ready:true,pending:false,daysInvalid:false,original:{trainingDays:[]}});"+assignment(s,'window','addNewStudent')+'})();',c);return ()=>w.addNewStudent();
 }
 function multi({name='Student',qty=1,tuition=false,debt=false}={}){
  const p={profileId:name,branch:'CS1',tuitionFee:100,paidUntil:'2026-10',paidMonths:[]};w.__store.profiles[name]=p;store.seed('clubs/A/profiles/'+name,p);
  const fields={mi_name:name,mi_tuition_month:'2026-11',mi_tuition_pkg:'1',mi_tuition_actual:tuition?'100':'0',mi_exam_title:'',mi_exam_actual:'0',mi_other_desc:'',mi_other_actual:'0',mi_inv_category:'Võ phục',mi_inv_size_select:'170',mi_inv_size_text:'',mi_inv_qty:String(qty),mi_inv_price_actual:'100',mi_inv_total_actual:String(qty*100),multiItemModal:''};for(const[k,v]of Object.entries(fields))put(k,v);put('mi_tuition_enabled','',{checked:tuition});put('mi_exam_toggle');put('mi_other_toggle');put('mi_inv_toggle','',{checked:true});
  if(debt){store.seed('clubs/A/inventory/debt',{type:'Xuất bán',qty:1,unpaid:true});debtChecks.push({getAttribute:k=>({'data-inv-id':'debt','data-amount':'50','data-label':'Old debt'})[k]});}
  w.getMultiItemInventorySelectionState=()=>({ready:true,valid:true,stock:99,available:99});w.validateMultiItemInventoryBeforeAction=()=>({ok:true});
  w.buildMultiItemTuitionPackageMonths=()=>({months:['2026-11']});w.TuitionDebtCanonical={areTuitionMonthsSettled:()=>({allSettled:false}),reconcilePaidUntilFromMonthEvidence:()=> '2026-11'};w.TuitionCommandBoundary={runInProfileTuitionMutationLane:async(_,fn)=>fn(),resolveTuitionSettlementForWrite:async()=>({status:'VERIFIED_UNPAID',profile:p}),commitLocalTuitionPaymentState:x=>events.push({kind:'profile-project',item:clone(x)})};
  vm.runInContext(assignment(read(root,'app.js'),'window','processMultiItem'),c);return ()=>w.processMultiItem('pay');
 }
 function legacyForm(){const s=read(root,'app.js'),start=s.indexOf("document.getElementById('inventoryForm').onsubmit ="),end=s.indexOf('\n    };',start)+7;if(start<0||end<start)throw Error('Legacy form missing');for(const[k,v]of Object.entries({inventoryForm:'',inv_category:'Võ phục',inv_size:'170',inv_type:'Xuất bán',inv_qty:'6',inv_desc:'Student',inv_totalActual:'0',inv_date:'2026-11-08'}))put(k,v);put('inv_unpaid');doc.getElementById=key=>elements.get(key)||put(key);w.populateInvCategorySelects=()=>{};w.toggleInvType=()=>{};sandbox.invRef=w.__store.invRef;sandbox.colRef=w.__store.colRef;sandbox.addDoc=async(ref,data)=>{const r=sdk.doc(ref),b=sdk.writeBatch();b.set(r,data);await b.commit();return r;};sandbox.setDoc=async(ref,data,opt)=>{const b=sdk.writeBatch();b.set(ref,data,opt);await b.commit();};sandbox.increment=sdk.increment;delete w.InventoryService;vm.runInContext(s.slice(start,end),c);return ()=>elements.get('inventoryForm').onsubmit({preventDefault(){},target:elements.get('inventoryForm')});}
 return {w,c,svc,sdk,store,events,elements,put,form,admission,multi,legacyForm,turn};
}
