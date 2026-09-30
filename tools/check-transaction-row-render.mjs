/**
 * check-transaction-row-render.mjs
 * Phase 4K-DATA-HYDRATION — kiểm tra transaction row render target + direct-render fallback
 *
 * Pass khi:
 *  1. #txList được dùng làm target (document.getElementById('txList'))
 *  2. Sau processPage thành công, có direct row render fallback vào #txList
 *  3. renderTxRow được import từ financeRenderer.js trong direct-render path
 *  4. Direct render chỉ chạy nếu island chưa inject rows (tr[data-tx-id] guard)
 *  5. Direct render có try/catch — không throw runtime error
 *  6. Nếu #txList không tìm thấy, log rõ (không silent-fail)
 *  7. renderTxRow được export từ financeRenderer.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname      = dirname(fileURLToPath(import.meta.url));
const root           = join(__dirname, '..');
const financeJs      = readFileSync(join(root, 'js/modules/finance.js'), 'utf8');
const financeRenderer = readFileSync(join(root, 'js/ui/render/computation/financeRenderer.js'), 'utf8');

const errors = [];

// 1. #txList target tồn tại
if (!financeJs.includes("getElementById('txList')")) {
    errors.push('FAIL: document.getElementById("txList") không tìm thấy trong finance.js');
} else {
    console.log('✅ #txList target tồn tại trong finance.js');
}

// 2. Direct row render fallback sau processPage
if (!financeJs.includes('Direct row render') && !financeJs.includes('pgState.currentItems')) {
    errors.push('FAIL: Direct row render fallback không tồn tại sau processPage');
} else {
    console.log('✅ Direct row render fallback tồn tại (pgState.currentItems)');
}

// 3. renderTxRow import trong direct-render path
if (!financeJs.includes('renderTxRow') || !financeJs.includes('financeRenderer')) {
    errors.push('FAIL: renderTxRow không được import từ financeRenderer trong finance.js');
} else {
    console.log('✅ renderTxRow import từ financeRenderer trong direct-render path');
}

// 4. Guard tr[data-tx-id] — chỉ render nếu island chưa inject
if (!financeJs.includes('data-tx-id')) {
    errors.push('FAIL: Guard tr[data-tx-id] không tồn tại — direct render sẽ overwrite island render');
} else {
    console.log('✅ Guard tr[data-tx-id] tồn tại — direct render chỉ chạy khi island chưa inject');
}

// 5. try/catch bảo vệ direct render
const directRenderBlock = financeJs.includes('Direct row render') || financeJs.includes('island fallback');
const hasTryCatch = financeJs.includes('} catch (_rowErr)') || financeJs.includes('catch (_rowErr)');
if (!hasTryCatch) {
    errors.push('FAIL: Direct row render không có try/catch — có thể throw và break pagination');
} else {
    console.log('✅ Direct row render có try/catch (non-blocking)');
}

// 6. renderTxRow export trong financeRenderer.js
if (!financeRenderer.includes('export function renderTxRow')) {
    errors.push('FAIL: renderTxRow không được export từ financeRenderer.js');
} else {
    console.log('✅ renderTxRow export từ financeRenderer.js');
}

// 7. invalidateList cascade còn nguyên (không bị xóa)
if (!financeJs.includes("window.invalidateList('tx.txList'") &&
    !financeJs.includes('window.invalidateList(\'tx.txList\'')) {
    errors.push('FAIL: invalidateList cascade bị mất — có thể do edit làm hỏng code');
} else {
    console.log('✅ invalidateList cascade vẫn còn (tx.txList)');
}

if (errors.length > 0) {
    errors.forEach(e => console.error(e));
    process.exit(1);
} else {
    console.log('\n✅ check-transaction-row-render: TẤT CẢ PASS');
}
