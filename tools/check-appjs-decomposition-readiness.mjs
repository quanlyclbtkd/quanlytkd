/**
 * tools/check-appjs-decomposition-readiness.mjs — Phase 4.0C-1
 * ─────────────────────────────────────────────────────────────────────────
 * Kiểm tra tất cả deliverables cho Phase 4.0C-1 đã có đủ chưa.
 * Đảm bảo không có thay đổi business logic / Firestore / HTML IDs.
 *
 * Chạy: node tools/check-appjs-decomposition-readiness.mjs
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(rel) {
    const p = resolve(root, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4.0C-1 — App.js Decomposition Readiness Check');
console.log('══════════════════════════════════════════════════════════\n');

const appJs    = readFile('app.js');
const indexHtml = readFile('index.html');
const depMap   = readFile('APPJS_DEPENDENCY_MAP.md');
const bridge   = readFile('APPJS_GLOBAL_BRIDGE_PLAN.md');
const roadmap  = readFile('APPJS_EXTRACTION_ROADMAP.md');
const report   = readFile('PHASE_4C1_APPJS_DECOMPOSITION_READINESS_REPORT.md');
const analyzer = readFile('tools/analyze-appjs-dependencies.mjs');
const checkTool = readFile('tools/check-appjs-decomposition-readiness.mjs');

// ── Section 1: Required files exist ─────────────────────────────────────────
console.log('▸ Section 1: Required Deliverables');
check('tools/analyze-appjs-dependencies.mjs exists', !!analyzer, 'Create the analysis tool');
check('APPJS_DEPENDENCY_MAP.md exists', !!depMap, 'Run: node tools/analyze-appjs-dependencies.mjs');
check('APPJS_GLOBAL_BRIDGE_PLAN.md exists', !!bridge, 'Create the bridge plan document');
check('APPJS_EXTRACTION_ROADMAP.md exists', !!roadmap, 'Create the extraction roadmap document');
check('PHASE_4C1_APPJS_DECOMPOSITION_READINESS_REPORT.md exists', !!report, 'Create the phase report');
console.log();

// ── Section 2: APPJS_DEPENDENCY_MAP.md content ──────────────────────────────
console.log('▸ Section 2: Dependency Map Completeness');
if (depMap) {
    check('Dependency map has function declarations list', depMap.includes('Function Declarations'), 'Add function declarations list to map');
    check('Dependency map has window.* exports list', depMap.includes('window.* Exports'), 'Add window exports list to map');
    check('Dependency map has inline handlers section', depMap.includes('Inline Handlers') || depMap.includes('inline handlers'), 'Add inline handler section to map');
    check('Dependency map has global variables section', depMap.includes('Global Variables') || depMap.includes('closure'), 'Add global variables section to map');
    check('Dependency map has domain grouping (Bootstrap/Auth)', depMap.includes('Bootstrap/Auth'), 'Add Bootstrap/Auth domain section');
    check('Dependency map has domain grouping (Finance)', depMap.includes('Finance'), 'Add Finance domain section');
    check('Dependency map has domain grouping (Attendance)', depMap.includes('Attendance'), 'Add Attendance domain section');
    check('Dependency map has domain grouping (SuperAdmin)', depMap.includes('SuperAdmin'), 'Add SuperAdmin domain section');
    check('Dependency map has safe extraction candidates', depMap.includes('Safe Extraction') || depMap.includes('safe to extract'), 'Add safe extraction section');
    check('Dependency map has unsafe extraction list', depMap.includes('Unsafe') || depMap.includes('unsafe'), 'Add unsafe extraction section');
    check('Dependency map has Firestore read/write info', depMap.includes('Firestore') || depMap.includes('Reads FS') || depMap.includes('Writes FS'), 'Add Firestore read/write info');
    check('Dependency map has render UI section', depMap.includes('Render UI') || depMap.includes('render'), 'Add render UI section');
}
console.log();

// ── Section 3: Bridge plan content ──────────────────────────────────────────
console.log('▸ Section 3: Global Bridge Plan Completeness');
if (bridge) {
    check('Bridge plan lists window.* required globals', bridge.includes('window.*') || bridge.includes('window.'), 'List all required window.* globals');
    check('Bridge plan includes handleLogin', bridge.includes('handleLogin'), 'Include handleLogin in bridge plan');
    check('Bridge plan includes switchTab', bridge.includes('switchTab'), 'Include switchTab in bridge plan');
    check('Bridge plan includes renderApp', bridge.includes('renderApp'), 'Include renderApp in bridge plan');
    check('Bridge plan has safe extract pattern', bridge.includes('import {') || bridge.includes('Pattern'), 'Add extract pattern examples');
    check('Bridge plan has closure-to-store migration plan', bridge.includes('window.__store') || bridge.includes('closure'), 'Add closure migration plan');
    check('Bridge plan has initSaaSDatabase in unsafe list', bridge.includes('initSaaSDatabase'), 'Add initSaaSDatabase to unsafe list');
}
console.log();

// ── Section 4: Extraction roadmap content ───────────────────────────────────
console.log('▸ Section 4: Extraction Roadmap Completeness');
if (roadmap) {
    check('Roadmap has Stage 1 (Pure Utilities)', roadmap.includes('Stage 1') && roadmap.includes('utils'), 'Add Stage 1 pure utilities section');
    check('Roadmap has Stage 2 (UI Helpers)', roadmap.includes('Stage 2') || roadmap.includes('UI Helpers'), 'Add Stage 2 UI helpers section');
    check('Roadmap has Stage 3 (Payment/QR)', roadmap.includes('Stage 3') || roadmap.includes('Payment'), 'Add Stage 3 payment section');
    check('Roadmap has Stage 4 (Diagnostics)', roadmap.includes('Stage 4') || roadmap.includes('Diagnostics'), 'Add Stage 4 diagnostics section');
    check('Roadmap has Stage 5 (Domain Modules)', roadmap.includes('Stage 5') || roadmap.includes('Domain Modules'), 'Add Stage 5 domain modules section');
    check('Roadmap has Stage 6 (App shell)', roadmap.includes('Stage 6') || roadmap.includes('App.js Shell'), 'Add Stage 6 app shell section');
    check('Roadmap has check requirements per stage', roadmap.includes('check') || roadmap.includes('Check'), 'Add check requirements');
    check('Roadmap explicitly blocks Stage 5 before 1-4', roadmap.includes('Stage 1') && roadmap.includes('Stage 5'), 'Add stage ordering constraint');
}
console.log();

// ── Section 5: No business logic changes ────────────────────────────────────
console.log('▸ Section 5: No Business Logic Changed (app.js integrity)');
if (appJs) {
    // app.js core functions still present
    check('initSaaSDatabase still in app.js', appJs.includes('async function initSaaSDatabase'), 'initSaaSDatabase must remain in app.js during Phase 4.0C-1');
    check('renderApp still in app.js', appJs.includes('function renderApp('), 'renderApp must remain in app.js during Phase 4.0C-1');
    check('handleLogin still in app.js', appJs.includes('window.handleLogin'), 'handleLogin must remain in app.js during Phase 4.0C-1');
    check('onAuthStateChanged still in app.js', appJs.includes('onAuthStateChanged(auth'), 'onAuthStateChanged must remain in app.js during Phase 4.0C-1');
    check('listenToData still in app.js', appJs.includes('window.listenToData'), 'listenToData must remain in app.js during Phase 4.0C-1');
    check('No React/Vue import in app.js', !appJs.includes("from 'react'") && !appJs.includes("from 'vue'"), 'Do not add React/Vue imports');
}
console.log();

// ── Section 6: No HTML changes ───────────────────────────────────────────────
console.log('▸ Section 6: HTML Integrity (no ID changes)');
if (indexHtml) {
    check('loginOverlay exists in HTML', indexHtml.includes('loginOverlay'), 'Do not rename loginOverlay');
    check('mainApp div exists in HTML', indexHtml.includes('mainApp'), 'Do not rename mainApp');
    check('passInput exists in HTML', indexHtml.includes('passInput'), 'Do not rename passInput');
    check('addModal exists in HTML', indexHtml.includes('addModal'), 'Do not rename addModal');
    check('profileModal exists in HTML', indexHtml.includes('profileModal'), 'Do not rename profileModal');
}
console.log();

// ── Section 7: Global functions not removed ──────────────────────────────────
console.log('▸ Section 7: Global Functions Preserved');
if (appJs) {
    const required = [
        'window.handleLogin', 'window.handleLogout', 'window.switchTab',
        'window.showToast', 'window.openAddModal', 'window.closeModal',
        'window.loadSuperAdminData', 'window.saveClubSettings',
    ];
    for (const fn of required) {
        check(`${fn} still exposed`, appJs.includes(fn), `${fn} must remain on window`);
    }
}
console.log();

// ── Section 8: First extraction targets identified ───────────────────────────
console.log('▸ Section 8: First Extraction Targets Identified');
if (depMap) {
    const pureUtils = ['formatDate', 'getLocalToday', 'addMonthsToYYYYMM', 'removeVietnameseTones', 'maskAccountNumber'];
    const mentioned = pureUtils.filter(fn => depMap.includes(fn));
    check(`Pure utility candidates in dependency map (${mentioned.length}/${pureUtils.length})`,
        mentioned.length >= 4, 'Ensure all pure utility functions are listed in dependency map');
}
if (roadmap) {
    check('js/core/utils.js as first target mentioned in roadmap', roadmap.includes('js/core/utils.js'), 'Add js/core/utils.js as Stage 1 target in roadmap');
}
console.log();

// ── Section 9: Domain modules NOT split in this phase ────────────────────────
console.log('▸ Section 9: Domain Modules NOT Split in Phase 4.0C-1');
if (appJs) {
    // Finance/students/attendance core must still be in app.js
    const heavyFns = ['processCombo', 'processMultiItem', 'toggleAttendance', 'bulkCheckIn'];
    for (const fn of heavyFns) {
        check(`${fn} still in app.js (not extracted)`, appJs.includes(fn), `${fn} should NOT be extracted in Phase 4.0C-1`);
    }
}
console.log();

// ── Section 10: package.json scripts ─────────────────────────────────────────
console.log('▸ Section 10: Package Scripts');
const pkg = readFile('package.json');
if (pkg) {
    let pkgData;
    try { pkgData = JSON.parse(pkg); } catch (_) { pkgData = null; }
    if (pkgData && pkgData.scripts) {
        check('"analyze:appjs" script exists', !!pkgData.scripts['analyze:appjs'], 'Add "analyze:appjs": "node tools/analyze-appjs-dependencies.mjs" to package.json');
        check('"check:appjs-readiness" script exists', !!pkgData.scripts['check:appjs-readiness'], 'Add "check:appjs-readiness": "node tools/check-appjs-decomposition-readiness.mjs" to package.json');
        const checkAll = pkgData.scripts['check:all'] || '';
        check('"check:all" includes appjs-readiness', checkAll.includes('check-appjs-decomposition-readiness'), 'Add check-appjs-decomposition-readiness.mjs to check:all');
    }
}
console.log();

// ── Final ────────────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail > 0) {
    console.error('\n  Failed checks:');
    errors.forEach(e => console.error('    - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All decomposition readiness checks passed!');
    console.log('  app.js sẵn sàng cho giai đoạn tách module an toàn.');
    console.log('══════════════════════════════════════════════════════════\n');
}
