/**
 * tools/check-legacy-status-compat.mjs — Phase 4K-STUDENT-LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra classifyProfileStatus() xử lý data cũ thiếu status đúng:
 * 1. classifyProfileStatus(profile) không trả 'other' khi status missing
 * 2. Missing status → 'active' (legacy compat)
 * 3. Explicit quit signals → 'quit' (quit=true, stopped=true, isQuit=true, active=false)
 * 4. classifyProfileStatus exported từ profileStatusConfig.js
 * 5. Hàm có comment về legacy compat
 *
 * Chạy: node tools/check-legacy-status-compat.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Legacy Status Compat Check — Phase 4K-STUDENT-LIST');
console.log('══════════════════════════════════════════════════════════\n');

const configJs = readFile('js/data/profileStatusConfig.js');

if (!configJs) {
    console.error('  ❌ FATAL: js/data/profileStatusConfig.js không tìm thấy');
    process.exit(1);
}

console.log('▸ Section 1: classifyProfileStatus() export');
check('classifyProfileStatus được export từ profileStatusConfig.js',
    configJs.includes('export function classifyProfileStatus'),
    'Cần: export function classifyProfileStatus(profile) { ... }');

console.log();
console.log('▸ Section 2: Missing status → active (không phải other)');
check('Missing status không trả "other" (return other đã bị xóa/thay thế)',
    !configJs.includes("if (!status) return 'other'") &&
    !configJs.includes('if (!status) return "other"'),
    'if (!status) return \'other\'; cần đổi thành return \'active\';');

check('Missing status trả "active" (legacy compat)',
    (configJs.includes("if (!status) return 'active'") ||
     configJs.includes('if (!status) return "active"')),
    'Thêm: if (!status) return \'active\'; // Legacy profiles without status are treated as active');

check('Unknown status fallback là "active" (cuối hàm)',
    (configJs.includes("return 'active';") &&
     !configJs.includes("return 'other';")),
    'Dòng cuối classifyProfileStatus phải là: return \'active\'; (không phải return \'other\';)');

console.log();
console.log('▸ Section 3: Boolean quit signals');
check('Kiểm tra quit === true hoặc stopped === true hoặc isQuit === true',
    configJs.includes('profile.quit === true') ||
    configJs.includes('profile.stopped === true') ||
    configJs.includes('profile.isQuit === true'),
    'Thêm: if (profile.quit === true || profile.stopped === true || profile.isQuit === true) return \'quit\';');

check('Kiểm tra active === false hoặc isActive === false → quit',
    configJs.includes('profile.active === false') ||
    configJs.includes('profile.isActive === false'),
    'Thêm: if (profile.active === false || profile.isActive === false) return \'quit\';');

console.log();
console.log('▸ Section 4: Comment về legacy compat');
check('Có comment về legacy profiles without status',
    configJs.includes('Legacy profiles without status'),
    'Thêm comment: // Legacy profiles without status are treated as active unless explicitly quit.');

console.log();
console.log('▸ Section 5: classifyProfileStatus được expose trên window (trong app.js hoặc main.js)');
const appJs  = readFile('app.js');
const mainJs = readFile('js/main.js');
const exposedOnWindow =
    (appJs  && (appJs.includes('window.classifyProfileStatus') || appJs.includes('classifyProfileStatus'))) ||
    (mainJs && (mainJs.includes('window.classifyProfileStatus') || mainJs.includes('classifyProfileStatus')));
check('classifyProfileStatus referenced trong app.js hoặc main.js',
    !!exposedOnWindow,
    'Cần expose hoặc reference window.classifyProfileStatus trong app.js / main.js');

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  classifyProfileStatus() chưa xử lý đúng data cũ!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Legacy status compat checks passed!');
    console.log('  classifyProfileStatus() xử lý đúng data cũ thiếu status.');
    console.log('══════════════════════════════════════════════════════════\n');
}
