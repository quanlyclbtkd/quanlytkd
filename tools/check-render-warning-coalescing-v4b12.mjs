#!/usr/bin/env node
/** Phase 4K-6V4B12 — Render Warning Coalescing + Production Console Safety */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const studentsRenderer = read('js/ui/render/computation/studentsRenderer.js');
const listRefresh = read('js/ui/render/listComputationRefresh.js');
const renderInvalidation = read('js/ui/render/renderInvalidation.js');
const renderJs = read('js/ui/render.js');
const renderStudents = read('js/ui/render/renderStudents.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name + (detail ? ' — ' + detail : '')); }
}

console.log('\n=== Phase 4K-6V4B12 — Render Warning Coalescing ===\n');
const build = 'coach-attendance-root-cause-recovery-20260630-v4d6';
const appBuilds = [build, 'profile-canonical-store-runtime-recovery-20260628-v4d1a', 'profile-canonical-store-20260628-v4d1', 'tuition-debt-source-of-truth-20260628-v4c'];

check('index cache-busts app.js/main.js to current render-safe build',
  appBuilds.some(b => index.includes(`app.js?v=${b}`)) && index.includes(`main.js?v=${build}`));
check('main imports changed render/list/student modules with current cache-bust',
  main.includes(`./ui/render.js?v=${build}`) &&
  main.includes(`./ui/render/renderStudents.js?v=${build}`) &&
  main.includes(`./ui/render/renderInvalidation.js?v=${build}`) &&
  main.includes(`./modules/students.js?v=${build}`));
check('nested render imports use current cache-bust',
  renderJs.includes(`studentsRenderer.js?v=${build}`) &&
  renderStudents.includes(`studentsRenderer.js?v=${build}`) &&
  renderInvalidation.includes(`studentsRenderer.js?v=${build}`) &&
  renderInvalidation.includes(`listComputationRefresh.js?v=${build}`) &&
  listRefresh.includes(`studentsRenderer.js?v=${build}`));
check('students slow warning threshold raised and gated for production',
  studentsRenderer.includes('const _STUDENTS_SLOW_WARN_MS = 64') &&
  studentsRenderer.includes('function _shouldWarnStudentCompute') &&
  studentsRenderer.includes('window.__ENABLE_PERF_WARNINGS') &&
  studentsRenderer.includes('if (_shouldWarnStudentCompute(ms))'));
check('listComputationRefresh threshold raised from 16ms to severe 64ms',
  listRefresh.includes('const _SLOW_MS = 64') &&
  !listRefresh.includes('const _SLOW_MS = 16'));
check('listComputationRefresh has same-tick domain refresh coalescing',
  listRefresh.includes('const _RECENT_REFRESH_REUSE_MS = 250') &&
  listRefresh.includes('function _domainSignature') &&
  listRefresh.includes('function _canReuseRecentRefresh') &&
  listRefresh.includes('function _markRecentRefresh'));
check('refreshListComputation reuses a recent identical domain refresh',
  listRefresh.includes('_canReuseRecentRefresh(domain, signature)') &&
  listRefresh.includes('reused: true') &&
  listRefresh.includes('return true;'));
check('refreshListsComputation reuses recent batch refresh by domain',
  listRefresh.includes('for (const [domain, domainKeys] of Object.entries(domainGroups))') &&
  listRefresh.includes('const signature = _domainSignature(domain)') &&
  listRefresh.includes('_markRecentRefresh(domain, signature, reason)'));
check('ListComputationSlow warning is gated in production',
  listRefresh.includes('function _isDebugPerfEnabled') &&
  listRefresh.includes('if (!_isDebugPerfEnabled()) return') &&
  listRefresh.includes('&& _isDebugPerfEnabled()'));
check('UI-only invalidations do not bump dataVersion again',
  renderInvalidation.includes('function _shouldBumpStoreDataVersion') &&
  renderInvalidation.includes("r.includes('search')") &&
  renderInvalidation.includes("r.includes('filter')") &&
  renderInvalidation.includes('if (window.__store && _shouldBumpStoreDataVersion(reason))'));
check('search/filter/load-more are routed as list-only invalidations before domain invalidation',
  renderInvalidation.includes('function _isListOnlyUiInvalidation') &&
  renderInvalidation.includes('invalidateLists(listKeys') &&
  renderInvalidation.indexOf('const listKeys = TAB_TO_LIST_KEYS[tabId]') < renderInvalidation.indexOf('mapping.fn(reason'));
const directStudentsBlock = renderInvalidation.slice(
  renderInvalidation.indexOf('export function invalidateStudents(reason)'),
  renderInvalidation.indexOf('export function invalidateInventory(reason)')
);
check('direct legacy invalidateStudents(search/filter) no longer clears whole students cache',
  directStudentsBlock.includes('Direct legacy callers may still call invalidateStudents()') &&
  directStudentsBlock.includes('if (_isListOnlyUiInvalidation(reason))') &&
  directStudentsBlock.indexOf('if (_isListOnlyUiInvalidation(reason))') < directStudentsBlock.indexOf('invalidateStudentsRender(\'all\')'));
check('LegacyRenderWarning remains for diagnostics but is production-gated',
  renderInvalidation.includes('LegacyRenderWarning') &&
  renderInvalidation.includes('function _shouldEmitLegacyRenderWarning') &&
  renderInvalidation.includes('window.__ENABLE_LEGACY_RENDER_WARNINGS') &&
  renderInvalidation.includes('if (!_shouldEmitLegacyRenderWarning()) return'));
check('APP patch version updated to V4B12 or later',
  main.includes("APP_PATCH_VERSION = '4K-6V4B12-render-warning-coalescing-20260627'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V4D1-profile-canonical-store-readonly-audit-20260628'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V4D4-coach-quit-authoritative-fix-20260630'") ||
  main.includes("APP_PATCH_VERSION = '4K-6V4D5-coach-quit-attendance-full-recovery-20260630'"));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B12 render warning coalescing checks passed.\n');
