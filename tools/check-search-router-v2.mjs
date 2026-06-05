/**
 * tools/check-search-router-v2.mjs
 * Phase 4K-5Q — Kiểm tra Search Router V2
 *
 * Fail nếu:
 * 1. Không có __SEARCH_ROUTER_V2_ACTIVE
 * 2. searchRuntime init không clear el.oninput legacy
 * 3. app.js searchInput.oninput không return khi __SEARCH_ROUTER_V2_ACTIVE hoặc __searchRuntimeMounted
 * 4. Không có _getSearchRoute
 * 5. Không có getSearchRouteForCurrentTab
 * 6. Không có strategy profiles-client-first
 * 7. Không có strategy debt-full-profiles
 * 8. Search route active/quit không dùng client profile search khi profiles có sẵn
 * 9. Debt search không reset __debtRenderLimit
 * 10. TX search còn refresh students/debt/dashboard không cần thiết
 * 11. Không có debugSearchRouterV2
 * 12. debugRuntimeSmokeTest không include searchRouterV2
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

function readFile(rel) {
    return readFileSync(join(root, rel), 'utf8');
}

const errors = [];
const warnings = [];

// ── Read files ────────────────────────────────────────────────────────────────

let appJs = '', searchRuntime = '', mainJs = '';

try { appJs = readFile('app.js'); }
catch (e) { errors.push('❌ Không đọc được app.js: ' + e.message); }

try { searchRuntime = readFile('js/modules/searchRuntime.js'); }
catch (e) { errors.push('❌ Không đọc được js/modules/searchRuntime.js: ' + e.message); }

try { mainJs = readFile('js/main.js'); }
catch (e) { errors.push('❌ Không đọc được js/main.js: ' + e.message); }

// ── Check 1: __SEARCH_ROUTER_V2_ACTIVE được set ───────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('__SEARCH_ROUTER_V2_ACTIVE')) {
        errors.push('❌ FAIL 1: __SEARCH_ROUTER_V2_ACTIVE không được set trong searchRuntime.js');
    } else {
        console.log('✅ __SEARCH_ROUTER_V2_ACTIVE: OK');
    }
}

// ── Check 2: el.oninput bị disable khi init ───────────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('el.oninput = null') && !searchRuntime.includes('el.oninput=null')) {
        errors.push('❌ FAIL 2: initGlobalSearchRuntime không clear el.oninput legacy');
    } else {
        console.log('✅ el.oninput = null (disable legacy): OK');
    }
}

// ── Check 3: app.js legacy guard dùng __SEARCH_ROUTER_V2_ACTIVE ──────────────

if (appJs) {
    if (!appJs.includes('__SEARCH_ROUTER_V2_ACTIVE || window.__searchRuntimeMounted')) {
        errors.push('❌ FAIL 3: app.js searchInput.oninput không guard __SEARCH_ROUTER_V2_ACTIVE || __searchRuntimeMounted');
    } else {
        console.log('✅ app.js legacy oninput guard dùng __SEARCH_ROUTER_V2_ACTIVE: OK');
    }
}

// ── Check 4: _getSearchRoute tồn tại ─────────────────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('function _getSearchRoute')) {
        errors.push('❌ FAIL 4: _getSearchRoute không tồn tại trong searchRuntime.js');
    } else {
        console.log('✅ _getSearchRoute: OK');
    }
}

// ── Check 5: getSearchRouteForCurrentTab expose ───────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('window.getSearchRouteForCurrentTab')) {
        errors.push('❌ FAIL 5: window.getSearchRouteForCurrentTab không được expose');
    } else {
        console.log('✅ window.getSearchRouteForCurrentTab: OK');
    }
}

// ── Check 6: strategy profiles-client-first ──────────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('profiles-client-first')) {
        errors.push('❌ FAIL 6: strategy "profiles-client-first" không tồn tại');
    } else {
        console.log('✅ strategy profiles-client-first: OK');
    }
}

// ── Check 7: strategy debt-full-profiles ─────────────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('debt-full-profiles')) {
        errors.push('❌ FAIL 7: strategy "debt-full-profiles" không tồn tại');
    } else {
        console.log('✅ strategy debt-full-profiles: OK');
    }
}

// ── Check 8: client profile search cho active/quit ───────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('_clientSearchProfiles')) {
        errors.push('❌ FAIL 8: _clientSearchProfiles không tồn tại — active/quit không dùng client search');
    } else {
        console.log('✅ _clientSearchProfiles: OK');
    }

    if (!searchRuntime.includes('hasFullProfiles')) {
        errors.push('❌ FAIL 8b: hasFullProfiles check không tồn tại — không có client-first guard');
    } else {
        console.log('✅ hasFullProfiles client-first guard: OK');
    }
}

// ── Check 9: Debt search reset __debtRenderLimit ─────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('__debtRenderLimit = 50')) {
        errors.push('❌ FAIL 9: Debt search không reset window.__debtRenderLimit = 50');
    } else {
        console.log('✅ Debt search reset __debtRenderLimit: OK');
    }
}

// ── Check 10: TX search không refresh students/debt/dashboard ────────────────

if (searchRuntime) {
    // Find the tx/expense block
    const txBlock = searchRuntime.match(
        /tab === 'tx' \|\| tab === 'expense'[\s\S]{0,400}/
    )?.[0] || '';

    // In the tx block there should NOT be a students/debt/dashboard refresh
    const txHasBadRefresh =
        txBlock.includes("'students.activeList'") ||
        txBlock.includes("'students.debtList'")   ||
        txBlock.includes("'students.quitList'")   ||
        txBlock.includes("'dashboard.summary'");

    if (txHasBadRefresh) {
        errors.push('❌ FAIL 10: TX search đang refresh students/debt/dashboard');
    } else {
        console.log('✅ TX search không refresh students/debt/dashboard: OK');
    }
}

// ── Check 11: debugSearchRouterV2 ────────────────────────────────────────────

if (searchRuntime) {
    if (!searchRuntime.includes('window.debugSearchRouterV2')) {
        errors.push('❌ FAIL 11: window.debugSearchRouterV2 không tồn tại');
    } else {
        console.log('✅ window.debugSearchRouterV2: OK');
    }
}

// ── Check 12: debugRuntimeSmokeTest includes searchRouterV2 ──────────────────

if (mainJs) {
    if (!mainJs.includes('searchRouterV2') || !mainJs.includes('debugSearchRouterV2')) {
        errors.push('❌ FAIL 12: debugRuntimeSmokeTest không include searchRouterV2');
    } else {
        console.log('✅ debugRuntimeSmokeTest includes searchRouterV2: OK');
    }

    if (!mainJs.includes('searchRouterV2Ok')) {
        warnings.push('⚠️  searchRouterV2Ok không có trong summary (không fatal)');
    } else {
        console.log('✅ summary.searchRouterV2Ok: OK');
    }
}

// ── Result ────────────────────────────────────────────────────────────────────

console.log('');
if (warnings.length) warnings.forEach(w => console.warn(w));

if (errors.length) {
    console.error('\n[check-search-router-v2] FAILED:');
    errors.forEach(e => console.error('  ' + e));
    process.exit(1);
} else {
    console.log('[check-search-router-v2] ✅ Tất cả kiểm tra qua — Search Router V2 OK');
}
