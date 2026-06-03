/**
 * tools/check-login-performance.mjs — Phase 4.0B-4J-8A (Phase 9)
 * ─────────────────────────────────────────────────────────────────────────
 * Kiểm tra source tĩnh: login performance infrastructure + deferred diagnostics.
 *
 * Chạy: node tools/check-login-performance.mjs
 * Hoặc: npm run check:login-performance
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4J-8A — Login Performance Check');
console.log('══════════════════════════════════════════════════════════\n');

const appJs = readFile('app.js');

// ── Section 1: Login Performance Metrics Infrastructure ─────────────────────
console.log('▸ Section 1: Login Performance Metrics Infrastructure (app.js)');
check('app.js exists', !!appJs, 'File not found');
if (appJs) {
    check('__loginPerfMetrics defined', appJs.includes('window.__loginPerfMetrics'), 'Add window.__loginPerfMetrics init block');
    check('markLoginPerf() defined', appJs.includes('function markLoginPerf('), 'Add markLoginPerf() function');
    check('measureLoginPerf() defined', appJs.includes('function measureLoginPerf('), 'Add measureLoginPerf() function');
    check('printLoginPerformance() exposed', appJs.includes('window.printLoginPerformance = function'), 'Add window.printLoginPerformance');
}
console.log();

// ── Section 2: Critical Login Marks ─────────────────────────────────────────
console.log('▸ Section 2: Critical Login Marks');
if (appJs) {
    check('mark: login-submit', appJs.includes("markLoginPerf('login-submit')") || appJs.includes('markLoginPerf("login-submit")'), 'Add markLoginPerf("login-submit") in login submit handler');
    check('mark: firebase-auth-success', appJs.includes("markLoginPerf('firebase-auth-success')") || appJs.includes('markLoginPerf("firebase-auth-success")'), 'Add markLoginPerf("firebase-auth-success") after signInWithEmailAndPassword success');
    check('mark: auth-state-received', appJs.includes("markLoginPerf('auth-state-received')") || appJs.includes('markLoginPerf("auth-state-received")'), 'Add markLoginPerf("auth-state-received") at start of onAuthStateChanged(user) handler');
    check('mark: initSaaSDatabase-start', appJs.includes("markLoginPerf('initSaaSDatabase-start')") || appJs.includes('markLoginPerf("initSaaSDatabase-start")'), 'Add markLoginPerf("initSaaSDatabase-start") at start of initSaaSDatabase()');
    check('mark: context-ready', appJs.includes("markLoginPerf('context-ready')") || appJs.includes('markLoginPerf("context-ready")'), 'Add markLoginPerf("context-ready") in dispatchAppContextReady');
    check('mark: first-ui-shell-visible', appJs.includes("markLoginPerf('first-ui-shell-visible')") || appJs.includes('markLoginPerf("first-ui-shell-visible")'), 'Add markLoginPerf("first-ui-shell-visible") after loginOverlay hide + mainApp show');
    check('mark: first-current-tab-rendered', appJs.includes("markLoginPerf('first-current-tab-rendered')") || appJs.includes('markLoginPerf("first-current-tab-rendered")'), 'Add markLoginPerf("first-current-tab-rendered") after initial tab render');
}
console.log();

// ── Section 3: Deferred Non-Critical Work ───────────────────────────────────
console.log('▸ Section 3: Deferred Non-Critical Work in Login Path');
if (appJs) {
    // runRuntimeDataRecovery must NOT be called synchronously in the login path.
    // "Definition" occurrences = function declaration + JSDoc comment — these are NOT call sites.
    // We detect call sites by looking for patterns like: `runRuntimeDataRecovery(` NOT preceded by
    // "function", "async function", "window.X = ", or " * " (JSDoc).
    const _rcCallSiteRegex = /(?<!function\s)(?<!\*\s{1,10})(?<!window\.\w{1,40}\s=\s(?:async\s)?)runRuntimeDataRecovery\s*\(/g;
    const _rcCallSites = appJs.match(_rcCallSiteRegex) || [];
    if (_rcCallSites.length === 0) {
        check('runRuntimeDataRecovery deferred (setTimeout/idle)', true,
            'Not called inline in login path — correctly deferred by design (only defined on window)');
    } else {
        // There are actual call sites — verify each is inside setTimeout/requestIdleCallback
        const _initSaaSBody = appJs.split('async function initSaaSDatabase')[1] || '';
        const _rcInLogin    = _initSaaSBody.includes('runRuntimeDataRecovery(');
        const _rcDeferred   = !_rcInLogin ||
            ((_initSaaSBody.match(/setTimeout[\s\S]{0,100}runRuntimeDataRecovery/) || []).length > 0) ||
            ((_initSaaSBody.match(/requestIdleCallback[\s\S]{0,100}runRuntimeDataRecovery/) || []).length > 0);
        check('runRuntimeDataRecovery deferred (setTimeout/idle)', _rcDeferred,
            'Wrap runRuntimeDataRecovery in setTimeout(..., 300+) or requestIdleCallback to defer from login critical path');
    }

    // Check _checkMonthlyReminder is deferred (it already uses setTimeout 300ms)
    const _mrDeferred = appJs.includes('setTimeout') && (appJs.includes('_checkMonthlyReminder') && appJs.includes('setTimeout(() => { if(typeof window._checkMonthlyReminder'));
    check('_checkMonthlyReminder deferred', _mrDeferred, 'Wrap _checkMonthlyReminder in setTimeout');

    // Check no heavy export/report in login
    const _loginBlock   = appJs.split('onAuthStateChanged(auth')[1] || '';
    const _loginFirst5k = _loginBlock.slice(0, 5000);
    const _hasHeavyInLogin = _loginFirst5k.includes('fetchAllPagesForExport') || _loginFirst5k.includes('exportExcel');
    check('No heavy export in onAuthStateChanged', !_hasHeavyInLogin, 'Do NOT call export functions inside onAuthStateChanged');
}
console.log();

// ── Section 4: Loading Messages ──────────────────────────────────────────────
console.log('▸ Section 4: Loading Messages');
if (appJs) {
    const _hasLoadMsg = appJs.includes('Đang tải dữ liệu CLB') || appJs.includes('Đang tải danh sách võ sinh');
    check('Has loading progress message', _hasLoadMsg, 'Add loading message: "Đang tải dữ liệu CLB…" or similar in initSaaSDatabase');
}
console.log();

// ── Section 5: Performance Degrade Guards ────────────────────────────────────
console.log('▸ Section 5: No Blocking Sync Loops in Login Path');
if (appJs) {
    // Check initSaaSDatabase doesn't have synchronous heavy loops over all profiles
    const _iSDB = appJs.split('async function initSaaSDatabase')[1] || '';
    const _iSDBFirst = _iSDB.slice(0, 4000);
    const _forEachInLogin = (_iSDBFirst.match(/forEach\s*\(/g) || []).length;
    // forEach is fine for small event setup, just warn if many
    check('initSaaSDatabase has no obvious blocking heavy loop', _forEachInLogin < 15,
        'Check initSaaSDatabase for synchronous heavy loops over allProfiles — should be deferred');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All login performance checks passed!');
    console.log('  Login path có đủ metrics + deferred diagnostics.');
    console.log('══════════════════════════════════════════════════════════\n');
}
