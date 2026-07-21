#!/usr/bin/env node
/** Phase 4K-6V5P — Quit Authoritative Data Boundary */
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  listeners: read('js/listeners/profiles.listeners.js'),
  listRefresh: read('js/ui/render/listComputationRefresh.js'),
  renderJs: read('js/ui/render.js'),
  renderStudents: read('js/ui/render/renderStudents.js'),
  studentsRenderer: read('js/ui/render/computation/studentsRenderer.js'),
  studentIndex: read('js/core/studentSearchIndex.js'),
  searchRuntime: read('js/modules/searchRuntime.js'),
  students: read('js/modules/students.js'),
  index: read('index.html'),
  main: read('js/main.js'),
  pkg: read('package.json')
};
let pass=0, fail=0;
function check(name, ok, detail='') { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name + (detail ? ' — '+detail : '')); } }
console.log('\n=== Phase 4K-6V5P — Quit Authoritative Data Boundary ===\n');
const build = 'quit-authoritative-data-boundary-20260704-v5p';
check('Index/main/app cache-bust uses V5P marker', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) && files.main.includes(`profiles.listeners.js?v=${build}`));
check('Quit-loaded state no longer blocks authoritative reconcile', files.listeners.includes('quit-tab-authoritative-reconcile-after-loaded') && files.listeners.includes('quitLoaded only means a targeted/local quit set exists') && files.listeners.includes('_state.quitCompletenessReconciled = !!ok'));
check('Targeted quit reconcile flag is set only after full fallback result', !files.listeners.includes('_state.quitCompletenessReconciled = true;\n            const ok = await loadFullProfilesFallback') && files.listeners.includes("loadFullProfilesFallback('quit-tab-authoritative-reconcile:"));
check('List computation uses quit-aware profile union for quit tab', files.listRefresh.includes('function _getQuitAwareProfiles') && files.listRefresh.includes("_getCurTabId() === 'quit'") && files.listRefresh.includes('getQuitProfiles()'));
check('Legacy render bridge also has quit-aware profile source', files.renderJs.includes('function _quitAwareProfiles') && files.renderJs.includes("getCurrentActiveTabId() === 'quit'") && files.renderJs.includes('getQuitProfiles()'));
check('Student search index builds from union including quitProfiles', files.studentIndex.includes('build the search index from the union source') && files.studentIndex.includes('getAllProfilesCompat') && files.studentIndex.includes('getQuitProfiles()'));
check('SearchRuntime quit tab uses union/canonical quit source', files.searchRuntime.includes('quit-tab search must use the union/canonical quit source') && files.searchRuntime.includes("if (tab === 'quit')") && files.searchRuntime.includes('getQuitProfiles()'));
check('Quit computation applies branch/search filter in PASS 1', files.studentsRenderer.includes('Đã nghỉ uses one canonical filter boundary') && files.studentsRenderer.includes('let quitPassFilter = true') && files.studentsRenderer.includes('_studentProfileMatchesSearch(name, p, search)'));
check('Quit pagination PASS 2 also applies same branch/search filter', (files.studentsRenderer.match(/let quitPassFilter = true/g) || []).length >= 2);
check('Direct authoritative quit rows apply same search and branch filters', files.renderStudents.includes('function _currentSearchTerm') && files.renderStudents.includes('function _quitProfileMatchesSearch') && files.renderStudents.includes('function _quitBranchMatches') && files.renderStudents.includes('options.applyFilters === false'));
check('Entering quit tab starts authoritative loader/reconcile', files.students.includes('entering Đã nghỉ must start the authoritative quit') && files.students.includes("loadQuitProfilesIfNeeded('ensure-student-tab-rendered:"));
check('V5P package script registered', files.pkg.includes('check:v5p-quit-authoritative-data-boundary'));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V5P checks passed.\n');
