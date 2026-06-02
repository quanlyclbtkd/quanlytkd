/**
 * tools/check-render-invalidation-usage.mjs — Render Invalidation Safety Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra render invalidation pipeline (Phase 3.5C → 4K):
 * 1. renderInvalidation.js expose đủ window.invalidate* APIs.
 * 2. window.scheduleRender trong renderInvalidation.js có throttled warning.
 * 3. tabs.js dùng invalidateCurrentTab (không gọi thẳng scheduleRender).
 * 4. app.js các render path chính dùng domain invalidation.
 * 5. window.invalidateCurrentTab và window.invalidateTab được expose.
 *
 * Chạy: node tools/check-render-invalidation-usage.mjs
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
console.log('  Render Invalidation Usage Check — Phase 4K-PROFILE-HYDRATION');
console.log('══════════════════════════════════════════════════════════\n');

const renderInvalidation = readFile('js/ui/render/renderInvalidation.js');
const tabsJs             = readFile('js/ui/tabs.js');
const renderJs           = readFile('js/ui/render.js');
const appJs              = readFile('app.js');
const mainJs             = readFile('js/main.js');

console.log('▸ Section 1: renderInvalidation.js — expose APIs đúng');
if (renderInvalidation) {
    check('window.invalidateCurrentTab exposed',
        renderInvalidation.includes('window.invalidateCurrentTab'),
        'renderInvalidation.js phải: window.invalidateCurrentTab = invalidateCurrentTab;');

    check('window.invalidateTab exposed',
        renderInvalidation.includes('window.invalidateTab'),
        'renderInvalidation.js phải: window.invalidateTab = invalidateTab;');

    check('window.invalidateByDomain exposed',
        renderInvalidation.includes('window.invalidateByDomain'),
        'renderInvalidation.js phải: window.invalidateByDomain = invalidateByDomain;');

    check('window.invalidateFinance exposed',
        renderInvalidation.includes('window.invalidateFinance'),
        'renderInvalidation.js phải expose invalidateFinance');

    check('window.invalidateStudents exposed',
        renderInvalidation.includes('window.invalidateStudents'),
        'renderInvalidation.js phải expose invalidateStudents');

    check('window.invalidateDashboard exposed',
        renderInvalidation.includes('window.invalidateDashboard'),
        'renderInvalidation.js phải expose invalidateDashboard');

    check('[LegacyRenderWarning] throttled warning trong scheduleRender wrapper',
        renderInvalidation.includes('LegacyRenderWarning') &&
        renderInvalidation.includes('window.scheduleRender'),
        'window.scheduleRender phải có LegacyRenderWarning để dễ trace caller');
}

console.log();
console.log('▸ Section 2: tabs.js — switchTab dùng invalidateCurrentTab');
if (tabsJs) {
    check('switchTab gọi invalidateCurrentTab (Phase 3.5C)',
        tabsJs.includes('invalidateCurrentTab') && tabsJs.includes('tab-switch-safety'),
        'switchTab cuối hàm phải: if (typeof window.invalidateCurrentTab === \'function\') window.invalidateCurrentTab(...)');

    check('switchTab có fallback scheduleRender (không xóa backward compat)',
        tabsJs.includes('scheduleRender') && tabsJs.includes('invalidateCurrentTab'),
        'Fallback: else if (typeof window.scheduleRender === \'function\') window.scheduleRender()');

    check('switchTab KHÔNG gọi scheduleRender() trực tiếp (không có fallback guard)',
        !(tabsJs.match(/window\.scheduleRender\(\)/g) && !tabsJs.includes('invalidateCurrentTab')),
        'switchTab phải ưu tiên invalidateCurrentTab — scheduleRender chỉ là fallback');

    check('tabs.js có _switchToDashboard dùng invalidateDashboard hoặc scheduleRender',
        tabsJs.includes('invalidateDashboard') || tabsJs.includes('scheduleRender'),
        '_switchToDashboard nên dùng invalidateDashboard thay vì scheduleRender');
}

console.log();
console.log('▸ Section 3: render.js — initRender expose scheduleRender an toàn');
if (renderJs) {
    check('render.js expose window.scheduleRender nếu chưa set',
        renderJs.includes('window.scheduleRender') && renderJs.includes('!window.scheduleRender'),
        'render.js: if (!window.scheduleRender) { window.scheduleRender = renderApp; }');

    check('render.js expose window._moduleRenderApp',
        renderJs.includes('_moduleRenderApp'),
        'render.js phải set window._moduleRenderApp = renderApp');
}

console.log();
console.log('▸ Section 4: app.js — render path chính dùng domain invalidation');
if (appJs) {
    check('app.js có invalidateStudents (không chỉ scheduleRender) cho profiles',
        appJs.includes('window.invalidateStudents') || appJs.includes('invalidateStudents'),
        'Sau khi profiles snapshot → window.invalidateStudents(\'profiles-snapshot\')');

    check('app.js có invalidateFinance hoặc invalidateByDomain cho finance',
        appJs.includes('invalidateFinance') || appJs.includes('invalidateByDomain'),
        'Finance update phải dùng invalidateFinance/invalidateByDomain, không dùng scheduleRender');

    check('app.js scheduleRender còn lại đều có fallback comment/guard',
        appJs.includes('Fallback') || appJs.includes('fallback'),
        'app.js: mọi scheduleRender() còn lại phải là fallback có comment');
}

console.log();
console.log('▸ Section 5: main.js — printClubRuntimeDiagnostics có metrics render');
if (mainJs) {
    check('printClubRuntimeDiagnostics tồn tại',
        mainJs.includes('printClubRuntimeDiagnostics'),
        'window.printClubRuntimeDiagnostics phải được define trong main.js');

    check('printClubRuntimeDiagnostics log __renderLegacyMetrics (scheduleRender calls)',
        mainJs.includes('__renderLegacyMetrics') && mainJs.includes('scheduleRenderCalls'),
        'Thêm: if (window.__renderLegacyMetrics) console.log(scheduleRenderCalls)');

    check('printClubRuntimeDiagnostics log __lastFirestoreError',
        mainJs.includes('__lastFirestoreError'),
        'Thêm: window.__lastFirestoreError tracking để trace Firestore errors');
}

console.log();
console.log('▸ Section 6: main.js — retryDataHydration + isClubRuntimeReady (Phase 4K)');
if (mainJs) {
    check('window.retryDataHydration tồn tại (manual retry helper)',
        mainJs.includes('window.retryDataHydration') && mainJs.includes('function retryDataHydration'),
        'main.js phải expose: window.retryDataHydration = function retryDataHydration(reason) {...}');

    check('window.isClubRuntimeReady tồn tại (db + clubId + user check)',
        mainJs.includes('window.isClubRuntimeReady') && mainJs.includes('function isClubRuntimeReady'),
        'main.js phải expose: window.isClubRuntimeReady = function() { return !!(db && clubId && user); }');

    check('printClubRuntimeDiagnostics in retryDataHydration available?',
        mainJs.includes('retryDataHydration') && mainJs.includes('printClubRuntimeDiagnostics'),
        'printClubRuntimeDiagnostics phải log: retryDataHydration available? ✅/❌');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Render invalidation có vấn đề — LegacyRenderWarning sẽ spam console!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Render invalidation checks passed!');
    console.log('  switchTab dùng domain invalidation đúng — không spam scheduleRender.');
    console.log('══════════════════════════════════════════════════════════\n');
}
