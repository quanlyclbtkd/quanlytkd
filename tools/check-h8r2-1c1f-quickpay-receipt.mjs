#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const read=p=>fs.readFileSync(p,'utf8');
const finance=read('js/modules/finance.js');
const boundary=read('js/core/tuitionCommandBoundary.js');
const service=read('js/services/finance.service.js');
const lazy=read('js/core/lazyAssetsBootstrap.js');
const app=read('app.js');
const html=read('index.html');
const css=read('css/ui-mobile-shell.css');
let pass=0, fail=0; const check=(name,ok,detail='')=>{ if(ok){pass++;console.log('✅ '+name)} else {fail++;console.error('❌ '+name+(detail?' — '+detail:''))} };
const collect=boundary.slice(boundary.indexOf('async collectTuition'), boundary.indexOf('async deleteTuitionTransaction'));
check('1. quickPay uses canonical TuitionCommandBoundary', /TuitionCommandBoundary\?\.collectTuition/.test(finance));
check('2. primary payment remains one atomic transaction+profile plan', /commitAtomicWritePlan\(\{[\s\S]*transactions:[\s\S]*profileUpdates:/.test(collect));
check('3. no new primary writer in quickPay/boundary', !/(addDoc|setDoc|updateDoc|writeBatch|runTransaction)\s*\(/.test(finance.slice(finance.indexOf('window.quickPay'),finance.indexOf('window.openQuickPayModal'))) && !/from ['"]firebase/.test(boundary));
check('4. fee_audit cannot invalidate canonical success', /void _service\(\)\.addFeeAuditSilent/.test(collect) && /canonicalPaymentPreserved:\s*true/.test(boundary));
check('5. fee_audit does not block receipt/primary result', !/await _service\(\)\.addFeeAuditSilent/.test(collect) && collect.indexOf('_commitProfilePayment') < collect.indexOf('addFeeAuditSilent'));
check('6. existing fee_audit writer used exactly once by collectTuition', (collect.match(/addFeeAuditSilent\s*\(/g)||[]).length===1 && /return addDoc\(collection\(db, 'clubs', clubId, 'fee_audit'\), data\)/.test(service));
check('7. html2canvas uses canonical lazy asset owner', /ensureHtml2CanvasReady/.test(lazy) && /ensureHtml2CanvasReady\('receipt-export'\)/.test(app));
check('8. no direct duplicate html2canvas loader in app', !/html2canvas\.min\.js/.test(app) && !/createElement\(['"]script['"]\)[\s\S]{0,220}html2canvas/.test(app));
check('9. shared asset promise exists', /if \(asset\.promise\)/.test(lazy) && /return asset\.promise/.test(lazy));
check('10. asset timeout exists', /setTimeout\(function \(\) \{[\s\S]*lazy load timeout[\s\S]*\}, 20000\)/.test(lazy));
check('11. exportReceipt exposes deterministic success/failure result', /return \{ ok: true, receiptJpeg:/.test(app) && /return \{ ok: false, reason: _reason, error \}/.test(app));
check('12. quickPay inspects receipt result', /receiptResult && receiptResult\.ok === false/.test(finance));
check('13. receipt failure cannot trigger payment retry', /Không thu lại khoản tiền này/.test(finance) && !/receiptResult[\s\S]{0,600}collectTuition/.test(finance));
check('14. receipt render concurrency is serialized without coalescing', /let _receiptRenderQueue = Promise\.resolve\(\)/.test(app) && /_receiptRenderQueue\.then\([\s\S]*_exportReceiptNow\(\.\.\.args\)/.test(app));
check('15. finance module remains canonical quickPay modal owner', /window\.openQuickPayModal\s*=/.test(finance) && /Legacy openQuickPayModal blocked until Finance module adopts canonical ownership/.test(app));
check('16. legacy bootstrap path fail-closed in http-module', /window\.__RUNTIME_MODE === 'http-module'/.test(app) && /return false;/.test(app.slice(app.indexOf('window.openQuickPayModal'), app.indexOf('window.openQuickPayModal')+700)));
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);e.isDirectory()?(!['migrations','diagnostics'].includes(e.name)&&walk(f,out)):e.name.endsWith('.js')&&out.push(f)}return out}
const runtime=['app.js',...walk('js')]; const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g}; const counts={getDoc:0,getDocs:0,onSnapshot:0};
for(const f of runtime){for(const line of read(f).split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const[k,re]of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}}
check('17. no new getDoc',counts.getDoc===29,JSON.stringify(counts));
check('18. no new getDocs',counts.getDocs===45,JSON.stringify(counts));
check('19. no new onSnapshot',counts.onSnapshot===16,JSON.stringify(counts));
check('20. canonical filterBranch remains exactly one authority', (html.match(/id="filterBranch"/g)||[]).length===1 && !/mobileFilterBranch|filterBranchProxy/.test(html+finance+app));
check('21. mobile direct branch presentation preserves month/debt filters', /\.ui-filter-toggle\s*\{\s*display:\s*none;/.test(css) && /\.input-branch #filterBranch/.test(css) && (html.match(/id="filterMonth"/g)||[]).length===1 && (html.match(/id="debtOverdueFilter"/g)||[]).length===1);

// Dynamic authoritative behavior: slow/failing secondary audit must not delay/fail primary; identical double-call commits once.
global.window={userRole:'admin',currentUserEmail:'qa@example.invalid',__store:{clubId:'club-A',profiles:{StudentA:{tuitionFee:100000,paidUntil:'2026-01',paidMonths:[]}}},allProfiles:{StudentA:{tuitionFee:100000,paidUntil:'2026-01',paidMonths:[]}},guardFinancialWriteIntent:()=>true,isFinancialWriteAllowed:r=>r===true||r?.ok===true,recordFinancialActionAudit:()=>{},studentProfileStore:{getAllProfilesCompat(){return window.__store.profiles},mergeProfile(k,v){window.__store.profiles[k]=v}},invalidateLists:()=>{},refreshListsComputation:()=>{},invalidateDashboard:()=>{},recordRuntimeError:()=>{}};
window.TuitionDebtCanonical={areTuitionMonthsSettled(profile,months){const skipped=Array.isArray(profile?.skippedMonths)?profile.skippedMonths:[];const paid=Array.isArray(profile?.paidMonths)?profile.paidMonths:[];const until=String(profile?.paidUntil||'');const states=months.map(m=>({month:m,paid:!skipped.includes(m)&&(paid.includes(m)||(until&&m<=until)),skipped:skipped.includes(m)}));return {states,allSettled:states.length>0&&states.every(x=>x.paid),paidMonths:states.filter(x=>x.paid).map(x=>x.month),skippedMonths:states.filter(x=>x.skipped).map(x=>x.month),unpaidMonths:states.filter(x=>!x.paid).map(x=>x.month)}} ,reconcilePaidUntilFromMonthEvidence(profile,paidMonths){const all=Array.from(new Set([...(Array.isArray(profile?.paidMonths)?profile.paidMonths:[]),...(Array.isArray(paidMonths)?paidMonths:[])])).sort();const until=String(profile?.paidUntil||'');return all.reduce((max,m)=>m>max?m:max,until)}};
global.document={getElementById:()=>null};
let commitCount=0,auditCount=0,resolveCommit; let auditMode='slow';
window.FinanceService={_arrayUnion:(...xs)=>xs,commitAtomicWritePlan:async()=>{commitCount++;return {txIds:['tx-'+commitCount]}},addFeeAuditSilent:()=>{auditCount++; if(auditMode==='fail')return Promise.resolve({ok:false,error:new Error('audit-fail')}); return new Promise(()=>{})}};
const mod=await import(pathToFileURL(path.resolve('js/core/tuitionCommandBoundary.js')).href+'?c1f-gate');
const r=await Promise.race([mod.TuitionCommandBoundary.collectTuition({studentName:'StudentA',months:['2026-02'],branch:'CS1',amount:100000}),new Promise(res=>setTimeout(()=>res({timeout:true}),120))]);
check('22. dynamic slow fee_audit does not block canonical result',r?.ok===true&&!r?.timeout && commitCount===1 && auditCount===1);
auditMode='fail';
const r2=await mod.TuitionCommandBoundary.collectTuition({studentName:'StudentA',months:['2026-03'],branch:'CS1',amount:100000});
check('23. dynamic fee_audit failure preserves payment success',r2?.ok===true && commitCount===2 && auditCount===2);
let release; window.FinanceService.commitAtomicWritePlan=()=>{commitCount++;return new Promise(res=>{release=()=>res({txIds:['tx-single']})})}; window.FinanceService.addFeeAuditSilent=async()=>({ok:true});
const p1=mod.TuitionCommandBoundary.collectTuition({studentName:'StudentA',months:['2026-04'],branch:'CS1',amount:100000});
const p2=mod.TuitionCommandBoundary.collectTuition({studentName:'StudentA',months:['2026-04'],branch:'CS1',amount:100000});
await new Promise(r=>setTimeout(r,0)); const before=commitCount; release(); const [x1,x2]=await Promise.all([p1,p2]);
check('24. dynamic identical double-submit primary commit exactly once',before===3 && commitCount===3 && x1.txId===x2.txId);
console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`); console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`); if(fail)process.exit(1); console.log('H8R2.1C1F quickpay/receipt gate PASS.');
