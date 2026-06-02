/**
 * tools/check-finance-indexes.mjs — Phase 4K-FINANCE-INDEX-HOTFIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra firestore.indexes.json có đủ các composite index cần thiết
 * cho finance pagination queries trong js/services/finance.service.js.
 *
 * Chạy: node tools/check-finance-indexes.mjs
 * Hoặc: npm run check:finance-indexes
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

/** Kiểm tra một index có tồn tại trong mảng indexes không. */
function hasIndex(indexes, collectionGroup, fieldDefs) {
    return indexes.some(idx => {
        if (idx.collectionGroup !== collectionGroup) return false;
        if (!idx.fields || idx.fields.length !== fieldDefs.length) return false;
        return fieldDefs.every((fd, i) =>
            idx.fields[i].fieldPath === fd.fieldPath &&
            idx.fields[i].order    === fd.order
        );
    });
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K — Finance Pagination Index Check');
console.log('══════════════════════════════════════════════════════════\n');

// ── Section 1: Đọc firestore.indexes.json ────────────────────────────
console.log('▸ Section 1: firestore.indexes.json tồn tại và hợp lệ');
const raw = readFile('firestore.indexes.json');
check('firestore.indexes.json exists', !!raw, 'Tạo file firestore.indexes.json');
let indexes = [];
if (raw) {
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
        check('File là valid JSON', true);
    } catch (e) {
        check('File là valid JSON', false, 'JSON parse error: ' + e.message);
    }
    if (parsed) {
        indexes = parsed.indexes || [];
        check('indexes array tồn tại và không rỗng',
            Array.isArray(indexes) && indexes.length > 0,
            'firestore.indexes.json cần có mảng "indexes" với ít nhất một entry');
    }
}
console.log();

// ── Section 2: Index cho getTransactionsPage (PRIMARY — CRITICAL) ────
// Query: where('txMonth', '==', monthStr) + orderBy('timestamp', 'desc')
// → Cần composite index: txMonth ASC + timestamp DESC
console.log('▸ Section 2: Index chính cho getTransactionsPage()');
console.log('  Query: where("txMonth", "==", ...) + orderBy("timestamp", "desc")');

check(
    'transactions: txMonth ASC + timestamp DESC  ← CRITICAL cho finance pagination',
    hasIndex(indexes, 'transactions', [
        { fieldPath: 'txMonth',    order: 'ASCENDING'  },
        { fieldPath: 'timestamp',  order: 'DESCENDING' },
    ]),
    'Thêm index: {"collectionGroup":"transactions","queryScope":"COLLECTION",' +
    '"fields":[{"fieldPath":"txMonth","order":"ASCENDING"},{"fieldPath":"timestamp","order":"DESCENDING"}]}'
);
console.log();

// ── Section 3: Index cho filter theo branch + txMonth ────────────────
// Query: where('branch', '==', ...) + where('txMonth', '==', ...) + orderBy('timestamp', 'desc')
console.log('▸ Section 3: Index phụ cho filter branch + txMonth');
check(
    'transactions: branch ASC + txMonth DESC + timestamp DESC',
    hasIndex(indexes, 'transactions', [
        { fieldPath: 'branch',    order: 'ASCENDING'  },
        { fieldPath: 'txMonth',   order: 'DESCENDING' },
        { fieldPath: 'timestamp', order: 'DESCENDING' },
    ]),
    'Cần nếu query finance có filter theo branch + txMonth đồng thời'
);

// type filter
check(
    'transactions: type ASC + txMonth DESC + timestamp DESC',
    hasIndex(indexes, 'transactions', [
        { fieldPath: 'type',      order: 'ASCENDING'  },
        { fieldPath: 'txMonth',   order: 'DESCENDING' },
        { fieldPath: 'timestamp', order: 'DESCENDING' },
    ]),
    'Cần nếu query finance có filter theo type + txMonth đồng thời'
);
console.log();

// ── Section 4: Index cho getTransactionsByDatePage ───────────────────
// Query: where('date', '>=', ...) + where('date', '<=', ...) + orderBy('date', 'desc')
// Range filter + orderBy cùng field → Firestore tự handle, không cần composite
// Query fallback: orderBy('timestamp', 'desc') → single field, không cần composite
console.log('▸ Section 4: Index cho getTransactionsByDatePage()');
check(
    'transactions: date ASC + timestamp ASC  (date range queries)',
    hasIndex(indexes, 'transactions', [
        { fieldPath: 'date',      order: 'ASCENDING' },
        { fieldPath: 'timestamp', order: 'ASCENDING' },
    ]),
    'Cần cho query date range + secondary sort theo timestamp'
);
console.log();

// ── Section 5: Đọc finance.service.js xác nhận query thực tế ─────────
console.log('▸ Section 5: Xác nhận query thực tế trong finance.service.js');
const svc = readFile('js/services/finance.service.js');
if (svc) {
    check(
        'getTransactionsPage dùng where("txMonth") + orderBy("timestamp")',
        svc.includes("where('txMonth'") && svc.includes("orderBy('timestamp'"),
        'finance.service.js::getTransactionsPage phải có where txMonth + orderBy timestamp'
    );
    check(
        'getTransactionsPage dùng cursor pagination (startAfter / startAt)',
        svc.includes('startAfter') && svc.includes('startAt'),
        'Cần startAfter/startAt cho cursor-based pagination'
    );
} else {
    check('js/services/finance.service.js tồn tại', false, 'File finance.service.js không tìm thấy');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Finance pagination sẽ lỗi "The query requires an index" trên production!');
    console.error('  → Deploy: firebase deploy --only firestore:indexes');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Finance index checks passed!');
    console.log('  → Deploy: firebase deploy --only firestore:indexes');
    console.log('══════════════════════════════════════════════════════════\n');
}
