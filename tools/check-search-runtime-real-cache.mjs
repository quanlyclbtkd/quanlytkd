/**
 * check-search-runtime-real-cache.mjs
 * Phase 4K-2B — Real Search Cache + SearchBlob Renderer Integration
 *
 * Checks:
 *  1. searchRuntime.js  — _cacheKey uses domain prefix  `${domain}:${tab}|...`
 *  2. searchRuntime.js  — invalidateSearchCache uses startsWith(domain+':'), NOT .includes('|')
 *  3. studentsRenderer.js — uses getProfileSearchBlob
 *  4. financeRenderer.js  — uses getTransactionSearchBlob
 *  5. inventoryRenderer.js — uses getInventorySearchBlob
 *  6. students.js — runStudentSearchPagination accepts options / searchToken
 *  7. students.js — _doLoad has stale guard before pgState.currentItems mutation
 *  8. profiles.listeners.js — loadFullProfilesFallback does NOT call _invalidateAll without a guard
 *  9. app.js — legacy renderApp search no longer uses raw .toLowerCase().includes(search)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) throw new Error(`File not found: ${rel}`);
    return fs.readFileSync(full, 'utf8');
}

const results = [];
let passed = 0;
let failed = 0;

function check(id, description, fn) {
    try {
        const ok = fn();
        if (ok) {
            results.push({ id, status: 'PASS', description });
            passed++;
        } else {
            results.push({ id, status: 'FAIL', description });
            failed++;
        }
    } catch (err) {
        results.push({ id, status: 'FAIL', description, error: err.message });
        failed++;
    }
}

// ── Load files ───────────────────────────────────────────────────────────────

const srSrc   = read('js/modules/searchRuntime.js');
const studR   = read('js/ui/render/computation/studentsRenderer.js');
const finR    = read('js/ui/render/computation/financeRenderer.js');
const invR    = read('js/ui/render/computation/inventoryRenderer.js');
const studJs  = read('js/modules/students.js');
const profL   = read('js/listeners/profiles.listeners.js');
const appJs   = read('app.js');

// ── Check 1: Cache key has domain prefix  ${domain}:${tab}|... ──────────────

check('C1', '_cacheKey uses domain prefix `${domain}:${tab}|`', () => {
    // Must have _domainForTab function
    const hasDomainFn = srSrc.includes('function _domainForTab(');
    // _cacheKey must join domain with colon
    const hasDomainPrefix = srSrc.includes('`${domain}:${tab}|') || srSrc.includes("domain + ':' + tab");
    return hasDomainFn && hasDomainPrefix;
});

// ── Check 2: invalidateSearchCache does NOT use k.includes('|') for matching ──

check('C2', 'invalidateSearchCache uses startsWith(domain+":") not k.includes("|")', () => {
    // Must NOT have the old pattern k.includes('|') in the invalidate section
    // Extract just the invalidateSearchCache function body
    const fnStart = srSrc.indexOf('export function invalidateSearchCache(');
    const fnEnd   = srSrc.indexOf('\nexport ', fnStart + 1);
    const fnBody  = fnEnd > 0 ? srSrc.slice(fnStart, fnEnd) : srSrc.slice(fnStart, fnStart + 1500);

    const hasOldPattern = /k\.includes\(['"]?\|['"]?\)/.test(fnBody);
    // Check for: k.startsWith(domain + ':') pattern
    const hasNewPattern = fnBody.includes("startsWith(domain + ':')")
        || fnBody.includes('startsWith(domain + ":")');
    return !hasOldPattern && hasNewPattern;
});

// ── Check 3: studentsRenderer uses getProfileSearchBlob ─────────────────────

check('C3', 'studentsRenderer.js uses getProfileSearchBlob', () => {
    return studR.includes('window.getProfileSearchBlob') &&
           studR.includes('getProfileSearchBlob(name, p)');
});

// ── Check 4: financeRenderer uses getTransactionSearchBlob ──────────────────

check('C4', 'financeRenderer.js uses getTransactionSearchBlob', () => {
    return finR.includes('window.getTransactionSearchBlob') &&
           finR.includes('getTransactionSearchBlob(t)');
});

// ── Check 5: inventoryRenderer uses getInventorySearchBlob ──────────────────

check('C5', 'inventoryRenderer.js uses getInventorySearchBlob', () => {
    return invR.includes('window.getInventorySearchBlob') &&
           invR.includes('getInventorySearchBlob(t)');
});

// ── Check 6: students.js runStudentSearchPagination accepts options/searchToken ──

check('C6', 'students.js runStudentSearchPagination accepts options/searchToken', () => {
    // runStudentSearchPagination must have options = {} param
    const fnMatch = studJs.match(/runStudentSearchPagination\s*=\s*async\s*function\s*\([^)]*\)/);
    if (!fnMatch) return false;
    const sig = fnMatch[0];
    const hasOptions = sig.includes('options') || sig.includes('searchToken');
    // Also must pass options to _doLoad
    const passesOptions = studJs.includes('_doLoad(null, \'first\', searchTerm, options)') ||
                          studJs.includes('_doLoad(null, "first", searchTerm, options)');
    return hasOptions && passesOptions;
});

// ── Check 7: students.js _doLoad has stale guard BEFORE pgState.currentItems ──

check('C7', 'students.js _doLoad has stale guard before pgState.currentItems mutation', () => {
    // Must have _isStaleSearch function defined inside _doLoad
    const hasIsStale = studJs.includes('function _isStaleSearch()') ||
                       studJs.includes('_isStaleSearch =');
    // Must use it before pgState.currentItems
    const hasStaleCheck = studJs.includes('_isStaleSearch()') &&
                          studJs.includes('stale: true, items: []');
    // The stale check must appear BEFORE pgState.currentItems = _sr.items in source order
    const staleIdx   = studJs.indexOf('if (_isStaleSearch())');
    const mutateIdx  = studJs.indexOf('pgState.currentItems = _sr.items');
    const orderOk    = staleIdx > 0 && mutateIdx > 0 && staleIdx < mutateIdx;
    return hasIsStale && hasStaleCheck && orderOk;
});

// ── Check 8: profiles.listeners.js loadFullProfilesFallback has guard around _invalidateAll ──

check('C8', 'profiles.listeners.js _invalidateAll is guarded (not default-called)', () => {
    // Extract the invalidation block that was changed — look at a 2500-char window around
    // the tab-aware section we wrote, starting from the refreshListsComputation+tab-aware area
    const tabAwareIdx = profL.indexOf('full-profiles-fallback-tab-aware');
    if (tabAwareIdx < 0) return false;
    // Check a window around the changed area (1000 chars before, 1500 after)
    const windowStart = Math.max(0, tabAwareIdx - 1000);
    const windowEnd   = tabAwareIdx + 1500;
    const fnBody      = profL.slice(windowStart, windowEnd);

    // Should have tab-aware logic
    const hasTabAware = fnBody.includes('getCurrentActiveTabId') &&
                        fnBody.includes("'students.activeList'");

    // In this window: any non-comment _invalidateAll( call MUST be inside an else block
    const lines = fnBody.split('\n');
    let allGuarded = true;
    let inElse = false;
    for (const line of lines) {
        const trimmed = line.trim();
        // Track else blocks
        if (trimmed.startsWith('} else {') || trimmed === 'else {') inElse = true;
        // Closing brace exits else
        if (trimmed === '}' && inElse) inElse = false;
        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        // If line contains _invalidateAll( and it's NOT in an else block
        if (trimmed.includes('_invalidateAll(') && !inElse) {
            allGuarded = false;
        }
    }

    return hasTabAware && allGuarded;
});

// ── Check 9: app.js legacy renderApp no longer uses raw .toLowerCase().includes(search) ──

check('C9', 'app.js renderApp no longer uses raw .toLowerCase().includes(search)', () => {
    // Extract renderApp function body only
    const fnMatch = /function\s+renderApp\s*\([^)]*\)\s*\{/.exec(appJs);
    const fnStart = fnMatch ? fnMatch.index : -1;
    // Look at a window containing the legacy search loops.
    const fnBody  = fnStart >= 0 ? appJs.slice(fnStart, fnStart + 9000) : '';

    // Patterns we do NOT want
    const badPatterns = [
        /\.toLowerCase\(\)\.includes\(search\)/,
        /value\.toLowerCase\(\)\.trim\(\)\s*:\s*''/,
    ];
    const hasBadPattern = badPatterns.some(re => re.test(fnBody));
    // Must have _legacyNormalizeSearch used
    const hasNewPattern = fnBody.includes('_legacyNormalizeSearch(');
    return !hasBadPattern && hasNewPattern;
});

// ── Phase 4K-2C checks ───────────────────────────────────────────────────────

// ── Check 10: searchRuntime.js passes searchToken to runStudentSearchPagination ──

check('C10', 'searchRuntime.js passes searchToken to runStudentSearchPagination', () => {
    // Must NOT have the bare call without options
    const bareCall = /runStudentSearchPagination\s*\(\s*term\s*\)/.test(srSrc);
    // Must have call with token
    const armedCall = srSrc.includes('runStudentSearchPagination(term, { searchToken:') ||
                      srSrc.includes('runStudentSearchPagination(term, {searchToken:');
    return !bareCall && armedCall;
});

// ── Check 11: invalidateSearchCacheForCurrentTab uses domain:tab| prefix ─────

check('C11', 'invalidateSearchCacheForCurrentTab uses domain:tab| prefix (not curTab+"|")', () => {
    // Find the function body
    const fnStart = srSrc.indexOf('invalidateSearchCacheForCurrentTab = function(');
    const fnEnd   = srSrc.indexOf('\n    };', fnStart);
    const fnBody  = fnEnd > 0 ? srSrc.slice(fnStart, fnEnd) : srSrc.slice(fnStart, fnStart + 800);

    // Old pattern: k.startsWith(curTab + '|')  — curTab directly joined with | (no domain prefix)
    // New pattern: domain + ':' + curTab + '|'  — domain prefix present
    // Use regex to avoid "curTab + '|'" matching as a substring inside the new pattern
    const hasOldPattern = /startsWith\s*\(\s*curTab\s*\+\s*['"][\|]/.test(fnBody);
    const hasNewPattern = fnBody.includes("domain + ':' + curTab + '|'") ||
                          fnBody.includes('domain + ":" + curTab + "|"') ||
                          /`\$\{domain\}:\$\{curTab\}\|/.test(fnBody);
    return !hasOldPattern && hasNewPattern;
});

// ── Check 12: _applyCachedStudentResult accepts tab and uses quitList ─────────

check('C12', '_applyCachedStudentResult accepts tab param and uses students.quitList', () => {
    // Signature must include tab param
    const sigMatch = srSrc.match(/function _applyCachedStudentResult\s*\(([^)]*)\)/);
    if (!sigMatch) return false;
    const hasTabParam = sigMatch[1].includes('tab');
    // Must use quitList
    const hasQuitList = srSrc.includes("'students.quitList'") || srSrc.includes('"students.quitList"');
    // listKey usage
    const hasListKey  = srSrc.includes('listKey') && srSrc.includes("tab === 'quit'");
    return hasTabParam && hasQuitList && hasListKey;
});

// ── Check 13: students.js _searchToken is extracted BEFORE isLoading check ───

check('C13', 'students.js _searchToken is extracted BEFORE the isLoading guard', () => {
    // Find _doLoad function body
    const fnStart  = studJs.indexOf('async function _doLoad(');
    const fnBody   = studJs.slice(fnStart, fnStart + 600);
    const tokenIdx   = fnBody.indexOf('const _searchToken =');
    const loadingIdx = fnBody.indexOf('pgState.isLoading');
    return tokenIdx > 0 && loadingIdx > 0 && tokenIdx < loadingIdx;
});

// ── Check 14: app.js no longer has raw .toLowerCase().includes(search) in the profile loop ──

check('C14', 'app.js profile loop no longer has raw name/safeBelt/safeNotes toLowerCase().includes(search)', () => {
    // Check around line 6037 — look in a 500-char window after matchesSearch declaration
    const matchIdx = appJs.indexOf('let matchesSearch = true');
    if (matchIdx < 0) return false;
    const window500 = appJs.slice(matchIdx, matchIdx + 500);
    const hasBadBelt  = /safeBelt\.toLowerCase\(\)\.includes\(search\)/.test(window500);
    const hasBadName  = /\bname\.toLowerCase\(\)\.includes\(search\)/.test(window500);
    const hasBadNotes = /safeNotes\.toLowerCase\(\)\.includes\(search\)/.test(window500);
    const hasNewStyle = window500.includes('_legacyNormalizeSearch(name)') ||
                        window500.includes('_legacyNormalizeSearch(safeBelt)');
    return !hasBadBelt && !hasBadName && !hasBadNotes && hasNewStyle;
});

// ── Report ───────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  check:search-runtime-real-cache  (Phase 4K-2B/2C)');
console.log('══════════════════════════════════════════════════════════');

for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon}  [${r.id}] ${r.description}`);
    if (r.error) console.log(`         Error: ${r.error}`);
}

console.log('──────────────────────────────────────────────────────────');
console.log(`  Passed: ${passed}/${results.length}    Failed: ${failed}/${results.length}`);
console.log('══════════════════════════════════════════════════════════\n');

if (failed > 0) {
    process.exit(1);
}
