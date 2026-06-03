/**
 * tools/check-students-render-classifier.mjs — Phase 4K-STUDENT-LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra studentsRenderer dùng classifier chung thay vì p.status === 'quit':
 * 1. studentsRenderer.js không dùng trực tiếp p.status === 'quit' trong PASS 1 / PASS 2
 * 2. Dùng classifyProfileStatus hoặc window.classifyProfileStatus
 * 3. Import classifyProfileStatus từ profileStatusConfig.js
 * 4. Áp dụng trong cả PASS 1 (full iteration) và PASS 2 (pagination override)
 *
 * Chạy: node tools/check-students-render-classifier.mjs
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
console.log('  Students Render Classifier Check — Phase 4K-STUDENT-LIST');
console.log('══════════════════════════════════════════════════════════\n');

const rendererJs = readFile('js/ui/render/computation/studentsRenderer.js');

if (!rendererJs) {
    console.error('  ❌ FATAL: js/ui/render/computation/studentsRenderer.js không tìm thấy');
    process.exit(1);
}

console.log('▸ Section 1: Import classifyProfileStatus');
check('studentsRenderer.js import classifyProfileStatus từ profileStatusConfig.js',
    rendererJs.includes('classifyProfileStatus') &&
    rendererJs.includes('profileStatusConfig.js'),
    "Thêm: import { classifyProfileStatus } from '../../../data/profileStatusConfig.js';");

console.log();
console.log('▸ Section 2: Không dùng p.status === \'quit\' trực tiếp');
// Đếm số lần xuất hiện của pattern cũ trong code thực (bỏ qua comment lines)
function countRawQuitChecks(src) {
    if (!src) return 0;
    let count = 0;
    for (const line of src.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        if (/p\.status\s*===\s*['"]quit['"]/.test(trimmed)) count++;
    }
    return count;
}
const _rawQuitChecks = countRawQuitChecks(rendererJs);
check('studentsRenderer.js không dùng p.status === \'quit\' trực tiếp trong compute logic (non-comment)',
    _rawQuitChecks === 0,
    'Thay p.status === \'quit\' bằng classifier: classifyProfileStatus(p) === \'quit\'');

console.log();
console.log('▸ Section 3: Classifier dùng trong PASS 1');
check('PASS 1 dùng classifyProfileStatus hoặc window.classifyProfileStatus',
    (rendererJs.includes('classifyProfileStatus(p)') ||
     rendererJs.includes('window.classifyProfileStatus')) &&
    rendererJs.includes('PASS 1'),
    'Trong PASS 1 (full iteration): const _pKind = classifyProfileStatus(p); const isQuit = _pKind === \'quit\';');

console.log();
console.log('▸ Section 4: Classifier dùng trong PASS 2');
check('PASS 2 dùng classifyProfileStatus hoặc window.classifyProfileStatus',
    (rendererJs.includes('classifyProfileStatus(p)') ||
     rendererJs.includes('window.classifyProfileStatus') ||
     rendererJs.includes('_pKind2')) &&
    rendererJs.includes('PASS 2'),
    'Trong PASS 2 (pagination override): cũng dùng classifyProfileStatus(p) thay vì p.status === \'quit\'');

console.log();
console.log('▸ Section 5: isQuit / isActive được tính từ classifier output');
check('isQuit được tính từ classifier === \'quit\' (không phải direct status check)',
    rendererJs.includes("=== 'quit'") &&
    (rendererJs.includes('_pKind') || rendererJs.includes('statusKind') || rendererJs.includes('classifyProfileStatus')),
    'const isQuit = _pKind === \'quit\'; const isActive = !isQuit;');

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  studentsRenderer vẫn dùng p.status === \'quit\' — data cũ sẽ không hiển thị đúng!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Students render classifier checks passed!');
    console.log('  studentsRenderer dùng classifier chung — data cũ thiếu status được xử lý đúng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
