#!/usr/bin/env node
/** Phase 4K-6V4B8 — Quit Tab Mobile Full Authoritative List */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('index.html');
const main = read('js/main.js');
const students = read('js/modules/students.js');
const renderStudents = read('js/ui/render/renderStudents.js');
const renderJs = read('js/ui/render.js');
const renderInvalidation = read('js/ui/render/renderInvalidation.js');
const listRefresh = read('js/ui/render/listComputationRefresh.js');
let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V4B8 — Quit Tab Mobile Parity ===\n');
const build = 'quit-mobile-authoritative-local-sync-20260628-v4d3';
const buildV4D4 = 'quit-authoritative-full-sync-20260629-v4d4';
const buildV4D5 = 'quit-mobile-coach-login-repair-20260629-v4d5';
const currentBuilds = [build, buildV4D4, buildV4D5];
const appBuilds = [build, buildV4D4, buildV4D5, 'profile-canonical-store-runtime-recovery-20260628-v4d1a', 'profile-canonical-store-20260628-v4d1', 'tuition-debt-source-of-truth-20260628-v4c'];

check('Index cache-busts app.js and main.js with current quit-safe build',
  appBuilds.some(b => index.includes(`app.js?v=${b}`)) && currentBuilds.some(b => index.includes(`./js/main.js?v=${b}`)));
check('Main cache-busts all quit render/profile modules with current quit-safe build',
  currentBuilds.some(b => main.includes(`./ui/render.js?v=${b}`)) &&
  currentBuilds.some(b => main.includes(`./ui/render/renderStudents.js?v=${b}`)) &&
  currentBuilds.some(b => main.includes(`./ui/render/renderInvalidation.js?v=${b}`)) &&
  currentBuilds.some(b => main.includes(`./listeners/profiles.listeners.js?v=${b}`)) &&
  currentBuilds.some(b => main.includes(`./modules/students.js?v=${b}`)));
check('Nested render imports use current build so mobile cannot reuse stale computation cache',
  currentBuilds.some(b => renderJs.includes(`studentsRenderer.js?v=${b}`)) &&
  currentBuilds.some(b => renderStudents.includes(`studentsRenderer.js?v=${b}`)) &&
  currentBuilds.some(b => renderInvalidation.includes(`studentsRenderer.js?v=${b}`)) &&
  currentBuilds.some(b => renderInvalidation.includes(`listComputationRefresh.js?v=${b}`)) &&
  currentBuilds.some(b => listRefresh.includes(`studentsRenderer.js?v=${b}`)));
check('renderQuitIsland never falls back to shared server pagination after authoritative quit load',
  renderStudents.includes('_quitLoaded') &&
  renderStudents.includes('_buildAuthoritativeQuitRows') &&
  (renderStudents.includes('quit-mobile-authoritative-cache-miss') || renderStudents.includes('quit-island-authoritative-full')) &&
  !renderStudents.includes('_quitPagActive'));
check('renderQuitIsland synchronizes the mobile control outside the table',
  renderStudents.includes('function _syncQuitMobileControl') &&
  renderStudents.includes('function _ensureQuitMobileControl') &&
  renderStudents.includes("ctrlEl.id = 'pgWrap_quitList'") &&
  (renderStudents.includes("window._loadMore(\\'quit\\')") || renderStudents.includes('Đã hiển thị đủ')));
check('Student pagination controls for quit use authoritative quitProfiles, not pgState',
  (students.includes('Phase 4K-6V4B8 mobile full authoritative render') || students.includes('web + mobile both show all quit profiles')) &&
  students.includes("if (listId === 'quitList' && _isQuitAuthoritativeLoaded())") &&
  ((students.includes("window._loadMore(\\'quit\\')") || students.includes("window._loadMore('quit')")) || students.includes('Đã hiển thị đủ')) &&
  students.includes('Đang tải danh sách đã nghỉ'));
check('Student pagination fallback counts quit rows correctly',
  students.includes("tr[data-quit-id], tr[data-student-id]") &&
  students.includes("if (listId === 'quitList')"));
check('Student pagination fallback cannot overwrite authoritative quit list',
  students.includes("if (_mode === 'quit')") &&
  students.includes('if (_isQuitAuthoritativeLoaded()) return false') &&
  students.includes("target.querySelector('tr[data-quit-id], tr[data-student-id]')"));
check('Fallback/pagination quit rows use data-quit-id for DOM parity',
  students.includes('data-quit-id="${_esc}"') && students.includes('data-quit-id="${_a}"'));
check('Debug separation counts data-quit-id rows as well as legacy data-student-id',
  students.includes("#quitList tr[data-quit-id], #quitList tr[data-student-id]") &&
  students.includes('r.dataset.quitId || r.dataset.studentId'));


check('Authoritative mobile render never clears quitList on cache miss',
  (renderStudents.includes('if (!_htmlQ && typeof window.refreshListComputation') || renderStudents.includes('quit-island-authoritative-full')) &&
  (renderStudents.includes('const direct = _buildAuthoritativeQuitRows()') || renderStudents.includes('_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true })')) &&
  !renderStudents.includes("_applyHtml(_target, _htmlQ || '')"));
check('Mobile quit control is created outside the scrollable table when missing',
  renderStudents.includes("target.closest('.table-wrapper')") &&
  renderStudents.includes("ctrlEl.setAttribute('data-mobile-quit-control', '1')") &&
  renderStudents.includes('parent.insertBefore(ctrlEl, anchor.nextSibling)'));
check('Legacy renderApp quit rows also use data-quit-id and legacy quit date fields',
  read('app.js').includes('data-quit-id="${safeNameEscaped}"') &&
  read('app.js').includes('p.quitDate || p.ngayNghi || p.inactiveDate || p.stoppedDate || p.leftDate || p.nghiDate'));
check('Quit renderer uses legacy quit date fields in module row render as well',
  read('js/ui/render/computation/studentsRenderer.js').includes('p.quitDate || p.ngayNghi || p.inactiveDate || p.stoppedDate || p.leftDate || p.nghiDate'));


check('Mobile quit renderer ignores cached/paginated quitRows after authoritative load',
  renderStudents.includes('_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true })') &&
  (renderStudents.includes('quit-island-authoritative-full') || renderStudents.includes('if (_isQuitMobileViewport())')));
check('Mobile quit row builder can force all rows instead of page-limited rows',
  renderStudents.includes('function _isQuitMobileViewport') &&
  (renderStudents.includes('const forceAll = options.forceAll === true') || renderStudents.includes('const forceAll = true')) &&
  (renderStudents.includes('const limit = forceAll ? entries.length') || renderStudents.includes('const limit = entries.length')));
check('Mobile quit external control reports all rows instead of showing load-more',
  (renderStudents.includes('const limit = mobileFull ? count') || renderStudents.includes('const limit = count')) &&
  renderStudents.includes("mobileFull ? 'Đã hiển thị đủ '") &&
  (students.includes('const _mobileFull  = _isMobileViewport()') || students.includes('web + mobile both show all quit profiles')) &&
  (students.includes('const _quitLimit   = _mobileFull ? _quitEntries.length') || students.includes('const _quitLimit   = _quitEntries.length')));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B8 mobile parity checks passed.\n');
