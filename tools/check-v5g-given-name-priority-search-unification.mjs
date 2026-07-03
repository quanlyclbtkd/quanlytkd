import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  searchIndex: read('js/core/studentSearchIndex.js'),
  searchRuntime: read('js/modules/searchRuntime.js'),
  studentsModule: read('js/modules/students.js'),
  studentsRenderer: read('js/ui/render/computation/studentsRenderer.js'),
  publicApp: read('public/app.js'),
  publicSearchIndex: read('public/js/core/studentSearchIndex.js'),
  publicStudentsRenderer: read('public/js/ui/render/computation/studentsRenderer.js'),
};

const checks = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });
const build = 'login-history-large-list-guard-20260703-v5h';

check('V5G cache-bust marker is active', files.index.includes(build) && (files.app.includes('4K-6V5H-login-history-large-list-guard-20260703') || files.app.includes('4K-6V5G-given-name-priority-search-unification')));
check('StudentSearchIndex keeps strict final-token given-name matching', files.searchIndex.includes('_givenNameTokensFromName') && files.searchIndex.includes('return [last]') && files.searchIndex.includes('given-name-exact'));
check('StudentSearchIndex exposes analyzeGivenNameMatch/debugGivenNameSearch', files.searchIndex.includes('analyzeGivenNameMatch') && files.searchIndex.includes('window.debugGivenNameSearch'));
check('StudentSearchIndex overwrites stale legacy global helpers', files.searchIndex.includes('intentionally overwrites older legacy helpers') && !files.searchIndex.includes('window.matchesStudentProfileSearch = window.matchesStudentProfileSearch || function'));
check('SearchRuntime overwrites stale legacy global helpers', files.searchRuntime.includes('overwrite stale legacy helpers') && !files.searchRuntime.includes('window.matchesStudentProfileSearch = window.matchesStudentProfileSearch || function'));
check('Isolated studentsRenderer has given-name priority gate', files.studentsRenderer.includes('Given-name priority gate used by Active/Debt/Quit isolated renderer') && files.studentsRenderer.includes('_studentProfileMatchesSearch'));
check('studentsRenderer PASS 1 no longer uses blob.includes for student search', files.studentsRenderer.includes('Do not use blob.includes() here') && files.studentsRenderer.includes('if (search && !_studentProfileMatchesSearch(name, p, search)) searchPassFilter = false'));
check('studentsRenderer PASS 2 pagination override uses same gate', files.studentsRenderer.includes('PASS 2 pagination override must follow') && files.studentsRenderer.includes('if (search && !_studentProfileMatchesSearch(name, p, search)) passFilter = false'));
check('students module local search also uses final token before fields blob', files.studentsModule.includes('isPlainGivenNameLookup') && files.studentsModule.indexOf('return !!last &&') < files.studentsModule.indexOf('const fields = ['));
check('legacy app helper prefers profile display name over document id', files.app.includes("const displayName = p.name || p.fullName || p.studentName || p.displayName || p.hoTen || name || ''"));
check('public mirrors synced', (files.publicApp.includes('4K-6V5H-login-history-large-list-guard-20260703') || files.publicApp.includes('4K-6V5G')) && files.publicSearchIndex.includes('analyzeGivenNameMatch') && files.publicStudentsRenderer.includes('_studentProfileMatchesSearch'));

// Runtime behavior using the real StudentSearchIndex module.
global.window = {
  __store: {
    profiles: {
      'a': { name: 'Đỗ Bảo Uyên', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'b': { name: 'Bùi Nguyên Chí Thành', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'c': { name: 'Chu Khang Nguyên', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'd': { name: 'Lê Đoàn Thảo Quyên', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'e': { name: 'Trần Uyển Nhi', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'f': { name: 'Nguyễn Văn An', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
      'g': { name: 'Lê Bảo Nguyên', status: 'active', branch: 'CS1', paidUntil: '2026-06', tuitionFee: 500000 },
    }
  },
  normalizeVNForSearch: v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim().replace(/\s+/g, ' '),
};
const mod = await import('../js/core/studentSearchIndex.js?check=v5g');
mod.StudentSearchIndex.invalidate('v5g-runtime');
let result = mod.StudentSearchIndex.searchStudents('uyên', { mode: 'all', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('runtime search "uyên" returns final-name Uyên only', result.includes('Đỗ Bảo Uyên') && !result.some(n => /Nguyên|Nguyễn|Tuyên|Quyên|Uyển Nhi/.test(n)));
result = mod.StudentSearchIndex.searchStudents('nguyên', { mode: 'all', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('runtime search "nguyên" returns final-name Nguyên, not surname Nguyễn', result.includes('Lê Bảo Nguyên') && !result.includes('Nguyễn Văn An'));
result = mod.StudentSearchIndex.searchStudents('bảo uyên', { mode: 'all', includeAllStatuses: true, limit: 20 }).entries.map(e => e.name);
check('runtime multi-token full-name search still works', result.includes('Đỗ Bảo Uyên'));
check('matchesStudentProfileSearch final-token gate works', mod.StudentSearchIndex.matchesStudentProfileSearch('Đỗ Bảo Uyên', {}, 'uyên') && !mod.StudentSearchIndex.matchesStudentProfileSearch('Chu Khang Nguyên', {}, 'uyên'));

let failed = 0;
for (const c of checks) {
  if (c.ok) console.log('PASS', c.name);
  else { console.error('FAIL', c.name); failed++; }
}
if (failed) {
  console.error(`\n[check-v5g-given-name-priority-search-unification] FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`\n[check-v5g-given-name-priority-search-unification] PASS ${checks.length}/${checks.length}`);
