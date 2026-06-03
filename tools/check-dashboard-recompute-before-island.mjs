/**
 * tools/check-dashboard-recompute-before-island.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu _invalidateDashboardOnly clear cache rồi run islands
 * mà không gọi refreshDashboardComputation trước.
 *
 * Chạy: node tools/check-dashboard-recompute-before-island.mjs
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
console.log('  check:dashboard-recompute-before-island');
console.log('══════════════════════════════════════════════════════════\n');

const renderInvalidation = readFile('js/ui/render/renderInvalidation.js');
const listCompRefresh    = readFile('js/ui/render/listComputationRefresh.js');

console.log('▸ Section 1: _invalidateDashboardOnly calls refreshDashboardComputation');
if (renderInvalidation) {
    check(
        '_invalidateDashboardOnly gọi window.refreshDashboardComputation trước khi run islands',
        renderInvalidation.includes('window.refreshDashboardComputation') &&
        renderInvalidation.includes('_invalidateDashboardOnly'),
        '_invalidateDashboardOnly phải: window.refreshDashboardComputation(reason) TRƯỚC _DASHBOARD_KEYS.forEach(runRender)'
    );

    check(
        'invalidateDashboardCache("all") đứng TRƯỚC refreshDashboardComputation trong _invalidateDashboardOnly',
        (function() {
            // Extract only the _invalidateDashboardOnly function body using its known start marker
            const startMarker = 'function _invalidateDashboardOnly(reason)';
            const startIdx = renderInvalidation.lastIndexOf(startMarker);
            if (startIdx === -1) return false;
            // Find the closing brace by counting braces
            let depth = 0, i = startIdx, fn = '';
            for (; i < renderInvalidation.length; i++) {
                const c = renderInvalidation[i];
                fn += c;
                if (c === '{') depth++;
                else if (c === '}') { depth--; if (depth === 0) break; }
            }
            const clearIdx  = fn.indexOf('invalidateDashboardCache');
            const recompIdx = fn.indexOf('refreshDashboardComputation');
            const runIdx    = fn.indexOf('runRender');
            return clearIdx !== -1 && recompIdx !== -1 && runIdx !== -1 &&
                   clearIdx < recompIdx && recompIdx < runIdx;
        })(),
        'Thứ tự phải là: invalidateDashboardCache → refreshDashboardComputation → runRender'
    );

    check(
        '_invalidateDashboardOnly không run islands từ empty cache (không skip recompute)',
        !renderInvalidation.includes('ok = false') ||
        renderInvalidation.includes('refreshDashboardComputation'),
        '_invalidateDashboardOnly phải recompute trước khi render islands'
    );
}

console.log('\n▸ Section 2: refreshDashboardComputation tồn tại và được expose');
if (listCompRefresh) {
    check(
        'export function refreshDashboardComputation tồn tại trong listComputationRefresh.js',
        listCompRefresh.includes('export function refreshDashboardComputation'),
        'Thêm: export function refreshDashboardComputation(reason) { ... } vào listComputationRefresh.js'
    );

    check(
        'refreshDashboardComputation được expose lên window',
        listCompRefresh.includes('window.refreshDashboardComputation = refreshDashboardComputation'),
        'Thêm: window.refreshDashboardComputation = refreshDashboardComputation; sau function definition'
    );

    check(
        'refreshDashboardComputation gọi _cacheAndApplyDashboardSummary',
        listCompRefresh.includes('_cacheAndApplyDashboardSummary') &&
        listCompRefresh.includes('refreshDashboardComputation'),
        'refreshDashboardComputation phải gọi _cacheAndApplyDashboardSummary(reason)'
    );

    check(
        'case dashboard trong refreshListComputation gọi refreshDashboardComputation (không còn ok=false)',
        (function() {
            const dashIdx = listCompRefresh.indexOf("case 'dashboard':\n                // [Part 2 FIX]");
            return dashIdx !== -1 || (
                listCompRefresh.includes("case 'dashboard':") &&
                listCompRefresh.includes('refreshDashboardComputation(reason')
            );
        })(),
        "case 'dashboard': trong refreshListComputation phải gọi refreshDashboardComputation(reason)"
    );
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Dashboard recompute-before-island checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
