#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectPaidUntilSemantics } from './helpers/paidUntilMonotonicGate.mjs';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'), html=read('index.html'), shell=read('js/ui/legacyUiShell.js');
const listener=read('js/listeners/profiles.listeners.js'), inv=read('js/services/inventory.service.js');
const debt=read('js/core/tuitionDebtCanonical.js');
const globalGate=read('tools/check-global-ownership-adoption-cleanup.mjs');
const invGate=read('tools/check-inventory-dynamic-size-catalog.mjs');
const quitGate=read('tools/check-v5r-quit-single-source-lock.mjs');
const v5tGate=read('tools/check-v5t-canonical-command-boundary-write-freeze.mjs');
let pass=0, fail=0; const check=(n,c,d='')=>{if(c){pass++;console.log('✅',n)}else{fail++;console.error('❌',n,d)}};

const paid=inspectPaidUntilSemantics(app,debt);
check('1. paidUntil monotonic gate aligned (T1-T4 + payment/debt)', paid.t1&&paid.t2&&paid.t3&&paid.t4&&paid.profileWriteUsesResult&&paid.transactionKeepsPackageMonths&&paid.canonicalBundleCommitted&&paid.debtConsumesProfilePaidUntil&&paid.debtStartsAfterPaidUntil);
check('2. stale paidUntil:lastMonth requirement removed from processMultiItem', paid.oldLiteralAbsent && !/paidUntil lastMonth missing/.test(read('tools/check-multiitem-tuition-package-fix.mjs')));
check('3. GlobalOwnership fixture supports current ARIA contract', ['setAttribute','getAttribute','removeAttribute','addEventListener','removeEventListener'].every(x=>globalGate.includes(x)) && globalGate.includes('mobile menu open preserves ARIA contract') && globalGate.includes('mobile menu close restores body scroll'));
check('4. Inventory summaryPatch semantic gate aligned', inv.includes('prepareAddItemMutation(data)') && inv.includes('prepared.summaryPatch') && invGate.includes('canonical prepared increment patch') && invGate.includes('same batch without a duplicate writer'));
const qStart=listener.indexOf('export async function loadQuitProfilesIfNeeded'), qEnd=listener.indexOf('export async function ensureQuitProfilesComplete',qStart), qSeg=listener.slice(qStart,qEnd);
check('5. Quit has no 60-second polling requirement', !/ageMs\s*>\s*60000/.test(qSeg) && !/setInterval\s*\(/.test(qSeg) && quitGate.includes('event-driven'));
check('6. Quit dirty/completeness authority preserved', listener.includes("_state.quitAuthorityState = 'dirty'") && listener.includes('markQuitComplete(false)') && listener.includes("ensureQuitProfilesComplete('active-query-membership-current-quit')") && listener.includes("if (!forceRefresh && sameClub && !dirty && _state.quitCompletenessReconciled && isQuitComplete()) return true;"));
check('7. V5T recognizes approved fee_audit Class-2 loop', v5tGate.includes('__approved_class2_combo_fee_audit_projection__') && v5tGate.includes('canonicalPaymentPreserved: true') && v5tGate.includes('bounded historical capacity'));

function walkJs(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(['migrations','diagnostics'].includes(e.name))continue;walkJs(f,out)}else if(e.name.endsWith('.js'))out.push(f)}return out}
const runtime=[path.join(root,'app.js'),...walkJs(path.join(root,'js'))];
const pats={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0}; for(const f of runtime){for(const line of fs.readFileSync(f,'utf8').split('\n')){const t=line.trim();if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))continue;for(const [k,re] of Object.entries(pats)){re.lastIndex=0;if(re.test(line))counts[k]++}}}
check('8. getDoc unchanged', counts.getDoc===29, JSON.stringify(counts));
check('9. getDocs unchanged', counts.getDocs===51, JSON.stringify(counts));
check('10. onSnapshot unchanged', counts.onSnapshot===16, JSON.stringify(counts));
check('11. mobile shell canonical owner unchanged', shell.includes("const owner = 'js/ui/legacyUiShell.js'") && shell.includes("['openMobileMenu', openMobileMenu") && shell.includes("['closeMobileMenu', closeMobileMenu"));
const nav=(html.match(/<nav id="mobileBottomNav"[\s\S]*?<\/nav>/)||[''])[0];
const ids=[...nav.matchAll(/id="(mobileNav[^"]+)"/g)].map(m=>m[1]);
check('12. nav order correct', JSON.stringify(ids)===JSON.stringify(['mobileNavTuition','mobileNavDebt','mobileNavAttendance','mobileNavStudents','mobileNavMore']));
const more=(html.match(/id="mobileMenuSheet"[\s\S]*?<\/div><\/div><script>window\.openMobileMenu/)||[''])[0];
check('13. Dashboard moved to More', !ids.includes('mobileNavDashboard') && more.includes('id="mobileMoreDashboard"') && more.includes("switchTab('dashboard')"));
check('14. Debt not duplicated in More', ids.includes('mobileNavDebt') && !/mobileMoreDebt|switchTab\('debt'\)/.test(more));
check('15. Tuition semantic card classes remain', ['tx-date-cell','tx-month-cell','tx-name-cell name-link','tx-amount-cell','tx-actions-cell action-btns'].every(x=>app.includes(x)) && html.includes('#tbl_tx tbody td.tx-date-cell{grid-column:1 / -1;grid-row:3'));

const roots=['index.html','app.js','style.css','.nojekyll','js','css','assets']; const norm=p=>p.split(path.sep).join('/');
function collect(base,rel){const a=path.resolve(base,rel);if(!fs.existsSync(a))return[];if(fs.statSync(a).isFile())return[norm(rel)];const out=[];const walk=d=>{for(const n of fs.readdirSync(d)){const x=path.resolve(d,n);fs.statSync(x).isDirectory()?walk(x):out.push(norm(path.relative(base,x)))}};walk(a);return out}
const rf=[...new Set(roots.flatMap(r=>collect(root,r)))].sort(), pf=[...new Set(roots.flatMap(r=>collect(path.join(root,'public'),r)))].sort(), ps=new Set(pf); const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const parity=rf.length===pf.length && rf.every(f=>ps.has(f)&&hash(path.join(root,f))===hash(path.join(root,'public',f)));
check('16. root/public parity', parity, `${rf.length}/${pf.length}`);
console.log(`\nFirestore static budget: ${counts.getDoc}/${counts.getDocs}/${counts.onSnapshot}`);
console.log(`Total: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`); if(fail)process.exit(1);
console.log('H8R2.1C1D regression gate/runtime readiness PASS.');
