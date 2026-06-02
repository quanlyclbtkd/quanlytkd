/**
 * tools/check-unsafe-transaction-preview.mjs — Transaction Preview Safety Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra rằng transaction listener bị limit chỉ phục vụ UI preview,
 * KHÔNG dùng cho tính toán dashboard/doanh thu.
 *
 * Checks:
 * 1. warnUnsafeLimit trong paginatedQuery.js hỗ trợ { uiOnly: true }.
 * 2. listenToData gọi warnUnsafeLimit với { uiOnly: true }.
 * 3. _recordWarn có nhánh uiOnly → console.info (không phải console.warn).
 * 4. Message uiOnly nói rõ "UI preview only".
 * 5. Dashboard dùng stats docs (totalRevenue từ _sd/monthStats).
 * 6. Không có dashboard calculation nào dùng allTransactions[] trực tiếp.
 *
 * Chạy: node tools/check-unsafe-transaction-preview.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Transaction Preview Safety Check — Phase 4K-RUNTIME-CLEANUP');
console.log('══════════════════════════════════════════════════════════\n');

const paginatedQueryJs = readFile('js/firebase/paginatedQuery.js');
const appJs            = readFile('app.js');
const mainJs           = readFile('js/main.js');

console.log('▸ Section 1: paginatedQuery.js — warnUnsafeLimit hỗ trợ uiOnly');
if (paginatedQueryJs) {
    check('warnUnsafeLimit signature có options parameter',
        /warnUnsafeLimit\s*\(\s*queryName\s*,\s*reason\s*,\s*options\s*\)/.test(paginatedQueryJs),
        'export function warnUnsafeLimit(queryName, reason, options) { ... }');

    check('_recordWarn signature có options parameter',
        /function _recordWarn\s*\(\s*queryName\s*,\s*reason\s*,\s*options\s*\)/.test(paginatedQueryJs),
        'function _recordWarn(queryName, reason, options) { ... }');

    check('_recordWarn có nhánh uiOnly check',
        paginatedQueryJs.includes('uiOnly') && paginatedQueryJs.includes('_uiOnly'),
        'const _uiOnly = options && options.uiOnly;');

    check('uiOnly path dùng console.info (không phải console.warn)',
        paginatedQueryJs.includes('console.info') &&
        paginatedQueryJs.includes('[UnsafeLimitInfo]'),
        "console.info('[UnsafeLimitInfo] ...')");

    check('non-uiOnly path vẫn dùng console.warn',
        paginatedQueryJs.includes('[UnsafeLimitWarning]') && paginatedQueryJs.includes('console.warn'),
        "console.warn('[UnsafeLimitWarning] ...')");

    check('Message uiOnly nói rõ "UI preview only"',
        paginatedQueryJs.includes('UI preview only'),
        '"UI preview only, không dùng cho tính toán nghiệp vụ"');
}

console.log();
console.log('▸ Section 2: app.js — listenToData có uiOnly: true');
if (appJs) {
    check('listenToData call warnUnsafeLimit với { uiOnly: true }',
        appJs.includes('uiOnly: true') && appJs.includes('listenToData'),
        "window.warnUnsafeLimit('transactions:...', 'listenToData:init', { uiOnly: true })");

    check('Comment giải thích listener chỉ phục vụ UI display',
        appJs.includes('chỉ phục vụ hiển thị tab Thu Chi') ||
        appJs.includes('UI preview only') ||
        appJs.includes('OK_UI_DISPLAY_LIMIT'),
        "// listener này chỉ phục vụ hiển thị tab Thu Chi, KHÔNG dùng cho tính toán");

    // Verify dashboard uses stats docs, not allTransactions
    check('Dashboard totalRevenue đọc từ stats doc (_sd.totalRevenue)',
        appJs.includes('_sd?.totalRevenue') || appJs.includes('_sd.totalRevenue') ||
        (appJs.includes('totalRevenue') && appJs.includes('monthStats')),
        'Dashboard: const rev = Number(_sd?.totalRevenue) — KHÔNG phải allTransactions.reduce(...)');
}

console.log();
console.log('▸ Section 3: paginatedQuery.js — warnUnsafeLimit exports');
if (paginatedQueryJs) {
    check('warnUnsafeLimit được export từ paginatedQuery.js',
        /export function warnUnsafeLimit/.test(paginatedQueryJs),
        'export function warnUnsafeLimit(...) { ... }');
}

if (mainJs) {
    check('main.js import warnUnsafeLimit từ paginatedQuery.js',
        mainJs.includes('warnUnsafeLimit') && mainJs.includes('paginatedQuery'),
        "import { ..., warnUnsafeLimit } from './firebase/paginatedQuery.js'");

    check('window.warnUnsafeLimit exposed trên window',
        mainJs.includes('window.warnUnsafeLimit'),
        'window.warnUnsafeLimit = warnUnsafeLimit;');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Transaction preview safety issue — UnsafeLimitWarning vẫn sẽ xuất hiện sai!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Transaction preview safety checks passed!');
    console.log('  listenToData: uiOnly=true → console.info thay vì console.warn.');
    console.log('  Dashboard dùng stats docs — không dùng limited allTransactions[].');
    console.log('══════════════════════════════════════════════════════════\n');
}
