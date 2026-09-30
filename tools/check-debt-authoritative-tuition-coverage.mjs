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

const activeBuilds = ['profile-display-name-safe-edit-20260916-v5u6h8r1', 'student-given-name-priority-20260811-v5u3', 'attendance-excel-documentid-sdk-fix-20260801-v5u2e', 'tuition-command-cutover-20260730-v5u2', 'student-status-command-cutover-tx-delete-fix-20260722-v5u1', 'quit-context-render-loop-guard-20260722-v5s', 'profile-canonical-store-runtime-recovery-20260628-v4d1a', 'profile-canonical-store-20260628-v4d1', 'tuition-debt-source-of-truth-20260628-v4c'];
const appBuildOk = activeBuilds.some(build => index.includes(`app.js?v=${build}`)) && activeBuilds.some(build => index.includes(`main.js?v=${build}`));
const moduleBuildOk = activeBuilds.some(build => main.includes(`modules/students.js?v=${build}`)) && activeBuilds.some(build => renderStudents.includes(`studentsRenderer.js?v=${build}`)) && activeBuilds.some(build => listRefresh.includes(`studentsRenderer.js?v=${build}`));
check('index/main/app cache-busted for current debt phase', appBuildOk && moduleBuildOk);
check('app normalizeYYYYMM supports MM/YYYY, T numeric and Vietnamese month-word formats', app.includes("_monthWordToNumber") && app.includes("Tháng năm 2026") && app.includes("Tháng tư 2026") && app.includes("raw.match(/^(\\d{1,2})[-\\/](20\\d{2})$/)") && app.includes("raw.match(/^(?:T)?(\\d{1,2})[-\\/]?(20\\d{2})$/i)"));
check('utils normalizeYYYYMM mirrors month-word parser', fmt.includes("_monthWordToNumber") && fmt.includes("Tháng năm 2026") && fmt.includes("muoi mot") && fmt.includes("raw.match(/^(\\d{1,2})[-\\/](20\\d{2})$/)"));
check('global normalizeTuitionMonth exposed', app.includes('window.normalizeTuitionMonth = normalizeYYYYMM'));
check('getChargeableTuitionMonths normalizes selectedMonth, paidUntil, paidMonths and skippedMonths', app.includes('const selMonth = normalizeYYYYMM(selectedMonth') && app.includes('skippedMonths.map(function(m) { return normalizeYYYYMM(m); })') && app.includes('rawPaidMonths = Array.isArray(p.paidMonths)') && app.includes('const paidUntil = normalizeYYYYMM'));
check('legacy isOwed is only additive and cannot suppress canonical debt', app.includes('p.isOwed === true && Array.isArray(p.owedMonths)') && app.includes('Only merge legacy owed months when they ADD evidence'));
check('legacy app debt render uses getChargeableTuitionMonths', app.includes("reason: 'legacy-render-debt-list'") && !app.includes("// [BƯỚC 2] Normalize paidUntil để tránh sai so sánh \"2025-1\""));
check('studentsRenderer ignores stale isOwed false and uses canonical months', renderer.includes('legacy isOwed/owedMonths may be stale') && renderer.includes("reason: 'studentsRenderer.debt-list'") && renderer.includes('_fallbackChargeableTuitionMonths'));
check('studentsRenderer debt rows are not hidden by Active new/returning filter', renderer.includes('let activePassFilter = sharedPassFilter') && renderer.includes('const debtPassFilter = sharedPassFilter') && !renderer.includes('const debtPassFilter = activePassFilter'));
check('studentsRenderer keeps ambiguous canonical profiles visible as reconciliation rows', renderer.includes('canonicalDebt.shouldAppearInDebtBeforeRender') && renderer.includes('ambiguousFuturePaidMonths') && renderer.includes('Cần đối soát'));
check('studentsRenderer never falls back ambiguous-only row to selected month payment token', renderer.includes("const owedMonthsStr = owedMonths.join(',');") && !renderer.includes("owedMonths.join(',') || selMonth"));
check('studentsRenderer debt branch filter uses canonical branch aliases', renderer.includes('function _branchMatchesFilter') && renderer.includes('resolver.queryValues') && renderer.includes('!_branchMatchesFilter(safeBranch, selBranch)'));
check('legacy render debt branch filter uses canonical branch aliases', app.includes('const _branchMatchesFilter = (profileBranch, selectedBranch)') && app.includes("if(!isSingleBranch && !_branchMatchesFilter(safeBranch, selBranch)) return;"));
check('studentsRenderer fallback normalizes paidUntil/paidMonths/skippedMonths', renderer.includes('function _fallbackChargeableTuitionMonths') && renderer.includes('const skipped = _monthList(p.skippedMonths)') && renderer.includes('const rawPaidMonths = _monthList(p.paidMonths)') && renderer.includes('paidMonths = paidUntil ? rawPaidMonths.filter'));
check('pagination fallback summary uses canonical months', renderer.includes("reason: 'studentsRenderer.page-summary'") && !renderer.includes('if (item.isOwed !== undefined)'));
check('bulk Zalo debt list uses canonical months', students.includes("reason: 'bulk-zalo-debt'"));
check('debt debug exposes normalized paid fields, filters and hidden reasons', students.includes('normalizedPaidUntil:') && students.includes('normalizedSelectedMonth:') && students.includes('hiddenReasons:') && students.includes('shouldAppearInDebtBeforeRender:'));
check('debugDebtCoverage uses chargeable months instead of raw paidUntil string compare', app.includes("reason: 'debugDebtCoverage'") && !app.includes('if (!paidUntil || paidUntil < selMonth) debtCount++'));

// Dynamic contract MUST execute the actual canonical debt implementation.
// The old local `chargeable()` replica diverged from computeProfileDebt and could
// report a green gate while production silently suppressed stale future months.
globalThis.window = globalThis;
const formatModule = await import(pathToFileURL(path.join(root, 'js/utils/format.js')).href + '?v=' + Date.now());
const normalizeYYYYMM = formatModule.normalizeYYYYMM;
await import(pathToFileURL(path.join(root, 'js/core/tuitionDebtCanonical.js')).href + '?d1c3b=' + Date.now());
const debtApi = globalThis.TuitionDebtCanonical;
function debtState(p, selected, transactions = []) {
  const profile = { name: p.name || 'Gate Student', ...p };
  return debtApi.computeProfileDebt(profile, selected, { name: profile.name, transactions });
}
function chargeable(p, selected, transactions = []) { return debtState(p, selected, transactions).chargeableMonths; }
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
check('Dynamic: paidUntil April + stale June keeps May definite and June ambiguous/visible', (() => { const d=debtState({paidUntil:'Tháng tư 2026', paidMonths:['2026-06']}, '2026-06'); return JSON.stringify(d.chargeableMonths)===JSON.stringify(['2026-05']) && d.ambiguousFuturePaidMonths.includes('2026-06') && d.shouldAppearInDebtBeforeRender===true; })());
check('Dynamic: paidUntil May + stale June never silently disappears and requires reconciliation', (() => { const d=debtState({paidUntil:'2026-05', paidMonths:['2026-06']}, '2026-06'); return d.chargeableMonths.length===0 && d.ambiguousFuturePaidMonths.includes('2026-06') && d.shouldAppearInDebtBeforeRender===true && d.warnings.includes('future-paid-month-requires-reconciliation'); })());
check('Dynamic: skipped month suppresses June debt', chargeable({paidUntil:'2026-05', skippedMonths:['06/2026']}, '2026-06').length === 0);
check('Dynamic: legacy isOwed true may add older owed month only as extra evidence', JSON.stringify(chargeable({paidUntil:'2026-05', isOwed:true, owedMonths:['04/2026']}, '2026-06')) === JSON.stringify(['2026-04','2026-06']));
check('Report debt export uses canonical chargeable months, not raw paidUntil comparison', reports.includes("reason: 'excel-report-debt-sheet'") && reports.includes('formatMonthCompact(owedMonths.join'));


// D1C3B CROSS-INVARIANT T1-T10 — one actual canonical gate for visibility,
// settlement idempotency, transaction evidence, skipped state and reversal.
const tuitionTx = (name, months, extra = {}) => ({ studentName:name, type:'Học phí', amount:500000, packageMonths:months, status:'success', ...extra });
const t1 = debtState({name:'T1',paidUntil:'2026-05',tuitionFee:500000},'2026-06');
check('T1 contiguous boundary => June definite unpaid', JSON.stringify(t1.chargeableMonths)===JSON.stringify(['2026-06']) && t1.ambiguousFuturePaidMonths.length===0);
const t2 = debtState({name:'T2',paidUntil:'2026-05',paidMonths:['2026-06'],tuitionFee:500000},'2026-06');
check('T2 stale future month => visible ambiguous, not definite chargeable', t2.chargeableMonths.length===0 && t2.ambiguousFuturePaidMonths.includes('2026-06') && t2.shouldAppearInDebtBeforeRender===true);
check('T2 settlement guard does not auto-enable recollection of ambiguous explicit paidMonth', debtApi.getTuitionMonthSettlement({name:'T2',paidUntil:'2026-05',paidMonths:['2026-06']},'2026-06',{name:'T2',transactions:[]}).paid===true);
const t3 = debtState({name:'T3',paidUntil:'2026-08',paidMonths:['2026-08','2026-10'],tuitionFee:500000},'2026-10',[tuitionTx('T3',['2026-10'])]);
check('T3 verified legitimate gap => September unpaid, October verified paid', JSON.stringify(t3.chargeableMonths)===JSON.stringify(['2026-09']) && t3.verifiedFuturePaidMonths.includes('2026-10') && t3.ambiguousFuturePaidMonths.length===0);
check('T3 settlement guard prevents double collection of verified October', debtApi.getTuitionMonthSettlement({name:'T3',paidUntil:'2026-08',paidMonths:['2026-08','2026-10']},'2026-10',{name:'T3',transactions:[tuitionTx('T3',['2026-10'])]}).paid===true);
const t4 = debtState({name:'T4',paidUntil:'2026-08',paidMonths:['2026-10'],tuitionFee:500000},'2026-10');
check('T4 gap without tx evidence => September definite + October ambiguous + profile visible', JSON.stringify(t4.chargeableMonths)===JSON.stringify(['2026-09']) && t4.ambiguousFuturePaidMonths.includes('2026-10') && t4.shouldAppearInDebtBeforeRender===true);
const t5 = debtState({name:'T5',paidUntil:'2026-05',skippedMonths:['2026-06'],tuitionFee:500000},'2026-06');
check('T5 skipped month => no debt/reconciliation row', t5.chargeableMonths.length===0 && t5.ambiguousFuturePaidMonths.length===0 && t5.shouldAppearInDebtBeforeRender===false);
const t6 = debtState({name:'T6',paidUntil:'2026-05',feeExempt:true,tuitionFee:500000},'2026-06');
check('T6 feeExempt => hidden explicitly', t6.chargeableMonths.length===0 && t6.hiddenReasons.includes('fee-exempt'));
const t7 = debtState({name:'T7',status:'Đã nghỉ',paidUntil:'2026-05',tuitionFee:500000},'2026-06');
check('T7 quit => no active debt row', t7.chargeableMonths.length===0 && t7.hiddenReasons.includes('profile-is-quit'));
const t8 = debtState({name:'T8',paidUntil:'2026-08',paidMonths:['2026-10'],tuitionFee:500000},'2026-10',[tuitionTx('T8',['2026-10'],{status:'reversed'})]);
check('T8 reversed transaction cannot verify future month', JSON.stringify(t8.chargeableMonths)===JSON.stringify(['2026-09']) && t8.verifiedFuturePaidMonths.length===0 && t8.ambiguousFuturePaidMonths.includes('2026-10'));
const t9Boundary = debtApi.reconcilePaidUntilFromMonthEvidence({paidUntil:'2026-08'}, ['2026-08','2026-10'], {allowRegression:true, removedMonths:['2026-10']});
check('T9 middle-gap reversal preserves contiguous paidUntil boundary', t9Boundary==='2026-08');
const t10a = debtApi.getTuitionMonthSettlement({name:'T10',paidUntil:'2026-08',paidMonths:['2026-10']},'2026-10',{name:'T10',transactions:[tuitionTx('T10',['2026-10'])]});
const t10b = debtApi.getTuitionMonthSettlement({name:'T10',paidUntil:'2026-08',paidMonths:['2026-10']},'2026-10',{name:'T10',transactions:[tuitionTx('T10',['2026-10'])]});
check('T10 same-runtime replay/idempotency settlement decision is stable', t10a.paid===true && t10b.paid===true && t10a.reason===t10b.reason);

const rendererModule = await import(pathToFileURL(path.join(root, 'js/ui/render/computation/studentsRenderer.js')).href + '?d1c3b=' + Date.now());
const ambiguousOnlyHtml = rendererModule.renderDebtRow('Ambiguous Student', {tuitionFee:500000,branch:'CS1'}, {
  unpaidMonthsCount:0, owedMonthsStr:'', ambiguousMonths:['2026-06'], isAdmin:true, selMonth:'2026-06'
});
check('Renderer behavioral: ambiguous-only row says Cần đối soát and exposes no QR/Thu/Zalo collection action',
  ambiguousOnlyHtml.includes('Cần đối soát') && ambiguousOnlyHtml.includes('data-debt-reconciliation="required"') && !ambiguousOnlyHtml.includes('openQuickPayModal') && !ambiguousOnlyHtml.includes('generateMultiMonthPaymentRequest') && !ambiguousOnlyHtml.includes('copyAndOpenZalo'));
const mixedReviewHtml = rendererModule.renderDebtRow('Mixed Student', {tuitionFee:500000,branch:'CS1'}, {
  unpaidMonthsCount:1, owedMonthsStr:'2026-09', ambiguousMonths:['2026-10'], isAdmin:true, selMonth:'2026-10'
});
check('Renderer behavioral: mixed row collects only definite month and blocks ambiguous selected-month skip action',
  mixedReviewHtml.includes('openQuickPayModal') && mixedReviewHtml.includes('2026-09') && mixedReviewHtml.includes('Cần đối soát') && !mixedReviewHtml.includes('skipDebtMonthFromDebt'));

console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B11 checks passed.\n');
