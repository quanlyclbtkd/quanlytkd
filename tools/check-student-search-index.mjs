#!/usr/bin/env node
import fs from 'fs';
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const idx = read('index.html');
const main = read('js/main.js');
const rt = read('js/modules/searchRuntime.js');
const core = read('js/core/studentSearchIndex.js');
const pkg = JSON.parse(read('package.json') || '{}');
const students = read('js/modules/students.js');
const app = read('app.js');
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
check(/import\s*\{[^}]*StudentSearchIndex[^}]*\}\s*from\s*['"]\.\.\/core\/studentSearchIndex\.js(?:\?v=[^'"]+)?['"]/.test(rt), 'SearchRuntime imports StudentSearchIndex');
check(rt.includes('window.StudentSearchIndex.searchStudents') || rt.includes('StudentSearchIndex.searchStudents'), 'SearchRuntime uses StudentSearchIndex.searchStudents');
check(rt.includes('student-search-index') && rt.includes('studentIndexRuns'), 'SearchRuntime records student index source/metrics');
check(rt.includes('server-pagination') && rt.includes('profileCount > 0'), 'server fallback only after local profile availability check');
check(rt.includes('tab-switch-search-replay') && rt.includes('replaySearchForTab'), 'cross-tab search replay preserved');
check(rt.includes('fastDebounceMs') && rt.includes('_getAdaptiveSearchDelay'), 'adaptive debounce preserved');
check(main.includes('debugStudentSearchIndex') && main.includes('debugSearchAccuracy') && main.includes('studentSearchIndexOk'), 'runtime smoke test includes student search index');
check(!rt.includes('getDocs(') && !core.includes('getDocs(') && !core.includes('getCountFromServer'), 'student search index does not add Firestore reads');
check(main.includes('4K-6K-E-unified-student-search-index-20260608') || main.includes('4K-6K-F-receipt-qr-helper-extraction-20260608') || main.includes('4K-6K-G-admission-tuition-type-normalization-20260608'), 'APP_BUILD_VERSION updated to 4K-6K-E/6K-F');
check(idx.includes('unified-student-search-index-20260608') || idx.includes('receipt-qr-helper-extraction-20260608') || idx.includes('admission-tuition-type-normalization-20260608'), 'index cache bust updated to 4K-6K-E/6K-F');
check(pkg.scripts && pkg.scripts['check:student-search-index'], 'package script check:student-search-index registered');
check(pkg.scripts?.['check:all']?.includes('check:student-search-index'), 'check:all includes student search index check');
check(pkg.scripts?.['check:all:critical']?.includes('check:student-search-index'), 'check:all:critical includes student search index check');

const updateStart=students.indexOf('window.updateProfile = async () =>');
const updateEnd=updateStart>=0 ? students.indexOf('window.deleteProfile = async () =>',updateStart) : -1;
const updateBody=updateStart>=0 && updateEnd>updateStart ? students.slice(updateStart,updateEnd) : '';
check(updateBody.includes("oldName !== newName") && updateBody.indexOf("oldName !== newName") < updateBody.indexOf('StudentStatusCommandBoundary.updateProfile'), 'profile rename remains fail-closed before canonical write');
check(updateBody.includes('window.buildStudentSearchIndex') && updateBody.includes('mergedProfile') && updateBody.includes('Object.assign(updateData'), 'active updateProfile rebuilds search index from RAM + updateData');
check(updateBody.indexOf('window.buildStudentSearchIndex') < updateBody.lastIndexOf('StudentStatusCommandBoundary.updateProfile'), 'search index is merged before canonical profile update write');
check(!/getDoc\s*\(|getDocs\s*\(|onSnapshot\s*\(/.test(updateBody), 'search-index-on-edit adds zero Firestore reads/listeners');

const helperStart=app.indexOf('function normalizeSearchText');
const helperEnd=app.indexOf('window.buildStudentSearchIndex = window.buildStudentSearchIndex || buildStudentSearchIndex;',helperStart);
if (helperStart>=0 && helperEnd>helperStart) {
  const helperSrc=app.slice(helperStart,helperEnd);
  const build = new Function(`${helperSrc}; return buildStudentSearchIndex;`)();
  const base={phone:'0901111111',memberId:'VS001',nickname:'An',belt:'Đen'};
  const edited={...base,phone:'0988888888',memberId:'VS999',nickname:'Bảo An'};
  const idxEdited=build(edited,'Nguyễn Văn An');
  check(idxEdited.searchPhone==='0988888888', 'Edit phone updates searchPhone in same payload');
  check(idxEdited.searchCode==='vs999', 'Edit memberId updates searchCode in same payload');
  check(idxEdited.searchNickname==='bao an', 'Edit nickname updates searchNickname in same payload');
  check(idxEdited.searchName==='nguyen van an' && Array.isArray(idxEdited.searchNameTokens) && idxEdited.searchNameTokens.includes('an'), 'Normal edit keeps canonical searchName/searchNameTokens');
}
// Guard: high-risk functions should remain in app.js unchanged by this phase.
check(app.includes('window.processMultiItem') || app.includes('processMultiItem'), 'processMultiItem still present in app.js');
check(app.includes('window.handleImportExcel') || app.includes('handleImportExcel'), 'Excel import write flow still present');
process.exit(ok ? 0 : 1);
