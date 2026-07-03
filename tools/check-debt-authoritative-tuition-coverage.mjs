#!/usr/bin/env node
/** Phase 4K-6V4B11 — Debt Authoritative Tuition Coverage */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const fmt = read('js/utils/format.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const reports = read('js/modules/reports.js');
const students = read('js/modules/students.js');
const index = read('index.html');
const main = read('js/main.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const listRefresh = read('js/ui/render/listComputationRefresh.js');

let pass=0, fail=0;
function check(name, ok, detail='') { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name + (detail ? ' — '+detail : '')); } }
console.log('\n=== Phase 4K-6V4B11 — Debt Authoritative Tuition Coverage ===\n');

const activeBuilds = ['given-name-search-20260703-v5d', 'profile-canonical-store-runtime-recovery-20260628-v4d1a', 'profile-canonical-store-20260628-v4d1', 'tuition-debt-source-of-truth-20260628-v4c'];
const appBuildOk = activeBuilds.some(build => index.includes(`app.js?v=${build}`));
const moduleBuildOk = activeBuilds.some(build => index.includes(`main.js?v=${build}`) && main.includes(`modules/students.js?v=${build}`) && renderStudents.includes(`studentsRenderer.js?v=${build}`) && listRefresh.includes(`studentsRenderer.js?v=${build}`));
check('index/main/app cache-busted for current debt phase', appBuildOk && moduleBuildOk);
check('app normalizeYYYYMM supports MM/YYYY, T numeric and Vietnamese month-word formats', app.includes("_monthWordToNumber") && app.includes("Tháng năm 2026") && app.includes("Tháng tư 2026") && app.includes("raw.match(/^(\\d{1,2})[-\\/](20\\d{2})$/)") && app.includes("raw.match(/^(?:T)?(\\d{1,2})[-\\/]?(20\\d{2})$/i)"));
check('utils normalizeYYYYMM mirrors month-word parser', fmt.includes("_monthWordToNumber") && fmt.includes("Tháng năm 2026") && fmt.includes("muoi mot") && fmt.includes("raw.match(/^(\\d{1,2})[-\\/](20\\d{2})$/)"));
check('global normalizeTuitionMonth exposed', app.includes('window.normalizeTuitionMonth = normalizeYYYYMM'));
check('getChargeableTuitionMonths normalizes selectedMonth, paidUntil, paidMonths and skippedMonths', app.includes('const selMonth = normalizeYYYYMM(selectedMonth') && app.includes('skippedMonths.map(function(m) { return normalizeYYYYMM(m); })') && app.includes('rawPaidMonths = Array.isArray(p.paidMonths)') && app.includes('const paidUntil = normalizeYYYYMM'));
check('legacy isOwed is only additive and cannot suppress canonical debt', app.includes('p.isOwed === true && Array.isArray(p.owedMonths)') && app.includes('Only merge legacy owed months when they ADD evidence'));
check('legacy app debt render uses getChargeableTuitionMonths', app.includes("reason: 'legacy-render-debt-list'") && !app.includes("// [BƯỚC 2] Normalize paidUntil để tránh sai so sánh \"2025-1\""));
check('studentsRenderer ignores stale isOwed false and uses canonical months', renderer.includes('legacy isOwed/owedMonths may be stale') && renderer.includes("reason: 'studentsRenderer.debt-list'") && renderer.includes('_fallbackChargeableTuitionMonths'));
check('studentsRenderer debt rows are not hidden by Active new/returning filter', renderer.includes('let activePassFilter = sharedPassFilter') && renderer.includes('const debtPassFilter = sharedPassFilter') && !renderer.includes('const debtPassFilter = activePassFilter'));
check('studentsRenderer debt branch filter uses canonical branch aliases', renderer.includes('function _branchMatchesFilter') && renderer.includes('resolver.queryValues') && renderer.includes('!_branchMatchesFilter(safeBranch, selBranch)'));
check('legacy render debt branch filter uses canonical branch aliases', app.includes('const _branchMatchesFilter = (profileBranch, selectedBranch)') && app.includes("if(!isSingleBranch && !_branchMatchesFilter(safeBranch, selBranch)) return;"));
check('studentsRenderer fallback normalizes paidUntil/paidMonths/skippedMonths', renderer.includes('function _fallbackChargeableTuitionMonths') && renderer.includes('const skipped = _monthList(p.skippedMonths)') && renderer.includes('const rawPaidMonths = _monthList(p.paidMonths)') && renderer.includes('paidMonths = paidUntil ? rawPaidMonths.filter'));
check('pagination fallback summary uses canonical months', renderer.includes("reason: 'studentsRenderer.page-summary'") && !renderer.includes('if (item.isOwed !== undefined)'));
check('bulk Zalo debt list uses canonical months', students.includes("reason: 'bulk-zalo-debt'"));
check('debt debug exposes normalized paid fields, filters and hidden reasons', students.includes('normalizedPaidUntil:') && students.includes('normalizedSelectedMonth:') && students.includes('hiddenReasons:') && students.includes('shouldAppearInDebtBeforeRender:'));
check('debugDebtCoverage uses chargeable months instead of raw paidUntil string compare', app.includes("reason: 'debugDebtCoverage'") && !app.includes('if (!paidUntil || paidUntil < selMonth) debtCount++'));

// Dynamic contract uses the actual utils/format.js parser.
const formatModule = await import(pathToFileURL(path.join(root, 'js/utils/format.js')).href + '?v=' + Date.now());
const normalizeYYYYMM = formatModule.normalizeYYYYMM;
const addMonthsToYYYYMM = formatModule.addMonthsToYYYYMM;
function chargeable(p, selected){ const sel=normalizeYYYYMM(selected); if(!sel||p.feeExempt===true) return []; const skipped=Array.isArray(p.skippedMonths)?p.skippedMonths.map(normalizeYYYYMM).filter(Boolean):[]; const rawPaidMonths=Array.isArray(p.paidMonths)?p.paidMonths.map(normalizeYYYYMM).filter(Boolean):[]; const pu=normalizeYYYYMM(p.paidUntil||''); const paidMonths=pu?rawPaidMonths.filter(m=>m<=pu):rawPaidMonths; let cur=pu?addMonthsToYYYYMM(pu,1):(normalizeYYYYMM(p.createdAt||sel)||sel); const out=[]; let guard=0; while(cur&&cur<=sel&&guard<36){ if(!skipped.includes(cur)&&!paidMonths.includes(cur)) out.push(cur); cur=addMonthsToYYYYMM(cur,1); guard++; } if(p.isOwed===true&&Array.isArray(p.owedMonths)){ p.owedMonths.map(normalizeYYYYMM).filter(Boolean).forEach(m=>{ if(m<=sel&&!skipped.includes(m)&&!paidMonths.includes(m)&&!out.includes(m)) out.push(m); }); out.sort(); } return out; }
check('Dynamic: paidUntil 05/2026 owes 2026-06', JSON.stringify(chargeable({paidUntil:'05/2026'}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil T5/2026 owes 2026-06', JSON.stringify(chargeable({paidUntil:'T5/2026'}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil Tháng 5/2026 owes 2026-06', JSON.stringify(chargeable({paidUntil:'Tháng 5/2026'}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil Tháng năm 2026 owes June only', JSON.stringify(chargeable({paidUntil:'Tháng năm 2026'}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil Tháng Năm năm 2026 owes June only', JSON.stringify(chargeable({paidUntil:'Tháng Năm năm 2026'}, 'Tháng 6 năm 2026')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil thang nam 2026 normalizes to 2026-05', normalizeYYYYMM('thang nam 2026') === '2026-05');
check('Dynamic: numeric month variants normalize to the same month 2026-05', ['05/2026','5/2026','Tháng 5/2026','Tháng 5 2026','Tháng 5 - 2026','T5/2026'].every(v => normalizeYYYYMM(v) === '2026-05'));
check('Dynamic: paidUntil Tháng tư 2026 owes May and June', JSON.stringify(chargeable({paidUntil:'Tháng tư 2026'}, '2026-06')) === JSON.stringify(['2026-05','2026-06']));
check('Dynamic: paidUntil Tháng Tư năm 2026 owes 2 months for June', JSON.stringify(chargeable({paidUntil:'Tháng Tư năm 2026'}, 'Tháng 6 năm 2026')) === JSON.stringify(['2026-05','2026-06']));
check('Dynamic: paidUntil thang muoi mot 2026 normalizes to 2026-11', normalizeYYYYMM('thang muoi mot 2026') === '2026-11');
check('Dynamic: stale isOwed false cannot hide June debt', JSON.stringify(chargeable({paidUntil:'2026-05', isOwed:false, owedMonths:[]}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: paidUntil April with stale paidMonths June still owes May and June', JSON.stringify(chargeable({paidUntil:'Tháng tư 2026', paidMonths:['2026-06']}, '2026-06')) === JSON.stringify(['2026-05','2026-06']));
check('Dynamic: paidUntil May with stale future paidMonths June still owes June', JSON.stringify(chargeable({paidUntil:'2026-05', paidMonths:['2026-06']}, '2026-06')) === JSON.stringify(['2026-06']));
check('Dynamic: skipped month suppresses June debt', chargeable({paidUntil:'2026-05', skippedMonths:['06/2026']}, '2026-06').length === 0);
check('Dynamic: legacy isOwed true may add older owed month only as extra evidence', JSON.stringify(chargeable({paidUntil:'2026-05', isOwed:true, owedMonths:['04/2026']}, '2026-06')) === JSON.stringify(['2026-04','2026-06']));
check('Report debt export uses canonical chargeable months, not raw paidUntil comparison', reports.includes("reason: 'excel-report-debt-sheet'") && reports.includes('formatMonthCompact(owedMonths.join'));

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B11 checks passed.\n');
