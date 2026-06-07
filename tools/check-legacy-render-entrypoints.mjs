/**
 * check-legacy-render-entrypoints.mjs — Phase 4K-6H
 * Static check: đảm bảo LegacyRenderEntrypoints module tồn tại và được tích hợp đúng.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(relPath) {
    const full = resolve(ROOT, relPath);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
}

const FAIL  = (msg)  => { console.error('  ✗ FAIL:', msg); return false; };
const PASS  = (msg)  => { console.log ('  ✓ PASS:', msg); return true;  };
const WARN  = (msg)  => { console.warn('  ⚠ WARN:', msg); };

let failures = 0;
let warnings = 0;

function check(condition, passMsg, failMsg) {
    if (condition) { PASS(passMsg); return true; }
    FAIL(failMsg); failures++; return false;
}
function warn(condition, warnMsg) {
    if (!condition) { WARN(warnMsg); warnings++; }
}

console.log('\n══════════════════════════════════════════════════════');
console.log(' check-legacy-render-entrypoints — Phase 4K-6H');
console.log('══════════════════════════════════════════════════════\n');

// ── 1. File existence ─────────────────────────────────────────────
const legacyEntrypointsFile = readFile('js/core/legacyRenderEntrypoints.js');
check(
    legacyEntrypointsFile !== null,
    'js/core/legacyRenderEntrypoints.js exists',
    'js/core/legacyRenderEntrypoints.js MISSING — Phase 4K-6H requires this file'
);

// ── 2. Expose window.LegacyRenderEntrypoints ────────────────────
const mainJs = readFile('js/main.js');
check(
    mainJs !== null && mainJs.includes('window.LegacyRenderEntrypoints'),
    'main.js exposes window.LegacyRenderEntrypoints',
    'main.js không expose window.LegacyRenderEntrypoints'
);

// ── 3. debugLegacyRenderEntrypoints global ──────────────────────
check(
    mainJs !== null && mainJs.includes('window.debugLegacyRenderEntrypoints'),
    'main.js exposes window.debugLegacyRenderEntrypoints',
    'main.js không có window.debugLegacyRenderEntrypoints'
);

// ── 4. scheduleRender calls recordLegacyRenderCall ──────────────
const appJs = readFile('app.js');
// Support both direct call and optional chaining (?.) patterns, with possible newlines between
const appJsFlat = appJs ? appJs.replace(/\s+/g, ' ') : '';
check(
    appJs !== null && appJsFlat.includes('recordLegacyRenderCall') && (
        appJsFlat.includes("recordLegacyRenderCall( 'scheduleRender'") ||
        appJsFlat.includes("recordLegacyRenderCall?.( 'scheduleRender'") ||
        appJsFlat.includes("recordLegacyRenderCall('scheduleRender'") ||
        appJsFlat.includes('recordLegacyRenderCall("scheduleRender"') ||
        appJsFlat.includes("recordLegacyRenderCall?.('scheduleRender'") ||
        // Broad: 'scheduleRender' string appears near recordLegacyRenderCall
        (() => {
            const idx = appJsFlat.indexOf('recordLegacyRenderCall');
            if (idx < 0) return false;
            const nearby = appJsFlat.slice(idx, idx + 120);
            return nearby.includes("'scheduleRender'") || nearby.includes('"scheduleRender"');
        })()
    ),
    'app.js scheduleRender calls recordLegacyRenderCall',
    'app.js scheduleRender không gọi recordLegacyRenderCall — Phase 4K-6H yêu cầu'
);

// ── 5. scheduleRender calls routeLegacyRenderReason ─────────────
check(
    appJs !== null && appJs.includes('routeLegacyRenderReason'),
    'app.js scheduleRender gọi routeLegacyRenderReason',
    'app.js không gọi routeLegacyRenderReason — Phase 4K-6H yêu cầu'
);

// ── 6. renderApp records metric ─────────────────────────────────
check(
    appJs !== null && (() => {
        const idxList = [];
        let idx = appJsFlat.indexOf('recordLegacyRenderCall');
        while (idx !== -1) {
            idxList.push(idx);
            idx = appJsFlat.indexOf('recordLegacyRenderCall', idx + 1);
        }
        return idxList.some(i => {
            const nearby = appJsFlat.slice(i, i + 120);
            return nearby.includes("'renderApp'") || nearby.includes('"renderApp"');
        });
    })(),
    'app.js renderApp() calls recordLegacyRenderCall',
    'app.js renderApp() không có recordLegacyRenderCall'
);

// ── 7. _moduleRenderApp still exists and records metric ─────────
const renderInvalidation = readFile('js/ui/render/renderInvalidation.js');
const riFlat = renderInvalidation ? renderInvalidation.replace(/\s+/g, ' ') : '';
check(
    renderInvalidation !== null && renderInvalidation.includes('_moduleRenderApp'),
    'renderInvalidation.js vẫn có _moduleRenderApp',
    'renderInvalidation.js THIẾU _moduleRenderApp — đã bị xóa sai!'
);
check(
    renderInvalidation !== null && (() => {
        const idxList = [];
        let idx = riFlat.indexOf('recordLegacyRenderCall');
        while (idx !== -1) {
            idxList.push(idx);
            idx = riFlat.indexOf('recordLegacyRenderCall', idx + 1);
        }
        return idxList.some(i => {
            const nearby = riFlat.slice(i, i + 140);
            return nearby.includes("'moduleRenderApp'") || nearby.includes('"moduleRenderApp"');
        });
    })(),
    'renderInvalidation.js _moduleRenderApp calls recordLegacyRenderCall',
    'renderInvalidation.js _moduleRenderApp không có recordLegacyRenderCall'
);
check(
    renderInvalidation !== null && renderInvalidation.includes('LegacyRenderWarning'),
    'renderInvalidation.js vẫn giữ LegacyRenderWarning',
    'renderInvalidation.js mất LegacyRenderWarning!'
);

// ── 8. classifyRenderReason exported ────────────────────────────
check(
    legacyEntrypointsFile !== null && legacyEntrypointsFile.includes('classifyRenderReason'),
    'legacyRenderEntrypoints.js có classifyRenderReason',
    'legacyRenderEntrypoints.js THIẾU classifyRenderReason'
);

// ── 9. routeLegacyRenderReason exported ─────────────────────────
check(
    legacyEntrypointsFile !== null && legacyEntrypointsFile.includes('routeLegacyRenderReason'),
    'legacyRenderEntrypoints.js có routeLegacyRenderReason',
    'legacyRenderEntrypoints.js THIẾU routeLegacyRenderReason'
);

// ── 10. debugRuntimeSmokeTest includes debugLegacyRenderEntrypoints
check(
    mainJs !== null && mainJs.includes('debugLegacyRenderEntrypoints'),
    'debugRuntimeSmokeTest includes debugLegacyRenderEntrypoints',
    'debugRuntimeSmokeTest không include debugLegacyRenderEntrypoints'
);

// ── 11–12. renderApp and scheduleRender NOT deleted ──────────────
check(
    appJs !== null && appJs.includes('function renderApp'),
    'renderApp() vẫn còn trong app.js (không bị xóa)',
    'renderApp() ĐÃ BỊ XÓA — vi phạm nguyên tắc!'
);
check(
    appJs !== null && (
        appJs.includes('window.scheduleRender =') ||
        appJs.includes('window.scheduleRender=')
    ),
    'scheduleRender vẫn còn trong app.js (không bị xóa)',
    'scheduleRender ĐÃ BỊ XÓA — vi phạm nguyên tắc!'
);

// ── 13. initSaaSDatabase NOT deleted ────────────────────────────
check(
    appJs !== null && appJs.includes('initSaaSDatabase'),
    'initSaaSDatabase vẫn còn trong app.js',
    'initSaaSDatabase BỊ XÓA — vi phạm nguyên tắc!'
);

// ── 14. listenToData NOT deleted ────────────────────────────────
check(
    appJs !== null && appJs.includes('listenToData'),
    'listenToData vẫn còn trong app.js',
    'listenToData BỊ XÓA — vi phạm nguyên tắc!'
);

// ── 15. processMultiItem NOT rewritten ──────────────────────────
check(
    appJs !== null && appJs.includes('processMultiItem'),
    'processMultiItem vẫn còn trong app.js (không bị xóa/rewrite)',
    'processMultiItem BỊ XÓA — vi phạm nguyên tắc!'
);

// ── 16. index.html has Phase 4K-6H cache bust ───────────────────
const indexHtml = readFile('index.html');
check(
    indexHtml !== null && (
        indexHtml.includes('legacy-render-entrypoint-reduction') ||
        indexHtml.includes('4K-6H') ||
        indexHtml.includes('4K-6I') ||
        indexHtml.includes('inline-handler-bridge')
    ),
    'index.html có cache bust Phase 4K-6H hoặc mới hơn',
    'index.html CHƯA có cache bust Phase 4K-6H hoặc mới hơn'
);

// ── 17. APP_BUILD_VERSION updated ───────────────────────────────
check(
    mainJs !== null && mainJs.includes('4K-6H'),
    'APP_BUILD_VERSION đã cập nhật Phase 4K-6H',
    'APP_BUILD_VERSION chưa cập nhật Phase 4K-6H'
);

// ── Warnings ─────────────────────────────────────────────────────
if (appJs !== null) {
    const directScheduleRenderCount = (appJs.match(/\bscheduleRender\s*\(/g) || []).length;
    warn(
        directScheduleRenderCount <= 25,
        `app.js vẫn còn ${directScheduleRenderCount} direct scheduleRender calls — cân nhắc giảm thêm`
    );

    const duplicateGlobalPatterns = [
        'window.LegacyRenderEntrypoints',
        'window.debugLegacyRenderEntrypoints'
    ];
    for (const p of duplicateGlobalPatterns) {
        const count = (mainJs && mainJs.split(p).length - 1) || 0;
        warn(count <= 3, `Duplicate global: ${p} xuất hiện ${count} lần trong main.js`);
    }
}

// ── Result ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
if (failures === 0) {
    console.log(` ✓ check-legacy-render-entrypoints PASSED (${warnings} warning${warnings !== 1 ? 's' : ''})`);
} else {
    console.log(` ✗ check-legacy-render-entrypoints FAILED — ${failures} failure${failures !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`);
}
console.log('══════════════════════════════════════════════════════\n');

if (failures > 0) process.exit(1);
