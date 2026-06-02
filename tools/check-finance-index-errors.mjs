/**
 * tools/check-finance-index-errors.mjs — Phase 4K-FINANCE-INDEX-HOTFIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra finance pagination có xử lý đúng lỗi "failed-precondition /
 * query requires an index" không:
 *   1. _doLoad bắt lỗi "failed-precondition" và "requires an index".
 *   2. Khi thiếu index, hiển thị thông báo rõ trong UI (txList).
 *   3. Không set data = 0 khi lỗi index.
 *   4. Log link Firebase Console nếu có.
 *   5. Không crash app.
 *
 * Chạy: node tools/check-finance-index-errors.mjs
 * Hoặc: npm run check:finance-index-errors
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

let pass = 0, fail = 0;
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

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K — Finance Index Error Handling Check');
console.log('══════════════════════════════════════════════════════════\n');

const financeJs = readFile('js/modules/finance.js');
if (!financeJs) {
    console.error('  ❌ FATAL: js/modules/finance.js không tìm thấy');
    process.exit(1);
}

// ── Section 1: Catch block tồn tại trong _doLoad ─────────────────────
console.log('▸ Section 1: Catch block trong _doLoad()');
check(
    '_doLoad có try/catch block',
    financeJs.includes('} catch (err)') || financeJs.includes('catch(err)'),
    'Thêm try/catch vào _doLoad() trong initTransactionPagination'
);
check(
    'Lỗi load trang được log (console.error)',
    financeJs.includes('[pagination/transactions]') && financeJs.includes('Lỗi load trang'),
    "console.error('[pagination/transactions] Lỗi load trang:', err)"
);
console.log();

// ── Section 2: Detect lỗi thiếu index ───────────────────────────────
console.log('▸ Section 2: Detect lỗi "failed-precondition / requires an index"');
check(
    'Bắt chuỗi "failed-precondition"',
    financeJs.includes('failed-precondition'),
    "errMsg.includes('failed-precondition')"
);
check(
    'Bắt chuỗi "requires an index"',
    financeJs.includes('requires an index'),
    "errMsg.includes('requires an index')"
);
check(
    'Bắt chuỗi "The query requires an index"',
    financeJs.includes('The query requires an index'),
    "errMsg.includes('The query requires an index')"
);
console.log();

// ── Section 3: Hiển thị thông báo rõ trong UI ───────────────────────
console.log('▸ Section 3: Thông báo rõ trong UI (txList)');
check(
    'Tìm element txList để hiển thị lỗi',
    financeJs.includes("getElementById('txList')") || financeJs.includes('getElementById("txList")'),
    "document.getElementById('txList') để inject thông báo lỗi"
);
check(
    'Thông báo tiếng Việt có ý nghĩa (không chỉ trống)',
    financeJs.includes('Thiếu Firestore index') || financeJs.includes('Firestore index'),
    "Thêm thông báo 'Thiếu Firestore index — danh sách giao dịch chưa tải được'"
);
check(
    'Hướng dẫn deploy firestore.indexes.json trong thông báo',
    financeJs.includes('firestore.indexes.json') || financeJs.includes('Console'),
    "Thêm hướng dẫn: 'Admin cần deploy firestore.indexes.json hoặc bấm link trong Console'"
);
console.log();

// ── Section 4: Log Firebase Console link ─────────────────────────────
console.log('▸ Section 4: Log Firebase Console link khi có');
check(
    'Trích xuất link console.firebase.google.com từ error message',
    // regex in source uses \. escapes, so look for both plain and regex-escaped forms
    financeJs.includes('console.firebase.google.com') ||
    financeJs.includes('console\\.firebase\\.google\\.com') ||
    financeJs.includes('linkMatch'),
    "const linkMatch = errMsg.match(/https:\\/\\/console\\.firebase\\.google\\.com\\/[^\\s]+/)"
);
console.log();

// ── Section 5: Không set data = 0 khi lỗi index ─────────────────────
console.log('▸ Section 5: Không kết luận dữ liệu = 0 khi lỗi index');
// Kiểm tra isLoading được reset đúng — dùng lastIndexOf để tìm catch block trong _doLoad
check(
    'pgState.isLoading = false trong catch block của _doLoad',
    (() => {
        // Tìm catch block cuối cùng trong initTransactionPagination context
        const pgSection = financeJs.indexOf('initTransactionPagination');
        if (pgSection === -1) return false;
        const pgBlock = financeJs.slice(pgSection);
        const catchIdx = pgBlock.lastIndexOf('} catch (err)');
        if (catchIdx === -1) return false;
        const catchBlock = pgBlock.slice(catchIdx, catchIdx + 800);
        return catchBlock.includes('isLoading = false') || catchBlock.includes('pgState.isLoading = false');
    })(),
    'pgState.isLoading = false trong catch block của _doLoad để không stuck'
);
check(
    'processPage() chỉ gọi trong try block, không trong catch của _doLoad',
    (() => {
        // Tìm catch block cuối trong initTransactionPagination
        const pgSection = financeJs.indexOf('initTransactionPagination');
        if (pgSection === -1) return true;
        const pgBlock = financeJs.slice(pgSection);
        const catchIdx = pgBlock.lastIndexOf('} catch (err)');
        if (catchIdx === -1) return true;
        // Catch block ends at next closing brace sequence
        const catchBlock = pgBlock.slice(catchIdx, catchIdx + 800);
        return !catchBlock.includes('processPage(snap');
    })(),
    'Không gọi processPage(snap, ...) trong catch block — dữ liệu cũ được giữ nguyên'
);
console.log();

// ── Section 6: Finance service bắt đúng query ────────────────────────
console.log('▸ Section 6: Finance service — query đúng');
const svc = readFile('js/services/finance.service.js');
if (svc) {
    check(
        'getTransactionsPage dùng where("txMonth") filter',
        svc.includes("where('txMonth'") || svc.includes('where("txMonth"'),
        "constraints.push(where('txMonth', '==', monthStr))"
    );
    check(
        'getTransactionsPage dùng orderBy("timestamp", "desc")',
        svc.includes("orderBy('timestamp', 'desc')") || svc.includes('orderBy("timestamp", "desc")'),
        "constraints.push(orderBy('timestamp', 'desc'))"
    );
} else {
    check('js/services/finance.service.js tồn tại', false, 'File không tìm thấy');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Finance pagination không xử lý đúng lỗi thiếu index!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Finance index error handling checks passed!');
    console.log('  Khi index thiếu: UI sẽ hiện thông báo rõ thay vì trống/0.');
    console.log('══════════════════════════════════════════════════════════\n');
}
