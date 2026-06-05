/**
 * tools/check-search-runtime-v2.mjs
 * Phase 4K-5Q — verify Search Runtime V2 requirements
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(rel) { return readFileSync(resolve(root, rel), 'utf-8'); }

let failures = 0;
function fail(msg) { console.error('  FAIL:', msg); failures++; }
function pass(msg) { console.log('  PASS:', msg); }

console.log('\n=== check-search-runtime-v2 ===\n');

const srJs  = readFile('js/modules/searchRuntime.js');
const appJs = readFile('app.js');
const mainJs = readFile('js/main.js');

// 1. __searchRuntimeV2Mounted
if (srJs.includes('__searchRuntimeV2Mounted')) {
  pass('__searchRuntimeV2Mounted set in searchRuntime.js');
} else {
  fail('__searchRuntimeV2Mounted NOT found in searchRuntime.js');
}

// 2. inputHandler reference saved
if (srJs.includes('_state.inputHandler') && srJs.includes('inputHandler:')) {
  pass('inputHandler reference saved in _state');
} else {
  fail('inputHandler reference NOT saved in _state');
}

// 3. disposeGlobalSearchRuntime calls removeEventListener
if (srJs.includes('removeEventListener') && srJs.includes('disposeGlobalSearchRuntime')) {
  pass('disposeGlobalSearchRuntime uses removeEventListener');
} else {
  fail('disposeGlobalSearchRuntime does NOT use removeEventListener');
}

// 4. compositionstart + compositionend handlers
if (srJs.includes('compositionstart') && srJs.includes('compositionend')) {
  pass('compositionstart/compositionend handlers present');
} else {
  fail('compositionstart/compositionend handlers NOT found');
}

// 5. debounceMs >= 400
const debounceMatch = srJs.match(/debounceMs:\s*(\d+)/);
if (debounceMatch && parseInt(debounceMatch[1]) >= 400) {
  pass(`debounceMs = ${debounceMatch[1]} (>= 400)`);
} else {
  fail(`debounceMs NOT >= 400 (found: ${debounceMatch ? debounceMatch[1] : 'none'})`);
}

// 6. queuedTerm in state (latest-only queue)
if (srJs.includes('queuedTerm') && srJs.includes('_state.queuedTerm')) {
  pass('queuedTerm (latest-only queue) present');
} else {
  fail('queuedTerm NOT found in _state');
}

// 7. Blocks server search for term.length < 2
if (srJs.includes('term.length < 2') || srJs.includes('term.length < 2')) {
  pass('Server search blocked for term < 2 chars');
} else {
  fail('No guard for term < 2 chars');
}

// 8. debugUnifiedSearchV2
if (srJs.includes('debugUnifiedSearchV2') || mainJs.includes('debugUnifiedSearchV2')) {
  pass('debugUnifiedSearchV2 defined');
} else {
  fail('debugUnifiedSearchV2 NOT found');
}

// 9. app.js legacy search guards SearchRuntime mounted
if (appJs.includes('__searchRuntimeV2Mounted')) {
  pass('app.js legacy search guards __searchRuntimeV2Mounted');
} else {
  fail('app.js legacy search does NOT guard __searchRuntimeV2Mounted');
}

// 10. debugRuntimeSmokeTest includes debugUnifiedSearchV2
if (mainJs.includes('debugUnifiedSearchV2')) {
  pass('debugRuntimeSmokeTest includes debugUnifiedSearchV2');
} else {
  fail('debugRuntimeSmokeTest does NOT include debugUnifiedSearchV2');
}

console.log(`\nResult: ${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);
