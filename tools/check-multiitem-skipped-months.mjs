/**
 * check-multiitem-skipped-months.mjs
 * Phase 4K-5M — verify skippedMonths integration in multi-item fee flow.
 * 10 checks covering: helper existence, badge logic, data-months wiring,
 * processMultiItem filtering, labels, debug tool, and studentsRenderer bridge.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function read(rel) {
    return readFileSync(resolve(root, rel), 'utf8');
}

let passed = 0;
let failed = 0;

function check(name, fn) {
    try {
        const result = fn();
        if (result === true) {
            console.log(`  ✅ PASS — ${name}`);
            passed++;
        } else {
            const reason = typeof result === 'string' ? result : 'assertion returned false';
            console.error(`  ❌ FAIL — ${name}: ${reason}`);
            failed++;
        }
    } catch (e) {
        console.error(`  ❌ FAIL — ${name}: ${e.message}`);
        failed++;
    }
}

console.log('\n🔍 check:multiitem-skipped-months — Phase 4K-5M\n');

const appJs = read('app.js');
const studentsRenderer = read('js/ui/render/computation/studentsRenderer.js');

// ── 1. window.getChargeableTuitionMonths exists ─────────────────────────────
check(
    'window.getChargeableTuitionMonths is defined as a global helper in app.js',
    () => {
        if (!appJs.includes('window.getChargeableTuitionMonths')) return 'window.getChargeableTuitionMonths not found in app.js';
        if (!appJs.includes('window.getChargeableTuitionMonths = function')) return 'window.getChargeableTuitionMonths must be assigned as a function';
        return true;
    }
);

// ── 2. _refreshMiHistoryBadges uses getChargeableTuitionMonths ──────────────
check(
    '_refreshMiHistoryBadges calls window.getChargeableTuitionMonths (not raw while loop)',
    () => {
        const fnStart = appJs.indexOf('window._refreshMiHistoryBadges');
        if (fnStart < 0) return 'window._refreshMiHistoryBadges not found';
        const fnEnd = appJs.indexOf('window.recalcMiInvDebt', fnStart);
        if (fnEnd < 0) return 'could not find end of _refreshMiHistoryBadges';
        const block = appJs.slice(fnStart, fnEnd);
        if (!block.includes('window.getChargeableTuitionMonths')) {
            return '_refreshMiHistoryBadges does not call window.getChargeableTuitionMonths';
        }
        return true;
    }
);

// ── 3. No raw unchecked while-loop for unpaid months in _refreshMiHistoryBadges
check(
    '_refreshMiHistoryBadges has no bare while(cur <= today) loop without skippedMonths guard',
    () => {
        const fnStart = appJs.indexOf('window._refreshMiHistoryBadges');
        if (fnStart < 0) return 'window._refreshMiHistoryBadges not found';
        const fnEnd = appJs.indexOf('window.recalcMiInvDebt', fnStart);
        const block = appJs.slice(fnStart, fnEnd);
        // The old raw loop: while (cur <= today) { unpaid++; debtList.push
        if (block.includes('while (cur <= today) { unpaid++')) {
            return 'bare while(cur <= today) loop without skippedMonths guard still present';
        }
        return true;
    }
);

// ── 4. _refreshMiHistoryBadges sets data-months on pkgSelect ────────────────
check(
    '_refreshMiHistoryBadges sets data-months attribute on pkgSelect with chargeable months',
    () => {
        const fnStart = appJs.indexOf('window._refreshMiHistoryBadges');
        if (fnStart < 0) return 'window._refreshMiHistoryBadges not found';
        const fnEnd = appJs.indexOf('window.recalcMiInvDebt', fnStart);
        const block = appJs.slice(fnStart, fnEnd);
        if (!block.includes("setAttribute('data-months'") && !block.includes('setAttribute("data-months"')) {
            return 'pkgSelect.setAttribute("data-months", ...) not found in _refreshMiHistoryBadges';
        }
        return true;
    }
);

// ── 5. updateMultiItemAutoFee reads data-months to derive pkg count ──────────
check(
    'updateMultiItemAutoFee reads data-months attribute to compute pkg count',
    () => {
        // Find the function DEFINITION (assignment), not a reference/call
        const defToken = 'window.updateMultiItemAutoFee =';
        const fnStart = appJs.indexOf(defToken);
        if (fnStart < 0) return 'window.updateMultiItemAutoFee definition not found';
        // Grab a generous slice — the function is typically <150 lines
        const block = appJs.slice(fnStart, fnStart + 3000);
        if (!block.includes("getAttribute('data-months')") && !block.includes('getAttribute("data-months")')) {
            return 'updateMultiItemAutoFee does not read data-months attribute from pkgSelect';
        }
        if (!block.includes('chargeMonths.length')) {
            return 'updateMultiItemAutoFee does not derive pkg from chargeMonths.length';
        }
        return true;
    }
);

// ── 6. processMultiItem reads data-months from pkgSelect ────────────────────
check(
    'processMultiItem reads data-months attribute from mi_tuition_pkg select',
    () => {
        const fnStart = appJs.indexOf('window.processMultiItem');
        if (fnStart < 0) return 'window.processMultiItem not found';
        const fnEnd = appJs.indexOf('\nwindow.', fnStart + 100);
        const block = fnEnd > fnStart ? appJs.slice(fnStart, fnEnd) : appJs.slice(fnStart, fnStart + 5000);
        if (!block.includes("getAttribute('data-months')") && !block.includes('getAttribute("data-months")')) {
            return 'processMultiItem does not read data-months attribute';
        }
        return true;
    }
);

// ── 7. processMultiItem filters skippedMonths in fallback path ───────────────
check(
    'processMultiItem filters skippedMonths in fallback packageMonths computation',
    () => {
        const fnStart = appJs.indexOf('window.processMultiItem');
        if (fnStart < 0) return 'window.processMultiItem not found';
        const fnEnd = appJs.indexOf('\nwindow.', fnStart + 100);
        const block = fnEnd > fnStart ? appJs.slice(fnStart, fnEnd) : appJs.slice(fnStart, fnStart + 5000);
        if (!block.includes('skippedMonths') && !block.includes('_skipped')) {
            return 'processMultiItem has no skippedMonths filter in fallback path';
        }
        return true;
    }
);

// ── 8. Tuition label uses formatTuitionMonthList ─────────────────────────────
check(
    'breakdown and _tuitionLabel use window.formatTuitionMonthList for month formatting',
    () => {
        const fnStart = appJs.indexOf('window.processMultiItem');
        if (fnStart < 0) return 'window.processMultiItem not found';
        const fnEnd = appJs.indexOf('\nwindow.', fnStart + 100);
        const block = fnEnd > fnStart ? appJs.slice(fnStart, fnEnd) : appJs.slice(fnStart, fnStart + 5000);
        if (!block.includes('formatTuitionMonthList')) {
            return 'processMultiItem does not reference window.formatTuitionMonthList for tuition labels';
        }
        return true;
    }
);

// ── 9. window.debugMultiItemSkippedMonth is defined ─────────────────────────
check(
    'window.debugMultiItemSkippedMonth debug helper is defined in app.js',
    () => {
        if (!appJs.includes('window.debugMultiItemSkippedMonth')) return 'window.debugMultiItemSkippedMonth not found';
        if (!appJs.includes('window.debugMultiItemSkippedMonth = function')) return 'must be assigned as a function';
        return true;
    }
);

// ── 10. studentsRenderer uses getChargeableTuitionMonths or equivalent ───────
check(
    'studentsRenderer debt loop uses window.getChargeableTuitionMonths or an equivalent skippedMonths guard',
    () => {
        if (studentsRenderer.includes('window.getChargeableTuitionMonths')) return true;
        // Fallback: still acceptable if it explicitly checks skippedMonths inside the loop
        if (studentsRenderer.includes('skippedMonths') && studentsRenderer.includes('while')) return true;
        return 'studentsRenderer debt computation neither uses getChargeableTuitionMonths nor has its own skippedMonths guard';
    }
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
    process.exit(1);
}
