/**
 * tools/check-active-loadmore-single-source.mjs
 * Phase 4K-5Q — verify Active LoadMore Single Source requirements
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

console.log('\n=== check-active-loadmore-single-source ===\n');

const rendererJs = readFile('js/ui/render/computation/studentsRenderer.js');
const appJs      = readFile('app.js');
const studentsJs = readFile('js/modules/students.js');
const mainJs     = readFile('js/main.js');

// 1. studentsRenderer must NOT render load-more-row for activeList (active block)
// Look for the active block specifically
const activeBlockMatch = rendererJs.match(/buildActive[\s\S]{0,500}load-more-row[\s\S]{0,200}activeList/);
if (activeBlockMatch) {
  // Check if it's commented out
  const block = activeBlockMatch[0];
  if (block.trim().startsWith('//') || block.includes('// Phase 4K-5Q: DISABLED')) {
    pass('studentsRenderer active load-more-row is disabled/commented');
  } else {
    fail('studentsRenderer still renders load-more-row for activeList in active block');
  }
} else {
  pass('studentsRenderer does NOT contain active load-more-row block');
}

// 2. app.js legacy must NOT render active load-more row (uncommented)
// Check each line — skip lines that are commented out
const legacyLines = appJs.split('\n');
const uncommentedActiveRow = legacyLines.find(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return false; // commented out — ok
  return /if\(_activeTotalCount > _activeLimit\)\s+activeHtml\s*\+=/.test(trimmed);
});
if (uncommentedActiveRow) {
  fail('app.js legacy still has uncommented active load-more row: ' + uncommentedActiveRow.trim().slice(0, 80));
} else {
  pass('app.js legacy active load-more row is disabled (commented)');
}

// 3. debugActiveLoadMoreSingleSource must exist
if (mainJs.includes('debugActiveLoadMoreSingleSource') || appJs.includes('debugActiveLoadMoreSingleSource')) {
  pass('debugActiveLoadMoreSingleSource defined');
} else {
  fail('debugActiveLoadMoreSingleSource NOT found');
}

// 4. _injectControls renders active load more based on __activeRenderLimit / full profiles
if (studentsJs.includes('__activeRenderLimit') && studentsJs.includes('pgWrap_activeList')) {
  pass('_injectControls uses __activeRenderLimit for active load more');
} else {
  fail('_injectControls does NOT use __activeRenderLimit for active list');
}

// 5. active load more calls loadMoreActiveStudents(event)
if (studentsJs.includes('loadMoreActiveStudents(event)') && studentsJs.includes('pgWrap_activeList')) {
  pass('active load more calls loadMoreActiveStudents(event)');
} else {
  fail('active load more does NOT call loadMoreActiveStudents(event) in _injectControls');
}

// 6. debugRuntimeSmokeTest includes debugActiveLoadMoreSingleSource
if (mainJs.includes('debugActiveLoadMoreSingleSource')) {
  pass('debugRuntimeSmokeTest includes debugActiveLoadMoreSingleSource');
} else {
  fail('debugRuntimeSmokeTest does NOT include debugActiveLoadMoreSingleSource');
}

console.log(`\nResult: ${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures > 0 ? 1 : 0);
