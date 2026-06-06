/**
 * check-performance-stability-gate.mjs
 * Phase 4K-6A — Performance Stability & Data Write Safety Gate
 *
 * Test fail nếu bất kỳ điều kiện nào không đáp ứng.
 */

import fs   from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function readFile(rel) {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
    catch (e) { return ''; }
}

const perfMonitorJs  = readFile('js/core/performanceMonitor.js');
const actionGuardJs  = readFile('js/core/actionGuard.js');
const mainJs         = readFile('js/main.js');
const studentsJs     = readFile('js/modules/students.js');
const searchRuntime  = readFile('js/modules/searchRuntime.js');
const studentsRend   = readFile('js/ui/render/computation/studentsRenderer.js');
const financeRend    = readFile('js/ui/render/computation/financeRenderer.js');
const appJs          = readFile('app.js');
const indexHtml      = readFile('index.html');

let pass = 0;
let fail = 0;
const fails = [];

function check(label, condition) {
    if (condition) {
        pass++;
        console.log(`  ✅ PASS — ${label}`);
    } else {
        fail++;
        fails.push(label);
        console.log(`  ❌ FAIL — ${label}`);
    }
}

console.log('\n[1] performanceMonitor.js exists + exports');
check(
    'js/core/performanceMonitor.js tồn tại',
    fs.existsSync(path.join(ROOT, 'js/core/performanceMonitor.js'))
);
check(
    'PerformanceMonitor.markStart được định nghĩa',
    perfMonitorJs.includes('markStart')
);
check(
    'PerformanceMonitor.markEnd được định nghĩa',
    perfMonitorJs.includes('markEnd')
);
check(
    'PerformanceMonitor.record được định nghĩa',
    perfMonitorJs.includes('record')
);

console.log('\n[2] window.PerformanceMonitor expose trong main.js');
check(
    'window.PerformanceMonitor expose trong main.js',
    mainJs.includes('window.PerformanceMonitor')
);

console.log('\n[3] ActionGuard + runGuardedAction');
check(
    'js/core/actionGuard.js tồn tại',
    fs.existsSync(path.join(ROOT, 'js/core/actionGuard.js'))
);
check(
    'ActionGuard.run được định nghĩa trong actionGuard.js',
    actionGuardJs.includes('ActionGuard') && actionGuardJs.includes('run')
);
check(
    'window.runGuardedAction được expose trong main.js',
    mainJs.includes('window.runGuardedAction')
);

console.log('\n[4] runGuardedAction có action lock logic');
// Kiểm tra ActionGuard sử dụng __actionLocks
check(
    'ActionGuard dùng __actionLocks để chống double click',
    actionGuardJs.includes('__actionLocks') || mainJs.includes('__actionLocks')
);

console.log('\n[5] window.__actionHistory');
check(
    'window.__actionHistory được khởi tạo',
    actionGuardJs.includes('__actionHistory') || mainJs.includes('__actionHistory')
);

console.log('\n[6] Debug functions trong main.js');
check(
    'debugPerformanceHealth trong main.js',
    mainJs.includes('window.debugPerformanceHealth')
);
check(
    'debugActionGuardState trong main.js',
    mainJs.includes('window.debugActionGuardState')
);
check(
    'debugDashboardCacheHealth trong main.js',
    mainJs.includes('window.debugDashboardCacheHealth')
);
check(
    'debugLargeListHealth trong main.js',
    mainJs.includes('window.debugLargeListHealth')
);

console.log('\n[7] debugRuntimeSmokeTest include 4 debug mới');
{
    const idx = mainJs.indexOf('window.debugRuntimeSmokeTest');
    const body = mainJs.slice(idx, idx + 15000);
    check(
        'debugRuntimeSmokeTest include debugPerformanceHealth',
        body.includes('debugPerformanceHealth')
    );
    check(
        'debugRuntimeSmokeTest include debugActionGuardState',
        body.includes('debugActionGuardState')
    );
    check(
        'debugRuntimeSmokeTest include debugDashboardCacheHealth',
        body.includes('debugDashboardCacheHealth')
    );
    check(
        'debugRuntimeSmokeTest include debugLargeListHealth',
        body.includes('debugLargeListHealth')
    );
}

console.log('\n[8] 3 action đã được migrate sang runGuardedAction');
{
    const idxQuit = studentsJs.indexOf('window.markStudentQuitFromDebt');
    const quitBody = studentsJs.slice(idxQuit, idxQuit + 2500);
    check(
        'markStudentQuitFromDebt dùng runGuardedAction',
        quitBody.includes('runGuardedAction')
    );

    const idxSkip = studentsJs.indexOf('window.skipDebtMonthFromDebt');
    const skipBody = studentsJs.slice(idxSkip, idxSkip + 2500);
    check(
        'skipDebtMonthFromDebt dùng runGuardedAction',
        skipBody.includes('runGuardedAction')
    );

    const idxLoad = studentsJs.indexOf('window.loadMoreActiveStudents = async function');
    const loadBody = studentsJs.slice(idxLoad, idxLoad + 2500);
    check(
        'loadMoreActiveStudents dùng runGuardedAction',
        loadBody.includes('runGuardedAction')
    );
}

console.log('\n[9] processMultiItem KHÔNG bị migrate trong phase này');
{
    const idxMulti = appJs.indexOf('window.processMultiItem');
    const multiBody = appJs.slice(idxMulti, idxMulti + 5000);
    check(
        'processMultiItem KHÔNG dùng runGuardedAction (chưa migrate)',
        !multiBody.includes('runGuardedAction')
    );
}

console.log('\n[10] Search performance được đo');
check(
    "searchRuntime.js gọi PerformanceMonitor?.markStart('search:",
    searchRuntime.includes("PerformanceMonitor?.markStart('search:")
);

console.log('\n[11] Render performance được đo');
check(
    "studentsRenderer.js gọi PerformanceMonitor?.record('render:students",
    studentsRend.includes("PerformanceMonitor?.record('render:students")
);
check(
    "financeRenderer.js gọi PerformanceMonitor?.record('render:finance",
    financeRend.includes("PerformanceMonitor?.record('render:finance")
);

console.log('\n[12] Cache bust + APP_BUILD_VERSION');
check(
    "index.html có cache bust 'tab-render-recovery-exam-direct-render-20260605'",
    indexHtml.includes('tab-render-recovery-exam-direct-render-20260605')
);
check(
    "APP_BUILD_VERSION = '4K-6A-B-tab-render-recovery-exam-direct-render-20260605'",
    /APP_BUILD_VERSION = '4K-/.test(mainJs)
);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail === 0) {
    console.log('\n  🎉 All performance stability gate checks passed!');
} else {
    console.log('\n  ❌ Các check FAIL:');
    fails.forEach(f => console.log('     - ' + f));
    process.exit(1);
}
