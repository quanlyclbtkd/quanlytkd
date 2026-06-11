#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const failures = [];
const fail = (msg) => failures.push(msg);

const main = read('js/main.js');
const index = read('index.html');
const search = read('js/modules/searchRuntime.js');
const pkg = JSON.parse(read('package.json'));

if (!search.includes('Phase 4K-6K-B: Cross-tab search replay')) fail('searchRuntime.js missing Phase 4K-6K-B marker');
if (!search.includes('window.replaySearchForTab')) fail('Missing window.replaySearchForTab');
if (!search.includes('window.replaySearchForCurrentTab')) fail('Missing window.replaySearchForCurrentTab');
if (!search.includes('window.debugSearchTabReplay')) fail('Missing debugSearchTabReplay');
if (!search.includes('tabSwitchReplays')) fail('Search runtime state must track tabSwitchReplays');
if (!search.includes('forcedReplays')) fail('Search runtime state must track forcedReplays');
if (!search.includes('options.force')) fail('_runSearchLatestOnly must support force option');
if (!search.includes("_runSearchLatestOnly(raw, reason, { force, tab })")) fail('Replay must force _runSearchLatestOnly for selected tab');
if (!search.includes("window.__store._globalSearchTerm = term")) fail('Replay must sync __store._globalSearchTerm');
if (!main.includes('switch-tab-search-replay')) fail('main.js switchTab wrapper must trigger search replay');
if (!main.includes('window.replaySearchForTab(tabId')) fail('main.js must call replaySearchForTab(tabId)');
if (!main.includes('debugSearchTabReplay')) fail('debugRuntimeSmokeTest must include debugSearchTabReplay');
if (!(main.includes("APP_BUILD_VERSION = '4K-6K-B-cross-tab-search-replay-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-C-search-latency-optimization-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-D-multiitem-tuition-package-fix-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-E-unified-student-search-index-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-F-receipt-qr-helper-extraction-20260608'"))) fail('APP_BUILD_VERSION missing 4K-6K-B/6K-C/6K-D/6K-E compatible marker');
if (!(index.includes('main.js?v=cross-tab-search-replay-20260608') || index.includes('main.js?v=search-latency-optimization-20260608') || index.includes('main.js?v=multiitem-tuition-package-fix-20260608') || index.includes('main.js?v=unified-student-search-index-20260608') || index.includes('main.js?v=receipt-qr-helper-extraction-20260608'))) fail('index.html cache bust missing 4K-6K-B/6K-C/6K-D/6K-E compatible marker');
if (!pkg.scripts?.['check:cross-tab-search-replay']) fail('package.json missing check:cross-tab-search-replay');
if (!pkg.scripts?.['check:all']?.includes('check:cross-tab-search-replay')) fail('check:all must include cross-tab search replay check');
if (!pkg.scripts?.['check:all:critical']?.includes('check:cross-tab-search-replay')) fail('check:all:critical must include cross-tab search replay check');

if (failures.length) {
  console.error('Phase 4K-6K-B — Cross-Tab Search Replay Check FAILED');
  failures.forEach(f => console.error('FAIL:', f));
  process.exit(1);
}
console.log('✅ check:cross-tab-search-replay PASS');
