/**
 * tools/check-admission-uniform-size.mjs — Phase 4K-3B
 *
 * Kiểm tra static: đảm bảo main.js và finance.events.js có đầy đủ các thành phần
 * cần thiết cho chức năng chọn size võ phục trong form Thu tiền nhập học.
 *
 * Chạy: npm run check:admission-uniform-size
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    const abs = resolve(root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
}

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';

let failures = 0;

function check(label, condition, hint) {
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-3B — Admission Uniform Size Check\n');

const mainJs     = readFile('js/main.js');
const finEvents  = readFile('js/events/finance.events.js');

// ── 1. window.ensureInventoryReady ────────────────────────────────────────
check(
    'main.js — window.ensureInventoryReady bridge',
    mainJs && mainJs.includes('ensureInventoryReady'),
    'Thêm window.ensureInventoryReady() trong _installAdmissionUniformSizeBridges()'
);

// ── 2. window.getUniformSizesFromInventory ────────────────────────────────
check(
    'main.js — window.getUniformSizesFromInventory bridge',
    mainJs && mainJs.includes('getUniformSizesFromInventory'),
    'Thêm window.getUniformSizesFromInventory() trong _installAdmissionUniformSizeBridges()'
);

// ── 3. window.renderAdmissionUniformSizeOptions ───────────────────────────
check(
    'main.js — window.renderAdmissionUniformSizeOptions bridge',
    mainJs && mainJs.includes('renderAdmissionUniformSizeOptions'),
    'Thêm window.renderAdmissionUniformSizeOptions() trong _installAdmissionUniformSizeBridges()'
);

// ── 4. event delegation choose-admission-uniform-size ─────────────────────
check(
    'finance.events.js — event delegation for choose-admission-uniform-size',
    finEvents && (
        finEvents.includes('choose-admission-uniform-size')
        || finEvents.includes('js-choose-admission-uniform-size')
    ),
    'Thêm event delegation closest([data-action="choose-admission-uniform-size"]) trong finance.events.js'
);

// ── 5. event delegation select-admission-uniform-size ─────────────────────
check(
    'finance.events.js — event delegation for select-admission-uniform-size',
    finEvents && finEvents.includes('select-admission-uniform-size'),
    'Thêm event delegation closest([data-action="select-admission-uniform-size"]) trong finance.events.js'
);

// ── 6. getUniformSizesFromInventory đọc từ window.__store.inventory ───────
check(
    'main.js — getUniformSizesFromInventory reads from window.__store.inventory',
    mainJs && mainJs.includes('__store') && mainJs.includes('st.inventory'),
    'getUniformSizesFromInventory() phải đọc từ window.__store.inventory'
);

// ── 7. getUniformSizesFromInventory hỗ trợ nhiều field name cho size ──────
check(
    'main.js — getUniformSizesFromInventory supports size/uniformSize/itemSize/variant fields',
    mainJs && mainJs.includes('uniformSize') && mainJs.includes('itemSize') && mainJs.includes('variant'),
    'getUniformSizesFromInventory() phải hỗ trợ item.size || item.uniformSize || item.itemSize || item.variant'
);

// ── 8. getUniformSizesFromInventory normalize tiếng Việt ─────────────────
check(
    'main.js — getUniformSizesFromInventory normalize Vietnamese (NFD / đ→d)',
    mainJs && (
        mainJs.includes('normalizeVNForSearch') ||
        (mainJs.includes('NFD') && mainJs.includes('đ'))
    ),
    'getUniformSizesFromInventory() phải filter võ phục bằng normalize tiếng Việt (NFD / đ→d)'
);

// ── 9. debugAdmissionUniformSize ─────────────────────────────────────────
check(
    'main.js — window.debugAdmissionUniformSize debug helper',
    mainJs && mainJs.includes('debugAdmissionUniformSize'),
    'Thêm window.debugAdmissionUniformSize() debug helper trong main.js'
);

// ── 10. _installAdmissionUniformSizeBridges called in bootstrap ───────────
check(
    'main.js — _installAdmissionUniformSizeBridges() called in bootstrap',
    mainJs && mainJs.includes('_installAdmissionUniformSizeBridges()'),
    'Gọi _installAdmissionUniformSizeBridges() trong bootstrap của main.js'
);

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failures === 0) {
    console.log('\x1b[32m🎉 Tất cả kiểm tra PASSED — Phase 4K-3B ready\x1b[0m\n');
    process.exit(0);
} else {
    console.log(`\x1b[31m💥 ${failures} kiểm tra FAILED — Cần sửa trước khi deploy\x1b[0m\n`);
    process.exit(1);
}
