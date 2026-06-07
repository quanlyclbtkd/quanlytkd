/**
 * check-legacy-app-reduction-readiness.mjs
 * Phase 4K-6F — Legacy App Kernel Boundary + Diagnostics Extraction Gate
 *
 * Static checks: app.js size, line count, window globals, duplicate globals,
 * critical function presence, and new module readiness.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync }                           from 'child_process';
import path                                   from 'path';

const root = process.cwd();

let _passed = 0;
let _failed = 0;

function ok(label) {
    console.log('✅ PASS ', label);
    _passed++;
}
function warn(label, hint) {
    console.warn('⚠️  WARN ', label);
    if (hint) console.warn('       💡', hint);
}
function fail(label, hint) {
    console.error('❌ FAIL ', label);
    if (hint) console.error('       💡', hint);
    _failed++;
}
function check(label, condition, hint) {
    if (condition) ok(label);
    else fail(label, hint);
}

function readFile(rel) {
    const p = path.join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf8');
}

function fileExists(rel) {
    return existsSync(path.join(root, rel));
}

function fileSize(rel) {
    const p = path.join(root, rel);
    if (!existsSync(p)) return 0;
    return statSync(p).size;
}

function lineCount(content) {
    if (!content) return 0;
    return content.split('\n').length;
}

console.log('\n🔍 Phase 4K-6F — Legacy App Kernel Boundary + Diagnostics Extraction Gate\n');

// ── Read key files ──────────────────────────────────────────────────────────
const appJs      = readFile('app.js');
const indexHtml  = readFile('index.html');
const mainJs     = readFile('js/main.js');
const auditJs    = readFile('js/core/legacyAppAudit.js');
const diagJs     = readFile('js/diagnostics/legacyDiagnostics.js');

// ── 1. app.js exists ────────────────────────────────────────────────────────
check(
    'app.js tồn tại',
    fileExists('app.js'),
    'app.js đã bị xóa — phase này không được phép xóa app.js'
);

// ── 2. app.js still loaded in index.html ────────────────────────────────────
check(
    'index.html vẫn load app.js',
    !!(indexHtml && (indexHtml.includes('app.js') || indexHtml.includes('"app.js"') || indexHtml.includes("'app.js'"))),
    'index.html không còn load app.js — nguy hiểm nếu chưa có migration gate'
);

// ── 3. app.js not deleted ────────────────────────────────────────────────────
check(
    'app.js chưa bị xóa (có nội dung)',
    !!(appJs && appJs.length > 1000),
    'app.js rỗng hoặc đã bị xóa'
);

// ── 4. js/core/legacyAppAudit.js exists ─────────────────────────────────────
check(
    'js/core/legacyAppAudit.js tồn tại',
    fileExists('js/core/legacyAppAudit.js'),
    'Tạo js/core/legacyAppAudit.js với export LegacyAppAudit'
);

// ── 5. js/diagnostics/legacyDiagnostics.js exists ───────────────────────────
check(
    'js/diagnostics/legacyDiagnostics.js tồn tại',
    fileExists('js/diagnostics/legacyDiagnostics.js'),
    'Tạo js/diagnostics/legacyDiagnostics.js với export initLegacyDiagnostics'
);

// ── 6. main.js imports LegacyAppAudit ───────────────────────────────────────
check(
    'main.js import LegacyAppAudit',
    !!(mainJs && mainJs.includes('LegacyAppAudit') && mainJs.includes('legacyAppAudit.js')),
    "Thêm: import { LegacyAppAudit } from './core/legacyAppAudit.js'; vào main.js"
);

// ── 7. main.js imports/inits initLegacyDiagnostics ──────────────────────────
check(
    'main.js import initLegacyDiagnostics',
    !!(mainJs && mainJs.includes('initLegacyDiagnostics') && mainJs.includes('legacyDiagnostics.js')),
    "Thêm: import { initLegacyDiagnostics } from './diagnostics/legacyDiagnostics.js'; vào main.js"
);
check(
    'main.js gọi initLegacyDiagnostics()',
    !!(mainJs && mainJs.includes('initLegacyDiagnostics()')),
    'Thêm: initLegacyDiagnostics(); vào main.js'
);

// ── 8. window.LegacyAppAudit exposed ────────────────────────────────────────
check(
    'main.js expose window.LegacyAppAudit',
    !!(mainJs && mainJs.includes('window.LegacyAppAudit')),
    'Thêm: window.LegacyAppAudit = window.LegacyAppAudit || LegacyAppAudit; vào main.js'
);

// ── 9. debugLegacyAppAudit ───────────────────────────────────────────────────
check(
    'main.js có window.debugLegacyAppAudit',
    !!(mainJs && mainJs.includes('window.debugLegacyAppAudit')),
    'Thêm window.debugLegacyAppAudit = function() {...}; vào main.js'
);

// ── 10. debugAppJsReductionPlan ──────────────────────────────────────────────
check(
    'main.js có window.debugAppJsReductionPlan',
    !!(mainJs && mainJs.includes('window.debugAppJsReductionPlan')),
    'Thêm window.debugAppJsReductionPlan = function() {...}; vào main.js'
);

// ── 11. debugRuntimeSmokeTest includes debugLegacyAppAudit ──────────────────
const smokeTestStart = mainJs ? mainJs.indexOf('window.debugRuntimeSmokeTest = async') : -1;
const smokeTestBlock = smokeTestStart >= 0 ? mainJs.slice(smokeTestStart, smokeTestStart + 30000) : '';
check(
    'debugRuntimeSmokeTest include debugLegacyAppAudit',
    smokeTestBlock.includes('debugLegacyAppAudit'),
    'Thêm out.legacyAppAudit = await safeCall(...debugLegacyAppAudit...) vào debugRuntimeSmokeTest'
);

// ── 12. Measure app.js size ──────────────────────────────────────────────────
const appJsBytes = fileSize('app.js');
const appJsSizeKB = (appJsBytes / 1024).toFixed(1);
const appJsSizeMB = (appJsBytes / 1024 / 1024).toFixed(2);
console.log(`📊 app.js size      : ${appJsSizeKB} KB (${appJsSizeMB} MB)`);
ok('app.js size measured: ' + appJsSizeKB + ' KB');

// ── 13. Measure app.js lines ─────────────────────────────────────────────────
const appJsLines = lineCount(appJs);
console.log(`📊 app.js lines     : ${appJsLines.toLocaleString()}`);
ok('app.js line count measured: ' + appJsLines);

// ── 14. Count window.X = in app.js ──────────────────────────────────────────
const windowAssignMatches = appJs ? (appJs.match(/window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g) || []) : [];
const windowAssignCount = windowAssignMatches.length;
console.log(`📊 window.X = count : ${windowAssignCount} in app.js`);
ok('window assignment count measured: ' + windowAssignCount);

// ── 15. Count duplicate globals between app.js and js/**/*.js ───────────────
let dupCount = 0;
let topDups  = [];
if (appJs) {
    const appGlobals = new Set();
    const appMatches = appJs.match(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g) || [];
    for (const m of appMatches) {
        const name = m.replace(/^window\./, '').replace(/\s*=$/, '');
        appGlobals.add(name);
    }

    let jsModuleContent = '';
    try {
        jsModuleContent = execSync(
            'find js -name "*.js" ! -name "app.js" -type f | xargs cat 2>/dev/null',
            { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
        );
    } catch (_e) {}

    const moduleGlobals = new Set();
    const modMatches = jsModuleContent.match(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g) || [];
    for (const m of modMatches) {
        const name = m.replace(/^window\./, '').replace(/\s*=$/, '');
        moduleGlobals.add(name);
    }

    for (const g of appGlobals) {
        if (moduleGlobals.has(g)) {
            topDups.push(g);
            dupCount++;
        }
    }
}
console.log(`📊 duplicate globals: ${dupCount} between app.js and js/**/*.js`);
if (topDups.length > 0) {
    console.log(`   top duplicates   : ${topDups.slice(0, 20).join(', ')}${topDups.length > 20 ? '...' : ''}`);
}
ok('duplicate global count measured: ' + dupCount);

// ── 16. Warn if app.js > 800KB ───────────────────────────────────────────────
if (appJsBytes > 800 * 1024) {
    warn('app.js > 800KB (' + appJsSizeKB + ' KB)',
         'app.js đang lớn — cần tiếp tục tách module từng phase nhỏ');
} else {
    ok('app.js size trong giới hạn <= 800KB');
}

// ── 17. Warn if app.js > 13000 lines ────────────────────────────────────────
if (appJsLines > 13000) {
    warn('app.js > 13.000 dòng (' + appJsLines + ')',
         'app.js vượt ngưỡng cảnh báo — theo dõi tiến độ tách module');
} else {
    ok('app.js lines trong giới hạn <= 13.000');
}

// ── 18. Warn if duplicate globals > 180 ─────────────────────────────────────
if (dupCount > 180) {
    warn('duplicate globals > 180 (' + dupCount + ')',
         'Nhiều duplicate globals — ưu tiên tách các module an toàn tiếp theo');
} else {
    ok('duplicate globals trong giới hạn');
}

// ── 19. initSaaSDatabase still in app.js ────────────────────────────────────
check(
    'app.js còn initSaaSDatabase',
    !!(appJs && appJs.includes('initSaaSDatabase')),
    'initSaaSDatabase đã bị xóa khỏi app.js — nguy hiểm!'
);

// ── 20. listenToData still in app.js ────────────────────────────────────────
check(
    'app.js còn listenToData',
    !!(appJs && appJs.includes('listenToData')),
    'listenToData đã bị xóa khỏi app.js — nguy hiểm!'
);

// ── 21. onAuthStateChanged still in app.js ──────────────────────────────────
check(
    'app.js còn onAuthStateChanged',
    !!(appJs && appJs.includes('onAuthStateChanged')),
    'onAuthStateChanged đã bị xóa khỏi app.js — nguy hiểm!'
);

// ── 22. renderApp still in app.js ───────────────────────────────────────────
check(
    'app.js còn renderApp',
    !!(appJs && appJs.includes('renderApp')),
    'renderApp đã bị xóa khỏi app.js — nguy hiểm!'
);

// ── 23. scheduleRender still in app.js or renderInvalidation ────────────────
const renderInvalidation = readFile('js/ui/render/renderInvalidation.js') || '';
check(
    'app.js hoặc renderInvalidation còn scheduleRender',
    !!(appJs && (appJs.includes('scheduleRender') || renderInvalidation.includes('scheduleRender'))),
    'scheduleRender đã bị xóa hoàn toàn — nguy hiểm!'
);

// ── 24. APP_BUILD_VERSION updated to Phase 4K-6F ────────────────────────────
check(
    'main.js APP_BUILD_VERSION có 4K-6F',
    !!(mainJs && (mainJs.includes('4K-6F') || mainJs.includes('4K-6G'))),
    "Cập nhật window.APP_BUILD_VERSION = '4K-6F-legacy-app-kernel-boundary-20260605' hoặc mới hơn trong js/main.js"
);

// ── 25. Cache bust updated to Phase 4K-6F ────────────────────────────────────
check(
    'index.html cache bust có 4K-6F hoặc legacy-app-kernel-boundary',
    !!(indexHtml && (
        indexHtml.includes('4K-6F') ||
        indexHtml.includes('legacy-app-kernel-boundary') ||
        indexHtml.includes('4K-6G') ||
        indexHtml.includes('multiitem-inventory-hydration') ||
        indexHtml.includes('4K-6H') ||
        indexHtml.includes('legacy-render-entrypoint-reduction') ||
        indexHtml.includes('4K-6I') ||
        indexHtml.includes('inline-handler-bridge')
    )),
    'Cập nhật ?v= trong index.html sang legacy-app-kernel-boundary-20260605 hoặc mới hơn'
);

// ── Summary Report ────────────────────────────────────────────────────────────
console.log('\n── App.js Reduction Summary ─────────────────────────────────────────────────');
console.log(`   Size        : ${appJsSizeKB} KB`);
console.log(`   Lines       : ${appJsLines}`);
console.log(`   window.X =  : ${windowAssignCount} assignments`);
console.log(`   Duplicates  : ${dupCount} globals shared with js/**/*.js`);
console.log(`   Risk Level  : ${dupCount > 200 ? 'HIGH' : dupCount > 100 ? 'MEDIUM' : 'LOW'}`);
console.log('─────────────────────────────────────────────────────────────────────────────\n');

if (_failed === 0) {
    console.log(`✅ Tất cả ${_passed} kiểm tra PASS — Phase 4K-6F Legacy App Kernel Boundary OK\n`);
} else {
    console.error(`❌ ${_failed} check(s) failed\n`);
    process.exit(1);
}
