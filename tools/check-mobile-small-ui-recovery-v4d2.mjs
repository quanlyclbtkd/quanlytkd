#!/usr/bin/env node
/** Phase 4K-6V4D2 — Mobile Small UI Recovery regression gate. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const VERSION = 'quit-mobile-authoritative-local-sync-20260628-v4d3';
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  render: read('js/ui/render.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  listRefresh: read('js/ui/render/listComputationRefresh.js'),
  invalidation: read('js/ui/render/renderInvalidation.js'),
  attendance: read('js/modules/attendance.js'),
  app: read('app.js'),
  publicRender: read('public/js/ui/render.js'),
  publicRenderStudents: read('public/js/ui/render/renderStudents.js'),
  publicListRefresh: read('public/js/ui/render/listComputationRefresh.js'),
  publicAttendance: read('public/js/modules/attendance.js'),
};
let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}
console.log('\n=== Phase 4K-6V4D2 — Mobile Small UI Recovery ===\n');

check('index cache-busts app.js and dynamic main.js to V4D2',
  files.index.includes(`app.js?v=${VERSION}`) && files.index.includes(`./js/main.js?v=${VERSION}`));
check('main imports changed mobile/render modules with V4D2 cache-bust',
  files.main.includes(`./ui/render.js?v=${VERSION}`) &&
  files.main.includes(`./ui/render/renderStudents.js?v=${VERSION}`) &&
  files.main.includes(`./ui/render/renderInvalidation.js?v=${VERSION}`) &&
  files.main.includes(`./modules/attendance.js?v=${VERSION}`));
check('nested render imports use V4D2 cache-bust',
  files.render.includes(`studentsRenderer.js?v=${VERSION}`) &&
  files.renderStudents.includes(`studentsRenderer.js?v=${VERSION}`) &&
  files.invalidation.includes(`studentsRenderer.js?v=${VERSION}`) &&
  files.invalidation.includes(`listComputationRefresh.js?v=${VERSION}`) &&
  files.listRefresh.includes(`studentsRenderer.js?v=${VERSION}`));
check('render.js exposes refreshSmallStudentUi global for island/tab-switch refresh',
  files.render.includes('window.refreshSmallStudentUi') &&
  files.render.includes('function _refreshSmallStudentUi(tabId, reason, options = {})'));
check('render.js refreshes birthday and active skipped-month section outside heavy render',
  files.render.includes('window._renderHomeBirthdayBanner()') &&
  files.render.includes("if (tabId === 'active')") &&
  files.render.includes('_renderSkippedMonthSection(_profilesForSmallUi(), fmEl ? fmEl.value : \'\')'));
check('refreshSmallStudentUi prevents recursive quit renderer calls',
  files.render.includes('options.skipQuitList') &&
  files.render.includes("if (tabId === 'quit' && !options.skipQuitList"));
check('render profile bridge merges studentProfileStore/allProfiles/__store',
  files.render.includes('getAllProfilesCompat') &&
  files.render.includes('Object.assign(merged, window.allProfiles || {})') &&
  files.render.includes('Object.assign(merged, (window.__store || {}).profiles || {})'));
check('list computation profile bridge merges full compat store for mobile lists',
  files.listRefresh.includes('getAllProfilesCompat') &&
  files.listRefresh.includes('return Object.keys(merged).length ? merged : {};'));
check('attendance birthday profile source merges full compat store',
  files.attendance.includes('getAllProfilesCompat') &&
  files.attendance.includes('function _profiles()') &&
  files.attendance.includes('p.birthDate || p.birthday || p.dateOfBirth || p.ngaySinh'));
check('student islands refresh small UI after active/debt/quit renders',
  files.renderStudents.includes('function _afterStudentIslandRender') &&
  files.renderStudents.includes("_afterStudentIslandRender('active-island-render')") &&
  files.renderStudents.includes("_afterStudentIslandRender('quit-island-mobile-full')"));
check('quit direct renderer includes studentProfileStore compat source and forceAll mobile rows',
  files.renderStudents.includes('getAllProfilesCompat') &&
  files.renderStudents.includes('const limit = forceAll ? entries.length') &&
  files.renderStudents.includes('_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true })'));
check('legacy app exposes refreshSmallStudentUi fallback',
  files.app.includes('window.refreshSmallStudentUi = window.refreshSmallStudentUi || function(reason, options)'));
check('public mirror files are synced for hosted builds',
  files.publicRender.includes('window.refreshSmallStudentUi') &&
  files.publicRenderStudents.includes('function _afterStudentIslandRender') &&
  files.publicListRefresh.includes('getAllProfilesCompat') &&
  files.publicAttendance.includes('getAllProfilesCompat'));
check('V4D2 introduces no new Firestore read/write APIs in touched render/attendance files',
  !/(getDocs|onSnapshot|getCountFromServer|setDoc|updateDoc|writeBatch|deleteDoc|addDoc)\s*\(/.test([
    files.render, files.renderStudents, files.listRefresh, files.attendance
  ].join('\n')));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D2 mobile small UI recovery checks passed.\n');
