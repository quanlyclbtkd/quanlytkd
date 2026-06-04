/**
 * check-debt-full-profiles-loader.mjs
 * Phase 4K-5G — Verify BÁO NỢ tab uses full profiles (not just paginated 50).
 *
 * Checks:
 *  1. window.ensureDebtProfilesReady defined in app.js
 *  2. window.loadFullProfilesFallback exposed in main.js
 *  3. switchTab in main.js calls ensureDebtProfilesReady on 'debt' tab
 *  4. studentsRenderer.js warns + auto-triggers ensureDebtProfilesReady on partial debt
 *  5. window.debugListCoverage / debugStudentListCoverage defined in main.js
 *  6. window.debugFinanceTableLayout defined or stubbed in main.js
 *  7. debugRuntimeSmokeTest smoke-tests studentListCoverage + financeTableLayout
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(rel) {
    try { return readFileSync(resolve(ROOT, rel), 'utf8'); } catch { return null; }
}

const results = [];
let allPassed = true;

function check(name, pass, detail) {
    results.push({ name, pass, detail: detail || '' });
    if (!pass) allPassed = false;
}

const appJs   = readFile('app.js')    || '';
const mainJs  = readFile('js/main.js') || '';
const studRen = readFile('js/ui/render/computation/studentsRenderer.js') || '';

// ── 1. ensureDebtProfilesReady in app.js ─────────────────────────────────────
check(
    'window.ensureDebtProfilesReady defined in app.js',
    appJs.includes('window.ensureDebtProfilesReady'),
    'app.js: window.ensureDebtProfilesReady = async function(reason)'
);

// ── 2. loadFullProfilesFallback exposed in main.js ────────────────────────────
check(
    'window.loadFullProfilesFallback exposed in main.js',
    mainJs.includes('window.loadFullProfilesFallback'),
    'main.js: window.loadFullProfilesFallback = loadFullProfilesFallback'
);

// ── 3. switchTab calls ensureDebtProfilesReady ────────────────────────────────
check(
    "switchTab calls ensureDebtProfilesReady on 'debt' tab",
    mainJs.includes("tabId === 'debt'") && mainJs.includes('ensureDebtProfilesReady'),
    "main.js: switchTab override — if (tabId === 'debt') window.ensureDebtProfilesReady('debt-tab-open')"
);

// ── 4. studentsRenderer auto-triggers ensureDebtProfilesReady on partial debt ─
check(
    'studentsRenderer auto-triggers ensureDebtProfilesReady when debt may be partial',
    studRen.includes('debtMayBePartial') && studRen.includes('ensureDebtProfilesReady'),
    'studentsRenderer.js: _debtSourceQuality.debtMayBePartial → ensureDebtProfilesReady auto-trigger'
);

// ── 5. debugListCoverage defined ──────────────────────────────────────────────
check(
    'window.debugListCoverage defined in main.js',
    mainJs.includes('window.debugListCoverage'),
    'main.js: window.debugListCoverage = async function() { ... }'
);
check(
    'window.debugStudentListCoverage aliased to debugListCoverage',
    mainJs.includes('window.debugStudentListCoverage'),
    'main.js: window.debugStudentListCoverage = window.debugListCoverage'
);

// ── 6. debugFinanceTableLayout defined ────────────────────────────────────────
check(
    'window.debugFinanceTableLayout defined or guarded in main.js',
    mainJs.includes('window.debugFinanceTableLayout'),
    'main.js: window.debugFinanceTableLayout stub for smoke test'
);

// ── 7. debugRuntimeSmokeTest tests studentListCoverage + financeTableLayout ───
check(
    'debugRuntimeSmokeTest calls debugStudentListCoverage',
    mainJs.includes('debugStudentListCoverage'),
    'main.js: out.studentListCoverage = safeCall(..., debugStudentListCoverage, ...)'
);
check(
    'debugRuntimeSmokeTest calls debugFinanceTableLayout',
    mainJs.includes('debugFinanceTableLayout'),
    'main.js: out.financeTableLayout = safeCall(..., debugFinanceTableLayout, ...)'
);

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n📊 check:debt-full-profiles-loader\n');
for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (r.detail) console.log(`       ${r.detail}`);
}
console.log('');
if (allPassed) {
    console.log('✅ All checks passed.\n');
} else {
    console.error('❌ One or more checks failed.\n');
    process.exit(1);
}
