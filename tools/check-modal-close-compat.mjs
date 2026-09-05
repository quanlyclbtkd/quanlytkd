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

console.log('\n▸ Section 2: registerModalGlobals — canonical ownership + legacy compatibility');
if (modalJs) {
    const closeOwnerRegistrations = (modalJs.match(/GlobalOwnershipRegistry\.register\(['\"]closeModal['\"]/g) || []).length;
    check(
        'closeModal có đúng ONE canonical GlobalOwnershipRegistry owner',
        closeOwnerRegistrations === 1 && modalJs.includes("owner: 'js/ui/modal.js'") && modalJs.includes("policy: 'module-primary'"),
        'closeModal must have exactly one module-primary registry owner in js/ui/modal.js'
    );

    check(
        'Legacy closeModal fallback được lấy qua GlobalOwnershipRegistry',
        modalJs.includes("GlobalOwnershipRegistry.getLegacyFallback('closeModal')") && modalJs.includes('window.closeModalLegacy'),
        "Compatibility must reuse GlobalOwnershipRegistry.getLegacyFallback('closeModal'), not capture/overwrite window.closeModal directly"
    );

    check(
        'registerModalGlobals không tạo second window.closeModal owner',
        !/window\.closeModal\s*=/.test(modalJs),
        'Canonical window.closeModal is installed by GlobalOwnershipRegistry; modal.js must not assign a second owner'
    );

    check(
        'Canonical closeModal hỗ trợ cả no-arg và explicit modalId',
        (modalJs.includes("closeModal(modalId = 'profileModal')") || modalJs.includes('closeModal(modalId = "profileModal")')) &&
        (modalJs.includes("modalId || 'profileModal'") || modalJs.includes('modalId || "profileModal"')),
        'closeModal() must default to profileModal while closeModal(id) keeps explicit target support'
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
