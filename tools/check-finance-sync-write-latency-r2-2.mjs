import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {installObserver} from './r2-2/observer-core.mjs';
import {installObserver as installR21} from './r2-1/observer-core.mjs';
import {createRecorder} from './r2/trace.mjs';
import {makeUnitWindow,prepareHarnessDOM} from './r2-1/unit-fixtures.mjs';
import {runScenario,comparable} from './r2/runtime-harness.mjs';
import {manifest,prove} from './r2-2/freeze.mjs';

if(typeof vm.SourceTextModule!=='function'){
  const child=spawnSync(process.execPath,[...process.execArgv,'--experimental-vm-modules',fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit'});
  process.exit(child.status??1);
}
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(process.argv[3]||path.join(root,'evidence/FINANCE_LATENCY_R2_2/06_OBSERVER_OFF_ON_INVARIANCE.json'));
const records=[],samples=[],baselineRed=[];
let failed=0;
const check=async(name,fn)=>{try{await fn();records.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){failed++;records.push({name,status:'FAIL',detail:error.stack});console.error('FAIL '+name+' '+error.stack);}};
const args=['S','2027-01','CS1','100000',true];
const install=(w,opts={})=>installObserver(w,{environment:'UNIT_TEST',...opts},createRecorder);
const turn=()=>new Promise(setImmediate);
const before=(flow='tx',opts={})=>w=>{prepareHarnessDOM(w);w.getCurrentActiveTabId=()=>flow;return install(w,opts);};
const trace=r=>r.observerSnapshot.traces[0];
function rawFixture(){
  const f=makeUnitWindow();f.w.getCurrentActiveTabId=()=> 'debt';
  f.w._fb_init.writeBatch=()=>({commit(){f.tick(7);return Promise.resolve('raw-ack');}});
  f.F.commitAtomicWritePlan=async function(){const batch=f.w._fb_init.writeBatch(f.w.__store.db);await batch.commit();f.tick(25);return {primaryCommitted:true};};
  return f;
}
function diagComparable(w){
  const d=w.getDebtSyncDiagnostics();
  const ids=new Map();
  return JSON.parse(JSON.stringify(d,(key,value)=>{
    // Normalize clock-derived IDs everywhere, retaining equality of all
    // operation references, including refreshPlanningOperationIds arrays.
    if(typeof value==='string'&&/^sync-[a-z0-9]+-\d+$/.test(value)){if(!ids.has(value))ids.set(value,ids.size+1);return 'operation-'+ids.get(value);}
    if(typeof value==='number'&&value>1e12)return '<runtime-clock>';
    return value;
  }));
}
await check('current-lineage manifest and 129 root/public pairs match frozen input',()=>{
  const expected=JSON.parse(fs.readFileSync(path.join(root,'tools/r2-2/current-lineage-manifest.json')));
  assert.deepEqual(manifest(root),expected);
  if(fs.existsSync(path.join(root,'../baseline')))prove(root,path.join(root,'../baseline'));
});
await check('baseline RED: R2.1 QuickPay changes exact native Promise identity',async()=>{
  const f=makeUnitWindow(),original=Promise.resolve(42);f.w.quickPay=()=>original;
  const h=installR21(f.w,{environment:'UNIT_TEST'},createRecorder),observed=f.w.quickPay(...args);
  assert.notEqual(observed,original);assert.equal(await observed,42);h.restore();
  baselineRed.push({id:'OBSERVER-PROMISE-IDENTITY',baseline:'RED',candidate:'GREEN',scope:'TOOLING_CONTRACT_ONLY'});
});
await check('baseline RED: R2.1 labels service return after projection as primary ACK',async()=>{
  const f=rawFixture(),h=installR21(f.w,{environment:'UNIT_TEST'},createRecorder);
  await f.w.quickPay(...args);const t=h.snapshot().traces[0];
  assert.equal(t.latency.T_commit,32);assert.equal(t.rawBatchCommitStartAt,undefined);h.restore();
  baselineRed.push({id:'RAW-ACK-BOUNDARY',baseline:'RED',candidate:'GREEN',scope:'TOOLING_ATTRIBUTION_ONLY',syntheticRawInterval:7,syntheticServiceInterval:32});
});
await check('native QuickPay Promise identity, this, arguments and fulfillment preserved',async()=>{
  const f=rawFixture(),receiver={},params=['S','2027-01',{},Symbol('exact')],answer={},p=Promise.resolve(answer);let calls=0;
  f.w.quickPay=function(...a){calls++;assert.equal(this,receiver);assert.deepEqual(a,params);return p;};
  const h=install(f.w);assert.equal(f.w.quickPay.apply(receiver,params),p);assert.equal(await p,answer);assert.equal(calls,1);h.restore();
});
await check('synchronous return stays synchronous and exact object is returned',()=>{
  const f=rawFixture(),answer={};f.w.quickPay=()=>answer;const h=install(f.w);assert.equal(f.w.quickPay(...args),answer);h.restore();
});
await check('synchronous original throw remains synchronous and same error',()=>{
  const f=rawFixture(),e=Error('original');f.w.quickPay=()=>{throw e;};const h=install(f.w);assert.throws(()=>f.w.quickPay(...args),x=>x===e);h.restore();
});
await check('native rejected Promise identity and rejection object preserved',async()=>{
  const f=rawFixture(),e=Error('original rejection'),p=Promise.reject(e);f.w.quickPay=()=>p;const h=install(f.w);
  assert.equal(f.w.quickPay(...args),p);await assert.rejects(p,x=>x===e);h.restore();
});
await check('service, evidence, SDK and receipt hooks keep exact Promise, receiver and arguments',async()=>{
  const f=rawFixture(),receiver={},p=Promise.resolve({same:true});
  const entries=[[f.F,'getCompleteMonthEvidence',{month:'2027-01'}],[f.F,'commitAtomicWritePlan',{}],[f.w._fb_init,'getDocs',{}],[f.w,'exportReceipt','private-fixture-only']];
  let calls=0;for(const [owner,key,arg]of entries)owner[key]=function(value){calls++;assert.equal(this,receiver);assert.equal(value,arg);return p;};
  const h=install(f.w);for(const [owner,key,arg]of entries)assert.equal(owner[key].call(receiver,arg),p);await p;assert.equal(calls,4);h.restore();
});
await check('SDK and service original synchronous errors are never swallowed or replaced',()=>{
  const f=rawFixture(),e=Error('same error');f.w._fb_init.getDocs=()=>{throw e;};f.F.getCompleteMonthEvidence=()=>{throw e;};f.F.commitAtomicWritePlan=()=>{throw e;};f.w.exportReceipt=()=>{throw e;};const h=install(f.w);
  for(const [owner,key,arg]of [[f.w._fb_init,'getDocs',{}],[f.F,'getCompleteMonthEvidence',{}],[f.F,'commitAtomicWritePlan',{}],[f.w,'exportReceipt','S']])assert.throws(()=>owner[key](arg),x=>x===e);h.restore();
});
await check('arbitrary thenable getters are never inspected or assimilated',()=>{
  const f=rawFixture();let reads=0;const value=new Proxy({},{get(){reads++;throw Error('forbidden');}});f.w.quickPay=()=>value;
  const h=install(f.w);assert.equal(f.w.quickPay(...args),value);assert.equal(reads,0);assert(h.snapshot().gaps.includes('NON_NATIVE_RETURN_NOT_OBSERVED'));h.restore();
});
await check('raw ACK precedes service projection and remains separate from service return',async()=>{
  const f=rawFixture(),h=install(f.w);await f.w.quickPay(...args);const t=h.snapshot().traces[0];
  assert.equal(t.primaryAckAt.performanceNow,7);assert.equal(t.serviceCommitResolvedAt.performanceNow,32);
  assert.equal(t.latency.T_commit,7);assert.equal(t.latency.T_primaryAck_to_successFeedback,35);
  assert.equal(t.commandReturnAt,null);assert.equal(t.latency.T_primaryAck_to_commandReturn,null);
  assert.equal(t.rawBatchCommitCount,1);assert.equal(t.rawBatchAckCount,1);h.restore();
});
await check('raw SDK batch instance, commit Promise, this and descriptor restored exactly',async()=>{
  const f=rawFixture(),p=Promise.resolve(),proto={commit(...a){assert.equal(this,batch);assert.deepEqual(a,[17]);return p;}},batch=Object.create(proto);
  f.w._fb_init.writeBatch=()=>batch;
  f.F.commitAtomicWritePlan=function(plan){assert.equal(f.w._fb_init.writeBatch(),batch);assert.equal(batch.commit(17),p);return p;};
  const h=install(f.w);await f.w.quickPay(...args);h.restore();assert.equal(Object.hasOwn(batch,'commit'),false);assert.equal(batch.commit,proto.commit);
});
await check('missing raw writeBatch hook never synthesizes ACK from service return',async()=>{
  const f=rawFixture();delete f.w._fb_init.writeBatch;f.F.commitAtomicWritePlan=()=>Promise.resolve({primaryCommitted:true});
  const h=install(f.w);await f.w.quickPay(...args);const t=h.snapshot().traces[0];assert.equal(t.primaryAckAt,null);assert.equal(t.latency.T_commit,null);assert.equal(t.latency.T_preAckResidual,null);assert(t.invalidReasons.includes('PRIMARY_BATCH_ACK_UNATTRIBUTED'));h.restore();
});
await check('read-only raw batch commit loses measurement without changing business',async()=>{
  const f=rawFixture();f.w._fb_init.writeBatch=()=>Object.freeze({commit:()=>Promise.resolve()});
  const h=install(f.w);assert.equal(await f.w.quickPay(...args),true);const t=h.snapshot().traces[0];assert.equal(t.primaryAckAt,null);assert.equal(t.rawBatchCommitCount,null);assert.equal(t.rawBatchAckCount,null);assert(t.observerGaps.includes('HOOK_READONLY_commit'));h.restore();
});
await check('diagnostic callback failure runs original exactly once and invalidates attribution',async()=>{
  const f=rawFixture(),h=install(f.w,{onEvent(){throw Error('diagnostics');}});assert.equal(await f.w.quickPay(...args),true);
  const t=h.snapshot().traces[0];assert(t.invalidReasons.includes('DIAGNOSTIC_FAILURE'));assert.equal(t.latency.T_preAckResidual,null);h.restore();
});
await check('failed metric capture cannot block or duplicate original command',async()=>{
  const f=rawFixture();f.F.getWriteEvidenceMetrics=()=>{throw Error('unavailable');};let n=0;f.w.quickPay=()=>{n++;return 12;};const h=install(f.w);
  assert.equal(f.w.quickPay(...args),12);assert.equal(n,1);assert(h.snapshot().gaps.includes('DIAGNOSTIC_FAILURE'));h.restore();
});
await check('R2.1 and R2.2 active guards prevent stacked wrappers in either order',()=>{
  const f=rawFixture(),h=install(f.w);assert.throws(()=>installR21(f.w,{environment:'UNIT_TEST'},createRecorder),/ALREADY_INSTALLED/);assert.throws(()=>install(f.w),/ALREADY_INSTALLED/);h.restore();
  const old=installR21(f.w,{environment:'UNIT_TEST'},createRecorder);assert.throws(()=>install(f.w),/ALREADY_INSTALLED/);old.restore();
});
await check('restore is idempotent, disconnects observer, and cached wrappers become inert',async()=>{
  const f=rawFixture(),original=f.w.quickPay,h=install(f.w),cached=f.w.quickPay;h.restore();h.restore();assert.equal(f.w.quickPay,original);await cached(...args);
  assert.equal(h.snapshot().traces.length,0);assert(f.observers.every(o=>o.disconnected));assert.equal(f.w.__financeLatencyObserverR21Active,undefined);assert.equal(f.w.__financeLatencyObserverR22Active,undefined);
});
await check('restoration never overwrites a newly replaced business owner',()=>{
  const f=rawFixture(),h=install(f.w),newOwner=()=>8;f.w.quickPay=newOwner;h.restore();assert.equal(f.w.quickPay,newOwner);assert(h.snapshot().gaps.includes('OWNER_CHANGED_quickPay'));
});
await check('staging identity gate denies production, mismatched project, and absent host',()=>{
  const f=rawFixture(),original=f.w.quickPay;assert.throws(()=>installObserver(f.w,{},createRecorder),/EXPLICIT_ENVIRONMENT/);
  f.w.__store.db.app.options.projectId='quanly-tst';assert.throws(()=>installObserver(f.w,{environment:'STAGING',expectedProjectId:'quanly-tst',allowedHosts:['unit.fixture.invalid']},createRecorder),/NOT_VERIFIED/);
  f.w.__store.db.app.options.projectId='safe-staging';for(const opts of [{expectedProjectId:'other',allowedHosts:['unit.fixture.invalid']},{expectedProjectId:'safe-staging',allowedHosts:[]}])assert.throws(()=>installObserver(f.w,{environment:'STAGING',...opts},createRecorder),/NOT_VERIFIED/);
  assert.equal(f.w.quickPay,original);
});
await check('generated browser factory rejects UNIT_TEST and never auto-installs',()=>{
  const f=rawFixture(),original=f.w.quickPay;vm.runInNewContext(fs.readFileSync(path.join(root,'tools/r2-2/finance-latency-observer.staging.js'),'utf8'),{window:f.w,Promise});
  assert.equal(f.w.quickPay,original);assert.throws(()=>f.w.FinanceLatencyObserverR22.install({environment:'UNIT_TEST'}),/BROWSER_STAGING_ONLY/);
});

// Every comparison runs UNMODIFIED actual source with the EXISTING fake-SDK
// harness, and its old source instrumenter disabled. These are not staging.
for(const flow of ['tx','debt'])for(const mode of ['legacy','canonical'])for(const count of [1,3,6,9,12]){
  await check(`OFF/ON actual source ${flow} ${mode} ${count} months`,async()=>{
    const after=(w,h)=>({observer:h?.snapshot(),debt:diagComparable(w)});
    const opts={enabled:false,count,mode,afterAction:after};
    const off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before(flow)});
    assert.deepEqual(comparable(on),comparable(off));assert.deepEqual(on.observerSnapshot.debt,off.observerSnapshot.debt);
    const t=on.observerSnapshot.observer.traces[0];assert.equal(t.rawBatchCommitCount,1);assert.equal(t.rawBatchAckCount,1);assert.equal(t.evidenceMonths.length,count);
    assert.equal(t.getDocsInvocationCount,count*(mode==='legacy'?3:1));assert.equal(t.traceValidity,'VALID_PRE_ACK_ATTRIBUTION');assert(t.latency.T_preAckResidual>=0);
    assert.equal(on.business.maxConcurrentQueries,1);assert.equal(t.flow,flow==='debt'?'DebtCollect':'TuitionQuickPay');
    assert(t.getDocsSamples.every(p=>p.source&&Number.isInteger(p.monthIndex)&&p.metadataAvailable&&p.fromCache===false));
    samples.push({flow:t.flow,mode,monthCount:count,evidenceLevel:'UNIT_TEST',businessEquivalent:true,debtOperationIdentityEquivalent:true,observer:t});
  });
}
for(const state of ['paid','partial','exempt','skipped','branch-mismatch','quit','cache-only','pending','profile-switch','fee-change','logout','commit-fail','club-switch'])await check(`OFF/ON actual guards ${state}`,async()=>{
  const opts={enabled:false,count:3,state},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});
  assert.deepEqual(comparable(on),comparable(off));const t=trace(on);
  if(state==='commit-fail')assert.equal(t.primaryAckAt,null);
  if(['cache-only','pending','profile-switch','fee-change','logout'].includes(state))assert.equal(t.latency.T_preAckResidual,null);
});
for(const [source,n]of [['byTxMonth',1],['byDate',2],['byPackageMonth',3],['canonical',1]])await check(`OFF/ON permission failure ${source}`,async()=>{
  const opts={enabled:false,count:12,mode:source==='canonical'?'canonical':'legacy',failSource:source},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});
  assert.deepEqual(comparable(on),comparable(off));assert.equal(on.business.queries.length,n);assert.equal(on.business.primaryCommits,0);assert.equal(trace(on).primaryAckAt,null);
});
for(const receipt of ['pending','error','qr-error'])await check(`OFF/ON detached receipt ${receipt}`,async()=>{
  const opts={enabled:false,receipt},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});
  assert.deepEqual(comparable(on),comparable(off));assert(trace(on).primaryAckAt);assert.equal(on.result,true);assert.equal(on.business.primaryCommits,1);
});
await check('rapid double tap keeps canonical duplicate prevention and refuses attribution',async()=>{
  const opts={enabled:false,doubleTap:true},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});assert.deepEqual(comparable(on),comparable(off));
  assert.equal(on.business.primaryCommits,1);assert(on.observerSnapshot.traces.every(t=>t.ambiguous&&t.traceValidity==='TRACE_INVALID_FOR_ATTRIBUTION'&&t.latency.T_preAckResidual===null));
});
await check('existing single-flight hits observed without changing calls or cache policy',async()=>{
  const actionDriver=async w=>{const p=w.quickPay(...args);await Promise.resolve();await Promise.resolve();await w.FinanceService.getCompleteMonthEvidence({month:'2027-01',expectedContext:w.FinanceService.captureWriteEvidenceContext('2027-01')});return p;};
  const opts={enabled:false,actionDriver},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});assert.deepEqual(comparable(on),comparable(off));
  const t=trace(on);assert(t.observerGaps.length===0);assert.equal(t.traceValidity,'TRACE_INVALID_FOR_ATTRIBUTION');assert.equal(t.latency.T_preAckResidual,null);
});
await check('unrelated SDK query is excluded from owner page accounting',async()=>{
  const actionDriver=async w=>{const p=w.quickPay(...args);await Promise.resolve();await Promise.resolve();await w._fb_init.getDocs({constraints:[{field:'txMonth',op:'==',value:'2027-09'}]});return p;};
  const opts={enabled:false,actionDriver},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});assert.deepEqual(comparable(on),comparable(off));assert.equal(on.business.queries.length,4);assert.equal(trace(on).getDocsInvocationCount,3);
});
await check('disabled page sampling leaves count null and residual unavailable',async()=>{
  const on=await runScenario(root,{enabled:false,beforeAction:before('tx',{sampleGetDocs:false})}),t=trace(on);assert.equal(t.getDocsInvocationCount,null);assert.equal(t.latency.T_preAckResidual,null);assert.equal(t.pageCount,3);
});
await check('Browser SDK 10.7.1 internal query shape maps semantic sources without query mutation',async()=>{
  const decorate=observe=>w=>{const query=w._fb_init.query;w._fb_init.query=function(...a){const q=Reflect.apply(query,this,a);q._query={filters:q.constraints.filter(x=>x.op).map(x=>({field:{segments:[x.field]},op:x.op,value:{stringValue:x.value}}))};return q;};return observe?before()(w):null;};
  const opts={enabled:false,count:3},off=await runScenario(root,{...opts,beforeAction:decorate(false)}),on=await runScenario(root,{...opts,beforeAction:decorate(true)});assert.deepEqual(comparable(on),comparable(off));assert.equal(trace(on).getDocsInvocationCount,9);assert.deepEqual(trace(on).getDocsSamples.slice(0,3).map(x=>x.source),['byTxMonth','byDate','byPackageMonth']);
});
await check('unsupported query adapter shape produces UNKNOWN samples and null residual',async()=>{
  const prepare=observe=>w=>{const query=w._fb_init.query;w._fb_init.query=function(...args){const q=Reflect.apply(query,this,args);q._query={filters:[{field:{segments:['unrecognized']},op:'==',value:{stringValue:'unknown'}}]};return q;};return observe?before()(w):null;};
  const off=await runScenario(root,{enabled:false,beforeAction:prepare(false)}),on=await runScenario(root,{enabled:false,beforeAction:prepare(true)});assert.deepEqual(comparable(on),comparable(off));const t=trace(on);assert.equal(t.getDocsInvocationCount,null);assert.equal(t.getDocsSamples[0].source,null);assert.equal(t.latency.T_preAckResidual,null);
});
for(const mode of ['legacy','canonical'])await check(`pagination accounting ${mode} keeps per-source page ordinal and returned-document count`,async()=>{
  const rows=Array.from({length:501},(_,i)=>({id:'row-'+i,type:'Khác',description:'Other fixture',amount:0,date:'2027-01-01',txMonth:'2027-01',packageMonths:['2027-01'],accountingMonths:['2027-01']}));
  const opts={enabled:false,rows,mode},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});assert.deepEqual(comparable(on),comparable(off));const t=trace(on),sources=mode==='canonical'?1:3;
  assert.equal(t.getDocsInvocationCount,sources*2);assert.equal(t.returnedPageDocuments,501*sources);assert.deepEqual(t.getDocsSamples.map(p=>p.pageSequence),Array.from({length:sources},()=>[1,2]).flat());assert.equal(t.traceValidity,'VALID_PRE_ACK_ATTRIBUTION');
});
await check('strict-current coverage stays zero-query without inventing evidence-operation timestamps',async()=>{
  const opts={enabled:false,strictCoverage:true},off=await runScenario(root,opts),on=await runScenario(root,{...opts,beforeAction:before()});assert.deepEqual(comparable(on),comparable(off));const t=trace(on);assert.equal(t.getDocsInvocationCount,0);assert.equal(t.evidenceClassification,'STRICT_CURRENT_COVERAGE');assert.equal(t.evidenceOperationStartAt,null);assert.equal(t.evidenceMonths[0].strictCurrentCoverageComplete,true);
});
await check('positive profile-paid evidence is never treated as unpaid from absent server samples',async()=>{
  const on=await runScenario(root,{enabled:false,state:'paid',beforeAction:before()}),t=trace(on);assert.equal(on.business.primaryCommits,0);assert.equal(t.primaryAckAt,null);assert.equal(t.primaryWriteClassification,'NO_PRIMARY_WRITE');assert.equal(t.latency.T_commit,null);
});
await check('unknown actual tab invalidates flow attribution rather than trusting an operator flow label',async()=>{
  const on=await runScenario(root,{enabled:false,beforeAction:w=>{prepareHarnessDOM(w);return install(w,{flow:'DebtCollect'});}}),t=trace(on);assert.equal(t.flow,'UNKNOWN');assert(t.invalidReasons.includes('FLOW_UNATTRIBUTED'));assert.equal(t.latency.T_preAckResidual,null);
});
await check('read-only SDK loses page and raw ACK coverage without false zeros',async()=>{
  const off=await runScenario(root,{enabled:false}),on=await runScenario(root,{enabled:false,beforeAction:w=>{Object.freeze(w._fb_init);return before()(w);}});assert.deepEqual(comparable(on),comparable(off));const t=trace(on);assert.equal(t.getDocsInvocationCount,null);assert.equal(t.primaryAckAt,null);assert.equal(t.latency.T_commit,null);
});
await check('owner counter reset invalidates attribution and does not invent zero requests',async()=>{
  const f=rawFixture();let reads=8;f.F.getWriteEvidenceMetrics=()=>({reads,singleFlightHits:0,requests:[]});const original=f.w.quickPay;f.w.quickPay=function(...a){reads=0;return Reflect.apply(original,this,a);};
  const h=install(f.w);await f.w.quickPay(...args);const t=h.snapshot().traces[0];assert.equal(t.ownerMetricsDelta.status,'COUNTER_RESET');assert.equal(t.getDocsInvocationCount,null);assert.equal(t.latency.T_preAckResidual,null);h.restore();
});
await check('actual Debt DOM delivery distinguished from cached HTML and physical paint',async()=>{
  const f=rawFixture(),h=install(f.w);await f.w.quickPay(...args);f.fillSync();let t=h.snapshot().traces[0];assert.equal(t.debtDomMutationAt,null);assert.equal(t.latency.T_ack_to_actualDebtDomMutation,null);
  f.tick(9);f.mutate();t=h.snapshot().traces[0];assert.equal(t.syncState,'SYNC_COMPLETE');assert(t.debtDomMutationAt);assert(t.latency.T_ack_to_actualDebtDomMutation>=0);assert.equal(t.clockDomains.crossDomainSubtraction,false);h.restore();
});
for(const which of ['club','logout','filter','role'])await check(`post-ACK ${which} change never binds old Debt DOM to new context`,async()=>{
  const f=rawFixture(),h=install(f.w);await f.w.quickPay(...args);f.fillSync();if(which==='club')f.w.__store.clubId='different';if(which==='logout')f.w.__verifiedAuthContextState.ready=false;if(which==='filter')f.elements.filterMonth.value='2027-02';if(which==='role')f.w.userRole='coach';f.mutate();
  const t=h.snapshot().traces[0];assert.equal(t.debtDomMutationAt,null);assert.equal(t.syncState,'SYNC_STALE_CONTEXT');h.restore();
});
await check('hidden Debt DOM never claims layout acceptance or settled visible rows',async()=>{
  const f=rawFixture(),h=install(f.w);await f.w.quickPay(...args);f.fillSync();f.setVisible(false);f.mutate();const t=h.snapshot().traces[0];assert.equal(t.syncState,'SYNC_NOT_VISIBLE');assert.equal(t.debtDomMutationAt,null);h.restore();
});
await check('two eligible Debt operations are ambiguous, never nearest-operation guessed',async()=>{
  const f=rawFixture(),original=f.w.quickPay;f.w.quickPay=function(...a){f.addOperation();return Reflect.apply(original,this,a);};const h=install(f.w);await f.w.quickPay(...args);f.rows.forEach(r=>f.fillSync(r));f.mutate();const t=h.snapshot().traces[0];assert(t.syncAmbiguous);assert.equal(t.debtDomMutationAt,null);assert.equal(t.fullAttributionComplete,false);h.restore();
});
await check('privacy export excludes raw principal, profile, name, search, toast and months',async()=>{
  const f=rawFixture(),secretName='PRIVATE_STUDENT_84915',p=f.w.__store.profiles.S;delete f.w.__store.profiles.S;f.w.__store.profiles[secretName]=p;
  f.elements.searchInput.value='private-address@example.invalid';const h=install(f.w);await f.w.quickPay(secretName,...args.slice(1));f.fillSync();f.mutate();const json=h.exportJSON();
  for(const s of [secretName,'private-profile','private-owner','private-club','private-address@example.invalid','2027-01','✅'])assert(!json.includes(s),'PII export '+s);
  h.restore();
});
await check('no source instrumentation, Firebase initialization, timers or owner invocation in observer',()=>{
  const text=fs.readFileSync(path.join(root,'tools/r2-2/observer-core.mjs'),'utf8');
  assert(!/\b(?:initializeApp|initializeFirestore|connectFirestoreEmulator|setTimeout|setInterval|preventDefault|stopPropagation)\s*\(/.test(text));
  assert(!/\b(?:getDocs|getDoc|onSnapshot|addDoc|setDoc|updateDoc|runTransaction)\s*\(/.test(text));
});
const result={gate:'FINANCE_SYNC_WRITE_LATENCY_R2_2',evidenceLevel:'UNIT_TEST',passed:records.length-failed,failed,baselineRed,tests:records,samples,realStaging:'NOT_RUN',actualDebtTabUI:'NOT_RUN',physicalDevice:'NOT_RUN',businessSourceChanged:false,observerSource:'R2.1 hardened single observer; original recorder and runtime harness reused',promiseIdentity:'CHECKED',billing:'FIRESTORE_BILLING_NOT_MEASURED'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({gate:result.gate,passed:result.passed,failed,realStaging:result.realStaging}));if(failed)process.exitCode=1;
