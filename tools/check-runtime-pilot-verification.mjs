/**
 * check-runtime-pilot-verification.mjs
 * Phase 4K-5K: Kiểm tra runtime pilot verification gates
 *
 * Tests:
 * 1. debugRuntimeSmokeTest gọi tất cả debug functions cần thiết (phase 4K-5K)
 * 2. check:all:critical không còn gọi trùng check:active-render-tdz-order
 * 3. package.json không còn pnpm trong check:all:critical
 * 4. Summary có đủ các keys mới
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;
function fail(msg) { console.error('❌ FAIL:', msg); failures++; }
function ok(msg)   { console.log ('✅ OK:  ', msg); }

const mainJs  = readFileSync(join(root, 'js/main.js'), 'utf8');
const pkgJson = readFileSync(join(root, 'package.json'), 'utf8');
const pkg     = JSON.parse(pkgJson);

// ── 1. debugRuntimeSmokeTest gọi các debug functions mới ─────────────────────
const smokeStart = mainJs.indexOf('window.debugRuntimeSmokeTest = async function');
const smokeEnd   = mainJs.indexOf('\n};', smokeStart);
const smokeBlock = smokeStart >= 0 && smokeEnd > smokeStart
    ? mainJs.slice(smokeStart, smokeEnd + 3)
    : '';

const newDebugFns = [
    'debugActiveLoadMoreAndSort',
    'debugDebtLoadMoreAndFilter',
    'debugDebtCoverage',
    'debugActiveQuitLeak',
    'debugTuitionTableLayout',
    'debugExamExportReadiness',
    'debugExamCanonicalLedger',
];

for (const fn of newDebugFns) {
    if (smokeBlock.includes(fn)) {
        ok(`debugRuntimeSmokeTest gọi ${fn}`);
    } else {
        fail(`debugRuntimeSmokeTest thiếu: ${fn}`);
    }
}

// ── 2. Summary keys ────────────────────────────────────────────────────────────
const newSummaryKeys = [
    'activeLoadMoreAndSortOk',
    'debtLoadMoreAndFilterOk',
    'debtCoverageOk',
    'activeQuitLeakOk',
    'tuitionTableLayoutOk',
    'examExportReadinessOk',
    'examCanonicalLedgerOk',
];

for (const key of newSummaryKeys) {
    if (smokeBlock.includes(key)) {
        ok(`summary có key: ${key}`);
    } else {
        fail(`summary thiếu key: ${key}`);
    }
}

// ── 3. check:all:critical không gọi trùng check:active-render-tdz-order ────────
const criticalScript = pkg.scripts && pkg.scripts['check:all:critical'] || '';

// Count occurrences
const occurrences = (criticalScript.match(/check:active-render-tdz-order/g) || []).length;
if (occurrences === 0) {
    fail('check:all:critical không có check:active-render-tdz-order (phải có đúng 1 lần)');
} else if (occurrences === 1) {
    ok('check:all:critical gọi check:active-render-tdz-order đúng 1 lần (không trùng)');
} else {
    fail(`check:all:critical gọi check:active-render-tdz-order ${occurrences} lần — phải là 1`);
}

// ── 4. check:all:critical không dùng pnpm ────────────────────────────────────
if (criticalScript.includes('pnpm')) {
    fail('check:all:critical còn chứa pnpm — phải dùng npm');
} else {
    ok('check:all:critical không dùng pnpm');
}

// ── 5. check:runtime-pilot-verification có trong check:all:critical ───────────
if (criticalScript.includes('check:runtime-pilot-verification')) {
    ok('check:runtime-pilot-verification có trong check:all:critical');
} else {
    fail('check:runtime-pilot-verification chưa có trong check:all:critical');
}

// ── 6. Script definition tồn tại ─────────────────────────────────────────────
if (pkg.scripts && pkg.scripts['check:runtime-pilot-verification']) {
    ok('Script check:runtime-pilot-verification được định nghĩa trong package.json');
} else {
    fail('package.json thiếu script check:runtime-pilot-verification');
}

// ── 7. Cache bust version đúng ────────────────────────────────────────────────
const html = readFileSync(join(root, 'index.html'), 'utf8');
if (/main\.js\?v=[a-z0-9-]+/i.test(html)) {
    ok('index.html có cache bust version trong main.js (?v=...)');
} else {
    fail('index.html thiếu cache bust version trong main.js (?v=...)');
}

// ── Tổng kết ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failures === 0) {
    console.log('✅ check-runtime-pilot-verification: TẤT CẢ PASS');
} else {
    console.error(`❌ check-runtime-pilot-verification: ${failures} lỗi`);
    process.exit(1);
}
