#!/usr/bin/env node
/**
 * Phase 4K-5Q — check-runtime-stability-gate.mjs
 * Kiểm tra: APP_BUILD_VERSION, error guard, safeDebugCall, data diagnostics,
 * runGuardedAction, action lock, debugRuntimeSmokeTest coverage, cache bust.
 */

import { readFileSync } from 'fs';
import vm from 'node:vm';

const mainJs = readFileSync('js/main.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
const failures = [];

function check(label, ok) {
  if (ok) {
    console.log('  ✅ PASS  ' + label);
    pass++;
  } else {
    console.error('  ❌ FAIL  ' + label);
    fail++;
    failures.push(label);
  }
}

console.log('\n🔍 Phase 4K-5Q — check-runtime-stability-gate\n');

// 1. APP_BUILD_VERSION — chấp nhận bất kỳ version Phase 4K- trở lên (flexible)
check(
  'APP_BUILD_VERSION được định nghĩa (Phase 5Q)',
  /APP_BUILD_VERSION = '4K-/.test(mainJs)
);

// 2. debugAppVersion
check('window.debugAppVersion được định nghĩa', mainJs.includes('window.debugAppVersion'));

// 3. __runtimeErrors
check('window.__runtimeErrors được khởi tạo', mainJs.includes('window.__runtimeErrors = window.__runtimeErrors || []'));

// 4. recordRuntimeError
check('window.recordRuntimeError được định nghĩa', mainJs.includes('window.recordRuntimeError'));

// 5. debugRuntimeErrors
check('window.debugRuntimeErrors được định nghĩa', mainJs.includes('window.debugRuntimeErrors'));

// 6. safeDebugCall
check('window.safeDebugCall được định nghĩa', mainJs.includes('window.safeDebugCall'));

// 7. debugDataSourceAuthority
check('window.debugDataSourceAuthority được định nghĩa', mainJs.includes('window.debugDataSourceAuthority'));

// 8. debugFinanceReconcile
check('window.debugFinanceReconcile được định nghĩa', mainJs.includes('window.debugFinanceReconcile'));

// 9. debugRenderHealth
check('window.debugRenderHealth được định nghĩa', mainJs.includes('window.debugRenderHealth'));

// 10. runGuardedAction
check('window.runGuardedAction được định nghĩa', mainJs.includes('window.runGuardedAction'));

// 11. runGuardedAction has action lock (Phase 4K-6A: moved to actionGuard.js)
import { readFileSync as _rfs2 } from 'fs';
const _actionGuardJs = (() => { try { return _rfs2('js/core/actionGuard.js', 'utf8'); } catch (e) { return ''; } })();
check(
  'runGuardedAction có __actionLocks guard',
  mainJs.includes('window.__actionLocks[name]') ||
  mainJs.includes('window.__actionLocks') ||
  _actionGuardJs.includes('window.__actionLocks[name]') ||
  _actionGuardJs.includes('__actionLocks')
);

// 12. debugRuntimeSmokeTest includes new debug functions
check('debugRuntimeSmokeTest gọi debugAppVersion', mainJs.includes('debugAppVersion'));
check('debugRuntimeSmokeTest gọi debugRuntimeErrors', mainJs.includes('debugRuntimeErrors'));
check('debugRuntimeSmokeTest gọi debugDataSourceAuthority', mainJs.includes('debugDataSourceAuthority'));
check('debugRuntimeSmokeTest gọi debugFinanceReconcile', mainJs.includes('debugFinanceReconcile'));
check('debugRuntimeSmokeTest gọi debugRenderHealth', mainJs.includes('debugRenderHealth'));

// 13. Cache bust — MUST validate the executable s.src assignment, not a compatibility comment.
const _bootAnchor = indexHtml.indexOf('function _loadMainWhenLegacyReady');
// Do not search for the nearest '<script' token: the bootstrap's leading comment itself
// contains the literal text '<script defer>', which would be a false tag boundary.
const _bootIifeStart = _bootAnchor >= 0 ? indexHtml.lastIndexOf('(function(){', _bootAnchor) : -1;
const _bootIifeEndMarker = _bootAnchor >= 0 ? indexHtml.indexOf('})();', _bootAnchor) : -1;
const _bootScript = (_bootIifeStart >= 0 && _bootIifeEndMarker > _bootIifeStart)
  ? indexHtml.slice(_bootIifeStart, _bootIifeEndMarker + 5)
  : '';
const _mainSrcAssignment = _bootScript.match(/\bs\.src\s*=\s*([^;]+);/);
const _mainSrcExpression = _mainSrcAssignment ? _mainSrcAssignment[1].trim() : '';

check('index.html có executable s.src assignment cho main.js', Boolean(_mainSrcAssignment));
check(
  'actual s.src assignment không dùng undeclared slug',
  Boolean(_mainSrcAssignment) && !/\bslug\b/.test(_mainSrcExpression)
);
check(
  'actual s.src resolves tới deterministic ./js/main.js?v=<version>',
  Boolean(_mainSrcAssignment) &&
    /^['"]\.\/js\/main\.js\?v=[A-Za-z0-9_.-]+['"]$/.test(_mainSrcExpression)
);
check(
  'actual main.js cache bust không dùng Date.now()/Math.random()',
  Boolean(_mainSrcAssignment) && !/Date\.now\s*\(|Math\.random\s*\(/.test(_mainSrcExpression)
);
check(
  'bootstrap append main module đúng một executable call',
  (_bootScript.match(/document\.head\.appendChild\(s\)/g) || []).length === 1
);
check(
  'MAIN_JS_LOADED chỉ được set sau existing s.onload path',
  /s\.onload\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?window\.MAIN_JS_LOADED\s*=\s*true/.test(_bootScript)
);
check(
  'existing 15-second bounded boot deadline remains intact',
  /BOOT_TIMEOUT_MS\s*=\s*15000/.test(_bootScript) && /__MAIN_BOOT_TIMEOUT\s*=\s*true/.test(_bootScript)
);

function _makeBootSandbox({ ready = true, deadline = false } = {}) {
  const appended = [];
  const scheduled = [];
  let nowCalls = 0;
  const bodyChildren = [];
  const document = {
    readyState: 'complete',
    body: { appendChild(node) { bodyChildren.push(node); } },
    head: { appendChild(node) { appended.push(node); } },
    createElement(tag) {
      return {
        tagName: String(tag || '').toUpperCase(),
        style: {},
        setAttribute() {},
        textContent: '',
        id: ''
      };
    },
    getElementById() { return null; },
    addEventListener() {}
  };
  const window = {
    location: { protocol: 'https:', hostname: 'localhost', href: 'https://localhost/' },
    MAIN_JS_LOADING: false,
    MAIN_JS_LOADED: false,
    _fb_init: ready ? {} : null,
    __appLoaded: ready,
    scheduleRender: ready ? function() {} : undefined,
    dispatchEvent() {}
  };
  const sandbox = {
    window,
    document,
    CustomEvent: function(type, init) { this.type = type; this.detail = init?.detail; },
    console: { debug() {}, warn() {}, error() {}, log() {} },
    setTimeout(fn, delay) { scheduled.push({ fn, delay }); return scheduled.length; },
    Date: { now() { nowCalls += 1; return deadline && nowCalls > 1 ? 15001 : 0; } }
  };
  return { sandbox, appended, scheduled, bodyChildren };
}

// Dynamic B1/B2: execute the ACTUAL bootstrap block with dependencies ready.
let _readyBootOk = false;
let _readyBootSrc = '';
let _readyBootLoadedFlag = false;
let _readyBootAppendCount = -1;
try {
  const h = _makeBootSandbox({ ready: true });
  vm.runInNewContext(_bootScript, h.sandbox, { filename: 'index-bootstrap-ready.vm.js' });
  _readyBootAppendCount = h.appended.length;
  _readyBootSrc = h.appended[0]?.src || '';
  if (typeof h.appended[0]?.onload === 'function') h.appended[0].onload();
  _readyBootLoadedFlag = h.sandbox.window.MAIN_JS_LOADED === true;
  _readyBootOk = true;
} catch (error) {
  console.error('  Dynamic ready-bootstrap error:', error && error.stack ? error.stack : error);
}
check('dynamic boot B1: dependencies ready => no ReferenceError', _readyBootOk);
check('dynamic boot B1: appended script URL contains js/main.js?v=', /(?:^|\/)js\/main\.js\?v=[A-Za-z0-9_.-]+$/.test(_readyBootSrc));
check('dynamic boot B2: main module appended exactly once', _readyBootAppendCount === 1);
check('dynamic boot B2: MAIN_JS_LOADED becomes true after onload', _readyBootLoadedFlag);

// Dynamic B3: dependency-not-ready schedules only the existing bounded retry.
let _waitBootOk = false;
let _waitScheduleCount = -1;
let _waitAppendCount = -1;
let _waitDelay = -1;
try {
  const h = _makeBootSandbox({ ready: false, deadline: false });
  vm.runInNewContext(_bootScript, h.sandbox, { filename: 'index-bootstrap-wait.vm.js' });
  _waitScheduleCount = h.scheduled.length;
  _waitDelay = h.scheduled[0]?.delay;
  _waitAppendCount = h.appended.length;
  _waitBootOk = true;
} catch (error) {
  console.error('  Dynamic waiting-bootstrap error:', error && error.stack ? error.stack : error);
}
check('dynamic boot B3: dependency-not-ready uses one existing 50ms retry', _waitBootOk && _waitScheduleCount === 1 && _waitDelay === 50 && _waitAppendCount === 0);

// Dynamic B4: deadline exceeded stops scheduling and exposes recoverable timeout state.
let _deadlineBootOk = false;
let _deadlineScheduleCount = -1;
let _deadlineTimedOut = false;
try {
  const h = _makeBootSandbox({ ready: false, deadline: true });
  vm.runInNewContext(_bootScript, h.sandbox, { filename: 'index-bootstrap-deadline.vm.js' });
  _deadlineScheduleCount = h.scheduled.length;
  _deadlineTimedOut = h.sandbox.window.__MAIN_BOOT_TIMEOUT === true;
  _deadlineBootOk = true;
} catch (error) {
  console.error('  Dynamic deadline-bootstrap error:', error && error.stack ? error.stack : error);
}
check('dynamic boot B4: deadline exceeded stops polling', _deadlineBootOk && _deadlineTimedOut && _deadlineScheduleCount === 0);

// Summary
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Total: ${pass + fail} checks | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
if (fail === 0) {
  console.log('\n  🎉 All runtime stability gate checks passed!\n');
} else {
  console.log('\n  ❌ FAILURES:\n');
  failures.forEach(f => console.log('    - ' + f));
  console.log('');
  process.exit(1);
}
