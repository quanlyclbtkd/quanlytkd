#!/usr/bin/env node
import fs from 'fs';
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const idx = read('index.html');
const main = read('js/main.js');
const rt = read('js/modules/searchRuntime.js');
const core = read('js/core/studentSearchIndex.js');
const pkg = JSON.parse(read('package.json') || '{}');
let ok = true;
function pass(msg){ console.log('✅', msg); }
function fail(msg){ console.error('❌', msg); ok = false; }
function check(cond, msg){ cond ? pass(msg) : fail(msg); }
console.log('\n🔍 Phase 4K-6K-E/6K-F — Unified Student Search Index Accuracy Gate Check\n');
check(!!core, 'js/core/studentSearchIndex.js exists');
check(core.includes('normalizeStudentSearchText') && core.includes('normalize(\'NFD\')') && core.includes('replace(/đ/g'), 'Vietnamese normalization exists');
check(core.includes('vtfCode') && core.includes('vtfId') && core.includes('maHoiVienVTF') && core.includes('memberId'), 'VTF/memberId fields indexed');
check(core.includes('phone') && core.includes('parentPhone') && core.includes('_digits'), 'phone/digit search indexed');
check(core.includes('searchStudents') && core.includes('matchesMode'), 'searchStudents + mode filter exists');
check(core.includes('debugStudentSearchIndex') && core.includes('debugSearchAccuracy') && core.includes('debugSearchIndexForStudent'), 'debug globals exist');
check(main.includes("import { initStudentSearchIndex }") && main.includes("./core/studentSearchIndex.js"), 'main imports initStudentSearchIndex');
check(main.includes('initStudentSearchIndex();') && main.indexOf('initStudentSearchIndex();') < main.indexOf('initGlobalSearchRuntime();'), 'student index initializes before SearchRuntime');
check(rt.includes("import { StudentSearchIndex }") && rt.includes('../core/studentSearchIndex.js'), 'SearchRuntime imports StudentSearchIndex');
check(rt.includes('window.StudentSearchIndex.searchStudents') || rt.includes('StudentSearchIndex.searchStudents'), 'SearchRuntime uses StudentSearchIndex.searchStudents');
check(rt.includes('student-search-index') && rt.includes('studentIndexRuns'), 'SearchRuntime records student index source/metrics');
check(rt.includes('server-pagination') && rt.includes('profileCount > 0'), 'server fallback only after local profile availability check');
check(rt.includes('tab-switch-search-replay') && rt.includes('replaySearchForTab'), 'cross-tab search replay preserved');
check(rt.includes('fastDebounceMs') && rt.includes('_getAdaptiveSearchDelay'), 'adaptive debounce preserved');
check(main.includes('debugStudentSearchIndex') && main.includes('debugSearchAccuracy') && main.includes('studentSearchIndexOk'), 'runtime smoke test includes student search index');
check(!rt.includes('getDocs(') && !core.includes('getDocs(') && !core.includes('getCountFromServer'), 'student search index does not add Firestore reads');
check(main.includes('4K-6K-E-unified-student-search-index-20260608') || main.includes('4K-6K-F-receipt-qr-helper-extraction-20260608'), 'APP_BUILD_VERSION updated to 4K-6K-E/6K-F');
check(idx.includes('unified-student-search-index-20260608') || idx.includes('receipt-qr-helper-extraction-20260608'), 'index cache bust updated to 4K-6K-E/6K-F');
check(pkg.scripts && pkg.scripts['check:student-search-index'], 'package script check:student-search-index registered');
check(pkg.scripts?.['check:all']?.includes('check:student-search-index'), 'check:all includes student search index check');
check(pkg.scripts?.['check:all:critical']?.includes('check:student-search-index'), 'check:all:critical includes student search index check');
// Guard: high-risk functions should remain in app.js unchanged by this phase.
const app = read('app.js');
check(app.includes('window.processMultiItem') || app.includes('processMultiItem'), 'processMultiItem still present in app.js');
check(app.includes('window.handleImportExcel') || app.includes('handleImportExcel'), 'Excel import write flow still present');
process.exit(ok ? 0 : 1);
