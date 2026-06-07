// tools/check-superadmin-quota-guard.mjs — Phase 4K-6I-B
import { readFileSync, existsSync } from 'fs';

let passes = 0, failures = 0;
function check(cond, pass, fail) {
    if (cond) { console.log('  ✓ PASS:', pass); passes++; }
    else       { console.log('  ✗ FAIL:', fail); failures++; }
}
function readFile(p) {
    const path = new URL('../' + p, import.meta.url).pathname;
    try { return readFileSync(path, 'utf8'); } catch { return null; }
}

console.log('══════════════════════════════════════════════════════');
console.log(' check-superadmin-quota-guard — Phase 4K-6I-B');
console.log('══════════════════════════════════════════════════════');
console.log();

const saGuard   = readFile('js/core/superAdminQuotaGuard.js');
const saModule  = readFile('js/modules/superadmin.js');
const mainJs    = readFile('js/main.js');
const indexHtml = readFile('index.html');

// 1. File exists
check(saGuard !== null, 'js/core/superAdminQuotaGuard.js exists', 'js/core/superAdminQuotaGuard.js MISSING');

// 2. window.SuperAdminQuotaGuard exposed
check(
    mainJs !== null && mainJs.includes('window.SuperAdminQuotaGuard'),
    'main.js exposes window.SuperAdminQuotaGuard',
    'main.js does NOT expose window.SuperAdminQuotaGuard'
);

// 3. debugSuperAdminQuotaGuard defined
check(
    mainJs !== null && mainJs.includes('debugSuperAdminQuotaGuard'),
    'main.js has window.debugSuperAdminQuotaGuard',
    'main.js missing window.debugSuperAdminQuotaGuard'
);

// 4. debugSuperAdminLoadState defined
check(
    mainJs !== null && mainJs.includes('debugSuperAdminLoadState') ||
    (saModule !== null && saModule.includes('debugSuperAdminLoadState')),
    'debugSuperAdminLoadState defined',
    'debugSuperAdminLoadState NOT defined'
);

// 5. Single-flight / cooldown in loadSuperAdminData
check(
    saModule !== null && (
        saModule.includes('_saLoadPromise') ||
        saModule.includes('SA_LOAD_COOLDOWN') ||
        saModule.includes('single-flight') ||
        saModule.includes('singleFlight')
    ),
    'loadSuperAdminData has single-flight/cooldown guard',
    'loadSuperAdminData missing single-flight/cooldown guard'
);

// 6. main.js HOTFIX retry has __saDashboardLoadInFlight guard
check(
    mainJs !== null && mainJs.includes('__saDashboardLoadInFlight'),
    'main.js HOTFIX retry has __saDashboardLoadInFlight guard',
    'main.js HOTFIX retry missing __saDashboardLoadInFlight guard'
);

// 7. No bare Promise.all with 4 countDocs for each club (aggregation storm)
const hasPromiseAllAgg = saModule !== null && (
    /Promise\.all\(\s*\[[\s\S]{0,200}countDocs[\s\S]{0,200}countDocs[\s\S]{0,200}countDocs[\s\S]{0,200}countDocs/.test(saModule)
);
check(
    !hasPromiseAllAgg,
    'superadmin.js: no Promise.all with 4 countDocs aggregation storm',
    'superadmin.js: STILL has Promise.all([countDocs x4]) aggregation storm'
);

// 8. countDocs not called directly in main render loop for all clubs
// Check that the old pattern "if (activeCount === undefined)" -> Promise.all countDocs is gone
const hasDirectCountInRenderLoop = saModule !== null && (
    saModule.includes('if (activeCount === undefined)') &&
    saModule.includes('await Promise.all([')
);
check(
    !hasDirectCountInRenderLoop,
    'superadmin.js: countDocs not called directly in render loop for all clubs',
    'superadmin.js: countDocs still called directly in render loop (old pattern)'
);

// 9. Circuit breaker for resource-exhausted/quota/429
check(
    saGuard !== null && (
        saGuard.includes('resource-exhausted') &&
        saGuard.includes('quota') &&
        saGuard.includes('429')
    ),
    'superAdminQuotaGuard.js has circuit breaker for quota errors',
    'superAdminQuotaGuard.js missing circuit breaker patterns'
);

// 10. No updateDoc with null/undefined cached counts
// The guard: only write if Number.isFinite
check(
    saModule !== null && (
        saModule.includes('Number.isFinite') ||
        saModule.includes('isFinite(') ||
        !saModule.includes('cachedActiveCount: activeCount,')
    ),
    'superadmin.js: cached counts write guarded (no null/undefined writes)',
    'superadmin.js: may write null/undefined to cached counts'
);

// 11. Background refresh queue with concurrency control
check(
    saModule !== null && (
        saModule.includes('_saCountRefreshQueue') ||
        saModule.includes('saCountRefreshQueue') ||
        saModule.includes('queueSuperAdminCountRefresh')
    ),
    'superadmin.js has background refresh queue',
    'superadmin.js missing background refresh queue'
);

// 12. UI fallback "--" for null count
check(
    saModule !== null && (
        saModule.includes('"--"') ||
        saModule.includes("'--'") ||
        saModule.includes('Đang cập nhật')
    ),
    'superadmin.js has UI fallback "--" for null counts',
    'superadmin.js missing UI fallback "--" for null counts'
);

// 13. Cache bust updated
check(
    indexHtml !== null && (
        indexHtml.includes('4K-6I-B') ||
        indexHtml.includes('superadmin-quota') ||
        indexHtml.includes('runtime-fallback-fix')
    ),
    'index.html cache bust has Phase 4K-6I-B',
    'index.html cache bust NOT updated to Phase 4K-6I-B'
);

// 14. APP_BUILD_VERSION updated
check(
    mainJs !== null && (
        mainJs.includes('4K-6I-B') ||
        mainJs.includes('superadmin-quota-runtime-fallback-fix')
    ),
    'main.js APP_BUILD_VERSION has 4K-6I-B',
    'main.js APP_BUILD_VERSION NOT updated to 4K-6I-B'
);

// 15. import SuperAdminQuotaGuard in main.js
check(
    mainJs !== null && mainJs.includes('SuperAdminQuotaGuard'),
    'main.js imports/references SuperAdminQuotaGuard',
    'main.js does not reference SuperAdminQuotaGuard'
);

console.log();
console.log('══════════════════════════════════════════════════════');
if (failures === 0) {
    console.log(' ✓ check-superadmin-quota-guard PASSED');
} else {
    console.log(` ✗ check-superadmin-quota-guard FAILED — ${failures} failure${failures !== 1 ? 's' : ''}`);
    process.exit(1);
}
console.log('══════════════════════════════════════════════════════');
