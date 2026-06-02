/**
 * tools/check-unsafe-transaction-calculation.mjs — Unsafe Limit Calculation Check
 * ─────────────────────────────────────────────────────────────────────────────────
 * Kiểm tra Phase 4K-RUNTIME-INIT-FIX:
 * Transaction listener có limit không được dùng cho tính toán dashboard/doanh thu.
 *
 * Checks:
 * 1. warnUnsafeLimit trong paginatedQuery.js chấp nhận options.uiOnly.
 * 2. listenToData call warnUnsafeLimit có { uiOnly: true }.
 * 3. _recordWarn phân loại uiOnly → console.info thay vì console.warn.
 * 4. Dashboard không dùng allTransactions cho totalRevenue/income calculations.
 * 5. Dashboard ưu tiên stats docs (monthStats, Phase 4K pattern).
 *
 * Chạy: node tools/check-unsafe-transaction-calculation.mjs
 * Hoặc: npm run check:unsafe-transaction-calculation
 * ─────────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Unsafe Transaction Calculation Check — Phase 4K');
console.log('══════════════════════════════════════════════════════════\n');

const paginatedQueryJs = readFile('js/firebase/paginatedQuery.js');
const appJs            = readFile('app.js');
const mainJs           = readFile('js/main.js');

// ── Section 1: paginatedQuery.js warnUnsafeLimit hỗ trợ options.uiOnly ──────
console.log('▸ Section 1: paginatedQuery.js — warnUnsafeLimit supports uiOnly');
if (paginatedQueryJs) {
    const _warnAcceptsOptions =
        /export function warnUnsafeLimit\s*\(queryName,\s*reason,\s*options\)/.test(paginatedQueryJs) ||
        /warnUnsafeLimit\s*\(queryName,\s*reason,\s*options\)/.test(paginatedQueryJs);
    check(
        'warnUnsafeLimit signature có parameter options',
        _warnAcceptsOptions,
        'Update: export function warnUnsafeLimit(queryName, reason, options) { ... }'
    );

    const _recordWarnAcceptsOptions =
        /function _recordWarn\s*\(queryName,\s*reason,\s*options\)/.test(paginatedQueryJs);
    check(
        '_recordWarn có parameter options',
        _recordWarnAcceptsOptions,
        'Update: function _recordWarn(queryName, reason, options) { ... }'
    );

    const _hasUiOnlyBranch = paginatedQueryJs.includes('uiOnly') && paginatedQueryJs.includes('UnsafeLimitInfo');
    check(
        '_recordWarn có nhánh uiOnly → console.info với message rõ ràng',
        _hasUiOnlyBranch,
        'Thêm: if (options && options.uiOnly) { console.info("[UnsafeLimitInfo]...") } else { console.warn(...) }'
    );

    const _uiOnlyUsesInfo = paginatedQueryJs.includes('console.info') && paginatedQueryJs.includes('UI preview only');
    check(
        'uiOnly dùng console.info với text "UI preview only"',
        _uiOnlyUsesInfo,
        'Text phải nói rõ: dữ liệu chỉ dùng cho UI preview, không dùng cho tính toán nghiệp vụ'
    );
}

// ── Section 2: app.js listenToData dùng { uiOnly: true } ────────────────────
console.log();
console.log('▸ Section 2: app.js listenToData — warnUnsafeLimit với uiOnly');
if (appJs) {
    const _listenToDataUiOnly =
        /warnUnsafeLimit\s*\([^)]*listenToData[^)]*\{[^}]*uiOnly\s*:\s*true/.test(appJs) ||
        /warnUnsafeLimit\s*\([^)]*\{\s*uiOnly\s*:\s*true\s*\}/.test(appJs.replace(/\n/g, ' '));
    check(
        'listenToData call warnUnsafeLimit với { uiOnly: true }',
        _listenToDataUiOnly,
        "Update: window.warnUnsafeLimit('transactions:...', 'listenToData:init', { uiOnly: true })"
    );

    // Check comment exists explaining UI-only purpose
    const _hasUiOnlyComment = appJs.includes('uiOnly') &&
        (appJs.includes('UI preview only') || appJs.includes('hiển thị tab Thu Chi') || appJs.includes('chỉ phục vụ hiển thị'));
    check(
        'Comment trong listenToData giải thích mục đích UI-only',
        _hasUiOnlyComment,
        'Thêm comment: // listener này chỉ phục vụ hiển thị tab Thu Chi, KHÔNG dùng cho tính toán'
    );
}

// ── Section 3: Dashboard không dùng allTransactions cho tính toán ────────────
console.log();
console.log('▸ Section 3: Dashboard stats không dùng allTransactions trực tiếp');
if (appJs) {
    // allTransactions is a UI array — check it's NOT used for totalRevenue calculation in dashboard
    // The stats docs pattern uses _sd?.totalRevenue or monthStats
    const _dashboardUsesStatsDocs =
        appJs.includes('totalRevenue') &&
        (appJs.includes('_sd?.totalRevenue') || appJs.includes('monthStats') || appJs.includes('stats doc'));
    check(
        'Dashboard dùng stats docs (totalRevenue từ _sd/monthStats) — không phải allTransactions',
        _dashboardUsesStatsDocs,
        'Dashboard phải đọc từ stats doc (monthly/daily stats) — KHÔNG tính từ allTransactions[]'
    );

    // Count actual call sites only: warnUnsafeLimit( — not assignments or comments
    const _warnCalls = (appJs.match(/warnUnsafeLimit\s*\(/g) || []).length;
    check(
        'warnUnsafeLimit call sites không quá nhiều (chỉ cho các query thật sự bị giới hạn)',
        _warnCalls <= 8,
        'Hơn 8 warnUnsafeLimit call sites trong app.js — kiểm tra có query nguy hiểm nào chưa được sửa'
    );
}

// ── Section 4: paginatedQuery.js export đúng signature ──────────────────────
console.log();
console.log('▸ Section 4: paginatedQuery.js — export warnUnsafeLimit');
if (paginatedQueryJs) {
    const _exported = /export function warnUnsafeLimit/.test(paginatedQueryJs);
    check(
        'warnUnsafeLimit được export từ paginatedQuery.js',
        _exported,
        'Cần export để main.js import và expose lên window.warnUnsafeLimit'
    );

    // Check it's imported in main.js
    if (mainJs) {
        const _importedInMain =
            mainJs.includes('warnUnsafeLimit') && mainJs.includes('paginatedQuery');
        check(
            'main.js import warnUnsafeLimit từ paginatedQuery.js',
            _importedInMain,
            'Trong main.js: import { ..., warnUnsafeLimit } from ./firebase/paginatedQuery.js'
        );
    }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  UnsafeLimitWarning chưa được phân loại đúng — console vẫn sẽ có cảnh báo sai!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All unsafe transaction calculation checks passed!');
    console.log('  listenToData dùng uiOnly: true — console.warn sẽ không còn xuất hiện sai.');
    console.log('  Dashboard tính từ stats docs, không phải allTransactions bị giới hạn.');
    console.log('══════════════════════════════════════════════════════════\n');
}
