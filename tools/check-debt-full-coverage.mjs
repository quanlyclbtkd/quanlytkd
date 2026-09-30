/**
 * check-debt-full-coverage.mjs — Phase 4K-5F
 * Kiểm tra BÁO NỢ dùng full profiles, không chỉ pagination page items.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readFile = (rel) => readFileSync(resolve(root, rel), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅  ${name}`); passed++; }
    else { console.error(`  ❌  ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n[check-debt-full-coverage] Phase 4K-5F\n');

const appJs              = readFile('app.js');
const studentsRenderer   = readFile('js/ui/render/computation/studentsRenderer.js');
const mainJs             = readFile('js/main.js');

// 1. ensureDebtProfilesReady defined
check('ensureDebtProfilesReady defined in app.js',
    appJs.includes('window.ensureDebtProfilesReady'));

// 2. ensureDebtProfilesReady calls loadFullProfilesFallback
check('ensureDebtProfilesReady calls loadFullProfilesFallback',
    appJs.includes('loadFullProfilesFallback') &&
    appJs.includes('ensureDebtProfilesReady'));

// 3. ensureDebtProfilesReady calls refreshListsComputation/invalidateList
check('ensureDebtProfilesReady calls refreshListsComputation',
    appJs.includes('refreshListsComputation') && appJs.includes('debt-tab-open'));

// 4. Tab debt open triggers ensureDebtProfilesReady in main.js
check("main.js switchTab calls ensureDebtProfilesReady on tabId === 'debt'",
    mainJs.includes("tabId === 'debt'") && mainJs.includes('ensureDebtProfilesReady'));

// 5. studentsRenderer stores _lastDebtSourceQuality
check('studentsRenderer stores _lastDebtSourceQuality',
    studentsRenderer.includes('_lastDebtSourceQuality') ||
    studentsRenderer.includes('debtSourceQuality'));

// 6. studentsRenderer warns when debtMayBePartial
check('studentsRenderer warns when debtMayBePartial',
    studentsRenderer.includes('debtMayBePartial') &&
    (studentsRenderer.includes('console.warn') || studentsRenderer.includes('debt-list')));

// 7. studentsRenderer triggers ensureDebtProfilesReady when partial
check('studentsRenderer triggers ensureDebtProfilesReady when debt partial',
    studentsRenderer.includes('ensureDebtProfilesReady'));

// 8. debugDebtCoverage defined
check('debugDebtCoverage defined in app.js',
    appJs.includes('window.debugDebtCoverage'));

// 9. debugDebtCoverage checks profilesCount vs DOM rows
check('debugDebtCoverage checks profilesCount + debtRowsDom',
    appJs.includes('debtRowsDom') && appJs.includes('profilesCount'));

// 10. debugDebtCoverage is async (calls loadFullProfilesFallback or ensureDebt)
check('debugDebtCoverage returns estimatedDebtCount',
    appJs.includes('estimatedDebtCount'));

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
