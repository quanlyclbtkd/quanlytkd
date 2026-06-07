// tools/check-superadmin-aggregation-hard-stop.mjs — Phase 4K-6I-C
import { readFileSync } from 'fs';

let passes = 0, failures = 0;
function check(cond, pass, fail) {
  if (cond) { console.log('  ✓ PASS:', pass); passes++; }
  else { console.log('  ✗ FAIL:', fail); failures++; }
}
function readFile(p) {
  const path = new URL('../' + p, import.meta.url).pathname;
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

console.log('══════════════════════════════════════════════════════');
console.log(' check-superadmin-aggregation-hard-stop — Phase 4K-6I-C');
console.log('══════════════════════════════════════════════════════');
console.log();

const guard = readFile('js/core/superAdminQuotaGuard.js');
const sa = readFile('js/modules/superadmin.js');
const main = readFile('js/main.js');
const index = readFile('index.html');
const pkg = readFile('package.json');

check(sa && sa.includes('debugSuperAdminAggregationHardStop'), 'debugSuperAdminAggregationHardStop defined', 'missing debugSuperAdminAggregationHardStop');
check(sa && sa.includes('window.__saDisableBackgroundCountRefresh = true'), '__saDisableBackgroundCountRefresh defaults true', 'background count refresh is not disabled by default');
check(sa && sa.includes('window.__saAggregationHardStop = true'), '__saAggregationHardStop defaults true', 'hard-stop flag missing');
check(sa && sa.includes('throw _e') && sa.includes('__superAdminQuotaError'), 'countDocs throws quota/resource-exhausted/429 errors', 'countDocs still may swallow quota errors');
check(!(sa && /console\.warn\('\[Phase 4K-FIX\] getCountFromServer failed:[\s\S]{0,120}return null/.test(sa)), 'old countDocs return-null quota pattern removed', 'old countDocs still catches getCountFromServer and returns null');
check(guard && guard.includes('invalid-count-result') && guard.includes('Number.isFinite(Number(result.count))'), 'runThrottledCount treats null/{ok:false} as failure', 'runThrottledCount may still mark invalid/null count as success');
check(guard && guard.includes('MAX_QUOTA_FAILURES_BEFORE_OPEN = 1') && guard.includes('15 * 60 * 1000'), 'quota circuit opens after first quota error for >=15 minutes', 'quota circuit threshold/duration not strict enough');
check(sa && sa.includes('countRefreshQueue stopped') && sa.includes('_saCountRefreshQueue.length = 0'), 'count refresh queue clears/stops when circuit opens', 'count refresh queue may continue after circuit opens');
check(sa && sa.includes('queueSuperAdminCountRefresh(cid, data, { manual: false })'), 'dashboard load does not directly refresh counts; auto queue guarded by disabled flag', 'dashboard load may still refresh counts without hard-stop guard');
check(sa && sa.includes('refreshSuperAdminCountsForClub') && sa.includes('{ manual: true }'), 'manual per-club refresh function exists', 'manual per-club refresh function missing');
check(sa && !/Promise\.all\(\s*\[[\s\S]{0,250}countDocs[\s\S]{0,250}countDocs[\s\S]{0,250}countDocs[\s\S]{0,250}countDocs/.test(sa), 'no Promise.all aggregation storm', 'Promise.all countDocs aggregation storm still exists');
check((sa && sa.includes("'--'")) || (sa && sa.includes('>--<')) || (sa && sa.includes('cached-only')), 'UI has -- / cached-only fallback for missing counts', 'UI fallback for missing counts not found');
check(main && main.includes('debugSuperAdminAggregationHardStop'), 'debugRuntimeSmokeTest includes debugSuperAdminAggregationHardStop', 'runtime smoke test missing debugSuperAdminAggregationHardStop');
check(main && main.includes('4K-6I-C-superadmin-aggregation-hard-stop'), 'APP_BUILD_VERSION updated to 4K-6I-C', 'APP_BUILD_VERSION not updated to 4K-6I-C');
check(index && index.includes('superadmin-aggregation-hard-stop-20260607'), 'index.html cache bust updated to 4K-6I-C', 'index.html cache bust not updated to 4K-6I-C');
check(pkg && pkg.includes('check:superadmin-aggregation-hard-stop'), 'package.json includes check:superadmin-aggregation-hard-stop', 'package.json missing check:superadmin-aggregation-hard-stop');

console.log();
console.log('══════════════════════════════════════════════════════');
if (failures === 0) {
  console.log(' ✓ check-superadmin-aggregation-hard-stop PASSED');
} else {
  console.log(` ✗ check-superadmin-aggregation-hard-stop FAILED — ${failures} failure${failures !== 1 ? 's' : ''}`);
  process.exit(1);
}
console.log('══════════════════════════════════════════════════════');
