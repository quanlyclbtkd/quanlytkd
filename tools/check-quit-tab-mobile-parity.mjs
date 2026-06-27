#!/usr/bin/env node
/** Phase 4K-6V4B4 — Quit Tab Desktop/Mobile Parity */
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

console.log('\n=== Phase 4K-6V4B4 — Quit Tab Mobile Parity ===\n');
const build = 'quit-tab-mobile-parity-20260627-v4b4';

check('Index cache-busts app.js and main.js with V4B4',
  index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`));
check('Main cache-busts all quit render/profile modules with V4B4',
  main.includes(`./ui/render.js?v=${build}`) &&
  main.includes(`./ui/render/renderStudents.js?v=${build}`) &&
  main.includes(`./ui/render/renderInvalidation.js?v=${build}`) &&
  main.includes(`./listeners/profiles.listeners.js?v=${build}`) &&
  main.includes(`./modules/students.js?v=${build}`));
check('Nested render imports use V4B4 so mobile cannot reuse stale V4B2 computation cache',
  renderJs.includes(`studentsRenderer.js?v=${build}`) &&
  renderStudents.includes(`studentsRenderer.js?v=${build}`) &&
  renderInvalidation.includes(`studentsRenderer.js?v=${build}`) &&
  renderInvalidation.includes(`listComputationRefresh.js?v=${build}`) &&
  listRefresh.includes(`studentsRenderer.js?v=${build}`));
check('renderQuitIsland never falls back to shared server pagination after authoritative quit load',
  renderStudents.includes('Once authoritative quitProfiles') &&
  renderStudents.includes('_quitLoaded') &&
  renderStudents.includes('_applyHtml(_target, _htmlQ ||') &&
  !renderStudents.includes('_quitPagActive'));
check('renderQuitIsland synchronizes the mobile control outside the table',
  renderStudents.includes('function _syncQuitMobileControl') &&
  renderStudents.includes("document.getElementById('pgWrap_quitList')") &&
  renderStudents.includes("window._loadMore(\\'quit\\')"));
check('Student pagination controls for quit use authoritative quitProfiles, not pgState',
  students.includes('Phase 4K-6V4B4 mobile parity') &&
  students.includes("if (listId === 'quitList' && _isQuitAuthoritativeLoaded())") &&
  students.includes("window._loadMore(\\'quit\\')") &&
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

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4B4 mobile parity checks passed.\n');
