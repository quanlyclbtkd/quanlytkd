import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {}, console });
vm.runInContext(fs.readFileSync('js/core/tuitionDebtCanonical.js', 'utf8'), context);
const calc = context.window.TuitionDebtCanonical.computeProfileDebt;
const p = { status: 'active', admissionDate: '2020-01-01',
    skippedMonths: ['2020-02'], paidMonths: ['2020-03'] };
const debt = calc(p, '2026-02', { name: 'Student 1' });
assert.equal(debt.chargeableMonths.length, 72); // 74 months, one skipped and one paid
assert.ok(debt.chargeableMonths.includes('2026-02'));
assert.ok(!debt.chargeableMonths.includes('2020-02'));
assert.ok(!debt.warnings.includes('month-loop-guard-hit'));
assert.equal(calc({ ...p, status: 'quit' }, '2026-02').chargeableMonths.length, 0);
assert.equal(calc({ ...p, feeExempt: true }, '2026-02').chargeableMonths.length, 0);
assert.throws(() => calc({ status: 'active', admissionDate: '2000-01-01' }, '2099-12'), /không hợp lệ|80 năm/);
console.log('PASS canonical debt: 74-month span, skip, paid, quit, exempt, bounded error');
