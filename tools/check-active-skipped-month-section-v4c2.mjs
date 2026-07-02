/**
 * check-active-skipped-month-section-v4c2.mjs
 * Phase 4K-6V4D1A — Restore Active-tab skipped-month section runtime recovery.
 *
 * Guards against regressions where "Báo nghỉ tháng" is hidden because code uses
 * raw p.status === 'active' or raw skippedMonths.includes(selMonth).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = rel => readFileSync(resolve(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n🔍 Phase 4K-6V4D1A — Active skipped-month section checks\n');

const render = read('js/ui/render.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const students = read('js/modules/students.js');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = read('package.json');

const acceptedBuilds = [
  'coach-attendance-toggle-queue-fix-20260701-v5c',
  'coach-reminder-attendance-stability-20260701-v5b',
  'profile-canonical-store-runtime-recovery-20260628-v4d1a'
];

check('index.html cache-busts app.js/main.js to active skipped month compatible build',
  acceptedBuilds.some(build => index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`)));
check('main.js APP_PATCH_VERSION markers include V4D1 lineage',
  main.includes("APP_BUILD_VERSION = '4K-6V4D1A-profile-canonical-store-runtime-recovery-20260628'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V4D1A-profile-canonical-store-runtime-recovery-20260628'") ||
  main.includes("APP_BUILD_VERSION = '4K-6V4D1-profile-canonical-store-readonly-audit-20260628'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V4D1-profile-canonical-store-readonly-audit-20260628'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V5B-coach-reminder-attendance-stability-20260701'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V5C-coach-attendance-toggle-queue-fix-20260701'"));
check('render.js exposes updateSkippedMonthSection global',
  render.includes('window.updateSkippedMonthSection') && render.includes('_renderSkippedMonthSection'));
check('render.js skipped section uses canonical helper, not raw status/includes',
  render.includes('_getSkippedMonthNames') &&
  render.includes('_normalizeSkippedMonthValue') &&
  !render.includes("return pr.status === 'active' && pr.skippedMonths && pr.skippedMonths.includes(selMonth)"));
check('render.js handles tab/month-only render calls when dataVersion unchanged',
  render.includes('_refreshSmallStudentUi(earlyTabId') && render.includes('_renderSkippedMonthSection(_profilesForSmallUi(), fmEl ? fmEl.value : \'\')'));
check('studentsRenderer summary normalizes skippedMonths for m_skipped',
  renderer.includes('_monthList(p.skippedMonths).includes(normalizeYYYYMM(selMonth))'));
check('legacy app.js uses _legacySkippedNamesForMonth for skipped section',
  app.includes('function _legacySkippedNamesForMonth') && app.includes('const skippedNames = _legacySkippedNamesForMonth(allProfiles, selMonth);'));
check('legacy app.js m_skipped uses canonical month compare',
  app.includes('_legacyHasSkippedMonth(p, selMonth)'));
check('syncStudentSkippedMonthLocal refreshes activeList and debtList',
  students.includes("['students.activeList', 'students.debtList', 'dashboard.summary']"));
check('syncStudentSkippedMonthLocal updates skipped section immediately',
  students.includes('window.updateSkippedMonthSection(window.__store.profiles, month)'));
check('package.json includes active skipped section gate in npm check',
  pkg.includes('check:active-skipped-month-section') && pkg.includes('check-active-skipped-month-section-v4c2.mjs'));

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
