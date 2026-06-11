#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const search = read('js/modules/searchRuntime.js');
const main = read('js/main.js');
const index = read('index.html');
const failures = [];
const fail = (msg) => failures.push(msg);

if (!search.includes('Phase 4K-6K-C: Adaptive fast search response')) fail('Missing Phase 4K-6K-C marker in searchRuntime.js');
if (!search.includes('fastDebounceMs:') || !search.includes('mediumDebounceMs:')) fail('Missing adaptive debounce state fields');
if (!search.includes('function _getAdaptiveSearchDelay')) fail('Missing _getAdaptiveSearchDelay');
if (!search.includes('_getProfileCount() > 0') && !search.includes('_getProfileCount()')) fail('Search fast path must inspect local profile count');
if (!search.includes('return _state.fastDebounceMs')) fail('Student local search must use fastDebounceMs');
if (!search.includes('_recordScheduledDelay')) fail('Missing scheduled delay metrics');
if (!search.includes('window.debugSearchLatency')) fail('Missing debugSearchLatency');
if (!search.includes('lastScheduledDelay') || !search.includes('fastScheduledCount')) fail('Missing latency metrics in debug state');
if (!search.includes('localStudentRuns++')) fail('Missing local student search run counter');
if (!search.includes('localDebtRuns++')) fail('Missing debt local search counter');
if (!search.includes('debounceMs:         450')) fail('Base debounceMs must remain 450 for server-safe compatibility');
if (!main.includes('debugSearchLatency')) fail('debugRuntimeSmokeTest must include debugSearchLatency');
if (!(main.includes("APP_BUILD_VERSION = '4K-6K-C-search-latency-optimization-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-D-multiitem-tuition-package-fix-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-E-unified-student-search-index-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-F-receipt-qr-helper-extraction-20260608'") || main.includes("APP_BUILD_VERSION = '4K-6K-G-admission-tuition-type-normalization-20260608'"))) fail('APP_BUILD_VERSION not updated to 4K-6K-C/6K-D/6K-E');
if (!(index.includes('main.js?v=search-latency-optimization-20260608') || index.includes('main.js?v=multiitem-tuition-package-fix-20260608') || index.includes('main.js?v=unified-student-search-index-20260608') || index.includes('main.js?v=receipt-qr-helper-extraction-20260608') || index.includes('main.js?v=admission-tuition-type-normalization-20260608'))) fail('index.html cache bust not updated to 4K-6K-C/6K-D/6K-E');
if (!pkg.scripts?.['check:search-latency-optimization']) fail('package.json missing check:search-latency-optimization');
if (!pkg.scripts?.['check:all']?.includes('check:search-latency-optimization')) fail('check:all must include check:search-latency-optimization');
if (!pkg.scripts?.['check:all:critical']?.includes('check:search-latency-optimization')) fail('check:all:critical must include check:search-latency-optimization');

const forbidden = ['processMultiItem', 'quickPay', 'deleteTx', 'markInvPaid', 'handleImportExcel'];
// This phase should not touch business flows; use marker expectations only.
for (const name of forbidden) {
  if (!read('app.js').includes(name)) fail(`Critical legacy function ${name} missing from app.js`);
}

if (failures.length) {
  console.error('Phase 4K-6K-C — Search Latency Optimization Check FAILED');
  failures.forEach(f => console.error('FAIL:', f));
  process.exit(1);
}
console.log('✅ check:search-latency-optimization PASS');
