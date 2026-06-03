/**
 * tools/check-runtime-smoke-test.mjs — Phase 4K-4B
 *
 * Kiểm tra static: đảm bảo window.debugRuntimeSmokeTest tồn tại,
 * gọi đủ 7 sub-debug functions, có safeCall/catch, return summary/detail,
 * và gọi console.table.
 *
 * Chạy: npm run check:runtime-smoke-test
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    const abs = resolve(root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
}

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';

let failures = 0;

function check(label, condition, hint) {
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-4B — debugRuntimeSmokeTest Check\n');

const mainJs = readFile('js/main.js');

check('mainJs readable', !!mainJs, 'Không tìm thấy js/main.js');

if (!mainJs) {
    console.error('\n❌ Cannot continue — js/main.js missing\n');
    process.exit(1);
}

// ── 1. Hàm tồn tại ────────────────────────────────────────────────────────
check(
    'main.js có window.debugRuntimeSmokeTest',
    mainJs.includes('window.debugRuntimeSmokeTest'),
    'Thêm window.debugRuntimeSmokeTest vào js/main.js'
);

// ── 2–8. Gọi đủ 7 sub-debug functions ─────────────────────────────────────
const requiredRefs = [
    'debugExamFeeSetting',
    'debugTuitionActions',
    'debugAdmissionUniformSize',
    'debugSearchPerformance',
    'debugDashboardHistory',
    'debugStudentPagination',
    'debugProfileModalClose',
];

for (const fn of requiredRefs) {
    check(
        `debugRuntimeSmokeTest references ${fn}`,
        mainJs.includes(fn),
        `Thêm safeCall('${fn}', window.${fn}) vào window.debugRuntimeSmokeTest`
    );
}

// ── 9. Có safeCall / catch để không crash ────────────────────────────────
check(
    'debugRuntimeSmokeTest có safeCall (crash-safe)',
    mainJs.includes('safeCall') && mainJs.includes('catch'),
    'Bọc từng debug call trong try/catch hoặc hàm safeCall'
);

// ── 10. Return summary/detail ─────────────────────────────────────────────
check(
    'debugRuntimeSmokeTest return { summary, detail }',
    mainJs.includes('summary:') && mainJs.includes('detail:'),
    'Hàm phải return { summary: ..., detail: ... }'
);

// ── 11. console.table summary ─────────────────────────────────────────────
check(
    'debugRuntimeSmokeTest gọi console.table(summary)',
    mainJs.includes('console.table(summary)'),
    'Thêm console.table(summary) để xuất kết quả ra Console'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 2 + requiredRefs.length + 3; // 11 checks
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
