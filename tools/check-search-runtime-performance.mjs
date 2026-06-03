/**
 * tools/check-search-runtime-performance.mjs
 * ─────────────────────────────────────────────────
 * PHẦN 13: Fail nếu còn double search handler, raw toLowerCase search, hoặc
 * full profile fallback không có guard.
 *
 * Chạy: node tools/check-search-runtime-performance.mjs
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
console.log('  check:search-runtime-performance');
console.log('══════════════════════════════════════════════════════════\n');

const appJs           = readFile('app.js');
const studentsJs      = readFile('js/modules/students.js');
const financeRender   = readFile('js/ui/render/computation/financeRenderer.js');
const inventoryRender = readFile('js/ui/render/computation/inventoryRenderer.js');
const profilesListener= readFile('js/listeners/profiles.listeners.js');
const studentsService = readFile('js/services/students.service.js');
const searchRuntime   = readFile('js/modules/searchRuntime.js');
const mainJs          = readFile('js/main.js');

// ─── Check 1: app.js search handler có guard __searchRuntimeMounted ──────────
console.log('▸ Section 1: app.js — search handler không còn gọi refreshListsComputation rộng khi http-module');

if (appJs) {
    check(
        'app.js searchInput.oninput có guard __RUNTIME_MODE==="http-module" && __searchRuntimeMounted',
        appJs.includes('__RUNTIME_MODE') && appJs.includes('__searchRuntimeMounted') &&
        appJs.includes('return;'),
        "PHẦN 2 FIX: Thêm: if (window.__RUNTIME_MODE === 'http-module' && window.__searchRuntimeMounted) { return; }"
    );

    // Kiểm tra không còn gọi refreshListsComputation 7 keys BÊN NGOÀI guard
    // (chỉ check app.js không còn gọi ngoài legacy fallback)
    const hasGuardedBranch = appJs.includes('global-search-change-legacy-fallback') ||
                             appJs.includes('// Legacy fallback');
    check(
        'app.js legacy search handler được đánh dấu là legacy-fallback',
        hasGuardedBranch,
        "PHẦN 2 FIX: Label comment/reason là 'global-search-change-legacy-fallback'"
    );
}

// ─── Check 2: students.js không bind input nếu __searchRuntimeMounted ──────────
console.log('\n▸ Section 2: students.js — _bindSearchReset check __searchRuntimeMounted');

if (studentsJs) {
    check(
        'students.js _bindSearchReset kiểm tra __searchRuntimeMounted trước khi bind',
        studentsJs.includes('__searchRuntimeMounted') &&
        (studentsJs.includes('skip _bindSearchReset') || studentsJs.includes('return;')),
        "PHẦN 3 FIX: Đầu _bindSearchReset: if (window.__searchRuntimeMounted) { ...; return; }"
    );

    check(
        'students.js expose window.runStudentSearchPagination',
        studentsJs.includes('window.runStudentSearchPagination'),
        "PHẦN 3 FIX: window.runStudentSearchPagination = async function(term) { ... }"
    );

    check(
        '_doLoad nhận searchOverride = null',
        studentsJs.includes('searchOverride = null') || studentsJs.includes('searchOverride=null'),
        "PHẦN 3 FIX: async function _doLoad(cursor, direction, searchOverride = null)"
    );

    check(
        '_doLoad dùng searchOverride nếu có',
        studentsJs.includes('searchOverride !== null ? searchOverride : _getCurrentSearch()'),
        "PHẦN 3 FIX: const search = searchOverride !== null ? searchOverride : _getCurrentSearch();"
    );
}

// ─── Check 3: financeRenderer — không còn dùng cleanName.toLowerCase().includes ──
console.log('\n▸ Section 3: financeRenderer.js — dùng normalizeVNForSearch');

if (financeRender) {
    check(
        'financeRenderer không còn cleanName.toLowerCase().includes(search)',
        !financeRender.includes('cleanName.toLowerCase().includes(search)'),
        "PHẦN 7 FIX: Đổi sang dùng normalizeVNForSearch + txBlob"
    );

    check(
        'financeRenderer dùng normalizeVNForSearch (window.normalizeVNForSearch)',
        financeRender.includes('normalizeVNForSearch') || financeRender.includes('_nvFn'),
        "PHẦN 7 FIX: const _nvFn = window.normalizeVNForSearch || ...; txBlob.includes(q)"
    );
}

// ─── Check 4: inventoryRenderer — không còn desc.toLowerCase().includes ──────
console.log('\n▸ Section 4: inventoryRenderer.js — dùng normalizeVNForSearch');

if (inventoryRender) {
    check(
        'inventoryRenderer không còn (t.desc||"").toLowerCase().includes(search)',
        !inventoryRender.includes("(t.desc || '').toLowerCase().includes(search)") &&
        !inventoryRender.includes('(t.desc || "").toLowerCase().includes(search)'),
        "PHẦN 7 FIX: Đổi sang dùng normalizeVNForSearch + invBlob"
    );

    check(
        'inventoryRenderer dùng normalizeVNForSearch hoặc _nvFn',
        inventoryRender.includes('normalizeVNForSearch') || inventoryRender.includes('_nvFn'),
        "PHẦN 7 FIX: const _nvFn = window.normalizeVNForSearch || ...; invBlob.includes(q)"
    );
}

// ─── Check 5: loadFullProfilesFallback không còn 5 lệnh invalidate đồng thời ──
console.log('\n▸ Section 5: profiles.listeners.js — loadFullProfilesFallback consolidated pipeline');

if (profilesListener) {
    // Đã thay invalidateStudents + invalidateList + refreshListsComputation + invalidateDashboard + _invalidateAll
    // bằng refreshListsComputation → _invalidateAll
    const hasConsolidated = profilesListener.includes('PHẦN 9 FIX') ||
        (profilesListener.includes('refreshListsComputation') &&
         !profilesListener.includes("window.invalidateStudents('full-fallback-quit')") &&
         !profilesListener.includes("window.invalidateList('students.quitList'") &&
         !profilesListener.includes("window.invalidateDashboard('full-profiles-fallback')"));

    check(
        'loadFullProfilesFallback không còn gọi invalidateStudents riêng sau _invalidateAll',
        !profilesListener.includes("window.invalidateStudents('full-fallback-quit')"),
        "PHẦN 9 FIX: Xóa: window.invalidateStudents('full-fallback-quit') — đã gộp vào _invalidateAll"
    );

    check(
        'loadFullProfilesFallback không còn gọi window.invalidateDashboard riêng sau _invalidateAll',
        !profilesListener.includes("window.invalidateDashboard('full-profiles-fallback')"),
        "PHẦN 9 FIX: Xóa: window.invalidateDashboard('full-profiles-fallback') — đã gộp vào _invalidateAll"
    );

    check(
        'loadFullProfilesFallback gọi refreshListsComputation TRƯỚC _invalidateAll',
        (() => {
            const idxRefresh    = profilesListener.indexOf('refreshListsComputation');
            const idxInvalidAll = profilesListener.indexOf('_invalidateAll(\'full-profiles-fallback\')');
            return idxRefresh !== -1 && idxInvalidAll !== -1 && idxRefresh < idxInvalidAll;
        })(),
        "PHẦN 9 FIX: refreshListsComputation phải gọi TRƯỚC _invalidateAll('full-profiles-fallback')"
    );
}

// ─── Check 6: students.service.js — guard loadFullProfilesFallback ────────────
console.log('\n▸ Section 6: students.service.js — guard loadFullProfilesFallback call');

if (studentsService) {
    check(
        'searchProfilesServerSide kiểm tra store profile count trước khi gọi fallback',
        studentsService.includes('_storeProfiles') &&
        (studentsService.includes('>= 50') || studentsService.includes('> 50')),
        "PHẦN 8 FIX: if (_storeProfiles >= 50) { // skip — dùng client-store-fallback }"
    );

    check(
        'searchProfilesServerSide kiểm tra __searchFallbackCount',
        studentsService.includes('__searchFallbackCount') || studentsService.includes('_fallbackCount'),
        "PHẦN 8 FIX: const _fallbackCount = window.__searchFallbackCount || 0; if (_fallbackCount > 0) skip"
    );

    check(
        'searchProfilesServerSide kiểm tra term length >= 2 trước fallback',
        studentsService.includes('_termLen') || studentsService.includes('termLen') ||
        studentsService.includes('.length < 2') || studentsService.includes('< 2'),
        "PHẦN 8 FIX: if (_termLen < 2) { skip full fallback }"
    );
}

// ─── Check 7: searchRuntime.js tồn tại và có đủ exports ──────────────────────
console.log('\n▸ Section 7: js/modules/searchRuntime.js — tồn tại và export đúng');

if (searchRuntime) {
    check(
        'searchRuntime.js export initGlobalSearchRuntime',
        searchRuntime.includes('export function initGlobalSearchRuntime'),
        "PHẦN 1: export function initGlobalSearchRuntime() { ... }"
    );

    check(
        'searchRuntime.js export disposeGlobalSearchRuntime',
        searchRuntime.includes('export function disposeGlobalSearchRuntime'),
        "PHẦN 1: export function disposeGlobalSearchRuntime() { ... }"
    );

    check(
        'searchRuntime.js export getSearchRuntimeState',
        searchRuntime.includes('export function getSearchRuntimeState'),
        "PHẦN 1: export function getSearchRuntimeState() { ... }"
    );

    check(
        'searchRuntime.js có debounce 250ms hoặc 300ms',
        searchRuntime.includes('}, 250)') || searchRuntime.includes('}, 300)'),
        "PHẦN 1: _state.pendingTimer = setTimeout(() => { _dispatchSearch(raw); }, 250);"
    );

    check(
        'searchRuntime.js check skip cùng term+tab',
        searchRuntime.includes('lastTerm') && searchRuntime.includes('lastTab'),
        "PHẦN 1: if (term === _state.lastTerm && tab === _state.lastTab) { skip }"
    );

    check(
        'searchRuntime.js tab-aware dispatch: active/quit gọi runStudentSearchPagination',
        searchRuntime.includes('runStudentSearchPagination'),
        "PHẦN 4: if (tab === 'active' || tab === 'quit') window.runStudentSearchPagination(term)"
    );

    check(
        'searchRuntime.js sets window.__searchRuntimeMounted = true',
        searchRuntime.includes('window.__searchRuntimeMounted = true'),
        "PHẦN 1: window.__searchRuntimeMounted = true; sau khi bind"
    );
}

// ─── Check 8: main.js import searchRuntime + flush queue ──────────────────────
console.log('\n▸ Section 8: main.js — import searchRuntime và flush pending queue');

if (mainJs) {
    check(
        'main.js import initGlobalSearchRuntime từ searchRuntime.js',
        mainJs.includes('searchRuntime.js') && mainJs.includes('initGlobalSearchRuntime'),
        "PHẦN 1: import { initGlobalSearchRuntime } from './modules/searchRuntime.js';"
    );

    check(
        'main.js gọi initGlobalSearchRuntime() sau bootstrap',
        mainJs.includes('initGlobalSearchRuntime()'),
        "PHẦN 1: try { initGlobalSearchRuntime(); } catch (e) { ... }"
    );

    check(
        'main.js flush __pendingDomainInvalidations sau init',
        mainJs.includes('__pendingDomainInvalidations') && mainJs.includes('Flushed'),
        "PHẦN 10: (function _flushPendingDomainInvalidations() { ... })()"
    );

    check(
        'main.js có window.debugSearchPerformance',
        mainJs.includes('window.debugSearchPerformance'),
        "PHẦN 12: window.debugSearchPerformance = function(term) { ... }"
    );

    check(
        'main.js có window.__searchTextCache với profiles Map',
        mainJs.includes('__searchTextCache') && mainJs.includes('new Map()'),
        "PHẦN 6: window.__searchTextCache = { profilesVersion: 0, profiles: new Map(), ... }"
    );
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Search runtime performance checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
