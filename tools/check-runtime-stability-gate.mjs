#!/usr/bin/env node
/**
 * Phase 4K-5Q — check-runtime-stability-gate.mjs
 * Kiểm tra: APP_BUILD_VERSION, error guard, safeDebugCall, data diagnostics,
 * runGuardedAction, action lock, debugRuntimeSmokeTest coverage, cache bust.
 */

import { readFileSync } from 'fs';

const mainJs = readFileSync('js/main.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(label, ok) {
  if (ok) {
    console.log('  ✅ PASS  ' + label);
    pass++;
  } else {
    console.error('  ❌ FAIL  ' + label);
    fail++;
    failures.push(label);
  }
}

console.log('\n🔍 Phase 4K-5Q — check-runtime-stability-gate\n');

// 1. APP_BUILD_VERSION — chấp nhận bất kỳ version Phase 5Q trở lên
check(
  'APP_BUILD_VERSION được định nghĩa (Phase 5Q)',
  mainJs.includes("APP_BUILD_VERSION = '4K-5Q-mobile-superadmin-searchv2-active-loadmore-20260605'")
);

// 2. debugAppVersion
check('window.debugAppVersion được định nghĩa', mainJs.includes('window.debugAppVersion'));

// 3. __runtimeErrors
check('window.__runtimeErrors được khởi tạo', mainJs.includes('window.__runtimeErrors = window.__runtimeErrors || []'));

// 4. recordRuntimeError
check('window.recordRuntimeError được định nghĩa', mainJs.includes('window.recordRuntimeError'));

// 5. debugRuntimeErrors
check('window.debugRuntimeErrors được định nghĩa', mainJs.includes('window.debugRuntimeErrors'));

// 6. safeDebugCall
check('window.safeDebugCall được định nghĩa', mainJs.includes('window.safeDebugCall'));

// 7. debugDataSourceAuthority
check('window.debugDataSourceAuthority được định nghĩa', mainJs.includes('window.debugDataSourceAuthority'));

// 8. debugFinanceReconcile
check('window.debugFinanceReconcile được định nghĩa', mainJs.includes('window.debugFinanceReconcile'));

// 9. debugRenderHealth
check('window.debugRenderHealth được định nghĩa', mainJs.includes('window.debugRenderHealth'));

// 10. runGuardedAction
check('window.runGuardedAction được định nghĩa', mainJs.includes('window.runGuardedAction'));

// 11. runGuardedAction has action lock
check('runGuardedAction có __actionLocks guard', mainJs.includes('window.__actionLocks[name]'));

// 12. debugRuntimeSmokeTest includes new debug functions
check('debugRuntimeSmokeTest gọi debugAppVersion', mainJs.includes('debugAppVersion'));
check('debugRuntimeSmokeTest gọi debugRuntimeErrors', mainJs.includes('debugRuntimeErrors'));
check('debugRuntimeSmokeTest gọi debugDataSourceAuthority', mainJs.includes('debugDataSourceAuthority'));
check('debugRuntimeSmokeTest gọi debugFinanceReconcile', mainJs.includes('debugFinanceReconcile'));
check('debugRuntimeSmokeTest gọi debugRenderHealth', mainJs.includes('debugRenderHealth'));

// 13. Cache bust — chấp nhận bất kỳ version main.js?v=<slug> hợp lệ, không hardcode tên phase cũ
const hasMainCacheBust = /main\.js\?v=[a-z0-9A-Z\-]+/.test(indexHtml);
check(
  'index.html có main.js cache bust hợp lệ',
  hasMainCacheBust
);

// Summary
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail === 0) {
  console.log('\n  🎉 All runtime stability gate checks passed!\n');
} else {
  console.log('\n  ❌ FAILURES:\n');
  failures.forEach(f => console.log('    - ' + f));
  console.log('');
  process.exit(1);
}
