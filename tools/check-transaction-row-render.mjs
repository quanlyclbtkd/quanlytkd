/**
 * check-transaction-row-render.mjs
 * Transaction page stays inside the list island; accounting remains listener-owned.
 *
 * Pass khi:
 *  1. #txList được dùng làm target (document.getElementById('txList'))
 *  2. Page state is passed to the existing list renderer without hydrating the ledger
 *  3. renderTxRow is called from that renderer for the matching month/search
 *  4. A redraw uses the same page state
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
const renderFinance = readFileSync(join(root, 'js/ui/render/renderFinance.js'), 'utf8');

const errors = [];

// 1. #txList target tồn tại
if (!financeJs.includes("getElementById('txList')")) {
    errors.push('FAIL: document.getElementById("txList") không tìm thấy trong finance.js');
} else {
    console.log('✅ #txList target tồn tại trong finance.js');
}

// 2. Partial page must not hydrate ledger or dashboard
if (!financeJs.includes('pgState._displayContextKey = contextKey') ||
    financeJs.includes('window.__store.transactions = pgState.currentItems') ||
    financeJs.includes("'tx-pagination-data-hydrated'")) {
    errors.push('FAIL: pagination leaks page data into accounting or does not set context');
} else {
    console.log('✅ Pagination keeps page separate from ledger and dashboard');
}

// 3. Existing list renderer owns rows
if (!renderFinance.includes('renderTxRow(tx,') || !renderFinance.includes('pg._displayContextKey === context')) {
    errors.push('FAIL: transaction island does not render the matching page');
} else {
    console.log('✅ Transaction island renders the matching page');
}

// 4. Direct render and later invalidations share the same owner
if (!financeJs.includes('renderTxIsland();') || !renderFinance.includes('export function renderTxIsland()')) {
    errors.push('FAIL: page presentation is not stable across redraws');
} else {
    console.log('✅ Page presentation shares the island owner');
}

// 5. try/catch bảo vệ direct render
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
