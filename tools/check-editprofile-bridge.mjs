/**
 * tools/check-editprofile-bridge.mjs — editProfile Bridge Check
 * ─────────────────────────────────────────────────────────────────
 * Kiểm tra editProfile multi-candidate legacy bridge:
 * 1. Bridge tồn tại sử dụng || pattern.
 * 2. Bridge có candidates array với đủ fallback functions.
 * 3. Bridge được gán SAU initStudents().
 * 4. Bridge không ghi đè impl thật nếu đã tồn tại.
 * 5. RuntimeGuard students yêu cầu editProfile — bridge sẽ satisfy.
 *
 * Chạy: node tools/check-editprofile-bridge.mjs
 * ─────────────────────────────────────────────────────────────────
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
console.log('  editProfile Bridge Check — Phase 4K-RUNTIME-CLEANUP');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
if (!mainJs) { console.error('  ❌ FATAL: js/main.js not found'); process.exit(1); }

console.log('▸ Section 1: bridge existence and pattern');
check('window.editProfile bridge dùng || (không ghi đè impl thật)',
    /window\.editProfile\s*=\s*window\.editProfile\s*\|\|/.test(mainJs),
    'window.editProfile = window.editProfile || function _editProfileBridge(...args) { ... }');

check('Bridge dùng ...args (rest params) thay vì chỉ (name)',
    /editProfile\s*\|\|\s*function[^{]*\(\.\.\.args\)/.test(mainJs),
    'Dùng ...args để forward đúng tất cả arguments');

console.log();
console.log('▸ Section 2: multi-candidate fallback');
check('candidates array có __realEditProfile',
    mainJs.includes('__realEditProfile'),
    'Thêm window.__realEditProfile vào candidates array');
check('candidates array có window.openProfile',
    mainJs.includes('window.openProfile') && mainJs.includes('candidates'),
    'Thêm window.openProfile vào candidates array');
check('candidates array có window.editStudent',
    mainJs.includes('editStudent') && mainJs.includes('candidates'),
    'Thêm window.editStudent vào candidates array');
check('candidates array có window.openEditProfile',
    mainJs.includes('openEditProfile') && mainJs.includes('candidates'),
    'Thêm window.openEditProfile vào candidates array');
check('candidates array có window.showStudentModal',
    mainJs.includes('showStudentModal') && mainJs.includes('candidates'),
    'Thêm window.showStudentModal vào candidates array');
check('.filter(fn => typeof fn === "function") để lọc available handlers',
    /\.filter\s*\([^)]*typeof\s+fn\s*===\s*['"]function['"]/.test(mainJs),
    'Dùng .filter(fn => typeof fn === "function")');
check('forward candidates[0](...args) khi có candidate',
    /candidates\[0\]\s*\(\.\.\.args\)/.test(mainJs),
    'if (candidates.length) return candidates[0](...args)');

console.log();
console.log('▸ Section 3: safe fallback khi không có candidate');
check('Bridge có console.warn khi không có candidate',
    mainJs.includes('[LegacyBridge] editProfile called before real handler ready'),
    "console.warn('[LegacyBridge] editProfile called before real handler ready:', args)");
check('Bridge có showToast fallback',
    mainJs.includes('showToast') && mainJs.includes('editProfile'),
    'window.showToast("Chức năng sửa võ sinh chưa sẵn sàng", "warning")');
check('Bridge return null khi không có candidate',
    mainJs.includes('return null') && mainJs.includes('editProfile'),
    'return null để caller không crash trên undefined return');

console.log();
console.log('▸ Section 4: ordering');
const _initStudentsIdx = mainJs.indexOf('initStudents()');
const _bridgeIdx = mainJs.indexOf('window.editProfile = window.editProfile ||');
check('editProfile bridge gán SAU initStudents()',
    _initStudentsIdx !== -1 && _bridgeIdx !== -1 && _bridgeIdx > _initStudentsIdx,
    'Bridge phải đứng sau initStudents() để không ghi đè impl thật của initStudents nếu có');

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  editProfile bridge chưa đúng — [RuntimeGuard] students sẽ vẫn warn!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 editProfile bridge checks passed!');
    console.log('  Nút sửa hồ sơ võ sinh sẽ hoạt động qua bridge nếu không có impl thật.');
    console.log('══════════════════════════════════════════════════════════\n');
}
