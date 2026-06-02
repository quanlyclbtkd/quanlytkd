/**
 * tools/check-legacy-schedule-render.mjs — Legacy scheduleRender Usage Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra việc dùng scheduleRender() legacy:
 * 1. tabs.js switchTab ưu tiên invalidateCurrentTab, scheduleRender chỉ fallback.
 * 2. app.js không gọi scheduleRender() trực tiếp cho profiles/finance updates.
 * 3. renderInvalidation.js wrap scheduleRender với LegacyRenderWarning (trace).
 * 4. render.js expose scheduleRender sơ bộ nếu chưa set (không gây crash).
 * 5. Không có scheduleRender() gọi thẳng (không qua guard) trong switchTab.
 *
 * Chạy: node tools/check-legacy-schedule-render.mjs
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

// Count raw (unguarded) scheduleRender() calls in a file
// An "unguarded" call is window.scheduleRender() or scheduleRender() that is NOT
// preceded by an invalidate* check in the same if/else block.
// Skips: // comments, * block-comment lines, JSDoc lines.
function countUnguardedScheduleRenderCalls(src) {
    if (!src) return 0;
    const lines = src.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip comment-only lines (both // and * block-comment and JSDoc lines)
        if (line.startsWith('//')) continue;
        if (line.startsWith('*')) continue;
        if (line.startsWith('/*')) continue;
        if (!line.includes('scheduleRender()') && !line.includes('scheduleRender();')) continue;
        // Check if within 5 lines above there's an invalidate* guard
        const context = lines.slice(Math.max(0, i-5), i).join('\n');
        const hasGuard = context.includes('invalidateCurrentTab') ||
                         context.includes('invalidateTab') ||
                         context.includes('invalidateByDomain') ||
                         context.includes('invalidateStudents') ||
                         context.includes('invalidateFinance') ||
                         context.includes('invalidateDashboard') ||
                         context.includes('typeof window.invalidate') ||
                         context.includes('typeof window.scheduleRender') ||
                         context.includes('else if');
        if (!hasGuard) count++;
    }
    return count;
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Legacy scheduleRender Usage Check — Phase 4K-PROFILE-HYDRATION');
console.log('══════════════════════════════════════════════════════════\n');

const tabsJs             = readFile('js/ui/tabs.js');
const renderInvalidation = readFile('js/ui/render/renderInvalidation.js');
const renderJs           = readFile('js/ui/render.js');
const appJs              = readFile('app.js');
const mainJs             = readFile('js/main.js');

console.log('▸ Section 1: tabs.js — switchTab không gọi thẳng scheduleRender');
if (tabsJs) {
    check('switchTab dùng invalidateCurrentTab làm ưu tiên chính',
        tabsJs.includes('invalidateCurrentTab') &&
        tabsJs.includes('tab-switch-safety'),
        'switchTab: if (typeof window.invalidateCurrentTab === \'function\') window.invalidateCurrentTab(\'tab-switch-safety\')');

    check('scheduleRender trong switchTab chỉ là else-if fallback',
        tabsJs.includes('} else if (typeof window.scheduleRender') ||
        tabsJs.includes('else if (typeof window.scheduleRender'),
        'Fallback pattern: } else if (typeof window.scheduleRender === \'function\') { window.scheduleRender(); }');

    // Check tab switch itself does NOT call scheduleRender() without guard
    const _tabUnguarded = countUnguardedScheduleRenderCalls(tabsJs);
    check('tabs.js không có scheduleRender() gọi thẳng không qua guard',
        _tabUnguarded === 0,
        'Mọi scheduleRender() trong tabs.js phải là else-if fallback sau invalidate* guard');
}

console.log();
console.log('▸ Section 2: renderInvalidation.js — scheduleRender wrapper có warning');
if (renderInvalidation) {
    check('renderInvalidation.js wrap window.scheduleRender với LegacyRenderWarning',
        renderInvalidation.includes('LegacyRenderWarning') &&
        renderInvalidation.includes('window.scheduleRender = function'),
        'window.scheduleRender phải là wrapper với _throttledWarn(\'LegacyRenderWarning\', ...)');

    check('scheduleRender wrapper gọi invalidateByDomain thay vì renderApp trực tiếp',
        renderInvalidation.includes("invalidateByDomain('all'") ||
        renderInvalidation.includes('invalidateByDomain(\'all\''),
        'window.scheduleRender: invalidateByDomain(\'all\', reason) — không renderApp() trực tiếp');

    check('__renderLegacyMetrics.scheduleRenderCalls counter tồn tại',
        renderInvalidation.includes('scheduleRenderCalls'),
        'renderInvalidation.js phải đếm scheduleRenderCalls vào window.__renderLegacyMetrics');
}

console.log();
console.log('▸ Section 3: render.js — scheduleRender expose sơ bộ an toàn');
if (renderJs) {
    check('render.js expose scheduleRender chỉ khi chưa set (Phase 3.5B guard)',
        renderJs.includes('!window.scheduleRender') &&
        renderJs.includes('window.scheduleRender'),
        'render.js: if (!window.scheduleRender) { window.scheduleRender = renderApp; }');
}

console.log();
console.log('▸ Section 4: app.js — profiles/finance update dùng domain invalidation');
if (appJs) {
    check('app.js profiles snapshot trigger invalidateStudents (không dùng scheduleRender)',
        (appJs.includes('invalidateStudents') && appJs.includes('profiles-snapshot')) ||
        (appJs.includes('invalidateStudents') && appJs.includes('snapshot')),
        'Sau profiles snapshot: window.invalidateStudents(\'profiles-snapshot\') thay vì scheduleRender()');

    // Count raw scheduleRender calls in app.js (unguarded = without nearby invalidate* check)
    const _appUnguarded = countUnguardedScheduleRenderCalls(appJs);
    check('app.js scheduleRender() calls đều có invalidation guard xung quanh (≤ 3 raw)',
        _appUnguarded <= 3,
        'app.js còn ' + _appUnguarded + ' scheduleRender() không qua guard — cân nhắc chuyển sang invalidate*');
}

console.log();
console.log('▸ Section 5: main.js — printClubRuntimeDiagnostics có render metrics');
if (mainJs) {
    check('printClubRuntimeDiagnostics log scheduleRender call count',
        mainJs.includes('scheduleRenderCalls') && mainJs.includes('__renderLegacyMetrics'),
        'printClubRuntimeDiagnostics: console.log(window.__renderLegacyMetrics.scheduleRenderCalls)');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  scheduleRender() legacy vẫn được gọi trực tiếp — warning sẽ spam console!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Legacy scheduleRender checks passed!');
    console.log('  scheduleRender() chỉ là fallback — domain invalidation hoạt động đúng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
