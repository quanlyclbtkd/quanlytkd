/**
 * tools/check-modal-close-compat.mjs
 * ─────────────────────────────────────────────────
 * Fail nếu:
 *   1. js/ui/modal.js closeModal không có default 'profileModal'
 *   2. index.html còn profileModal button onclick="closeModal()" không có arg
 *      (phải là closeModal('profileModal'))
 *   3. registerModalGlobals ghi đè legacy closeModal mà không giữ compatibility
 *
 * Chạy: node tools/check-modal-close-compat.mjs
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
console.log('  check:modal-close-compat');
console.log('══════════════════════════════════════════════════════════\n');

const modalJs   = readFile('js/ui/modal.js');
const indexHtml = readFile('index.html');

console.log('▸ Section 1: modal.js — default parameter cho closeModal');
if (modalJs) {
    check(
        'closeModal có default profileModal',
        modalJs.includes("closeModal(modalId = 'profileModal')") ||
        modalJs.includes('closeModal(modalId = "profileModal")'),
        "closeModal phải có: export function closeModal(modalId = 'profileModal') {"
    );

    check(
        'openModal có default profileModal',
        modalJs.includes("openModal(modalId = 'profileModal'") ||
        modalJs.includes('openModal(modalId = "profileModal"'),
        "openModal phải có: export function openModal(modalId = 'profileModal', display = 'flex') {"
    );

    check(
        'closeModal dùng fallback: const id = modalId || "profileModal"',
        modalJs.includes("modalId || 'profileModal'") ||
        modalJs.includes('modalId || "profileModal"'),
        "Thêm: const id = modalId || 'profileModal'; const el = document.getElementById(id);"
    );
}

console.log('\n▸ Section 2: registerModalGlobals — legacy compatibility');
if (modalJs) {
    check(
        'registerModalGlobals lưu legacyClose trước khi ghi đè',
        modalJs.includes('legacyClose') || modalJs.includes('legacyClose = window.closeModal'),
        "Thêm: const legacyClose = window.closeModal; trước khi gán window.closeModal"
    );

    check(
        'registerModalGlobals assign window.closeModalLegacy',
        modalJs.includes('window.closeModalLegacy'),
        "Thêm: window.closeModalLegacy = legacyClose;"
    );

    check(
        'window.closeModal trong registerModalGlobals xử lý cả có và không có arg',
        modalJs.includes('window.closeModal = function(modalId)') ||
        modalJs.includes("window.closeModal = function(modalId){"),
        "window.closeModal phải: if (modalId) return closeModal(modalId); return closeModal('profileModal');"
    );
}

console.log('\n▸ Section 3: index.html — không còn onclick="closeModal()" không arg cho profileModal');
if (indexHtml) {
    const bareCloseModal = (indexHtml.match(/onclick="closeModal\(\)"/g) || []).length;
    check(
        'Không còn onclick="closeModal()" không có argument',
        bareCloseModal === 0,
        `Còn ${bareCloseModal} occurrence(s) của onclick="closeModal()". Đổi thành onclick="closeModal('profileModal')"`
    );

    check(
        'Có onclick="closeModal(\'profileModal\')" trong index.html',
        indexHtml.includes("closeModal('profileModal')") ||
        indexHtml.includes('closeModal("profileModal")'),
        "Phải có ít nhất 1 closeModal('profileModal') trong index.html"
    );
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Modal close compatibility checks passed!');
    console.log('══════════════════════════════════════════════════════════\n');
}
