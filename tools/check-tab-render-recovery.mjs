#!/usr/bin/env node
/**
 * Phase 4K-6A-B — check-tab-render-recovery.mjs
 * Kiểm tra: syncStudentStatusLocal không còn gọi scheduleRender,
 * ensureStudentTabRendered, tabs.js gọi đúng, exam.listeners.js fix,
 * debug functions, smokeTest coverage.
 */

import { readFileSync } from 'fs';

const studentsJs     = readFileSync('js/modules/students.js', 'utf8');
const tabsJs         = readFileSync('js/ui/tabs.js', 'utf8');
const examListenersJs = readFileSync('js/listeners/exam.listeners.js', 'utf8');
const mainJs         = readFileSync('js/main.js', 'utf8');

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

console.log('\n🔍 Phase 4K-6A-B — check-tab-render-recovery\n');

// [1] syncStudentStatusLocal không còn gọi scheduleRender
const syncIdx = studentsJs.indexOf('window.syncStudentStatusLocal = function syncStudentStatusLocal');
const syncBody = syncIdx >= 0 ? studentsJs.slice(syncIdx, syncIdx + 4000) : '';
check(
  'syncStudentStatusLocal không còn gọi scheduleRender',
  syncIdx >= 0 && !syncBody.includes('scheduleRender(reason)')
);

// [2] ensureStudentTabRendered được định nghĩa
check(
  'window.ensureStudentTabRendered được định nghĩa',
  studentsJs.includes('window.ensureStudentTabRendered = function')
);

// [3] markStudentQuitFromDebt gọi ensureStudentTabRendered('debt')
const quitIdx = studentsJs.indexOf('window.markStudentQuitFromDebt');
const quitBody = quitIdx >= 0 ? studentsJs.slice(quitIdx, quitIdx + 4000) : '';
check(
  "markStudentQuitFromDebt gọi ensureStudentTabRendered('debt')",
  quitBody.includes("ensureStudentTabRendered('debt'") ||
  quitBody.includes('ensureStudentTabRendered("debt"')
);

// [4] skipDebtMonthFromDebt gọi ensureStudentTabRendered('debt')
const skipIdx = studentsJs.indexOf('window.skipDebtMonthFromDebt');
const skipBody = skipIdx >= 0 ? studentsJs.slice(skipIdx, skipIdx + 4000) : '';
check(
  "skipDebtMonthFromDebt gọi ensureStudentTabRendered('debt')",
  skipBody.includes("ensureStudentTabRendered('debt'") ||
  skipBody.includes('ensureStudentTabRendered("debt"')
);

// [5] tabs.js gọi ensureStudentTabRendered khi tabId là active/debt/quit
const switchIdx = tabsJs.indexOf('export function switchTab');
const switchBody = switchIdx >= 0 ? tabsJs.slice(switchIdx, switchIdx + 3000) : '';
check(
  "tabs.js gọi ensureStudentTabRendered khi tab active/debt/quit",
  switchBody.includes('ensureStudentTabRendered') &&
  (switchBody.includes("'active', 'debt', 'quit'") || switchBody.includes("active.*debt.*quit"))
);

// [6] exam.listeners.js KHÔNG còn gọi invalidateByDomain('exam') trong code (comments OK)
const examListenersCode = examListenersJs.split('\n')
  .filter(line => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
  .join('\n');
check(
  "exam.listeners.js không gọi invalidateByDomain('exam')",
  !examListenersCode.includes("invalidateByDomain('exam'") &&
  !examListenersCode.includes('invalidateByDomain("exam"')
);

// [7] _triggerExamRender gọi trực tiếp renderExamList
const triggerIdx = examListenersJs.indexOf('function _triggerExamRender');
const triggerBody = triggerIdx >= 0 ? examListenersJs.slice(triggerIdx, triggerIdx + 800) : '';
check(
  '_triggerExamRender gọi trực tiếp renderExamList',
  triggerBody.includes('window.renderExamList') &&
  triggerBody.includes('renderExamList()')
);

// [8] debugStudentTabRenderRecovery được định nghĩa
check(
  'window.debugStudentTabRenderRecovery được định nghĩa',
  mainJs.includes('window.debugStudentTabRenderRecovery')
);

// [9] debugExamRenderRecovery được định nghĩa
check(
  'window.debugExamRenderRecovery được định nghĩa',
  mainJs.includes('window.debugExamRenderRecovery')
);

// [10] debugRuntimeSmokeTest include 2 debug này
const smokeIdx = mainJs.indexOf('window.debugRuntimeSmokeTest = async');
const smokeBody = smokeIdx >= 0 ? mainJs.slice(smokeIdx, smokeIdx + 20000) : '';
check(
  'debugRuntimeSmokeTest include debugStudentTabRenderRecovery',
  smokeBody.includes('debugStudentTabRenderRecovery')
);
check(
  'debugRuntimeSmokeTest include debugExamRenderRecovery',
  smokeBody.includes('debugExamRenderRecovery')
);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);

if (fail === 0) {
  console.log('\n  🎉 All tab render recovery checks passed!\n');
  process.exit(0);
} else {
  console.log('\n  ❌ FAILURES:');
  failures.forEach(f => console.log('    — ' + f));
  console.log('');
  process.exit(1);
}
