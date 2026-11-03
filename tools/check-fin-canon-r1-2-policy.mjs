#!/usr/bin/env node
/** A9R18-FINANCE-CANONICAL-POLICY-R1.2 — no automatic historical mutation/persisted promotion */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const boundary = read('js/core/transactionCanonicalBoundary.js');
const app = read('app.js');
const index = read('index.html');
let pass=0, fail=0;
function check(name, cond, detail=''){ if(cond){pass++; console.log('✅',name);} else {fail++; console.error('❌',name+(detail?' — '+detail:''));} }
function makeRuntime({canonicalMonths=[]}={}) {
  let timerId=0, timerCalls=0, historicalSet=0, batchCommits=0, settingsWrites=0, getDocsCalls=0, detach=0, attach=0, transition=0;
  const timers=new Map(), storage=new Map(), docs=new Map();
  const month='2026-10';
  const legacy=[
    {id:'a',amount:100,date:'2026-10-01',txMonth:'2026-10'},
    {id:'b',amount:200,date:'2026-10-02',txMonth:'2026-10'},
  ];
  legacy.forEach(tx=>docs.set(tx.id,{...tx}));
  const documentMock={readyState:'complete', getElementById(id){ if(id==='filterMonth') return {value:month}; if(id==='btnCanonicalTxOptimize') return null; return null; }, addEventListener(){}};
  const win={
    document:documentMock, userRole:'admin', currentClubId:'club1', navigator:{onLine:true},
    __verifiedAuthContextState:{ready:true,uid:'u1',role:'admin',clubId:'club1',generation:1,sessionEpoch:1,authGeneration:1},
    __scaleConfig:{txListenerLimit:1200},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    __store:{db:{},clubId:'club1',userRole:'admin',clubConfig:{canonicalTransactionReadMonths:[...canonicalMonths]},transactionCoverage:{clubId:'club1',month,readMode:canonicalMonths.includes(month)?'canonical':'legacy',ready:true,complete:true},_activeTxListenerMonth:month,_activeTxReadMode:canonicalMonths.includes(month)?'canonical':'legacy',transactions:legacy.map(x=>({...x}))},
    syncClubStatsCache:{async beginFinanceTransition(){transition++; return {ok:true,isCurrent(){return true}}}},
    cleanupListenersByOwner(owner){ if(owner==='finance') detach++; },
    listenToData(){ attach++; }, addEventListener(){},
    txMatchesSelectedMonth(tx,m){ return String(tx.date||'').startsWith(m)||tx.txMonth===m||(tx.accountingMonths||[]).includes(m); },
    _fb_init:{
      collection:(...a)=>({a}), query:(...a)=>({a}), where:(...a)=>({a}), limit:n=>({n}), doc:(...a)=>({path:a.slice(1).join('/')}),
      arrayUnion:value=>({op:'union',value}), arrayRemove:value=>({op:'remove',value}),
      writeBatch(){ const writes=[]; return { set(ref,patch){ historicalSet++; writes.push({ref,patch}); }, async commit(){ batchCommits++; for(const {ref,patch} of writes){const id=ref.path.split('/').at(-1);docs.set(id,{...(docs.get(id)||{}),...patch});} } }; },
      async getDocs(){ getDocsCalls++; const rows=[...docs.entries()].filter(([,x])=>(x.accountingMonths||[]).includes(month)).map(([id,x])=>({id,data:()=>({...x})})); return {size:rows.length,docs:rows}; },
      async setDoc(ref,patch){ if(ref.path.endsWith('/settings/main_config')) settingsWrites++; },
      async updateDoc(){ throw new Error('unexpected updateDoc'); }, async addDoc(){ throw new Error('unexpected addDoc'); }, async deleteDoc(){ throw new Error('unexpected deleteDoc'); }, async runTransaction(){ throw new Error('unexpected runTransaction'); },
    }
  };
  const ctx={console:{log(){},info(){},warn(){},error(){},group(){},groupEnd(){},table(){}},document:documentMock,Map,Set,Date,Number,String,Object,Array,Math,Error,JSON,Promise,
    setTimeout(fn,ms){timerCalls++; const id=++timerId; timers.set(id,{fn,ms}); return id;}, clearTimeout(id){timers.delete(id);}, requestIdleCallback(fn){fn();}
  }; ctx.window=win; vm.createContext(ctx); vm.runInContext(boundary,ctx,{filename:'transactionCanonicalBoundary.js'});
  // Ignore initialization-only DOM cleanup timer. Mutation-capable schedule tests start after load.
  timers.clear(); timerCalls=0;
  return {win,ctx,api:win.CanonicalTransactionBoundary,legacy,month,timers,storage,docs, stats:()=>({timerCalls,historicalSet,batchCommits,settingsWrites,getDocsCalls,detach,attach,transition})};
}
async function drain(r){ for(let round=0;round<8 && r.timers.size;round++){const cur=[...r.timers.values()];r.timers.clear();for(const t of cur)t.fn();await Promise.resolve();} await Promise.resolve(); }
function safeOverlap(r){ return r.api.recordTransactionOverlap(r.month,{byDate:r.legacy,byTxMonth:r.legacy,byPackageMonth:[],sourceSeen:{byDate:true,byTxMonth:true,byPackageMonth:true},queryLimit:1200}); }

console.log('\n=== FIN-CANON-R1.2 — Production no-migration policy ===\n');
check('Production bundle still loads canonical boundary before app.js', index.includes('./js/core/transactionCanonicalBoundary.js?v=fin-canon-r1-2-20261031') && index.indexOf('transactionCanonicalBoundary.js') < index.indexOf('<script defer src="app.js'));
check('Production app still reports overlap from legacy snapshot owner', app.includes('window.recordTransactionQueryOverlap(monthStr'));
check('Overlap measurement no longer invokes automatic cutover scheduling', !boundary.includes("scheduleAutomaticCutover(month, 'legacy-snapshots-ready')"));
check('Non-dry-run production cutover is policy-blocked before cutover-in-flight state', boundary.indexOf("if (opts.dryRun === false)") < boundary.indexOf('global.__canonicalTxCutoverInFlight = true'));
check('Automatic runner is policy-blocked before retry/write path', boundary.indexOf("reason: 'automatic-historical-mutation-policy'") < boundary.indexOf("const blocked = automaticCutoverBlockedReason(month)"));

const r=makeRuntime();
const overlap=safeOverlap(r);
await drain(r);
let s=r.stats();
check('AUTO_HISTORICAL_MUTATION_PRODUCTION_RED closure: safe overlap remains diagnostic-safe', overlap.safeForBackfill === true);
check('MUTATION_CAPABLE_TIMER_ZERO', s.timerCalls===0, JSON.stringify(s));
check('AUTOMATIC_HISTORICAL_WRITES_ZERO', s.historicalSet===0 && s.batchCommits===0, JSON.stringify(s));
check('AUTOMATIC_PERSISTED_CANONICAL_PROMOTION_ZERO', s.settingsWrites===0, JSON.stringify(s));
check('FINANCE_LISTENER_TOPOLOGY_UNCHANGED during safe overlap', s.detach===0 && s.attach===0, JSON.stringify(s));
check('BLOCKED_PATH_CAUSES_NO_SYNC_STATE', r.win.__canonicalTxCutoverInFlight !== true);
check('NONCANONICAL_MONTH_AUTHORITY_NOT_PERSISTED', r.api.getReadMode('club1',r.month)==='legacy');
check('Overlap diagnostics remain readable', r.win.__firestoreReadAttribution.transactionOverlap[r.month]?.safeForBackfill===true);

const beforeDry=r.stats();
const dry=await r.api.executeCanonicalCutover(r.month,{dryRun:true});
const afterDry=r.stats();
check('DRY_RUN_ZERO_MUTATION', dry.dryRun===true && afterDry.historicalSet===beforeDry.historicalSet && afterDry.settingsWrites===beforeDry.settingsWrites && afterDry.detach===beforeDry.detach && afterDry.attach===beforeDry.attach);
let blockedDirect=false; try{ await r.win.executeCanonicalTransactionCutover(r.month,{dryRun:false,confirmToken:'ENABLE_CANONICAL_READ'});}catch(e){blockedDirect=String(e?.message||e).includes('FINANCE_HISTORICAL_MUTATION_POLICY_BLOCKED');}
const afterDirect=r.stats();
check('NO_PRODUCTION_MIGRATION_BYPASS: direct non-dry bridge blocked', blockedDirect && afterDirect.historicalSet===0 && afterDirect.settingsWrites===0 && afterDirect.detach===0);
check('Manual schedule bridge cannot create mutation-capable timer', r.win.scheduleAutomaticCanonicalTransactionOptimization(r.month,'debug')===false && r.stats().timerCalls===0);
const auto=await r.win.runAutomaticCanonicalTransactionOptimization(r.month,'debug');
check('Manual run bridge is blocked without side effects', auto?.blocked===true && r.stats().historicalSet===0 && r.stats().settingsWrites===0 && r.stats().detach===0);

// Existing persisted canonical authority is preserved and not rewritten by overlap.
const c=makeRuntime({canonicalMonths:['2026-10']});
check('EXISTING_CANONICAL_MONTH_UNCHANGED: persisted month reads canonical', c.api.getReadMode('club1',c.month)==='canonical');
safeOverlap(c); await drain(c); const cs=c.stats();
check('Existing canonical month policy causes zero writes/restarts', cs.historicalSet===0 && cs.settingsWrites===0 && cs.detach===0 && cs.attach===0);
check('Reload authority derives from canonical settings, not auto localStorage', c.api.getReadMode('club1',c.month)==='canonical' && c.storage.size===0);

// R1.1 QA only: explicit emergency rollback remains available for an already-canonical month.
const rb=makeRuntime({canonicalMonths:['2026-10']});
const rbResult=await rb.win.disableCanonicalTransactionRead(rb.month);
const rbs=rb.stats();
check('EXISTING_CANONICAL_MONTH_EXPLICIT_ROLLBACK_REMAINS_SAFE', rbResult?.ok===true && rbResult?.readMode==='legacy' && rb.api.getReadMode('club1',rb.month)==='legacy' && rbs.settingsWrites===1 && rbs.detach===1 && rbs.attach===1);

// New transaction canonical format remains intact.
const newTx=r.win.canonicalizeTransactionForWrite({date:'2026-10-31',txMonth:'2026-10',amount:123},'test');
check('NORMAL_TRANSACTION_WRITER_UNCHANGED: canonical fields still produced', newTx.accountingSchemaVersion===1 && newTx.primaryAccountingMonth==='2026-10' && Array.isArray(newTx.accountingMonths) && newTx.accountingMonths.includes('2026-10'));

// Rapid callbacks, logout/club-switch/reconnect cannot leave deferred mutation.
const race=makeRuntime();
safeOverlap(race); safeOverlap(race); safeOverlap(race); race.win.userRole='viewer'; race.win.__store.userRole='viewer'; race.win.currentClubId='club2'; race.win.__store.clubId='club2'; race.win.navigator.onLine=false; race.win.navigator.onLine=true; await drain(race); const rs=race.stats();
check('RAPID_CALLBACKS_ZERO_MUTATION', rs.timerCalls===0 && rs.historicalSet===0 && rs.settingsWrites===0);
check('LOGOUT/CLUB_SWITCH/RECONNECT_STALE_EFFECT_ZERO', rs.detach===0 && rs.attach===0 && rs.transition===0);

// Storage audit: auto status storage is not consulted by getReadMode authority.
check('STORAGE_AUTHORITY_AUDIT: getReadMode authority is canonicalTransactionReadMonths only', boundary.includes('return configuredReadMonths().indexOf(month) >= 0 ? \'canonical\' : \'legacy\';') && !boundary.slice(boundary.indexOf('function getReadMode'), boundary.indexOf('function arraysEqual')).includes('localStorage'));
check('No listener owner is introduced by boundary', !boundary.includes('onSnapshot('));

console.log(`\nPASS ${pass}/${pass+fail}`);
if(fail) process.exit(1);
