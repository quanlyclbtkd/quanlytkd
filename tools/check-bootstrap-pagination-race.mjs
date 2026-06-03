/**
 * tools/check-bootstrap-pagination-race.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu js/main.js còn initStudentPagination bằng setTimeout 500/1500ms
 * độc lập với isClubRuntimeReady().
 * Fail nếu initTransactionPagination chạy trước isClubRuntimeReady().
 *
 * Chạy: node tools/check-bootstrap-pagination-race.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  check:bootstrap-pagination-race');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');

if (!mainJs) {
    console.error('  ❌ Không đọc được js/main.js');
    process.exit(1);
}

console.log('▸ Section 1: Không còn setTimeout 500ms/1500ms init pagination sớm');

// Kiểm tra không còn block setTimeout độc lập với isClubRuntimeReady()
// Pattern nguy hiểm: setTimeout(() => { ... initStudentPagination ... }, 500)
// mà không có isClubRuntimeReady() check bên trong
const earlyStudentPattern = /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*initStudentPagination[^}]*\}/s;
const earlyTransactionPattern = /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*initTransactionPagination[^}]*\}/s;

// Tìm "DISABLED" comment để confirm đã disable
check(
    'Block setTimeout initStudentPagination sớm đã bị DISABLED',
    mainJs.includes('[DISABLED - StudentPagination early setTimeout]') ||
    mainJs.includes('DISABLED - StudentPagination') ||
    !earlyStudentPattern.test(mainJs),
    "PHẦN 6 FIX: Thêm comment [DISABLED - StudentPagination early setTimeout] hoặc xóa block"
);

check(
    'Block setTimeout initTransactionPagination sớm đã bị DISABLED',
    mainJs.includes('[DISABLED - TransactionPagination early setTimeout]') ||
    mainJs.includes('DISABLED - TransactionPagination') ||
    !earlyTransactionPattern.test(mainJs),
    "PHẦN 6 FIX: Thêm comment [DISABLED - TransactionPagination early setTimeout] hoặc xóa block"
);

console.log('\n▸ Section 2: _tryInitPaginationsOnDbReady dùng isClubRuntimeReady()');

check(
    '_tryInitPaginationsOnDbReady tồn tại trong main.js',
    mainJs.includes('_tryInitPaginationsOnDbReady'),
    "Phải có hàm _tryInitPaginationsOnDbReady(reason) để init pagination khi db ready"
);

check(
    '_tryInitPaginationsOnDbReady check isClubRuntimeReady()',
    mainJs.includes('isClubRuntimeReady()'),
    "_tryInitPaginationsOnDbReady phải: if (!window.isClubRuntimeReady()) return;"
);

check(
    'window.isClubRuntimeReady được define',
    mainJs.includes('window.isClubRuntimeReady = function'),
    "Phải có: window.isClubRuntimeReady = function isClubRuntimeReady() { ... }"
);

console.log('\n▸ Section 3: Guard per-club không double-init');

check(
    '__studentPaginationInitializedForClub guard tồn tại',
    mainJs.includes('__studentPaginationInitializedForClub'),
    "Phải có: window.__studentPaginationInitializedForClub guard để không init lại cùng club"
);

check(
    'Pagination trigger từ app:context-ready hoặc app:db-ready event',
    mainJs.includes("'app:context-ready'") && mainJs.includes("'app:db-ready'"),
    "Phải trigger pagination init từ: addEventListener('app:context-ready', ...) và app:db-ready"
);

console.log('\n▸ Section 4: Không còn warning "db chưa sẵn sàng sau 2s"');

// Warning message này chỉ được dùng trong deprecated path
check(
    'Warning "db chưa sẵn sàng sau 2s" không còn trong active code path',
    !mainJs.includes('[Bootstrap] StudentPagination: db chưa sẵn sàng sau 2s') &&
    !mainJs.includes('[Bootstrap] TransactionPagination: db chưa sẵn sàng sau 2s'),
    "PHẦN 6 FIX: Xóa hoặc comment out warning db chưa sẵn sàng — nó xuất hiện từ early setTimeout đã disable"
);

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Bootstrap pagination race condition checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
