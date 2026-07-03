import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  app: read('app.js'),
  searchIndex: read('js/core/studentSearchIndex.js'),
  searchRuntime: read('js/modules/searchRuntime.js'),
  publicApp: read('public/app.js'),
  publicSearchIndex: read('public/js/core/studentSearchIndex.js'),
  pkg: read('package.json'),
};
const build = 'login-history-large-list-guard-20260703-v5h';
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }

console.log('\n=== Phase 4K-6V5G — Given-Name Priority Search Unification ===\n');
check('V5F cache-bust active in index/main/app', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) && files.main.includes(build));
check('legacy app has strict given-name helper', files.app.includes('_legacyStudentProfileMatchesSearch') && files.app.includes('_legacyMatchesGivenNameOnly') && files.app.includes('_legacyIsPlainGivenNameLookup'));
check('legacy app debt/active/quit profile loop uses strict helper', files.app.includes('matchesSearch = _legacyStudentProfileMatchesSearch(name, p, search, _rawSearch)'));
check('legacy broad name includes removed from profile loop', !files.app.includes('matchesSearch =\n                    _legacyNormalizeSearch(name).includes(search)'));
check('legacy helper explicitly documents Nguyen/Nguyen/Tuyen flood prevention', files.app.includes('Nguyễn/Nguyên/Tuyên') && files.app.includes('final\n    // given-name token only'));
check('StudentSearchIndex exposes helper API for shared runtime use', ['isPlainGivenNameLookup(rawTerm)','matchesGivenNameOnly(name, rawTerm)','matchesStudentProfileSearch(name, profile, rawTerm)'].every(s => files.searchIndex.includes(s)));
check('SearchRuntime exposes helper API when module is mounted', files.searchRuntime.includes('window.matchesStudentProfileSearch') && files.searchRuntime.includes('window.matchesStudentGivenNameOnly'));
check('public mirrors synced', files.publicApp.includes('_legacyStudentProfileMatchesSearch') && files.publicSearchIndex.includes('matchesStudentProfileSearch'));
check('package exposes V5F check', files.pkg.includes('check:v5f-debt-given-name-final-token-search'));

// Behavior: one-token Vietnamese name queries must match final given-name only.
globalThis.window = { __store: { profiles: {
  'Đỗ Bảo Uyên': { name: 'Đỗ Bảo Uyên', status: 'active', branchCode: 'CS1' },
  'Lê Đoàn Thảo Quyên': { name: 'Lê Đoàn Thảo Quyên', status: 'active', branchCode: 'CS1' },
  'Bùi Nguyên Chí Thành': { name: 'Bùi Nguyên Chí Thành', status: 'active', branchCode: 'CS1' },
  'Chu Khang Nguyên': { name: 'Chu Khang Nguyên', status: 'active', branchCode: 'CS1' },
  'Khúc Nguyên Phương': { name: 'Khúc Nguyên Phương', status: 'active', branchCode: 'CS1' },
  'Lê Tuyên': { name: 'Lê Tuyên', status: 'active', branchCode: 'CS1' },
  'Trần Uyển Nhi': { name: 'Trần Uyển Nhi', status: 'active', branchCode: 'CS1' },
} }, __studentSearchIndexReady: false };
const mod = await import('../js/core/studentSearchIndex.js?checkv5f=' + Date.now());
const result = mod.StudentSearchIndex.searchStudents('uyên', { mode: 'debt', includeAllStatuses: true, limit: 20 });
const names = result.entries.map(e => e.name);
check('search "uyên" includes final given-name Uyên', names.includes('Đỗ Bảo Uyên'));
check('search "uyên" excludes Quyên because final token is not Uyên', !names.includes('Lê Đoàn Thảo Quyên'));
check('search "uyên" excludes Nguyên surname/middle false positives', !names.includes('Bùi Nguyên Chí Thành') && !names.includes('Khúc Nguyên Phương'));
check('search "uyên" excludes final Nguyên because it is a different given-name', !names.includes('Chu Khang Nguyên'));
check('search "uyên" excludes Tuyên and middle Uyển Nhi false positives', !names.includes('Lê Tuyên') && !names.includes('Trần Uyển Nhi'));
check('shared matchesStudentProfileSearch follows final token gate', mod.StudentSearchIndex.matchesStudentProfileSearch('Đỗ Bảo Uyên', {}, 'uyên') && !mod.StudentSearchIndex.matchesStudentProfileSearch('Chu Khang Nguyên', {}, 'uyên'));
const full = mod.StudentSearchIndex.searchStudents('Đỗ Bảo Uyên', { mode: 'debt', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('full-name search still works for Đỗ Bảo Uyên', full.includes('Đỗ Bảo Uyên'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V5F checks passed.\n');
