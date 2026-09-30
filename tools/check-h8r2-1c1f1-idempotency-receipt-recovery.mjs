#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const read = p => fs.readFileSync(p, 'utf8');
const boundary = read('js/core/tuitionCommandBoundary.js');
const finance = read('js/modules/finance.js');
const lazy = read('js/core/lazyAssetsBootstrap.js');
const app = read('app.js');
const html = read('index.html');
let pass = 0, fail = 0;
const check = (name, ok, detail='') => {
  if (ok) { pass++; console.log('✅ ' + name); }
  else { fail++; console.error('❌ ' + name + (detail ? ' — ' + detail : '')); }
};

// Static authority and receipt contracts.
check('1. canonical TuitionCommandBoundary remains owner', /TuitionCommandBoundary\?\.collectTuition/.test(finance) && /async collectTuition/.test(boundary));
check('2. no new primary writer', !/(addDoc|setDoc|updateDoc|writeBatch|runTransaction)\s*\(/.test(finance.slice(finance.indexOf('window.quickPay'), finance.indexOf('window.openQuickPayModal'))) && !/from ['"]firebase/.test(boundary));
check('3. completed replay guard lives inside existing boundary', /const completedReplay = new Map\(\)/.test(boundary) && /COMPLETED_REPLAY_TTL_MS\s*=\s*30000/.test(boundary));
check('4. canonical replay fingerprint contains club/profile/branch/months/amount', /_clubIdentity\(\)/.test(boundary) && /_profileIdentity\(profile, name\)/.test(boundary) && /normalizedBranch/.test(boundary) && /normalizedMonthsForKey\.join/.test(boundary) && /numericAmount/.test(boundary));
check('5. completed replay reuses canonical result', /deduped:\s*true/.test(boundary) && /completedReplay:\s*true/.test(boundary));
check('6. failed asset promise is reset', /asset\.promise\s*=\s*null/.test(lazy) && /detachFailedScript/.test(lazy));
check('7. asset loader has generation guard', /asset\.generation/.test(lazy) && /isCurrentFlight/.test(lazy));
check('8. no automatic asset retry loop', !/setInterval\s*\(/.test(lazy) && !/setTimeout\s*\([^\n]*ensureHtml2CanvasReady/.test(lazy));
check('9. shared asset loader remains single-flight', /if \(asset\.promise\)/.test(lazy) && /return asset\.promise/.test(lazy));
check('10. receipt queue remains serialized', /let _receiptRenderQueue = Promise\.resolve\(\)/.test(app) && /_receiptRenderQueue\.then/.test(app));
check('11. structured receipt failure reasons exist', ['asset-timeout','asset-load-failed','render-failed','image-failed','preview-failed','modal-not-visible','modal-closed-before-display'].every(x => app.includes(`'${x}'`)));
check('12. payment success is separated from receipt success', /receiptResult && receiptResult\.ok === false/.test(finance) && /Không thu lại khoản tiền này/.test(finance));
check('13. receipt visibility contract validates computed DOM state', /_inspectReceiptModalVisibility/.test(app) && /getComputedStyle\(modal\)/.test(app) && /getBoundingClientRect\(\)/.test(app) && /intersectsViewport/.test(app));
check('14. preview dimensions are required before success', /naturalWidth > 0/.test(app) && /naturalHeight > 0/.test(app) && /previewNaturalWidth/.test(app) && /previewNaturalHeight/.test(app));
check('15. receipt success explicitly reports rendered + preview + modal', /rendered:\s*true/.test(app) && /previewReady:\s*true/.test(app) && /modalVisible:\s*true/.test(app));
check('16. quickPay receipt uses canonical transaction date', /result\.txDate \|\| getLocalToday\(\)/.test(finance));
check('17. one canonical #filterBranch remains', (html.match(/id="filterBranch"/g) || []).length === 1 && !/mobileFilterBranch|filterBranchProxy/.test(html + finance + app));

// Firestore static budget.
function walk(dir,out=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if (e.isDirectory()) { if (!['migrations','diagnostics'].includes(e.name)) walk(f,out); } else if (e.name.endsWith('.js')) out.push(f); } return out; }
const runtime=['app.js', ...walk('js')];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
for (const f of runtime) for (const line of read(f).split('\n')) { const t=line.trim(); if (t.startsWith('//')||t.startsWith('*')||t.startsWith('/*')) continue; for (const [k,re] of Object.entries(pats)) { re.lastIndex=0; if (re.test(line)) counts[k]++; } }
check('18. no new getDoc', counts.getDoc===29, JSON.stringify(counts));
check('19. no new getDocs', counts.getDocs===45, JSON.stringify(counts));
check('20. no new onSnapshot', counts.onSnapshot===16, JSON.stringify(counts));

// Dynamic completed replay tests: ID01-ID08 core semantics.
global.window={
  userRole:'admin', currentUserEmail:'qa@example.invalid', currentClubId:'clubA',
  __store:{clubId:'clubA',profiles:{
    StudentA:{profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-01',paidMonths:[]},
    StudentB:{profileId:'pB',branch:'CS1',tuitionFee:100000,paidUntil:'2026-01',paidMonths:[]},
  }},
  guardFinancialWriteIntent:()=>true, isFinancialWriteAllowed:r=>r===true||r?.ok===true, recordFinancialActionAudit:()=>{},
  studentProfileStore:{getAllProfilesCompat(){return window.__store.profiles},mergeProfile(k,v){window.__store.profiles[k]=v}},
  invalidateLists:()=>{},refreshListsComputation:()=>{},invalidateDashboard:()=>{},recordRuntimeError:()=>{}
};
window.TuitionDebtCanonical={areTuitionMonthsSettled(profile,months){const skipped=Array.isArray(profile?.skippedMonths)?profile.skippedMonths:[];const paid=Array.isArray(profile?.paidMonths)?profile.paidMonths:[];const until=String(profile?.paidUntil||'');const states=months.map(m=>({month:m,paid:!skipped.includes(m)&&(paid.includes(m)||(until&&m<=until)),skipped:skipped.includes(m)}));return {states,allSettled:states.length>0&&states.every(x=>x.paid),paidMonths:states.filter(x=>x.paid).map(x=>x.month),skippedMonths:states.filter(x=>x.skipped).map(x=>x.month),unpaidMonths:states.filter(x=>!x.paid).map(x=>x.month)}} ,reconcilePaidUntilFromMonthEvidence(profile,paidMonths){const all=Array.from(new Set([...(Array.isArray(profile?.paidMonths)?profile.paidMonths:[]),...(Array.isArray(paidMonths)?paidMonths:[])])).sort();const until=String(profile?.paidUntil||'');return all.reduce((max,m)=>m>max?m:max,until)}};
global.document={getElementById:()=>null};
let commits=0, releaseFirst=null;
window.FinanceService={
  _arrayUnion:(...xs)=>xs,
  commitAtomicWritePlan:()=>{ commits++; if (commits===1) return new Promise(res=>{releaseFirst=()=>res({txIds:['tx-1']})}); return Promise.resolve({txIds:['tx-'+commits]}); },
  addFeeAuditSilent:async()=>({ok:true}),
};
const mod=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+'?c1f1='+Date.now());
const T=mod.TuitionCommandBoundary;
const cmdA={studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000};
const p1=T.collectTuition(cmdA), p2=T.collectTuition(cmdA);
await new Promise(r=>setTimeout(r,0)); const concurrentBefore=commits; releaseFirst(); const [a1,a2]=await Promise.all([p1,p2]);
check('21. ID01 concurrent duplicate primary commit exactly once', concurrentBefore===1 && commits===1 && a1.txId===a2.txId);
const seq=await T.collectTuition(cmdA);
check('22. ID02 sequential completed replay adds zero primary commit', commits===1 && seq.completedReplay===true && seq.txId===a1.txId);
await T.collectTuition({studentName:'StudentA',months:['2026-03'],branch:'CS1',amount:100000});
const afterDifferentMonth=commits;
await T.collectTuition({studentName:'StudentB',months:['2026-02'],branch:'CS1',amount:100000});
const afterDifferentStudent=commits;
const clubAProfiles=window.__store.profiles;
window.__store.clubId='clubB'; window.currentClubId='clubB'; window.__store.profiles={StudentA:{profileId:'pA',branch:'CS1',tuitionFee:100000,paidUntil:'2026-01',paidMonths:[]}};
await T.collectTuition(cmdA);
check('23. ID03-ID05 legitimate different month/student/club are not deduped', afterDifferentMonth===2 && afterDifferentStudent===3 && commits===4);
window.__store.clubId='clubA'; window.currentClubId='clubA'; window.__store.profiles=clubAProfiles;
const replayAfterReceiptFailure=await T.collectTuition(cmdA);
check('24. ID06-ID08 replay/rerender remains duplicate-safe after context reset', commits===4 && replayAfterReceiptFailure.alreadySettled===true && replayAfterReceiptFailure.primaryWritePerformed===false && replayAfterReceiptFailure.txId===null);

// Dynamic lazy asset recovery harness: AR01-AR09.
function makeLazyHarness() {
  const nodes=[], timers=[];
  const head={ appendChild(node){ node.parentNode=head; nodes.push(node); }, removeChild(node){ const i=nodes.indexOf(node); if(i>=0){} node.parentNode=null; } };
  const document={head,createElement(){return {onload:null,onerror:null,parentNode:null};}};
  const window={};
  const context={
    window, document, console, Promise, Date,
    performance:{now:()=>1}, location:{href:'test://'}, navigator:{userAgent:'qa'},
    setTimeout(fn,ms){const t={fn,ms,active:true};timers.push(t);return t;},
    clearTimeout(t){if(t)t.active=false;},
  };
  vm.createContext(context); vm.runInContext(lazy,context,{filename:'lazyAssetsBootstrap.js'});
  return {window,document,nodes,timers};
}
{
  const h=makeLazyHarness(); h.window.html2canvas=()=>{};
  const v=await h.window.ensureHtml2CanvasReady('AR01');
  check('25. AR01 already-loaded fast path creates no script', typeof v==='function' && h.nodes.length===0);
}
{
  const h=makeLazyHarness();
  const p=h.window.ensureHtml2CanvasReady('AR02'); const node=h.nodes[0]; h.window.html2canvas=()=>{}; node.onload(); await p;
  check('26. AR02 first load succeeds', h.nodes.length===1 && h.window.__mobileStartupPerf.assets.html2canvas.loaded===true);
}
{
  const h=makeLazyHarness();
  const first=h.window.ensureHtml2CanvasReady('AR03'); const n1=h.nodes[0]; n1.onerror(); let failed=false; try{await first}catch{failed=true}
  const afterFail=h.window.__mobileStartupPerf.assets.html2canvas;
  const retry=h.window.ensureHtml2CanvasReady('AR04'); const n2=h.nodes[1]; h.window.html2canvas=()=>{}; n2.onload(); await retry;
  check('27. AR03-AR04 terminal network failure resets promise and explicit retry succeeds', failed && afterFail.promise!==first && h.nodes.length===2 && afterFail.loaded===true);
}
{
  const h=makeLazyHarness();
  const first=h.window.ensureHtml2CanvasReady('AR05'); const oldNode=h.nodes[0]; const oldOnload=oldNode.onload; const timeout=h.timers.find(t=>t.active && t.ms===20000); timeout.fn(); let timedOut=false; try{await first}catch(e){timedOut=e?.code==='asset-load-timeout'}
  const retry=h.window.ensureHtml2CanvasReady('AR06'); const currentGen=h.window.__mobileStartupPerf.assets.html2canvas.generation;
  h.window.html2canvas=()=>{}; oldOnload(); const stillCurrent=h.window.__mobileStartupPerf.assets.html2canvas.generation===currentGen && h.window.__mobileStartupPerf.assets.html2canvas.promise===retry;
  h.nodes[1].onload(); await retry;
  check('28. AR05-AR06 timeout resets flight and explicit retry succeeds', timedOut && h.nodes.length===2 && h.window.__mobileStartupPerf.assets.html2canvas.loaded===true);
  check('29. AR09 late old onload cannot corrupt new generation', stillCurrent);
}
{
  const h=makeLazyHarness(); const a=h.window.ensureHtml2CanvasReady('AR07-A'); const b=h.window.ensureHtml2CanvasReady('AR07-B'); const one=h.nodes.length===1 && a===b; h.window.html2canvas=()=>{}; h.nodes[0].onload(); await Promise.all([a,b]);
  check('30. AR07 same loading flight stays single-script/single-promise', one);
}
{
  const h=makeLazyHarness(); const first=h.window.ensureHtml2CanvasReady('AR08-first'); h.nodes[0].onerror(); try{await first}catch{}
  const a=h.window.ensureHtml2CanvasReady('AR08-A'); const b=h.window.ensureHtml2CanvasReady('AR08-B'); const oneRetry=h.nodes.length===2 && a===b; h.window.html2canvas=()=>{}; h.nodes[1].onload(); await Promise.all([a,b]);
  check('31. AR08 two explicit retry callers share exactly one new flight', oneRetry);
}

const parity=spawnSync(process.execPath,['tools/check-root-public-parity.mjs'],{encoding:'utf8'});
check('32. root/public parity', parity.status===0, (parity.stderr||parity.stdout||'').trim().slice(-500));

console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('H8R2.1C1F1 idempotency/receipt recovery gate PASS.');
