import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createRecorder} from './trace.mjs';
import {instrumentSource} from './source-hooks.mjs';
import {parse} from '../v11r2/vendor/acorn.mjs';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';

const turn=()=>new Promise(setImmediate);
const trustedRoots=new Map();
// This harness executes actual source with a FAKE SDK and FAKE DOM.
// Numbers are UNIT_TEST CPU/event scheduling samples, never network benchmarks.
export async function runScenario(root,{enabled=true,count=1,mode='legacy',flow='QuickPay',state='unpaid',rows=[],failSource='',receipt='pending',strictCoverage=false,resolveOnly=false,doubleTap=false,observerThrows=false,rawMonths=null,runtimePositiveRows=[],beforeAction=null,afterAction=null,actionDriver=null}={}) {
  root=path.resolve(root);const business={queries:[],returnedDocuments:0,primaryCommits:0,primaryAcks:0,plannedWrites:[],secondaryAudits:0,receipts:0,successMessages:0,maxConcurrentQueries:0};let active=0,auto=0;
  if(!trustedRoots.has(root)){const p=verifyRuntimeProfile(root);trustedRoots.set(root,JSON.parse(fs.readFileSync(path.join(root,p.identity.manifest),'utf8')).canonicalRuntimeFiles);}
  const readSource=file=>{const text=fs.readFileSync(path.join(root,file),'utf8');if(crypto.createHash('sha256').update(text).digest('hex')!==trustedRoots.get(root)[file])throw Error('R2_INPUT_SOURCE_HASH_MISMATCH');return text;};
  const elements={},body={appendChild(n){n.isConnected=true;},dataset:{}};
  const element=id=>elements[id]||(elements[id]={id,value:id==='filterMonth'?'2027-01':id==='filterBranch'?'all':'',dataset:{},style:{},isConnected:true,setAttribute(){},removeAttribute(){},remove(){this.isConnected=false;},replaceChildren(){this.replaced=true;},classList:{contains:()=>false},querySelectorAll:()=>[]});
  const document={body,getElementById:id=>['filterMonth','filterBranch','searchInput','debtList'].includes(id)?element(id):null,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>({tagName:tag,style:{},content:{},setAttribute(){},remove(){this.isConnected=false;},appendChild(){}})};
  const sandbox={console:{log(){},info(){},warn(){},error(){}},performance,Date,Promise,queueMicrotask,document,URL,URLSearchParams,TextEncoder,TextDecoder,structuredClone};const ctx=vm.createContext(sandbox);ctx.window=ctx;
  ctx.userRole='admin';ctx.currentUserEmail='unit@test.invalid';ctx.currentClubId='fixture-club';ctx.__verifiedAuthContextState={ready:true,uid:'fixture-admin',generation:1,sessionEpoch:1,authGeneration:1};
  const months=rawMonths||Array.from({length:count},(_,i)=>'2027-'+String(i+1).padStart(2,'0'));
  const profile={profileId:'fixture-profile',name:'S',branch:'CS1',status:'active',tuitionFee:100000,admissionDate:'2026-12-01',paidMonths:[],paidUntil:'2026-12'};
  if(state==='paid')Object.assign(profile,{paidMonths:months.slice(),paidUntil:months.at(-1)});
  if(state==='partial')profile.paidMonths=[months[0]];
  if(state==='exempt')profile.feeExempt=true;
  if(state==='skipped')profile.skippedMonths=[months[0]];
  if(state==='branch-mismatch')profile.branch='CS2';
  if(state==='quit')profile.status='quit';
  ctx.__store={clubId:'fixture-club',db:{},colRef:{path:'clubs/fixture-club/transactions'},profiles:{S:profile},transactions:[],allTransactions:[],currentUser:{uid:'fixture-admin'},selectedMonth:'2027-01',selectedBranch:'all',search:'',clubConfig:{branchCount:1,canonicalTransactionReadMonths:mode==='canonical'?months.slice():[]},_activeTxReadMode:mode,_activeTxProjectionEpoch:{}};
  if(strictCoverage)ctx.__store.transactionCoverage={clubId:'fixture-club',month:months[0],readMode:mode,ready:true,complete:true,pageServerComplete:true,pageEvidence:{epoch:ctx.__store._activeTxProjectionEpoch}};
  ctx.allProfiles=ctx.__store.profiles;ctx.allTransactions=[];
  ctx.__store.transactions=structuredClone(runtimePositiveRows);
  ctx.studentProfileStore={version:1,quitComplete:true,getAllProfilesCompat:()=>ctx.__store.profiles,mergeProfile:(name,value)=>{ctx.__store.profiles[name]={...ctx.__store.profiles[name],...value};ctx.studentProfileStore.version++;}};
  const listener={activeListenerMounted:true,activeListenerFailed:false,activeListenerKey:'students:profiles:active:fixture-club:admin',authorityClubId:'fixture-club',fullAuthoritySnapshotSeen:true,fullAuthoritySnapshotCount:1,fullAuthorityComplete:true,authorityServerConfirmed:true,authorityFreshness:'fresh',authorityHasPendingWrites:false,authoritySessionEpoch:1,activeOwnerUid:'fixture-admin',role:'admin',lastProfilesMode:'full-profiles-authoritative',quitComplete:true};
  ctx.getProfilesListenerMetrics=()=>({...listener});ctx.hasListener=()=>true;ctx.getProfileStatusConfig=()=>({activeQueryValues:['active','trial'],quitQueryValues:['quit']});ctx.getDebtOverdueFilterValue=()=>0;
  for(const k of ['invalidateLists','invalidateList','invalidateDashboard','refreshListsComputation','recordRuntimeError','recordFinancialActionAudit'])ctx[k]=()=>{};
  ctx.guardFinancialWriteIntent=()=>true;ctx.isFinancialWriteAllowed=()=>true;
  ctx.showToast=message=>{if(String(message).startsWith('✅'))business.successMessages++;};
  ctx.exportReceipt=()=>{business.receipts++;if(receipt==='error')return Promise.reject(new Error('fixture receipt error'));if(receipt==='qr-error')return Promise.resolve({ok:false,reason:'QR_EMV_MISMATCH'});return new Promise(()=>{});};
  const context=()=>({...ctx.__verifiedAuthContextState,clubId:ctx.__store.clubId,profileId:ctx.__store.profiles.S?.profileId,role:ctx.userRole});
  const trace=createRecorder({enabled,context,clock:()=>performance.now(),level:'UNIT_TEST'});ctx.__financeLatencyTraceR2=observerThrows?{mark(){throw Error('observer failure');}}:trace;
  const reference=(...args)=>{const parts=args[0]?.path?[args[0].path,'auto-'+(++auto)]:args.slice(1);return{path:parts.join('/'),id:String(parts.at(-1))};};
  ctx._fb_init={collection:(_db,...parts)=>({path:parts.join('/')}),doc:reference,where:(field,op,value)=>({field,op,value}),limit:n=>({limit:n}),startAfter:cursor=>({cursor}),query:(ref,...constraints)=>({ref,constraints}),arrayUnion:(...values)=>({__arrayUnion:values}),
    async getDocs(query){const filters=query.constraints.filter(x=>x.field);const source=filters.some(x=>x.field==='accountingMonths')?'canonical':filters.some(x=>x.field==='txMonth')?'byTxMonth':filters.some(x=>x.field==='packageMonths')?'byPackageMonth':'byDate';business.queries.push(source);active++;business.maxConcurrentQueries=Math.max(active,business.maxConcurrentQueries);try{await Promise.resolve();if(state==='profile-switch')ctx.__store.profiles.S.profileId='different-profile';if(state==='fee-change')ctx.__store.profiles.S.tuitionFee=200000;if(state==='logout')ctx.__verifiedAuthContextState.ready=false;if(source===failSource)throw Object.assign(new Error('fixture permission fail'),{code:'permission-denied'});let selected=rows.filter(tx=>filters.every(f=>f.op==='=='?tx[f.field]===f.value:f.op==='array-contains'?(tx[f.field]||[]).includes(f.value):f.op==='>='?tx[f.field]>=f.value:tx[f.field]<=f.value));const cursor=query.constraints.find(x=>x.cursor)?.cursor;if(cursor)selected=selected.slice(selected.findIndex(tx=>tx.id===cursor.id)+1);selected=selected.slice(0,query.constraints.find(x=>x.limit)?.limit||500);business.returnedDocuments+=selected.length;return{metadata:{fromCache:state==='cache-only',hasPendingWrites:state==='pending'},docs:selected.map(tx=>({id:tx.id,data:()=>({...tx})}))};}finally{active--;}}
    ,writeBatch(){const ops=[];return{set:(ref,data)=>ops.push({kind:'set',path:ref.path,data}),update:(ref,data)=>ops.push({kind:'update',path:ref.path,data}),async commit(){business.primaryCommits++;business.plannedWrites.push(...ops);listener.authorityFreshness='stale';listener.authorityHasPendingWrites=true;ctx.DebtProfileReadBoundary?.markActiveSyncStage('profilePendingSnapshotAt',{clubId:'fixture-club'});await Promise.resolve();if(state==='commit-fail')throw new Error('fixture rejected commit');if(state==='club-switch'){ctx.__store.clubId='different-club';ctx.__verifiedAuthContextState.generation++;}business.primaryAcks++;}};},async addDoc(){business.secondaryAudits++;return{id:'audit'};}};
  const modules=new Map();
  async function load(file){const key=file.split('?')[0];if(modules.has(key))return modules.get(key);const text=instrumentSource(key,readSource(key),{enabled});const mod=new vm.SourceTextModule(text,{context:ctx,identifier:key});modules.set(key,mod);await mod.link(async(spec,parent)=>load(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),spec.split('?')[0]))));return mod;}
  for(const file of ['js/core/transactionCanonicalBoundary.js','js/core/tuitionDebtCanonical.js','js/core/debtProfileReadBoundary.js'])vm.runInContext(readSource(file),ctx,{filename:file});
  const D=ctx.DebtProfileReadBoundary;const markStage=D.markActiveSyncStage;D.markActiveSyncStage=function(stage,options){const result=Reflect.apply(markStage,this,[stage,options]);if(result?.tracked)trace.syncStage(stage);return result;};
  const service=await load('js/services/finance.service.js');await service.evaluate();ctx.FinanceService=service.namespace.FinanceService;
  const boundary=await load('js/core/tuitionCommandBoundary.js');await boundary.evaluate();ctx.TuitionCommandBoundary=boundary.namespace.TuitionCommandBoundary;
  const format=await load('js/utils/format.js');await format.evaluate();for(const key of ['getLocalToday','formatMonthCompact'])ctx[key]=format.namespace[key];
  const ui=instrumentSource('js/modules/finance.js',readSource('js/modules/finance.js'),{enabled});const ast=parse(ui,{ecmaVersion:'latest',sourceType:'module'}),firstExport=ast.body.find(n=>n.type.startsWith('Export')).start;let quick;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left?.object?.name==='window'&&n.left?.property?.name==='quickPay')quick=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'&&v.type)walk(v);}walk(ast);
  const prelude=ast.body.filter(n=>n.end<=firstExport&&n.type!=='ImportDeclaration').map(n=>ui.slice(n.start,n.end)).join('\n');vm.runInContext(prelude+'\n'+ui.slice(quick.start,quick.end)+';',ctx);
  const observerHandle=beforeAction?await beforeAction(ctx):null;
  const selectedMode=ctx.FinanceService.captureWriteEvidenceContext(months[0]).readMode;
  trace.begin({commandType:flow,monthCount:count,evidenceMode:selectedMode.toUpperCase()});
  let result;
  if(actionDriver)result=await actionDriver(ctx);
  else if(resolveOnly){const d=await ctx.TuitionCommandBoundary.resolveTuitionSettlementForWrite({studentName:'S',targetMonths:months,expectedContext:ctx.FinanceService.captureFinancialWriteContext()});result={status:d.status,reason:d.reason||d.code||'',ids:(d.rows||[]).map(x=>x.id).sort(),amountTotal:(d.rows||[]).reduce((n,x)=>n+Number(x.amount||0),0),settlement:d.settlement||null};}
  else if(doubleTap){const p=ctx.quickPay('S',months.join(','),'CS1',String(100000*count),true);trace.begin({commandType:flow,monthCount:count,evidenceMode:selectedMode.toUpperCase()});const q=ctx.quickPay('S',months.join(','),'CS1',String(100000*count),true);result=await Promise.all([p,q]);}
  else result=await ctx.quickPay('S',months.join(','),'CS1',String(100000*count),true);
  await turn();
  const observerSnapshot=afterAction?await afterAction(ctx,observerHandle):observerHandle?.snapshot?.()||null;
  observerHandle?.restore?.();
  business.committedDocuments=business.primaryAcks?business.plannedWrites.length:0;
  // Simulated callback driver, NOT a real onSnapshot delivery. We deliberately
  // leave actual server-fresh/render markers absent rather than inventing them.
  const snapshot={result,profile:JSON.parse(JSON.stringify(ctx.__store.profiles.S)),business:JSON.parse(JSON.stringify(business)),mode:selectedMode,trace:trace.export(),observerSnapshot,flowDescription:flow==='DebtCollect'?'Debt shared QuickPay write-path fixture':'QuickPay write-path fixture',measurementScope:'UNIT_TEST: actual QuickPay/Boundary/Service source, fake SDK and DOM; no real network, no listener delivery, no layout/paint'};
  return snapshot;
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  const root=path.resolve(process.argv[2]||process.cwd()),samples=[];
  for(const flow of ['QuickPay','DebtCollect'])for(const mode of ['legacy','canonical'])for(const count of [1,3,6,9,12]) {
    const off=await runScenario(root,{enabled:false,flow,mode,count});const on=await runScenario(root,{enabled:true,flow,mode,count});
    const equal=JSON.stringify(comparable(off))===JSON.stringify(comparable(on));
    if(!equal)throw Error('INSTRUMENTATION_OFF_ON_BUSINESS_DELTA');samples.push({flow,mode,count,offOnBusinessEquivalent:equal,...on});
  }
  console.log(JSON.stringify({evidenceLevel:'UNIT_TEST',realRuntimeAttribution:'NOT VERIFIED',samples},null,2));
}
// Only the naturally changing transaction clock field is normalized. Financial
// fields, identities, plans, query order, ACK counts and outcomes remain exact.
export function comparable(snapshot){return JSON.parse(JSON.stringify({result:snapshot.result,profile:snapshot.profile,business:snapshot.business},(key,value)=>key==='timestamp'?'<runtime-clock>':value));}
