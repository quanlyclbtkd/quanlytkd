#!/usr/bin/env node
/**
 * Phase 4K-6C-A — check-financial-flow-guard-readiness.mjs
 * Kiểm tra FinancialFlowMap, contract checker, debug tools,
 * smoke test coverage, và đảm bảo không bọc action lớn bằng runGuardedAction.
 */

import { readFileSync, existsSync } from 'fs';

const mainJs     = readFileSync('js/main.js', 'utf8');
const indexHtml  = readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(label, ok) {
  if (ok) {
    console.log('  ✅ PASS — ' + label);
    pass++;
  } else {
    console.error('  ❌ FAIL — ' + label);
    fail++;
    failures.push(label);
  }
}

console.log('\n🔍 Phase 4K-6C-A — check-financial-flow-guard-readiness\n');

// [1] js/core/financialFlowMap.js tồn tại
check('js/core/financialFlowMap.js tồn tại', existsSync('js/core/financialFlowMap.js'));

// [2] window.FinancialFlowMap được expose trong main.js
check('window.FinancialFlowMap được expose trong main.js', mainJs.includes('window.FinancialFlowMap'));

// [3] validatePaymentComponentsContract được định nghĩa
check('window.validatePaymentComponentsContract được định nghĩa', mainJs.includes('window.validatePaymentComponentsContract'));

// [4] debugPaymentFlowIntegrity được định nghĩa
check('window.debugPaymentFlowIntegrity được định nghĩa', mainJs.includes('window.debugPaymentFlowIntegrity'));

// [5] getFinancialPostWriteRefreshPlan được định nghĩa
check('window.getFinancialPostWriteRefreshPlan được định nghĩa', mainJs.includes('window.getFinancialPostWriteRefreshPlan'));

// [6] debugExamCancelRisk được định nghĩa
check('window.debugExamCancelRisk được định nghĩa', mainJs.includes('window.debugExamCancelRisk'));

// [7] debugInventoryPaidRisk được định nghĩa
check('window.debugInventoryPaidRisk được định nghĩa', mainJs.includes('window.debugInventoryPaidRisk'));

// [8] debugFinancialActionMap được định nghĩa
check('window.debugFinancialActionMap được định nghĩa', mainJs.includes('window.debugFinancialActionMap'));

// [9] debugRuntimeSmokeTest include 4 debug mới
const smokeIdx = mainJs.indexOf('window.debugRuntimeSmokeTest = async');
const smokeBody = smokeIdx >= 0 ? mainJs.slice(smokeIdx, smokeIdx + 25000) : '';
check('debugRuntimeSmokeTest include debugFinancialActionMap',    smokeBody.includes('debugFinancialActionMap'));
check('debugRuntimeSmokeTest include debugPaymentFlowIntegrity',  smokeBody.includes('debugPaymentFlowIntegrity'));
check('debugRuntimeSmokeTest include debugExamCancelRisk',        smokeBody.includes('debugExamCancelRisk'));
check('debugRuntimeSmokeTest include debugInventoryPaidRisk',     smokeBody.includes('debugInventoryPaidRisk'));

// [10-14] Các action KHÔNG bị bọc bằng runGuardedAction (phase này)
// Kiểm tra trong toàn bộ main.js — nếu có runGuardedAction trong body của action thì fail
// Chỉ kiểm tra trong finance modules
const financeJs = (() => {
  try { return readFileSync('js/modules/finance.js', 'utf8'); } catch(e) { return ''; }
})();
const examJs = (() => {
  try { return readFileSync('js/modules/exam.js', 'utf8'); } catch(e) { return ''; }
})();
const inventoryJs = (() => {
  try { return readFileSync('js/modules/inventory.js', 'utf8'); } catch(e) { return ''; }
})();
const appJs = (() => {
  try { return readFileSync('app.js', 'utf8'); } catch(e) { return ''; }
})();
const allSource = [mainJs, financeJs, examJs, inventoryJs, appJs].join('\n');

function actionWrapped(actionName) {
  // Find window.<actionName> = ... and check if runGuardedAction appears in next 3000 chars
  const idx = allSource.indexOf('window.' + actionName + ' = ');
  if (idx < 0) return false;
  const body = allSource.slice(idx, idx + 3000);
  return body.includes('runGuardedAction');
}

check('processMultiItem KHÔNG bị bọc runGuardedAction',   !actionWrapped('processMultiItem'));
check('quickPay KHÔNG bị bọc runGuardedAction',           !actionWrapped('quickPay'));
check('quickCollectExam KHÔNG bị bọc runGuardedAction',   !actionWrapped('quickCollectExam'));
check('cancelExamPayment KHÔNG bị bọc runGuardedAction',  !actionWrapped('cancelExamPayment'));
check('markInvPaid KHÔNG bị bọc runGuardedAction',        !actionWrapped('markInvPaid'));

// [15] Cache bust — flexible (any main.js?v= version accepted)
check(
  "index.html có cache bust phase 4K- (flexible)",
  /main\.js\?v=[a-zA-Z0-9\-]+/.test(indexHtml)
);

// [16] APP_BUILD_VERSION — flexible (any 4K- version accepted)
check(
  "APP_BUILD_VERSION = '4K-...' (flexible)",
  /APP_BUILD_VERSION = '4K-/.test(mainJs)
);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);

if (fail === 0) {
  console.log('\n  🎉 All financial flow guard readiness checks passed!\n');
  process.exit(0);
} else {
  console.log('\n  ❌ FAILURES:');
  failures.forEach(f => console.log('    — ' + f));
  console.log('');
  process.exit(1);
}
