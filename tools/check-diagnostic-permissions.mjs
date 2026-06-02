/**
 * tools/check-diagnostic-permissions.mjs — Phase 4K-FINANCE-INDEX-HOTFIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra printClubRuntimeDiagnostics xử lý đúng lỗi permission-denied:
 *   1. Khi permission-denied, chỉ log cảnh báo, không kết luận dữ liệu = 0.
 *   2. Diagnostic query dùng đúng path club-scoped (clubs/{clubId}/...).
 *   3. Không set UI count = 0 khi diagnostic bị chặn.
 *   4. Không tự động chạy diagnostic khi load — chỉ khi gọi thủ công.
 *   5. Cảnh báo "permission-denied" không được dùng để set dữ liệu = 0.
 *   6. Diagnostic dùng getCountFromServer (không đọc full docs).
 *
 * Chạy: node tools/check-diagnostic-permissions.mjs
 * Hoặc: npm run check:diagnostic-permissions
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
console.log('  Phase 4K — Diagnostic Permission-Denied Handling Check');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
if (!mainJs) {
    console.error('  ❌ FATAL: js/main.js không tìm thấy');
    process.exit(1);
}

// ── Section 1: Helper tồn tại và là async function ───────────────────
console.log('▸ Section 1: printClubRuntimeDiagnostics tồn tại');
check(
    'window.printClubRuntimeDiagnostics được định nghĩa',
    mainJs.includes('window.printClubRuntimeDiagnostics'),
    'Thêm: window.printClubRuntimeDiagnostics = async function() { ... }'
);
check(
    'printClubRuntimeDiagnostics là async function',
    mainJs.includes('async function printClubRuntimeDiagnostics'),
    'Phải async để await getCountFromServer và các Firestore calls'
);
console.log();

// ── Section 2: permission-denied xử lý đúng ─────────────────────────
console.log('▸ Section 2: Xử lý lỗi permission-denied');
check(
    'Có handler cho permission-denied trong profiles count',
    mainJs.includes('permission-denied'),
    "if (_msg.includes('permission-denied')) console.warn('permission-denied — ...')"
);

// Kiểm tra KHÔNG set dữ liệu = 0 sau permission-denied
// Dấu hiệu nguy hiểm: gán count = 0 hoặc activeCount = 0 trong catch block sau permission-denied check
check(
    'Không gán count = 0 trong catch block của diagnostic',
    (() => {
        // Tìm block của printClubRuntimeDiagnostics
        const startIdx = mainJs.indexOf('window.printClubRuntimeDiagnostics =');
        const endIdx   = mainJs.indexOf('\n};', startIdx) + 3;
        if (startIdx === -1) return false;
        const diagBlock = mainJs.slice(startIdx, endIdx > startIdx ? endIdx : startIdx + 3000);
        // Kiểm tra không có "= 0" sau permission-denied trong catch
        const permIdx = diagBlock.indexOf('permission-denied');
        if (permIdx === -1) return true;
        const afterPerm = diagBlock.slice(permIdx, permIdx + 300);
        return !afterPerm.includes('= 0') && !afterPerm.includes('count = 0') && !afterPerm.includes('activeCount = 0');
    })(),
    'Sau permission-denied, chỉ log cảnh báo — không gán count = 0'
);

check(
    'Cảnh báo rõ khi bị permission-denied (không kết luận dữ liệu rỗng)',
    mainJs.includes('permission-denied') && (
        mainJs.includes('kiểm tra Firestore Rules') ||
        mainJs.includes('Firestore Rules') ||
        mainJs.includes('Diagnostic query bị') ||
        mainJs.includes('permission-denied —')
    ),
    "console.warn('[ClubDiagnostics] ... permission-denied — kiểm tra Firestore Rules...')"
);
console.log();

// ── Section 3: Club-scoped paths ─────────────────────────────────────
console.log('▸ Section 3: Diagnostic dùng đúng path club-scoped');

// Kiểm tra diagnostic dùng profRef (đã có clubId trong path) thay vì collectionGroup
check(
    'Diagnostic dùng profRef (club-scoped) thay vì collectionGroup trực tiếp',
    mainJs.includes('_profRef') || mainJs.includes('profRef'),
    'Dùng _profRef (đã scope theo clubId) thay vì collection(db, "profiles") global'
);
check(
    'Diagnostic không dùng collectionGroup "profiles" toàn cục',
    (() => {
        const startIdx = mainJs.indexOf('window.printClubRuntimeDiagnostics =');
        if (startIdx === -1) return true;
        const diagBlock = mainJs.slice(startIdx, startIdx + 3000);
        return !diagBlock.includes("collection(db, 'profiles')") &&
               !diagBlock.includes('collection(db, "profiles")');
    })(),
    "Không dùng collection(db, 'profiles') trực tiếp — phải dùng profRef đã có clubId"
);
console.log();

// ── Section 4: Không tự động chạy khi load ──────────────────────────
console.log('▸ Section 4: Không tự động chạy diagnostic khi load');
check(
    'printClubRuntimeDiagnostics không được gọi tự động tại top-level',
    (() => {
        const assignIdx = mainJs.indexOf('window.printClubRuntimeDiagnostics =');
        const callIdx   = mainJs.indexOf('window.printClubRuntimeDiagnostics()');
        if (assignIdx === -1) return true;
        if (callIdx === -1) return true;
        return callIdx < assignIdx;
    })(),
    'Không gọi window.printClubRuntimeDiagnostics() tự động — chỉ assign lên window'
);
console.log();

// ── Section 5: Dùng getCountFromServer (không đọc full docs) ─────────
console.log('▸ Section 5: An toàn — dùng getCountFromServer');
check(
    'Diagnostic dùng getCountFromServer thay vì getDocs full collection',
    mainJs.includes('getCountFromServer'),
    'Dùng getCountFromServer(_profRef) để đếm — không đọc toàn bộ docs'
);
check(
    'Kiểm tra getCountFromServer available trước khi gọi',
    mainJs.includes('if (getCountFromServer') || mainJs.includes('&& getCountFromServer'),
    "if (getCountFromServer && _profRef) { ... } để tránh crash khi SDK chưa load"
);
console.log();

// ── Section 6: Kiểm tra finance.js — lỗi index không set stats = 0 ──
console.log('▸ Section 6: finance.js — lỗi index không kết luận dữ liệu = 0');
const financeJs = readFile('js/modules/finance.js');
if (financeJs) {
    check(
        'finance.js bắt lỗi failed-precondition (index error) riêng',
        financeJs.includes('failed-precondition') || financeJs.includes('requires an index'),
        "Trong _doLoad(): isIndexErr = errMsg.includes('failed-precondition') || ..."
    );
    check(
        'Khi lỗi index, finance.js không reset pgState.currentItems về []',
        (() => {
            const catchIdx = financeJs.indexOf('} catch (err)');
            if (catchIdx === -1) return true;
            const catchBlock = financeJs.slice(catchIdx, catchIdx + 800);
            return !catchBlock.includes('currentItems = []') &&
                   !catchBlock.includes('currentItems=[]');
        })(),
        'Trong catch index error: không reset currentItems — giữ nguyên dữ liệu cũ nếu có'
    );
} else {
    check('js/modules/finance.js tồn tại', false, 'File không tìm thấy');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Diagnostic permission-denied có thể làm sai số liệu!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Diagnostic permission-denied handling checks passed!');
    console.log('  Khi Firestore Rules chặn diagnostic, UI không bị set về 0.');
    console.log('══════════════════════════════════════════════════════════\n');
}
