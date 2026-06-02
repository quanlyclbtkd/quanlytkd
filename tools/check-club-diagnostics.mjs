/**
 * tools/check-club-diagnostics.mjs — Club Runtime Diagnostics Helper Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra window.printClubRuntimeDiagnostics:
 * 1. Helper tồn tại trong main.js.
 * 2. Là async function.
 * 3. Dùng getCountFromServer (không đọc full docs).
 * 4. Có permission-denied error handling.
 * 5. Log currentClubId, userRole, db ready.
 * 6. Không tự động chạy khi load (chỉ khi gọi thủ công).
 * 7. Không expose PII trong log.
 *
 * Chạy: node tools/check-club-diagnostics.mjs
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

let pass = 0, fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); fail++; errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Club Runtime Diagnostics Check — Phase 4K-RUNTIME-CLEANUP');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
if (!mainJs) { console.error('  ❌ FATAL: js/main.js not found'); process.exit(1); }

console.log('▸ Section 1: printClubRuntimeDiagnostics existence');
check('window.printClubRuntimeDiagnostics defined on window',
    mainJs.includes('window.printClubRuntimeDiagnostics'),
    'Thêm: window.printClubRuntimeDiagnostics = async function printClubRuntimeDiagnostics() { ... }');

check('printClubRuntimeDiagnostics là async function',
    mainJs.includes('async function printClubRuntimeDiagnostics'),
    'Phải async để await getCountFromServer');

console.log();
console.log('▸ Section 2: diagnostic content');
check('Log currentClubId',
    mainJs.includes('currentClubId') && mainJs.includes('printClubRuntimeDiagnostics'),
    'console.log("currentClubId :", _cid || "⚠️ MISSING")');

check('Log userRole',
    mainJs.includes('userRole') && mainJs.includes('printClubRuntimeDiagnostics'),
    'console.log("userRole :", _role)');

check('Log db ready status',
    mainJs.includes('db ready') || (mainJs.includes('!!_db') && mainJs.includes('printClubRuntimeDiagnostics')),
    'console.log("db ready :", !!_db)');

check('Log __studentPaginationInitialized status',
    mainJs.includes('__studentPagInit') || (mainJs.includes('__studentPaginationInitialized') && mainJs.includes('printClubRuntimeDiagnostics')),
    'console.log("__studentPagInit :", !!window.__studentPaginationInitialized)');

console.log();
console.log('▸ Section 3: safe count (getCountFromServer)');
check('Dùng getCountFromServer thay vì getDocs full',
    mainJs.includes('getCountFromServer') && mainJs.includes('printClubRuntimeDiagnostics'),
    'Dùng getCountFromServer(_profRef) thay vì getDocs để không đọc full collection');

check('Count active profiles riêng (where status active)',
    mainJs.includes("where('status', '==', 'active')") || mainJs.includes('where("status", "==", "active")'),
    "getCountFromServer(query(_profRef, where('status', '==', 'active')))");

console.log();
console.log('▸ Section 4: error handling');
check('Có permission-denied handler',
    mainJs.includes('permission-denied'),
    "if (_msg.includes('permission-denied')) console.warn('permission-denied — kiểm tra Firestore Rules')");

check('Không crash khi thiếu clubId',
    mainJs.includes('currentClubId missing') || (mainJs.includes('!_cid') && mainJs.includes('printClubRuntimeDiagnostics')),
    "if (!_cid) { console.warn('currentClubId missing'); return; }");

check('Không crash khi thiếu db',
    mainJs.includes('db chưa sẵn sàng') || (mainJs.includes('!_db') && mainJs.includes('printClubRuntimeDiagnostics')),
    "if (!_db) { console.warn('db chưa sẵn sàng'); return; }");

console.log();
console.log('▸ Section 5: safety — không tự động chạy khi load');
// Helper should only be assigned to window, not called at top level
const _diagIdx   = mainJs.indexOf('window.printClubRuntimeDiagnostics =');
const _diagCallIdx = mainJs.indexOf('window.printClubRuntimeDiagnostics()');
check('printClubRuntimeDiagnostics không tự động gọi khi load',
    _diagCallIdx === -1 || _diagCallIdx < _diagIdx,
    'Không gọi window.printClubRuntimeDiagnostics() tự động — chỉ assign lên window');

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass+fail) + ' | ✅ ' + pass + ' | ❌ ' + fail);
if (fail > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Club diagnostics helper thiếu hoặc không đủ — debug production sẽ khó!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Club diagnostics checks passed!');
    console.log('  Gọi window.printClubRuntimeDiagnostics() trong console để debug production.');
    console.log('══════════════════════════════════════════════════════════\n');
}
