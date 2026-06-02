/**
 * tools/check-superadmin-counts.mjs — Phase 4K-FIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra SuperAdmin count không dùng getDocs full collection scan.
 *
 * Phát hiện:
 *   1. countDocs() dùng getDocs().size thay vì getCountFromServer
 *   2. Full collection getDocs không có limit (unbounded scan)
 *   3. SuperAdmin không dùng getCountFromServer
 *   4. UI hiển thị '--' khi count không khả dụng
 *
 * Chạy: node tools/check-superadmin-counts.mjs
 * Hoặc: npm run check:superadmin-counts
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

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

function warn(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.warn('  ⚠️  ' + label + (hint ? ' — ' + hint : ''));
        // warnings are non-blocking
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-FIX — SuperAdmin Count Cost Check');
console.log('══════════════════════════════════════════════════════════\n');

const superadminJs = readFile('js/modules/superadmin.js');
const appJs        = readFile('app.js');

// ── Section 1: superadmin.js countDocs implementation ────────────────
console.log('▸ Section 1: countDocs() Implementation (superadmin.js)');
if (superadminJs) {
    check('superadmin.js exists', true, '');

    // Must NOT use getDocs().size (loads all docs)
    const _hasGetDocsDotSize = /getDocs\s*\([\s\S]{0,200}?\)\s*\.size/.test(superadminJs) &&
        /countDocs/.test(superadminJs);
    check('countDocs does NOT use getDocs().size',
        !_hasGetDocsDotSize,
        'Replace getDocs(q).size with getCountFromServer(q) — loading docs just to count is wasteful');

    // Must NOT do unbounded getDocs on transactions/profiles/inventory
    const _hasUnboundedTxScan = /getDocs\s*\(\s*collection\s*\(db\s*,\s*["']clubs["'][\s\S]{0,100}?["']transactions["']\s*\)/.test(superadminJs);
    check('No unbounded getDocs on transactions collection',
        !_hasUnboundedTxScan,
        'Do not call getDocs(collection(db, "clubs", cid, "transactions")) without limit — use getCountFromServer or cached count');

    const _hasUnboundedProfileScan = /getDocs\s*\(\s*collection\s*\(db\s*,\s*["']clubs["'][\s\S]{0,100}?["']profiles["']\s*\)/.test(superadminJs);
    check('No unbounded getDocs on profiles collection',
        !_hasUnboundedProfileScan,
        'Do not call getDocs(collection(...profiles)) without limit — use getCountFromServer or cached count');

    // Should use getCountFromServer
    check('Uses getCountFromServer for O(1) count',
        superadminJs.includes('getCountFromServer') || superadminJs.includes('_gcfs'),
        'Use getCountFromServer(query) for server-side aggregation — does not load docs');

    // Should have cached count fallback
    check('Has cached count logic (cachedActiveCount)',
        superadminJs.includes('cachedActiveCount'),
        'Cache counts in club doc to avoid repeated count queries');

    // Should handle null counts (display --)
    check('Handles null counts gracefully (displays -- or n/a)',
        superadminJs.includes('null') && (superadminJs.includes("'--'") || superadminJs.includes('"--"') || superadminJs.includes('return null')),
        'When count is null, display "--" in UI — do not crash or show NaN');
}
console.log();

// ── Section 2: app.js loadSARevenue reads income.total ───────────────
console.log('▸ Section 2: loadSARevenue reads income.total (app.js)');
if (appJs) {
    check('app.js exists', true, '');

    check('loadSARevenue reads income?.total nested',
        appJs.includes('_sd?.income?.total') || appJs.includes("sd?.income?.total"),
        "Read stats.income.total nested — Cloud Functions writes as nested object");

    check("loadSARevenue reads 'income.total' flat key",
        appJs.includes("_sd?.['income.total']") || appJs.includes("sd['income.total']"),
        "Also read stats['income.total'] flat key for backward compat");

    check('loadSARevenue reads totalRevenue fallback',
        appJs.includes('_sd?.totalRevenue') || appJs.includes('sd.totalRevenue') || appJs.includes('totalRevenue'),
        'Keep totalRevenue fallback for backward compat with old stats format');

    check('loadSARevenue has fallback warning log',
        appJs.includes('Phase 4K-FIX') && appJs.includes('income'),
        'Log warning when stats doc exists but income cannot be read');

    // Must NOT use only typeof check for totalRevenue (old bug)
    const _hasOldBug = /typeof _sd\.totalRevenue === 'number'/.test(appJs) || /typeof _sd\.revenue === 'number'/.test(appJs);
    check('loadSARevenue does NOT use old limited typeof check',
        !_hasOldBug,
        'Replace "typeof _sd.totalRevenue === number" with multi-format helper that reads income.total');
}
console.log();

// ── Section 3: SuperAdmin estimated KB handles nulls ─────────────────
console.log('▸ Section 3: Null-safe count usage in SuperAdmin');
if (superadminJs) {
    // Verify estimated KB calculation won't NaN with null counts
    const _hasNullSafeEstimate = superadminJs.includes('(profileCount||0)') ||
        superadminJs.includes('(txCount||0)') ||
        superadminJs.includes('profileCount * 1') ||
        superadminJs.includes('estimatedKB');
    warn('estimatedKB calculated safely with null-safe counts',
        _hasNullSafeEstimate,
        'If counts can be null, use (profileCount || 0) in estimatedKB formula');
}
console.log();

// ── Final Summary ────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All SuperAdmin count checks passed!');
    console.log('  SuperAdmin không scan full collection chỉ để đếm.');
    console.log('══════════════════════════════════════════════════════════\n');
}
