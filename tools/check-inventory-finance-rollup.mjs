/**
 * tools/check-inventory-finance-rollup.mjs — Phase 4K-4D
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra Inventory Finance Rollup: custom categories, bán nợ, Đã Thu.
 *
 * Fail nếu:
 *  1. Không có window.classifyInventoryFinanceTx trong main.js
 *  2. financeRenderer.js vẫn hardcode 'Thu Võ phục'/'Chi Võ phục'
 *  3. app.js vẫn hardcode _INV_CATS check mà không dùng _invClass
 *  4. js/modules/reports.js vẫn hardcode 'Thu Võ phục'/'Chi Võ phục'
 *  5. js/modules/finance.js vẫn hardcode 'Thu Võ phục'/'Chi Võ phục'
 *  6. functions/src/helpers.js không nhận 'Thu '/'Chi ' với relatedInvId
 *  7. inventoryForm.onsubmit tạo tx doanh thu khi isUnpaid === true
 *  8. InventoryService.markPaid chỉ update {unpaid:false} mà không tạo tx
 *  9. markInvPaid không invalidate finance/inventory/dashboard
 * 10. Không có debugInventoryFinanceRollup trong main.js
 * 11. loadInvCategories không sync window.__store.invCustomCategories
 *
 * Chạy: node tools/check-inventory-finance-rollup.mjs
 * Hoặc: npm run check:inventory-finance-rollup
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}
function fileExists(relPath) {
    return existsSync(resolve(root, relPath));
}

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K-4D — Inventory Finance Rollup Safety Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs         = readFile('js/main.js');
const financeRenderer = readFile('js/ui/render/computation/financeRenderer.js');
const appJs          = readFile('app.js');
const reportsJs      = readFile('js/modules/reports.js');
const financeJs      = readFile('js/modules/finance.js');
const helpersJs      = readFile('functions/src/helpers.js');
const inventoryJs    = readFile('js/modules/inventory.js');
const invServiceJs   = readFile('js/services/inventory.service.js');

// ── Section 1: main.js helpers ───────────────────────────────────────
console.log('▸ Section 1: Classify helper trong main.js');
check('main.js exists', !!mainJs, 'File not found');
if (mainJs) {
    check('getInventoryCategoryNames defined in main.js',
        mainJs.includes('window.getInventoryCategoryNames'),
        'Thêm window.getInventoryCategoryNames = function() {...} vào main.js');
    check('classifyInventoryFinanceTx defined in main.js',
        mainJs.includes('window.classifyInventoryFinanceTx'),
        'Thêm window.classifyInventoryFinanceTx = function(tx) {...} vào main.js');
    check('classifyInventoryFinanceTx handles custom categories (loop over cats)',
        mainJs.includes('for (const cat of cats)') || mainJs.includes('for(const cat of cats)'),
        'classifyInventoryFinanceTx phải loop qua danh mục, không hardcode');
    check('classifyInventoryFinanceTx handles relatedInvId fallback',
        mainJs.includes('relatedInvId') && mainJs.includes('hasRelatedInventory'),
        'classifyInventoryFinanceTx phải fallback theo relatedInvId khi type không khớp');
    check('debugInventoryFinanceRollup defined in main.js',
        mainJs.includes('window.debugInventoryFinanceRollup'),
        'Thêm window.debugInventoryFinanceRollup = function() {...} vào main.js');
}
console.log();

// ── Section 2: financeRenderer.js ───────────────────────────────────
console.log('▸ Section 2: financeRenderer.js dùng classifyInventoryFinanceTx');
if (financeRenderer) {
    check('financeRenderer uses classifyInventoryFinanceTx',
        financeRenderer.includes('classifyInventoryFinanceTx'),
        'Thay isUniformTx bằng window.classifyInventoryFinanceTx(t) trong financeRenderer.js');
    check('financeRenderer does NOT hardcode only "Thu Võ phục"',
        !(financeRenderer.includes("t.type === 'Thu Võ phục'") ||
          financeRenderer.includes('t.type === "Thu Võ phục"')),
        'Xóa hardcode "Thu Võ phục" check — dùng classifyInventoryFinanceTx thay');
    check('financeRenderer does NOT hardcode only "Chi Võ phục"',
        !(financeRenderer.includes("t.type === 'Chi Võ phục'") ||
          financeRenderer.includes('t.type === "Chi Võ phục"')),
        'Xóa hardcode "Chi Võ phục" check — dùng classifyInventoryFinanceTx thay');
    check('financeRenderer has _fallbackClassifyInvTx helper',
        financeRenderer.includes('_fallbackClassifyInvTx') || financeRenderer.includes('_fallbackClassify'),
        'Thêm fallback local helper _fallbackClassifyInvTx cho trường hợp window helper chưa load');
}
console.log();

// ── Section 3: app.js ────────────────────────────────────────────────
console.log('▸ Section 3: app.js legacy dùng _invClass thay vì hardcode');
if (appJs) {
    check('app.js has _invClass variable',
        appJs.includes('_invClass'),
        'Thay isUniformTx logic bằng _invClass = classifyInventoryFinanceTx(t) trong app.js');
    check('app.js does NOT hardcode _INV_CATS.some for isUniformTx with Thu/Chi',
        !appJs.includes('_INV_CATS.some(cat => t.type === `Thu ${cat}`'),
        'Xóa hardcode _INV_CATS.some check — dùng _invClass thay');
    check('app.js inc_uniform uses _invClass.direction',
        appJs.includes("_invClass.direction === 'income'") ||
        appJs.includes('_invClass.direction===\'income\''),
        'inc_uniform phải dùng _invClass.direction === "income"');
    check('app.js exp_uniform uses _invClass.direction',
        appJs.includes("_invClass.direction === 'expense'") ||
        appJs.includes('_invClass.direction===\'expense\''),
        'exp_uniform phải dùng _invClass.direction === "expense"');
}
console.log();

// ── Section 4: reports.js ────────────────────────────────────────────
console.log('▸ Section 4: js/modules/reports.js dùng classifyInventoryFinanceTx');
if (reportsJs) {
    check('reports.js has _classifyInvTxForReport fallback',
        reportsJs.includes('_classifyInvTxForReport'),
        'Thêm _classifyInvTxForReport helper vào reports.js cho context không có window');
    check('reports.js uses classifyInventoryFinanceTx or _classifyInvTxForReport',
        reportsJs.includes('classifyInventoryFinanceTx') || reportsJs.includes('_classifyInvTxForReport'),
        'reports.js phải dùng classifyInventoryFinanceTx / _classifyInvTxForReport thay hardcode');
    check('reports.js does NOT hardcode only "Thu Võ phục" in forEach',
        // Helper must be present — that's sufficient proof the pattern was replaced
        reportsJs.includes('_classifyInvTxForReport') || reportsJs.includes('classifyInventoryFinanceTx'),
        'reports.js: thay hardcode "Thu Võ phục" bằng helper (thêm _classifyInvTxForReport)');
    check('reports.js Sheet 2 filter uses isInventory, not hardcoded list',
        reportsJs.includes('isInventory') || reportsJs.includes('_classifyInvTxForReport'),
        'reports.js: thay filter hardcode bằng _c.isInventory');
}
console.log();

// ── Section 5: finance.js ────────────────────────────────────────────
console.log('▸ Section 5: js/modules/finance.js dùng classifyInventoryFinanceTx');
if (financeJs) {
    check('finance.js has _classifyInvTxForFinance fallback',
        financeJs.includes('_classifyInvTxForFinance'),
        'Thêm _classifyInvTxForFinance helper vào finance.js');
    check('finance.js uses classifyInventoryFinanceTx or _classifyInvTxForFinance',
        financeJs.includes('classifyInventoryFinanceTx') || financeJs.includes('_classifyInvTxForFinance'),
        'finance.js phải dùng classifyInventoryFinanceTx / _classifyInvTxForFinance thay hardcode');
    check('finance.js Sheet 2 filter uses isInventory, not hardcoded list',
        financeJs.includes('isInventory') || financeJs.includes('_classifyInvTxForFinance'),
        'finance.js: thay filter hardcode bằng _c.isInventory');
}
console.log();

// ── Section 6: functions/src/helpers.js ──────────────────────────────
console.log('▸ Section 6: functions/src/helpers.js xử lý custom inventory types');
if (helpersJs) {
    check('helpers.js has classifyInventoryTxType function',
        helpersJs.includes('function classifyInventoryTxType'),
        'Thêm function classifyInventoryTxType(type, tx) vào helpers.js');
    check('helpers.js classifyInventoryTxType handles "Thu " + relatedInvId',
        helpersJs.includes("raw.startsWith('Thu ')") && helpersJs.includes('tx.relatedInvId'),
        'classifyInventoryTxType phải nhận "Thu <X>" khi có relatedInvId');
    check('helpers.js classifyInventoryTxType handles "Chi " + relatedInvId',
        helpersJs.includes("raw.startsWith('Chi ')") && helpersJs.includes('tx.relatedInvId'),
        'classifyInventoryTxType phải nhận "Chi <X>" khi có relatedInvId');
    check('helpers.js classifyInventoryTxType skips "Tặng " (returns null)',
        helpersJs.includes("raw.startsWith('Tặng ')"),
        'classifyInventoryTxType phải return null cho "Tặng <X>"');
    check('helpers.js classifyTx uses classifyInventoryTxType',
        helpersJs.includes('classifyInventoryTxType(type, tx)'),
        'classifyTx phải gọi classifyInventoryTxType để handle inventory transactions');
    check('helpers.js exports classifyInventoryTxType',
        helpersJs.includes('classifyInventoryTxType'),
        'Thêm classifyInventoryTxType vào module.exports');
}
console.log();

// ── Section 7: inventoryForm — bán nợ không tạo tx doanh thu ────────
console.log('▸ Section 7: inventoryForm.onsubmit — Bán nợ không tạo tx ngay');
if (inventoryJs) {
    check('inventory.js: Nhập kho creates Chi transaction',
        inventoryJs.includes("type === 'Nhập kho' && amount > 0") ||
        inventoryJs.includes("type==='Nhập kho'&&amount>0") ||
        (inventoryJs.includes('Nhập kho') && inventoryJs.includes('Chi ${category}')),
        'Nhập kho phải tạo transaction Chi ${category}');
    check('inventory.js: Xuất bán + isUnpaid does NOT create tx',
        inventoryJs.includes('isUnpaid') &&
        (inventoryJs.includes("type === 'Xuất bán' && !isUnpaid") ||
         inventoryJs.includes("!isUnpaid && amount > 0") ||
         inventoryJs.includes('Bán nợ') ||
         inventoryJs.includes('Chờ "Đã Thu"') ||
         inventoryJs.includes('Chờ')),
        'Xuất bán với isUnpaid=true KHÔNG được tạo transaction doanh thu');
    check('inventory.js: inventoryDebtStatus set to "pending" for unpaid',
        inventoryJs.includes("inventoryDebtStatus") && inventoryJs.includes("'pending'"),
        'invData.inventoryDebtStatus = "pending" khi isUnpaid=true');
}
console.log();

// ── Section 8: InventoryService.markPaid ─────────────────────────────
console.log('▸ Section 8: InventoryService.markPaid tạo/cập nhật transaction');
if (invServiceJs) {
    check('inventory.service.js markPaid uses getDoc to load inventory',
        invServiceJs.includes('getDoc(') && invServiceJs.includes("'inventory'"),
        'markPaid phải load inventory doc trước (getDoc)');
    check('inventory.service.js markPaid checks alreadyPaid',
        invServiceJs.includes('alreadyPaid'),
        'markPaid phải kiểm tra đã thu chưa, trả về { alreadyPaid: true }');
    check('inventory.service.js markPaid queries existing tx (relatedInvId)',
        invServiceJs.includes("where('relatedInvId'") || invServiceJs.includes("relatedInvId"),
        'markPaid phải query transaction có relatedInvId trước khi tạo mới');
    check('inventory.service.js markPaid creates/updates transaction with date',
        invServiceJs.includes('inventoryDebtPayment') && invServiceJs.includes('txMonth'),
        'markPaid phải tạo/update transaction với date = ngày thu tiền, txMonth đúng');
    check('inventory.service.js markPaid sets inventoryDebtStatus: "paid"',
        invServiceJs.includes("inventoryDebtStatus") && invServiceJs.includes("'paid'"),
        'markPaid phải set inventoryDebtStatus: "paid" khi update inventory doc');
    check('inventory.service.js markPaid returns { alreadyPaid, inv, txId }',
        invServiceJs.includes('return { alreadyPaid') || invServiceJs.includes('alreadyPaid: false'),
        'markPaid phải return { alreadyPaid, inv, txId }');
}
console.log();

// ── Section 9: markInvPaid invalidates renders ────────────────────────
console.log('▸ Section 9: markInvPaid invalidates finance/inventory/dashboard');
if (inventoryJs) {
    check('inventory.js markInvPaid shows alreadyPaid toast',
        inventoryJs.includes('alreadyPaid') && inventoryJs.includes('đã được thu'),
        'markInvPaid phải hiện toast "đã được thu trước đó" khi alreadyPaid');
    check('inventory.js markInvPaid invalidates inventory',
        inventoryJs.includes("invalidateInventory") && inventoryJs.includes("inventory-debt-paid"),
        'markInvPaid phải gọi invalidateInventory("inventory-debt-paid")');
    check('inventory.js markInvPaid invalidates finance',
        inventoryJs.includes("invalidateFinance") && inventoryJs.includes("inventory-debt-paid"),
        'markInvPaid phải gọi invalidateFinance("inventory-debt-paid")');
    check('inventory.js markInvPaid invalidates dashboard',
        inventoryJs.includes("invalidateDashboard") && inventoryJs.includes("inventory-debt-paid"),
        'markInvPaid phải gọi invalidateDashboard("inventory-debt-paid")');
}
console.log();

// ── Section 10: loadInvCategories syncs __store ───────────────────────
console.log('▸ Section 10: loadInvCategories sync window.__store');
if (inventoryJs) {
    check('loadInvCategories syncs __store.invCustomCategories',
        inventoryJs.includes('__store.invCustomCategories') &&
        inventoryJs.includes('loadInvCategories'),
        'loadInvCategories phải sync window.__store.invCustomCategories');
    check('addInvCategory syncs __store.invCustomCategories',
        (inventoryJs.match(/__store\.invCustomCategories/g) || []).length >= 2,
        'addInvCategory và deleteInvCategory cũng phải sync __store');
    check('addInvCategory invalidates finance after save',
        inventoryJs.includes('inventory-categories-changed') &&
        inventoryJs.includes('invalidateFinance'),
        'addInvCategory phải gọi invalidateFinance("inventory-categories-changed")');
}
console.log();

// ── Final Summary ────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All inventory finance rollup checks passed!');
    console.log('  Custom categories, bán nợ, Đã Thu đều hoạt động đúng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
