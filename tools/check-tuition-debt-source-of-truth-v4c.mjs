#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd());
const failures = [];
function check(name, condition) {
  if (condition) console.log(`✅ ${name}`);
  else { console.error(`❌ ${name}`); failures.push(name); }
}
function includes(file, text) {
  return readFileSync(resolve(root, file), 'utf8').includes(text);
}

check('canonical helper file exists', existsSync(resolve(root, 'js/core/tuitionDebtCanonical.js')));
check('index loads tuitionDebtCanonical before app.js', (() => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  return html.indexOf('js/core/tuitionDebtCanonical.js?v=tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1') > -1 &&
    html.indexOf('js/core/tuitionDebtCanonical.js?v=tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1') < html.indexOf('app.js?v=tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1');
})());
check('app.js cache-bust updated to V4C', includes('index.html', 'app.js?v=tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1'));
check('getChargeableTuitionMonths delegates to computeTuitionDebtCanonical', includes('app.js', 'window.computeTuitionDebtCanonical') && includes('app.js', 'canonical.chargeableMonths'));
check('debugDebtTrace exported', includes('js/core/tuitionDebtCanonical.js', 'window.debugDebtTrace = debugDebtTrace'));
check('auditTuitionDebtCanonicalProfiles exported', includes('js/core/tuitionDebtCanonical.js', 'window.auditTuitionDebtCanonicalProfiles'));
check('profile canonical state exported', includes('js/core/tuitionDebtCanonical.js', 'window.deriveProfileCanonicalState'));
check('debugDebtActionState includes canonical trace', includes('js/modules/students.js', 'canonicalDebtTrace'));

const src = readFileSync(resolve(root, 'js/core/tuitionDebtCanonical.js'), 'utf8');
const context = {
  window: {},
  console,
  document: { getElementById: () => null, querySelectorAll: () => ({ length: 0 }), querySelector: () => null },
  CSS: { escape: (s) => String(s).replace(/["\\]/g, '') }
};
context.window.__store = { profiles: {} };
vm.createContext(context);
vm.runInContext(src, context, { filename: 'tuitionDebtCanonical.js' });
const api = context.window.TuitionDebtCanonical;

check('canonical API initialized', !!api && api.version.includes('4K-6V4C'));

const cases = [
  ['Tháng Năm 2026 -> 2026-05', api.normalizeMonth('Tháng Năm 2026') === '2026-05'],
  ['Tháng 5 - 2026 -> 2026-05', api.normalizeMonth('Tháng 5 - 2026') === '2026-05'],
  ['05/2026 -> 2026-05', api.normalizeMonth('05/2026') === '2026-05'],
  ['5/2026 -> 2026-05', api.normalizeMonth('5/2026') === '2026-05'],
  ['Tháng Tư 2026 -> 2026-04', api.normalizeMonth('Tháng Tư 2026') === '2026-04'],
];
for (const [name, condition] of cases) check(name, condition);

const debtJune = api.computeProfileDebt({ name: 'A', paidUntil: 'Tháng Năm 2026', paidMonths: ['2026-06'], tuitionFee: 500000 }, '2026-06', { name: 'A' });
check('paidUntil is authoritative over stale future paidMonths', JSON.stringify(debtJune.chargeableMonths) === JSON.stringify(['2026-06']));
check('future paidMonths after paidUntil are reported', debtJune.ignoredFuturePaidMonthsAfterPaidUntil.includes('2026-06'));
check('debt trace warns about stale paidMonths', debtJune.warnings.includes('paidMonths-after-paidUntil-ignored'));

const debtTwo = api.computeProfileDebt({ name: 'B', paidUntil: 'Tháng tư 2026', paidMonths: ['2026-06'], tuitionFee: 500000 }, '2026-06', { name: 'B' });
check('two-month debt remains complete when stale paidMonths exists', JSON.stringify(debtTwo.chargeableMonths) === JSON.stringify(['2026-05', '2026-06']));

const skipped = api.computeProfileDebt({ name: 'C', paidUntil: '2026-05', skippedMonths: ['Tháng 6 năm 2026'] }, '2026-06', { name: 'C' });
check('skipped month suppresses debt only through canonical skippedMonths', skipped.chargeableMonths.length === 0 && skipped.skippedMonthsCanonical.includes('2026-06'));

const exempt = api.computeProfileDebt({ name: 'D', paidUntil: '2026-05', feeExempt: true }, '2026-06', { name: 'D' });
check('feeExempt suppresses debt with explicit hidden reason', exempt.chargeableMonths.length === 0 && exempt.hiddenReasons.includes('fee-exempt'));

const quit = api.computeProfileDebt({ name: 'E', paidUntil: '2026-05', status: 'Đã nghỉ' }, '2026-06', { name: 'E' });
check('quit profile suppresses debt through statusCanonical', quit.chargeableMonths.length === 0 && quit.profileState.statusCanonical === 'quit');

const audit = api.auditProfiles({
  A: { name: 'A', paidUntil: 'Tháng Năm 2026', paidMonths: ['2026-06'] },
  B: { name: 'B', paidUntil: 'Tháng tư 2026', paidMonths: [] },
  C: { name: 'C', paidUntil: '2026-05', feeExempt: true },
}, '2026-06');
check('audit counts total profiles', audit.totalProfiles === 3);
check('audit detects debt profiles', audit.debtProfiles === 2);
check('audit detects paidMonths after paidUntil', audit.paidMonthsAfterPaidUntil === 1);
check('audit exposes readyForCanonicalCutover flag', Object.prototype.hasOwnProperty.call(audit, 'readyForCanonicalCutover'));

check('no write/migration APIs in canonical helper', !/updateDoc|setDoc|addDoc|deleteDoc|writeBatch|getDocs|onSnapshot/.test(src));

if (failures.length) {
  console.error(`\nTuition Debt Source of Truth V4C: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nTuition Debt Source of Truth V4C: all checks passed');
