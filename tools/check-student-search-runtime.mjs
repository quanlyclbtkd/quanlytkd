/**
 * tools/check-student-search-runtime.mjs
 * ────────────────────────────────────────────────────────────────
 * PHẦN 10: Kiểm tra runtime search patterns trong js/modules/students.js
 *
 * Test FAIL nếu:
 *   1. `const snap` khai báo trong else block nhưng `snap.docs` dùng bên ngoài block
 *   2. Thiếu window.debugStudentSearch
 *   3. Thiếu _clientSearchProfiles
 *   4. Thiếu _lastSearchSource
 *   5. Thiếu 'client-store-fallback' string
 *
 * Usage: node tools/check-student-search-runtime.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const studentsJsPath = resolve(__dirname, '../js/modules/students.js');

let src;
try {
    src = readFileSync(studentsJsPath, 'utf8');
} catch (e) {
    console.error('❌ Không đọc được js/modules/students.js:', e.message);
    process.exit(1);
}

const errors = [];
const warnings = [];

// ── Test 1: snap không được khai báo bên ngoài else block rồi dùng .docs ──
// Pattern nguy hiểm: const snap = await ... TRONG else block
// rồi pgState._lastSnapSize = snap.docs ... BÊN NGOÀI else block
// Hãy kiểm tra xem snap.docs có dùng với non-optional chaining không
const UNSAFE_SNAP_PATTERN = /pgState\._lastSnapSize\s*=\s*snap\.docs/;
if (UNSAFE_SNAP_PATTERN.test(src)) {
    errors.push('❌ FAIL [Test 1]: Tìm thấy `snap.docs` không an toàn (không optional chaining). ' +
        'snap chỉ tồn tại trong else block nhưng được dùng trực tiếp — sẽ gây ReferenceError khi search trên GitHub Pages. ' +
        'Sửa thành `snap && snap.docs ? snap.docs.length : loadedItems.length`.');
} else {
    console.log('✅ [Test 1] snap.docs không còn dùng trực tiếp ngoài else block — OK');
}

// ── Test 2: Phải có let snap = null khai báo trước try ──
if (!src.includes('let snap = null')) {
    errors.push('❌ FAIL [Test 2]: Thiếu `let snap = null` — snap phải được khai báo trước try block để tránh ReferenceError.');
} else {
    console.log('✅ [Test 2] `let snap = null` tìm thấy — OK');
}

// ── Test 3: Phải có window.debugStudentSearch ──
if (!src.includes('window.debugStudentSearch')) {
    errors.push('❌ FAIL [Test 3]: Thiếu `window.debugStudentSearch` — cần cho debug search trên GitHub Pages.');
} else {
    console.log('✅ [Test 3] window.debugStudentSearch tìm thấy — OK');
}

// ── Test 4: Phải có _clientSearchProfiles ──
if (!src.includes('_clientSearchProfiles')) {
    errors.push('❌ FAIL [Test 4]: Thiếu `_clientSearchProfiles` — cần cho client-side fallback search.');
} else {
    console.log('✅ [Test 4] _clientSearchProfiles tìm thấy — OK');
}

// ── Test 5: Phải có _lastSearchSource ──
if (!src.includes('_lastSearchSource')) {
    errors.push('❌ FAIL [Test 5]: Thiếu `_lastSearchSource` — cần để debug biết search dùng nguồn nào.');
} else {
    console.log('✅ [Test 5] _lastSearchSource tìm thấy — OK');
}

// ── Test 6: Phải có client-store-fallback string ──
if (!src.includes('client-store-fallback')) {
    errors.push('❌ FAIL [Test 6]: Thiếu `client-store-fallback` — cần để fallback search source label.');
} else {
    console.log('✅ [Test 6] client-store-fallback tìm thấy — OK');
}

// ── Test 7: Phải có let loadedItems = [] ──
if (!src.includes('let loadedItems = []')) {
    errors.push('❌ FAIL [Test 7]: Thiếu `let loadedItems = []` — cần cho search/pagination unified result tracking.');
} else {
    console.log('✅ [Test 7] `let loadedItems = []` tìm thấy — OK');
}

// ── Test 8: Phải có _normalizeSearchLocal ──
if (!src.includes('_normalizeSearchLocal')) {
    errors.push('❌ FAIL [Test 8]: Thiếu `_normalizeSearchLocal` — cần cho client-side fallback normalize.');
} else {
    console.log('✅ [Test 8] _normalizeSearchLocal tìm thấy — OK');
}

// ── Report ──
console.log('\n────────────────────────────────────────────────────────────');
if (errors.length === 0) {
    console.log('✅ ALL TESTS PASSED — js/modules/students.js search runtime an toàn.');
    if (warnings.length > 0) {
        console.log('\nWarnings:');
        warnings.forEach(w => console.log(w));
    }
    process.exit(0);
} else {
    console.error('\n❌ TESTS FAILED:');
    errors.forEach(e => console.error(e));
    if (warnings.length > 0) {
        console.log('\nWarnings:');
        warnings.forEach(w => console.log(w));
    }
    process.exit(1);
}
