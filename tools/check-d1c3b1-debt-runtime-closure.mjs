#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const files = {
  boundary: fs.readFileSync('js/core/debtProfileReadBoundary.js','utf8'),
  renderer: fs.readFileSync('js/ui/render/computation/studentsRenderer.js','utf8'),
  listeners: fs.readFileSync('js/listeners/profiles.listeners.js','utf8'),
  students: fs.readFileSync('js/modules/students.js','utf8'),
  app: fs.readFileSync('app.js','utf8'),
  pkg: JSON.parse(fs.readFileSync('package.json','utf8')),
};
let pass=0, fail=0;
function check(label, cond, detail='') { if (cond) { pass++; console.log('PASS', label); } else { fail++; console.error('FAIL', label, detail); } }
function sliceBetween(src,a,b){ const i=src.indexOf(a), j=src.indexOf(b,i+1); return i>=0 && j>i ? src.slice(i,j) : ''; }

const getStatusBody = sliceBetween(files.boundary,'function getStatus()','function printMetrics()');
check('R01 boundary exposes one canonical ready boolean', /\bready\s*:/.test(getStatusBody));
check('R02 boundary status exposes authorityClubId', /authorityClubId/.test(getStatusBody));
check('R03 boundary status exposes sameClub', /sameClub/.test(getStatusBody));
check('R04 boundary status exposes fullAuthoritySnapshotSeen', /fullAuthoritySnapshotSeen/.test(getStatusBody));
check('R05 boundary status exposes fullAuthorityComplete', /fullAuthorityComplete/.test(getStatusBody));
check('R06 boundary status exposes storeComplete', /storeComplete/.test(getStatusBody));

const rendererCoverage = files.renderer;
check('R07 renderer asks canonical coverage.ready only', /_debtBoundaryStatus\?\.ready|_boundaryStatus\?\.ready|_boundaryStatus\s*&&\s*_boundaryStatus\.ready/.test(rendererCoverage));
check('R08 renderer does not promote configVerified to authoritative Debt', !/_boundaryStatus\.configVerified/.test(rendererCoverage));
check('R09 renderer does not promote sessionVerified/source strings independently', !/_boundaryStatus\.sessionVerified/.test(rendererCoverage) && !/includes\(['"]full-fallback/.test(rendererCoverage));
check('R10 renderer has neutral syncing state for not-ready Debt', /Đang đồng bộ đầy đủ dữ liệu Báo nợ/.test(files.renderer));

const studentsEnsure = files.students;
check('R11 module ensureDebtProfilesReady guards recomputation on result.ready === true', /if\s*\(\s*result\?\.ready\s*===\s*true(?:\s*&&\s*!wasReady)?|if\s*\(\s*result\s*&&\s*result\.ready\s*===\s*true/.test(studentsEnsure));
check('R12 module compatibility fallback never treats profilesCount>0 as ready', !/ready:\s*profilesCount\s*>\s*0/.test(files.students));
const appEnsure = sliceBetween(files.app,'window.ensureDebtProfilesReady = async function(reason)','// debugDebtCoverage');
check('R13 app compatibility owner delegates instead of independently recomputing Debt', !/refreshListsComputation/.test(appEnsure) && /ensureDebtProfileCoverage|loadAllProfilesForDebt/.test(appEnsure));
check('R14 app compatibility fallback never treats profilesCount>0 as ready', !/ready:\s*profilesCount\s*>\s*0/.test(appEnsure));

const mountBody = sliceBetween(files.listeners,'export function mountActiveProfilesListener(context)','export function cleanupActiveProfilesListener');
const keyPos = mountBody.indexOf("const key = isCoach");
const resetPos = mountBody.indexOf('_state.fullAuthoritySnapshotSeen = false');
const duplicateGuardPos = mountBody.indexOf('window.hasListener(key)');
check('R15 listener key is resolved before Admin authority reset', keyPos >= 0 && resetPos >= 0 && keyPos < resetPos);
check('R16 duplicate listener guard runs before Admin authority reset', duplicateGuardPos >= 0 && resetPos >= 0 && duplicateGuardPos < resetPos);
check('R17 duplicate mount preserves healthy authority and returns idempotently', /hasListener\(key\)[\s\S]{0,500}return true/.test(mountBody));

const fallbackBody = sliceBetween(files.listeners,'export async function loadFullProfilesFallback','export function');
check('R18 complete same-club realtime authority short-circuits fallback before getDocs', /fullAuthoritySnapshotSeen[\s\S]*fullAuthorityComplete[\s\S]*authorityClubId[\s\S]*return true/.test(fallbackBody));
check('R19 fallback verifies listener teardown before full getDocs', /removeListener[\s\S]*hasListener[\s\S]*return false[\s\S]*getDocs/.test(fallbackBody));

check('R20 zero-fee admission refresh includes students.debtList', /refreshListsComputation\?\.\(\['students\.activeList', 'students\.debtList', 'dashboard\.summary'\]/.test(files.students));
check('R21 zero-fee admission invalidates students.debtList', /invalidateList\('students\.debtList', 'after-add-new-student'\)/.test(files.students));

const release = String(files.pkg.scripts?.['check:release']||'');
const critical = String(files.pkg.scripts?.['check:all:critical']||'');
check('R22 release locks D1C3B authoritative coverage gate', /d1c3b-debt-authoritative-profile-coverage/.test(release));
check('R23 release locks D1C3B1 runtime closure gate', /d1c3b1-debt-runtime-closure/.test(release));
check('R24 critical gate includes D1C3B1 runtime closure', /d1c3b1-debt-runtime-closure/.test(critical));


// Behavioral listener idempotency / fallback exclusion using the actual owner.
globalThis.window = globalThis;
window.userRole = 'admin';
window.__store = { clubId:'club-A', profiles:{}, clubConfig:{} };
window._syncAllProfilesLegacy = () => {};
window.refreshListsComputation = () => {};
window.invalidateList = () => {};
window.invalidateStudents = () => {};
window.scheduleAutomaticDebtProfileCoverage = () => {};
window.RoleReadBoundary = { isCoachAttendanceOnly:()=>false, canMount:()=>true };
window._moduleDashboard = { reconcileHydrationEvidence(){}, markStatsDirty(){} };
const registry = new Map();
let onSnapshotCalls = 0, getDocsCalls = 0, lastNext = null, lastError = null;
window.hasListener = key => registry.has(key);
window.removeListener = key => { const e=registry.get(key); try { e?.unsub?.(); } catch {} registry.delete(key); return true; };
window.safeRegisterSnapshot = (key, create) => {
  if (registry.has(key)) return false;
  const unsub = create();
  registry.set(key,{unsub});
  return true;
};
window.markListenerSnapshot = () => {};
window._fb_init = {
  query:(ref,...constraints)=>({ref,constraints}),
  where:(...args)=>({where:args}),
  limit:n=>({limit:n}),
  onSnapshot:(target,opts,next,error)=>{ if(opts?.includeMetadataChanges!==true) throw Error('metadata changes not included'); onSnapshotCalls++; lastNext=next; lastError=error; return ()=>{}; },
  getDocs:async()=>{ getDocsCalls++; return { size:0, empty:true, metadata:{fromCache:false,hasPendingWrites:false}, forEach(){} }; },
};
const profileOwner = await import('../js/listeners/profiles.listeners.js?d1c3b1=' + Date.now());
const profRef = { path:'clubs/club-A/profiles' };
const ctx = { db:{}, clubId:'club-A', profRef, role:'admin', reason:'d1c3b1-test' };
const emptySnap = { metadata:{fromCache:false,hasPendingWrites:false}, size:0, empty:true, forEach(){}, docChanges(){ return []; } };

profileOwner.resetProfilesListeners('d1c3b1-m01'); registry.clear(); onSnapshotCalls=0; getDocsCalls=0; lastNext=null;
profileOwner.mountActiveProfilesListener(ctx);
check('M01 first Admin mount creates exactly one listener', onSnapshotCalls === 1 && registry.size === 1);
lastNext?.(emptySnap);
let m = profileOwner.getProfilesListenerMetrics();
check('M01 first snapshot establishes full authority even at zero profiles', m.fullAuthoritySnapshotSeen === true && m.fullAuthorityComplete === true && m.authorityClubId === 'club-A');
for (let i=0;i<10;i++) profileOwner.mountActiveProfilesListener(ctx);
m = profileOwner.getProfilesListenerMetrics();
check('M03 repeated duplicate mount keeps listener count one', registry.size === 1 && onSnapshotCalls === 1 && m.fullAuthorityComplete === true);
const beforeFallbackReads = getDocsCalls;
check('F01 complete realtime authority makes fallback zero-read', await profileOwner.loadFullProfilesFallback('d1c3b1-complete') === true && getDocsCalls === beforeFallbackReads);

profileOwner.resetProfilesListeners('d1c3b1-m02'); registry.clear(); onSnapshotCalls=0; getDocsCalls=0; lastNext=null;
profileOwner.mountActiveProfilesListener(ctx);
profileOwner.mountActiveProfilesListener(ctx);
m = profileOwner.getProfilesListenerMetrics();
check('M02 pending duplicate mount preserves one pending listener without fallback', registry.size === 1 && onSnapshotCalls === 1 && getDocsCalls === 0 && m.fullAuthoritySnapshotSeen === false);
lastNext?.(emptySnap);
m = profileOwner.getProfilesListenerMetrics();
check('M02 original pending listener can still establish authority', m.fullAuthoritySnapshotSeen === true && m.fullAuthorityComplete === true);

profileOwner.resetProfilesListeners('d1c3b1-f02'); registry.clear(); onSnapshotCalls=0; getDocsCalls=0; lastNext=null;
profileOwner.mountActiveProfilesListener(ctx);
const pendingKey = profileOwner.getProfilesListenerMetrics().activeListenerKey || 'students:profiles:active:club-A:admin';
// D1C3B2: pending is healthy; only a concrete snapshot error may takeover.
lastError?.({ code: 'unavailable' });
await new Promise(resolve => setImmediate(resolve));
const fallbackOk = getDocsCalls === 1;
check('F02 explicit listener error removes old owner before one full getDocs and recovers realtime', fallbackOk === true && registry.size === 1 && onSnapshotCalls === 2);

profileOwner.resetProfilesListeners('d1c3b1-f03'); registry.clear(); onSnapshotCalls=0; getDocsCalls=0; lastNext=null;
profileOwner.mountActiveProfilesListener(ctx);
const realRemoveListener = window.removeListener;
window.removeListener = () => false; // simulated teardown failure: registry entry remains
const blockedFallback = await profileOwner.loadFullProfilesFallback('d1c3b1-remove-fails');
check('F03 fallback fails closed when listener removal cannot be verified', blockedFallback === false && registry.size === 1 && getDocsCalls === 0);
window.removeListener = realRemoveListener;
profileOwner.resetProfilesListeners('d1c3b1-f03-cleanup'); registry.clear();

// S02-S04 — execute the exact module-installed ensureDebtProfilesReady function body.
function extractAssignment(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('missing assignment marker: ' + marker);
  const braceStart = source.indexOf('{', start);
  let depth=0, quote='', escaped=false;
  for (let i=braceStart; i<source.length; i++) {
    const ch=source[i];
    if (quote) { if (escaped) escaped=false; else if (ch==='\\') escaped=true; else if (ch===quote) quote=''; continue; }
    if (ch==='"' || ch==="'" || ch==='`') { quote=ch; continue; }
    if (ch==='{') depth++;
    else if (ch==='}' && --depth===0) return source.slice(start, source.indexOf(';',i)+1);
  }
  throw new Error('unclosed assignment');
}
const ensureAssignment = extractAssignment(files.students, 'window.ensureDebtProfilesReady = async function ensureDebtProfilesReady');
let refreshCount=0, invalidateCount=0, readyResult={ ready:false, source:'not-ready' };
const debtVm = {
  window: {
    __store:{ profiles:{}, _debtProfileCoverageReady:false, selectedMonth:'2026-09' },
    loadAllProfilesForDebt: async()=>readyResult,
    refreshListsComputation:()=>{ refreshCount++; },
    invalidateList:()=>{ invalidateCount++; },
    updateSkippedMonthSection:()=>{},
  },
  document:{ getElementById:()=>({value:'2026-09'}) },
  Date,Object,Array,String,Number,Boolean,Promise,console,
};
vm.createContext(debtVm); vm.runInContext(ensureAssignment,debtVm,{filename:'students.js#ensureDebtProfilesReady'});
await debtVm.window.ensureDebtProfilesReady('s02-not-ready');
check('S02 ready=false performs zero Debt recomputation/invalidation', refreshCount===0 && invalidateCount===0 && debtVm.window.__store._debtProfileCoverageReady===false);
readyResult={ ready:true, source:'full-profiles-authoritative' };
await debtVm.window.ensureDebtProfilesReady('s03-ready');
check('S03 false→true performs exactly one authoritative refresh/invalidation', refreshCount===1 && invalidateCount===1 && debtVm.window.__store._debtProfileCoverageReady===true);
await debtVm.window.ensureDebtProfilesReady('s04-repeat-1');
await debtVm.window.ensureDebtProfilesReady('s04-repeat-2');
check('S04 repeated ready callbacks do not create a refresh storm', refreshCount===1 && invalidateCount===1);

console.log(`D1C3B1 runtime closure: ${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
