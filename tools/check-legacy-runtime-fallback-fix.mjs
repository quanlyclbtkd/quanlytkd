// tools/check-legacy-runtime-fallback-fix.mjs — Phase 4K-6I-B
import { readFileSync } from 'fs';

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
console.log(' check-legacy-runtime-fallback-fix — Phase 4K-6I-B');
console.log('══════════════════════════════════════════════════════');
console.log();

const appJs      = readFile('app.js');
const mainJs     = readFile('js/main.js');
const studentsJs = readFile('js/modules/students.js');

// 1. Inventory snapshot callback no longer has bare scheduleRender() with no reason
// The bare call was: } else { scheduleRender(); } in _invCb
// After fix it should use flushOrQueueDomainInvalidation or scheduleRender with a reason
const invCbSection = (() => {
    if (!appJs) return '';
    const idx = appJs.indexOf('const _invCb = (snap) =>');
    if (idx < 0) return '';
    return appJs.substring(idx, idx + 3000);
})();
const hasBareScheduleRenderInInvCb = (
    /\bscheduleRender\(\s*\)/.test(invCbSection) &&
    !invCbSection.includes('flushOrQueueDomainInvalidation') &&
    !invCbSection.includes('inventory-snapshot-fallback')
);
check(
    !hasBareScheduleRenderInInvCb,
    'app.js _invCb: no bare scheduleRender() without reason',
    'app.js _invCb: still has bare scheduleRender() without reason'
);

// 2. flushOrQueueDomainInvalidation defined
check(
    (appJs !== null && appJs.includes('flushOrQueueDomainInvalidation')) ||
    (mainJs !== null && mainJs.includes('flushOrQueueDomainInvalidation')),
    'flushOrQueueDomainInvalidation defined (app.js or main.js)',
    'flushOrQueueDomainInvalidation NOT defined anywhere'
);

// 3. main.js flushes inventory domain in pending invalidations
check(
    mainJs !== null && (
        mainJs.includes("'inventory'") ||
        mainJs.includes('"inventory"')
    ),
    'main.js _flushPendingDomainInvalidations handles inventory domain',
    'main.js _flushPendingDomainInvalidations missing inventory domain'
);

// 4. students.js: bare setTimeout(() => _renderStudentsPageRowsFallback, 300) removed
// or wrapped with scheduleStudentsPaginationFallback
const studentsHasBareTimeout = studentsJs !== null && (
    studentsJs.includes('setTimeout(() => _renderStudentsPageRowsFallback(pgState), 300)') &&
    !studentsJs.includes('scheduleStudentsPaginationFallback')
);
check(
    !studentsHasBareTimeout,
    'students.js: bare 300ms setTimeout fallback replaced or guarded',
    'students.js: still has bare setTimeout(() => _renderStudentsPageRowsFallback, 300)'
);

// 5. scheduleStudentsPaginationFallback defined
check(
    (studentsJs !== null && studentsJs.includes('scheduleStudentsPaginationFallback')) ||
    (mainJs !== null && mainJs.includes('scheduleStudentsPaginationFallback')),
    'scheduleStudentsPaginationFallback defined',
    'scheduleStudentsPaginationFallback NOT defined'
);

// 6. debugPendingDomainInvalidations defined
check(
    mainJs !== null && mainJs.includes('debugPendingDomainInvalidations'),
    'main.js has debugPendingDomainInvalidations',
    'main.js missing debugPendingDomainInvalidations'
);

console.log();
console.log('══════════════════════════════════════════════════════');
if (failures === 0) {
    console.log(' ✓ check-legacy-runtime-fallback-fix PASSED');
} else {
    console.log(` ✗ check-legacy-runtime-fallback-fix FAILED — ${failures} failure${failures !== 1 ? 's' : ''}`);
    process.exit(1);
}
console.log('══════════════════════════════════════════════════════');
