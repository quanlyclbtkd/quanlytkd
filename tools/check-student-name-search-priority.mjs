#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) { console.log(`✅ ${message}`); passed++; }
  else { console.error(`❌ ${message}`); failed++; }
}
function sameSet(a, b) {
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

console.log('\n🔎 Phase 4K-6V5U3 — Student Given-Name Search Priority\n');

// Minimal browser-like globals for the in-memory index/boundary modules.
global.window = { __store: { profiles: {} } };
global.document = { getElementById: () => null };

const coreUrl = pathToFileURL(path.join(root, 'js/core/studentSearchIndex.js')).href + `?v5u3test=${Date.now()}`;
const core = await import(coreUrl);
const {
  StudentSearchIndex,
  normalizeStudentSearchText,
  getStudentNameSearchPriority,
  rankStudentNameSearchResults,
} = core;

const dataset = {
  s1: { name: 'Nguyễn Văn An', status: 'active', phone: '0912345678', memberId: 'VTF12345' },
  s2: { name: 'Lê Minh An', status: 'active', phone: '0900000002', memberId: 'CLB0002' },
  s3: { name: 'Hoàng Bảo Anh', status: 'active' },
  s4: { name: 'Bùi Đào Gia Hân', status: 'active' },
  s5: { name: 'Cô Thị Thu Hằng', status: 'active' },
  s6: { name: 'Bùi Hoàng Thiên Phú', status: 'active' },
  s7: { name: 'Trần An Khang', status: 'active' },
};
window.__store.profiles = dataset;
StudentSearchIndex.invalidate('v5u3-test-dataset');
StudentSearchIndex.buildIndex('v5u3-test-dataset');

// CASE 1 — query "an": same result set, exact final-token first.
const anResult = StudentSearchIndex.searchStudents('an', { mode: 'all', includeAllStatuses: true, limit: 100 });
const anNames = anResult.entries.map(e => e.name);
check(anResult.total === 7, 'CASE 1: search "an" giữ nguyên đủ 7 kết quả cũ');
check(sameSet(anNames, Object.values(dataset).map(p => p.name)), 'CASE 1: search "an" không thêm/mất hồ sơ');
check(anNames[0] === 'Nguyễn Văn An' && anNames[1] === 'Lê Minh An', 'CASE 1: exact final-token "An" đứng đầu và giữ stable order');
check(anNames.indexOf('Hoàng Bảo Anh') > 1, 'CASE 1: "Anh" đứng sau exact given-name "An"');
check(anNames.indexOf('Trần An Khang') > anNames.indexOf('Hoàng Bảo Anh'), 'CASE 1: exact token giữa tên đứng sau final-token startsWith');
check(anNames.indexOf('Bùi Đào Gia Hân') > anNames.indexOf('Trần An Khang'), 'CASE 1: generic contains Hân đứng sau exact other-token');

// CASE 2 — query "anh".
const anhResult = StudentSearchIndex.searchStudents('anh', { mode: 'all', includeAllStatuses: true, limit: 100 });
check(anhResult.entries[0]?.name === 'Hoàng Bảo Anh', 'CASE 2: query "anh" ưu tiên Hoàng Bảo Anh');

// CASE 3 — exact full name.
const exactResult = StudentSearchIndex.searchStudents('Nguyễn Văn An', { mode: 'all', includeAllStatuses: true, limit: 100 });
check(exactResult.entries[0]?.name === 'Nguyễn Văn An', 'CASE 3: exact full name đứng đầu');
check(getStudentNameSearchPriority('Nguyễn Văn An', 'Nguyễn Văn An') === 1, 'CASE 3: exact full name = priority 1');

// Priority tiers including multi-token suffix and other token.
check(getStudentNameSearchPriority('Nguyễn Bảo An', 'bao an') === 3, 'Priority 3: exact multi-token suffix');
check(getStudentNameSearchPriority('Hoàng Bảo Anh', 'an') === 4, 'Priority 4: final token startsWith query');
check(getStudentNameSearchPriority('Trần An Khang', 'an') === 5, 'Priority 5: exact non-final token');
check(getStudentNameSearchPriority('Trần Anh Khang', 'an') === 6, 'Priority 6: non-final token startsWith query');
check(getStudentNameSearchPriority('Bùi Đào Gia Hân', 'an') === 7, 'Priority 7: generic full-name contains');
check(getStudentNameSearchPriority('Nguyễn Đức Bình', 'an') === 8, 'Priority 8: no name match / metadata-only');

// CASE 4 — accent insensitive.
check(normalizeStudentSearchText('Hân Hằng Hoàng') === 'han hang hoang', 'CASE 4: normalization tiếng Việt vẫn accent-insensitive');
const accentRank = rankStudentNameSearchResults(
  ['Bùi Đào Gia Hân', 'Nguyễn Văn An', 'Cô Thị Thu Hằng'],
  'án',
  x => x
);
check(accentRank[0] === 'Nguyễn Văn An', 'CASE 4: query có dấu vẫn ưu tiên exact given-name sau normalize');

// CASE 5 — phone exact keeps structured-field priority.
const phoneResult = StudentSearchIndex.searchStudents('0912345678', { mode: 'all', includeAllStatuses: true, limit: 100 });
check(phoneResult.entries[0]?.name === 'Nguyễn Văn An' && phoneResult.entries[0]?.matches.includes('exact-phone'), 'CASE 5: exact phone search hoạt động như trước');

// CASE 6 — member/VTF exact keeps structured-field priority.
const codeResult = StudentSearchIndex.searchStudents('VTF12345', { mode: 'all', includeAllStatuses: true, limit: 100 });
check(codeResult.entries[0]?.name === 'Nguyễn Văn An' && codeResult.entries[0]?.matches.includes('exact-code'), 'CASE 6: exact memberId/VTF code hoạt động như trước');

// CASE 7 — blank search helper must be a no-op for ordering.
const defaultOrder = ['Bùi Hoàng Thiên Phú', 'Lê Minh An', 'Nguyễn Văn An'];
check(JSON.stringify(rankStudentNameSearchResults(defaultOrder, '', x => x)) === JSON.stringify(defaultOrder), 'CASE 7: blank search không re-rank danh sách mặc định');

// CASE 8 — Debt: ranking changes only presentation ordering, never count/amount.
const debtCandidates = [
  { name: 'Bùi Đào Gia Hân', debt: 600000 },
  { name: 'Nguyễn Văn An', debt: 300000 },
  { name: 'Hoàng Bảo Anh', debt: 900000 },
  { name: 'Lê Minh An', debt: 300000 },
];
const debtCountBefore = debtCandidates.length;
const debtTotalBefore = debtCandidates.reduce((sum, row) => sum + row.debt, 0);
const rankedDebt = rankStudentNameSearchResults(debtCandidates, 'an', row => row.name);
check(rankedDebt.length === debtCountBefore, 'CASE 8: Debt ranking giữ nguyên debtCount/result count');
check(rankedDebt.reduce((sum, row) => sum + row.debt, 0) === debtTotalBefore, 'CASE 8: Debt ranking giữ nguyên totalDebtEst');
check(rankedDebt[0].name === 'Nguyễn Văn An' && rankedDebt[1].name === 'Lê Minh An', 'CASE 8: Debt presentation ưu tiên exact given-name An');

// CASE 9 — Quit authoritative boundary: blank stays alphabetical; search is relevance-ranked.
window.normalizeVNForSearch = normalizeStudentSearchText;
window.getProfileSearchBlob = (id, p) => normalizeStudentSearchText([
  id, p.name, p.fullName, p.studentName, p.phone, p.memberId, p.vtfCode
].filter(Boolean).join(' '));
const quitMap = {
  q1: { name: 'Bùi Đào Gia Hân', status: 'quit' },
  q2: { name: 'Lê Minh An', status: 'quit' },
  q3: { name: 'Hoàng Bảo Anh', status: 'quit' },
  q4: { name: 'Nguyễn Văn An', status: 'quit' },
};
window.studentProfileStore = { getQuitProfiles: () => quitMap };
window.isQuitProfilesComplete = () => true;
const quitUrl = pathToFileURL(path.join(root, 'js/data/quitProfileBoundary.js')).href + `?v5u3test=${Date.now()}`;
const quit = await import(quitUrl);
const quitBlank = quit.getFilteredQuitEntries({ search: '', branch: 'all', reason: 'v5u3-test-blank' }).map(([, p]) => p.name);
const quitAn = quit.getFilteredQuitEntries({ search: 'an', branch: 'all', reason: 'v5u3-test-an' }).map(([, p]) => p.name);
check(JSON.stringify(quitBlank) === JSON.stringify(['Bùi Đào Gia Hân', 'Hoàng Bảo Anh', 'Lê Minh An', 'Nguyễn Văn An']), 'CASE 9: Quit blank search giữ alphabetical behavior cũ');
check(quitAn[0] === 'Lê Minh An' && quitAn[1] === 'Nguyễn Văn An' && quitAn[2] === 'Hoàng Bảo Anh', 'CASE 9: Quit search "an" ưu tiên exact final-token trước Anh/contains');
check(quitAn.length === 4, 'CASE 9: Quit search giữ nguyên tập kết quả đã match');

// Architecture/static safety gates.
const coreSrc = read('js/core/studentSearchIndex.js');
const runtimeSrc = read('js/modules/searchRuntime.js');
const rendererSrc = read('js/ui/render/computation/studentsRenderer.js');
const quitSrc = read('js/data/quitProfileBoundary.js');
const financeSrc = read('js/ui/render/computation/financeRenderer.js');
const inventorySrc = read('js/ui/render/computation/inventoryRenderer.js');
const appSrc = read('app.js');
const eventsSrc = read('js/events/students.events.js');
const indexSrc = read('index.html');

check((runtimeSrc.match(/addEventListener\(['"]input['"]/g) || []).length === 1, 'Architecture: SearchRuntime vẫn chỉ có một canonical input listener');
check(!runtimeSrc.includes('new StudentSearchController') && !runtimeSrc.includes('new DebtSearch') && !runtimeSrc.includes('new GlobalSearch'), 'Architecture: không tạo search controller/engine mới');
check(appSrc.includes('__searchRuntimeMounted') && appSrc.includes('__searchRuntimeV2Mounted'), 'Architecture: app.js legacy search guards vẫn còn');
check(eventsSrc.includes('__searchRuntimeMounted'), 'Architecture: students.events fallback guard vẫn còn');
check(runtimeSrc.includes('compositionstart') && runtimeSrc.includes('compositionend') && runtimeSrc.includes('staleDropped') && runtimeSrc.includes('queuedTerm'), 'Architecture: IME + stale/latest-only protections giữ nguyên');
check(runtimeSrc.includes('server-pagination') && runtimeSrc.includes('profileCount > 0'), 'Architecture: server fallback hiện hữu giữ nguyên');

const readTokens = /\b(getDocs|getDoc|onSnapshot|collectionGroup)\s*\(/;
check(!readTokens.test(coreSrc) && !readTokens.test(rendererSrc) && !readTokens.test(quitSrc), 'Firestore: core/Debt/Quit ranking không thêm Firestore read');
check(!readTokens.test(financeSrc) && !readTokens.test(inventorySrc), 'Firestore: Finance/Inventory presentation ranking không thêm Firestore read');

check(rendererSrc.includes('const debtPassFilter = sharedPassFilter;'), 'Debt safety: debtPassFilter tiếp tục = sharedPassFilter');
check(rendererSrc.includes('_debtSearchCandidates') && rendererSrc.indexOf('_debtSearchCandidates.push') > rendererSrc.indexOf('if (debtPassFilter && passDebtOverdueFilter)'), 'Debt safety: chỉ collect ranking sau debt qualification/filter');
check(rendererSrc.indexOf('totalDebtEst += totalDebtAmount') < rendererSrc.indexOf('_debtSearchCandidates.push'), 'Debt safety: totalDebtEst tính trước presentation ranking');
check(quitSrc.includes('getAuthoritativeQuitMap') && quitSrc.includes('studentProfileStore.quitProfiles') && quitSrc.includes('if (search)'), 'Quit safety: authoritative source/completeness giữ nguyên, ranking chỉ khi search');
check(coreSrc.includes('a.originalIndex - b.originalIndex') || coreSrc.includes('a._searchOriginalIndex - b._searchOriginalIndex'), 'Stable sort: original index được dùng làm tie-break');
check(indexSrc.includes('student-given-name-priority-20260811-v5u3'), 'Cache-bust: index main runtime dùng V5U3 marker');
check(!coreSrc.includes('Levenshtein') && !coreSrc.includes('Soundex') && !coreSrc.includes('fuzzy'), 'Scope: không thêm fuzzy/Levenshtein/Soundex');

// Finance/Inventory audit: presentation copy only, original calculation arrays stay in place.
check(financeSrc.includes('_txSearchCandidates') && financeSrc.includes('transactions.forEach(t =>') && financeSrc.includes('rankStudentNameSearchResults'), 'Other tabs: Finance chỉ re-rank matched presentation rows');
check(inventorySrc.includes('_uniformSearchCandidates') && inventorySrc.includes('allInventory.forEach(t =>') && inventorySrc.includes('rankStudentNameSearchResults'), 'Other tabs: Inventory chỉ re-rank matched presentation rows');

console.log(`\n${'─'.repeat(66)}`);
console.log(`Kết quả V5U3: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
console.log('✅ Student Given-Name Search Priority regression gate PASS.\n');
