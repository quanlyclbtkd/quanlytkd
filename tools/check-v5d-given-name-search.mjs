import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  app: read('app.js'),
  searchIndex: read('js/core/studentSearchIndex.js'),
  searchRuntime: read('js/modules/searchRuntime.js'),
  studentService: read('js/services/students.service.js'),
  publicSearchIndex: read('public/js/core/studentSearchIndex.js'),
  pkg: read('package.json'),
};
const build = 'debt-given-name-final-token-search-20260703-v5f';
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }

console.log('\n=== Phase 4K-6V5D — Given-Name Focused Student Search ===\n');
check('index/main/app use V5D cache-bust', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`) && files.main.includes(build));
check('StudentSearchIndex has strict given-name helpers', ['_isPlainNameLookup','_givenNameTokensFromName','_givenNameMatches','givenNameTokens','givenNameToken'].every(s => files.searchIndex.includes(s)));
check('plain name lookup returns before blob/compact broad matching', files.searchIndex.indexOf('plainNameLookup') < files.searchIndex.indexOf('entry.normalizedName === normTerm') && files.searchIndex.includes("return { score: 0, matches: [] }"));
check('removed token contains matching that caused Nguyen/Nguyen false positives', !files.searchIndex.includes('name-token-contains') && !files.searchIndex.includes('compact-name-contains'));
check('SearchRuntime fallback also uses given-name only for plain student name lookup', files.searchRuntime.includes('_isPlainStudentGivenNameLookup') && files.searchRuntime.includes('_matchesGivenNameOnly'));
check('write index includes searchGivenName for new/edited profiles', files.app.includes('searchGivenName: searchNameTokens[searchNameTokens.length - 1]'));
check('server-side search prefers searchGivenName for plain one-token name', files.studentService.includes('orderBy(\'searchGivenName\')') && files.studentService.includes('_plainGivenNameLookup'));
check('package exposes V5D check', files.pkg.includes('check:v5d-given-name-search'));
check('public search index synced', files.publicSearchIndex.includes('_givenNameMatches') && files.publicSearchIndex.includes('given-name-exact'));

// Behavior test: searching "Uyên" should match final given-name Uyên, but not Nguyễn/Nguyên/Tuyên through substring matching.
globalThis.window = { __store: { profiles: {
  'Bảo Uyên': { name: 'Bảo Uyên', status: 'active', branchCode: 'CS1' },
  'Nguyễn Minh Anh': { name: 'Nguyễn Minh Anh', status: 'active', branchCode: 'CS1' },
  'Bảo Nguyên': { name: 'Bảo Nguyên', status: 'active', branchCode: 'CS1' },
  'Lê Tuyên': { name: 'Lê Tuyên', status: 'active', branchCode: 'CS1' },
  'Trần Uyển Nhi': { name: 'Trần Uyển Nhi', status: 'active', branchCode: 'CS1' },
} }, __studentSearchIndexReady: false };
const mod = await import('../js/core/studentSearchIndex.js?checkv5d=' + Date.now());
const result = mod.StudentSearchIndex.searchStudents('Uyên', { mode: 'all', includeAllStatuses: true, limit: 20 });
const names = result.entries.map(e => e.name);
check('search "Uyên" includes Bảo Uyên', names.includes('Bảo Uyên'));
check('search "Uyên" excludes Nguyễn surname false positive', !names.includes('Nguyễn Minh Anh'));
check('search "Uyên" excludes Nguyên/Tuyên substring false positives', !names.includes('Bảo Nguyên') && !names.includes('Lê Tuyên'));
check('search "Uyên" excludes middle-name-only result when final given name is Nhi', !names.includes('Trần Uyển Nhi'));
const full = mod.StudentSearchIndex.searchStudents('Bảo Uyên', { mode: 'all', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('full-name search still works', full.includes('Bảo Uyên'));

globalThis.window.__store.profiles = {
  'Bảo Nguyên': { name: 'Bảo Nguyên', status: 'active', branchCode: 'CS1' },
  'Nguyễn Minh Anh': { name: 'Nguyễn Minh Anh', status: 'active', branchCode: 'CS1' },
};
mod.StudentSearchIndex.invalidate('given-name-behavior-reset');
const nguyen = mod.StudentSearchIndex.searchStudents('Nguyên', { mode: 'all', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('search "Nguyên" matches given-name Nguyên but not surname Nguyễn', nguyen.includes('Bảo Nguyên') && !nguyen.includes('Nguyễn Minh Anh'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V5D checks passed.\n');
