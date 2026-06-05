#!/usr/bin/env node
/**
 * check-exam-auto-select-paid.mjs
 * Phase 4K-5R: Kiểm tra selectPaidStudents dùng canonical ledger
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const appJs  = readFileSync(join(root, 'app.js'), 'utf8');
const mainJs = readFileSync(join(root, 'js/main.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(label, ok) {
  if (ok) { console.log('  ✅ PASS  ' + label); pass++; }
  else { console.error('  ❌ FAIL  ' + label); fail++; failures.push(label); }
}

console.log('\n🔍 Phase 4K-5R — check-exam-auto-select-paid\n');

// Trích phần selectPaidStudents để kiểm tra chi tiết
const spStart = appJs.indexOf('window.selectPaidStudents = ');
const spEnd   = appJs.indexOf('window.toggleAllExam');
const spBlock = spStart >= 0 && spEnd > spStart ? appJs.slice(spStart, spEnd) : '';

// 1. selectPaidStudents gọi buildCanonicalExamPaymentLedger
check(
  'selectPaidStudents gọi buildCanonicalExamPaymentLedger',
  spBlock.includes('buildCanonicalExamPaymentLedger')
);

// 2. selectPaidStudents dùng buildCanonicalExamPaymentLedger TRƯỚC allTransactions (canonical first)
check(
  'selectPaidStudents dùng canonical ledger làm nguồn chính (trước fallback allTransactions)',
  spBlock.includes('buildCanonicalExamPaymentLedger') &&
  (
    !spBlock.includes('allTransactions') ||
    spBlock.indexOf('buildCanonicalExamPaymentLedger') < spBlock.indexOf('allTransactions')
  )
);

// 3. selectPaidStudents xử lý components (trong fallback)
check(
  'selectPaidStudents xử lý components trong fallback',
  spBlock.includes('components')
);

// 4. selectPaidStudents xử lý paymentKind === bundle (trong fallback)
check(
  "selectPaidStudents xử lý paymentKind === 'bundle' trong fallback",
  spBlock.includes('paymentKind')
);

// 5. selectPaidStudents kiểm tra examPaidCancelled
check(
  'selectPaidStudents kiểm tra examPaidCancelled',
  spBlock.includes('examPaidCancelled')
);

// 6. window.isNewlyUpgradedExamStudent được định nghĩa
check(
  'window.isNewlyUpgradedExamStudent được định nghĩa',
  appJs.includes('window.isNewlyUpgradedExamStudent')
);

// 7. selectPaidStudents loại trừ nhóm newly upgraded
check(
  'selectPaidStudents loại trừ isNewlyUpgradedExamStudent',
  spBlock.includes('isNewlyUpgraded') || spBlock.includes('isNewlyUpgradedExamStudent')
);

// 8. window.debugExamAutoSelectPaid được định nghĩa
check(
  'window.debugExamAutoSelectPaid được định nghĩa',
  appJs.includes('window.debugExamAutoSelectPaid')
);

// 9. debugExamAutoSelectPaid có paidButSkippedBecauseNewlyUpgraded
check(
  'debugExamAutoSelectPaid có paidButSkippedBecauseNewlyUpgraded',
  appJs.includes('paidButSkippedBecauseNewlyUpgraded')
);

// 10. debugRuntimeSmokeTest trong main.js include debugExamAutoSelectPaid
check(
  'debugRuntimeSmokeTest trong main.js include debugExamAutoSelectPaid',
  mainJs.includes('debugExamAutoSelectPaid')
);

// 11. isExamStudentPaidCanonical (nếu có) phải dùng buildCanonicalExamPaymentLedger
if (appJs.includes('window.isExamStudentPaidCanonical')) {
  const icpStart = appJs.indexOf('window.isExamStudentPaidCanonical');
  const icpEnd   = appJs.indexOf('\n};', icpStart) + 3;
  const icpBlock = appJs.slice(icpStart, icpEnd > icpStart + 100 ? icpEnd : icpStart + 3000);
  check(
    'isExamStudentPaidCanonical dùng buildCanonicalExamPaymentLedger',
    icpBlock.includes('buildCanonicalExamPaymentLedger')
  );
} else {
  // helper optional — chỉ cần nếu có thì đúng
  check('isExamStudentPaidCanonical không có hoặc dùng đúng ledger', true);
}

// Summary
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail === 0) {
  console.log('\n  🎉 All exam auto select paid checks passed!\n');
} else {
  console.log('\n  ❌ FAILURES:\n');
  failures.forEach(f => console.log('    - ' + f));
  console.log('');
  process.exit(1);
}
