/**
 * tools/check-exam-payment-identity.mjs — Phase 4K-4H
 *
 * Kiểm tra static: đảm bảo hệ thống nhận đúng tên võ sinh
 * khi thu gộp lệ phí thi (Exam Combo Payment Identity).
 *
 * Chạy: npm run check:exam-payment-identity
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

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

console.log('\n🔍 Phase 4K-4H — Exam Payment Identity Check\n');

const appJs     = readFile('app.js');
const reportsJs = readFile('js/modules/reports.js');
const financeJs = readFile('js/modules/finance.js');

check('app.js readable',     !!appJs,     'Không tìm thấy app.js');
check('reports.js readable', !!reportsJs, 'Không tìm thấy js/modules/reports.js');
check('financeJs readable',  !!financeJs, 'Không tìm thấy js/modules/finance.js');

if (!appJs || !reportsJs || !financeJs) {
    console.error('\n❌ Cannot continue — required files missing\n');
    process.exit(1);
}

// ── 1. window.extractExamStudentName tồn tại ──────────────────────────────
check(
    'app.js có window.extractExamStudentName',
    appJs.includes('window.extractExamStudentName'),
    'Thêm window.extractExamStudentName vào app.js (Phase 1)'
);

// ── 2. window.getExamTargetBeltFromTx tồn tại ─────────────────────────────
check(
    'app.js có window.getExamTargetBeltFromTx',
    appJs.includes('window.getExamTargetBeltFromTx'),
    'Thêm window.getExamTargetBeltFromTx vào app.js (Phase 1)'
);

// ── 3. processMultiItem lưu studentName ───────────────────────────────────
// Tìm block processMultiItem rộng hơn (hàm dài ~200 dòng)
check(
    'processMultiItem lưu studentName trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        // Hàm processMultiItem dài, dùng window đủ rộng
        const block = appJs.slice(idx, idx + 50000);
        const endIdx = block.indexOf('};') + idx;
        return block.includes('studentName: name') || block.includes("studentName:name");
    })(),
    'processMultiItem phải lưu studentName: name khi tạo giao dịch Lệ phí thi'
);

// ── 4. processMultiItem lưu profileName ───────────────────────────────────
check(
    'processMultiItem giữ profileId=profileKey và profileName=displayName trong bundle',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('profileId: name') && block.includes('profileName: _miDisplayName') && block.includes('studentName: _miDisplayName');
    })(),
    'processMultiItem phải giữ identity profileId=name và chỉ dùng displayName cho nhãn'
);

// ── 5. processMultiItem lưu examTargetBelt ────────────────────────────────
check(
    'processMultiItem lưu examTargetBelt trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('examTargetBelt');
    })(),
    'processMultiItem phải lưu examTargetBelt khi tạo giao dịch Lệ phí thi'
);

// ── 6. processMultiItem lưu currentBeltAtPayment ──────────────────────────
check(
    'processMultiItem lưu currentBeltAtPayment trong giao dịch Lệ phí thi',
    (function() {
        const idx = appJs.indexOf('window.processMultiItem');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 50000);
        return block.includes('currentBeltAtPayment');
    })(),
    'processMultiItem phải lưu currentBeltAtPayment khi tạo giao dịch Lệ phí thi'
);

// ── 7. H8R1: quickCollectExam giữ profileId identity + display label ───────
check(
    'app.js quickCollectExam is a fail-closed bootstrap stub',
    (function() {
        const idx = appJs.indexOf('window.quickCollectExam');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 5000);
        return block.includes('đang khởi tạo') && !/\b(addDoc|setDoc|updateDoc|deleteDoc)\s*\(/.test(block);
    })(),
    'Bootstrap không được ghi lệ phí thi trực tiếp'
);

// ── 8. quickCollectExam trong app.js lưu examTargetBelt ──────────────────
check(
    'finance.js quickCollectExam lưu examTargetBelt',
    (function() {
        const idx = financeJs.indexOf('window.quickCollectExam = async');
        if (idx === -1) return false;
        const block = financeJs.slice(idx, idx + 3000);
        return block.includes('examTargetBelt');
    })(),
    'Canonical finance handler phải lưu examTargetBelt'
);

// ── 9. H8R1: finance quickCollectExam giữ profileId + display label ───────
check(
    'finance.js quickCollectExam giữ profileId=profileKey và studentName=displayName',
    (function() {
        const idx = financeJs.indexOf('window.quickCollectExam = async');
        if (idx === -1) return false;
        const block = financeJs.slice(idx, idx + 5000);
        return /profileId\s*:\s*name/.test(block) && /studentName\s*:\s*displayName/.test(block);
    })(),
    'H8R1 yêu cầu profileId: name và studentName: displayName'
);

// ── 10. exportExamPaidList dùng extractExamStudentName ───────────────────
check(
    'reports.js exportExamPaidList dùng extractExamStudentName',
    reportsJs.includes('extractExamStudentName'),
    'exportExamPaidList phải dùng window.extractExamStudentName để lấy tên võ sinh'
);

// ── 11. exportExamPaidList dùng getExamTargetBeltFromTx ──────────────────
check(
    'reports.js exportExamPaidList dùng getExamTargetBeltFromTx',
    reportsJs.includes('getExamTargetBeltFromTx'),
    'exportExamPaidList phải dùng window.getExamTargetBeltFromTx để lấy đai mục tiêu'
);

// ── 12. exportExamPaidList không còn stuName = t.description.trim() cho combo
check(
    'reports.js exportExamPaidList không còn "stuName = t.description ? t.description.trim()"',
    !reportsJs.includes("stuName    = t.description ? t.description.trim() : \"\";"),
    'Xóa dòng stuName = t.description.trim() cho Học phí + Lệ phí thi — dùng extractExamStudentName'
);

// ── 13. renderExamList dùng extractExamStudentName ────────────────────────
check(
    'app.js renderExamList dùng extractExamStudentName',
    (function() {
        // Tìm định nghĩa hàm (assignment), không phải reference đầu tiên
        const idx = appJs.indexOf('window.renderExamList = ');
        if (idx === -1) return false;
        const block = appJs.slice(idx, idx + 5000);
        return block.includes('extractExamStudentName');
    })(),
    'renderExamList phải dùng extractExamStudentName thay vì parse description thủ công'
);

// ── 14. window.debugExamPaymentIdentity tồn tại ──────────────────────────
check(
    'app.js có window.debugExamPaymentIdentity',
    appJs.includes('window.debugExamPaymentIdentity'),
    'Thêm window.debugExamPaymentIdentity vào app.js (Phase 9)'
);


// ── 15. H8R2.1A: quickCollectExam must bind profile from existing local canonical map ──
const _quickExamStart = financeJs.indexOf('window.quickCollectExam = async');
const _quickExamEnd = _quickExamStart >= 0 ? financeJs.indexOf('// 8. processCombo', _quickExamStart) : -1;
const _quickExamBlock = (_quickExamStart >= 0 && _quickExamEnd > _quickExamStart)
    ? financeJs.slice(_quickExamStart, _quickExamEnd)
    : '';

check(
    'H8R2.1A canonical quickCollectExam binds profile from local store',
    /profile\s*=\s*_profiles\(\)\[name\]/.test(_quickExamBlock),
    'Không được lấy hồ sơ từ biến ngoài scope hoặc đọc Firestore'
);

check(
    'H8R2.1A quickCollectExam does not add Firestore profile reads',
    !/\bgetDoc\s*\(|\bgetDocs\s*\(|\bonSnapshot\s*\(/.test(_quickExamBlock),
    'Quick exam chỉ được lookup profile từ local RAM map'
);

check(
    'H8R2.1A quickCollectExam does not mutate/create profile',
    !/\bsetDoc\s*\(|\bupdateDoc\s*\(|\bdeleteDoc\s*\(|\bwriteBatch\s*\(/.test(_quickExamBlock),
    'Quick exam chỉ tạo transaction hiện hữu, không được profile write'
);

// Dynamic QX: execute the production finance handler with only its I/O mocked.
let _dynamicQuickExamError = null;
let _dynamicQuickExamPayload = null;
let _dynamicQuickExamAddCount = 0;
try {
    const profiles = { 'Nguyen Van A': { belt: 'Đai trắng - Cấp 10', branch: 'CS1', displayName: 'Nguyễn Văn Anh' } };
    const store = { clubId: 'club-A', profiles, transactions: [], allTransactions: [] };
    const sandbox = {
        prompt() { return '250000'; },
        document: {
            getElementById(id) {
                if (id === 'filterMonth') return { value: '2026-09' };
                if (id === 'exam_fee_all_actual') return { value: '250000' };
                return { value: '' };
            }
        },
        getLocalToday() { return '2026-09-17'; },
        _profiles() { return store.profiles; },
        _clubId() { return store.clubId; },
        _vMonth(v) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(v); },
        _positiveAmount(v) { return Number.isFinite(v) && v > 0 ? v : null; },
        _guardAllowed(action) { return action === 'exam.collect'; },
        FinanceService: { async addTransaction(payload) {
            _dynamicQuickExamAddCount++; _dynamicQuickExamPayload = payload;
            store.transactions.push({ id: 'tx-exam-1', ...payload }); return 'tx-exam-1';
        } },
        Date,
        console: { log() {}, warn() {}, error() {} }
    };
    sandbox.window = {
        __store: store,
        buildCanonicalExamPaymentLedger({ transactions }) {
            return { byName: Object.fromEntries(transactions.filter(t => t.type === 'Lệ phí thi').map(t => [t.profileId, t])) };
        },
        userRole: 'admin',
        getClubExamFee() { return 250000; },
        mergeTransactionIntoRuntimeStore(tx) { store.transactions.push(tx); },
        BELT_NEXT: { 'Đai trắng - Cấp 10': 'Đai vàng - Cấp 9' },
        ProfileCanonicalStore: {
            resolveDisplayName(profileKey, profile) {
                return String(profile?.displayName || profile?.name || profileKey || '').trim();
            }
        },
        showToast() {},
        renderExamList() {}
    };
    vm.runInNewContext(_quickExamBlock, sandbox, { filename: 'finance.quickCollectExam.vm.js' });
    await sandbox.window.quickCollectExam('Nguyen Van A', 'CS1');
    await sandbox.window.quickCollectExam('Nguyen Van A', 'CS1');
} catch (error) {
    _dynamicQuickExamError = error;
}

check(
    'H8R2.1A dynamic quickCollectExam has no ReferenceError',
    !_dynamicQuickExamError,
    _dynamicQuickExamError ? String(_dynamicQuickExamError.stack || _dynamicQuickExamError) : ''
);
check(
    'H8R2.1A dynamic quickCollectExam writes exactly one canonical exam transaction',
    _dynamicQuickExamAddCount === 1,
    `Expected addDoc=1, got ${_dynamicQuickExamAddCount}`
);
check(
    'H8R2.1A dynamic quick exam preserves profileKey + displayName + branch + amount',
    _dynamicQuickExamPayload?.profileId === 'Nguyen Van A' &&
        _dynamicQuickExamPayload?.studentName === 'Nguyễn Văn Anh' &&
        _dynamicQuickExamPayload?.profileName === 'Nguyễn Văn Anh' &&
        _dynamicQuickExamPayload?.branch === 'CS1' &&
        _dynamicQuickExamPayload?.amount === 250000,
    'Payload phải giữ profileId=profileKey và display fields từ resolveDisplayName'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
const total = 20;
if (failures === 0) {
    console.log(`\x1b[32m✅ All checks passed (${total}/${total})\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures} check(s) failed\x1b[0m\n`);
    process.exit(1);
}
