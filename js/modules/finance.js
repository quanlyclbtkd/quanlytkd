// Compatibility import marker: import { StudentService } from '../services/students.service.js';
/**
 * modules/finance.js — Phase 2e
 * ────────────────────────────────────────────────────────────────
 * Extract các hàm tài chính từ app.js sang ES Module.
 * Bao gồm: thu học phí nhanh, xóa giao dịch, combo gia đình,
 *           lệ phí thi, báo nghỉ tháng.
 *
 * PATTERN (delegation — giống students.js Phase 2d):
 *   initFinance() gán window.X = function() {...}
 *   → Mỗi hàm đọc state từ window.__store TẠI THỜI ĐIỂM GỌI,
 *     KHÔNG capture closure → tránh stale data.
 *
 * BRIDGE (window.__store):
 *   app.js sync sau login:
 *     window.__store.db, .colRef, .profRef, .invRef,
 *     .clubId, .profiles, .clubConfig, .transactions
 *
 * FIREBASE SDK:
 *   window._fb_init (CDN loader của app.js) — không import trực tiếp.
 *   Phase 3 sẽ chuyển sang ES module Firebase thật.
 *
 * ROLLBACK NHANH:
 *   Comment `initFinance()` trong main.js → app.js xử lý như cũ,
 *   không ảnh hưởng bất kỳ chức năng nào.
 *
 * MIGRATION MAP hoàn chỉnh:
 * ┌─────────────────────────────────────┬────────────┐
 * │ Hàm / block                         │ Dòng app.js│
 * ├─────────────────────────────────────┼────────────┤
 * │ window.skipMonth                    │ ~3447      │
 * │ window.removeSkip                   │ ~3448      │
 * │ window.deleteTx                     │ ~3885      │
 * │ window.quickPay                     │ ~3938      │
 * │ window.openQuickPayModal            │ ~4014      │
 * │ window.quickCollectExam             │ ~4074      │
 * │ window.processCombo                 │ ~4089      │
 * │ window.handleQuitOption             │ ~3498      │
 * │ window.formatMonthCompact (override)│ ~3509      │
 * └─────────────────────────────────────┴────────────┘
 *
 * /// Phase 2e — extracted from app.js
 * ────────────────────────────────────────────────────────────────
 */

import {
    getLocalToday,
    formatDate,
    formatMonth,
    normalizeYYYYMM,
    formatMonthCompact,
} from '../utils/format.js';
import { FinanceService } from '../services/finance.service.js?v=quick-pay-commit-acknowledgement-20260618-v3f2';
import { StudentService } from '../services/students.service.js?v=quick-pay-commit-acknowledgement-20260618-v3f2';
import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

// ── Phase 4K-4D: Fallback classify helper (finance.js) ──
function _classifyInvTxForFinance(tx, cats) {
    const type   = String(tx && tx.type || '').trim();
    const amount = Number(tx && tx.amount || 0);
    const _cats  = Array.isArray(cats) ? cats : ['Võ phục', 'Áo thun', 'Bảo hộ'];
    for (const cat of _cats) {
        if (type === 'Thu ' + cat)  return { isInventory: true, direction: 'income',  amount };
        if (type === 'Chi ' + cat)  return { isInventory: true, direction: 'expense', amount };
        if (type === 'Tặng ' + cat) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    if (type === 'Võ phục')         return { isInventory: true, direction: 'income',  amount };
    const hasRelated = !!(tx && tx.relatedInvId);
    if (hasRelated) {
        if (type.startsWith('Thu '))  return { isInventory: true, direction: 'income',  amount };
        if (type.startsWith('Chi '))  return { isInventory: true, direction: 'expense', amount };
        if (type.startsWith('Tặng ')) return { isInventory: true, direction: 'gift',    amount: 0 };
    }
    return { isInventory: false, direction: '', amount: 0 };
}


// ════════════════════════════════════════════════════════════════
// BRIDGE HELPERS — đọc state từ window.__store tại call time
// Không bao giờ cache ra biến ngoài scope → luôn lấy giá trị mới nhất
// ════════════════════════════════════════════════════════════════

/** Firestore db instance */
function _db()           { return (window.__store || {}).db; }
/** transactions collection ref của club hiện tại */
function _colRef()       { return (window.__store || {}).colRef; }
/** Club ID hiện tại */
function _clubId()       { return (window.__store || {}).clubId; }
/** Tất cả hồ sơ võ sinh (object {tên: profileData}) */
function _profiles()     { return (window.__store || {}).profiles || {}; }
/** Tất cả giao dịch đang cache trong bộ nhớ (sync bởi app.js sau mỗi query) */
function _transactions() { return (window.__store || {}).transactions || []; }
/** Inventory collection ref */
function _invRef()       { return (window.__store || {}).invRef; }
/** Club config (từ settings/main_config) */
function _config()       { return (window.__store || {}).clubConfig || {}; }

// Phase 4K-6V3F1: chặn cùng một khoản học phí bị gửi lặp trong khi request trước chưa xong.
const _quickPayInFlight = new Set();
/** Club data (từ clubs/{id} doc — chứa clubName, parentCode, ...) */
function _clubData()     { return (window.__store || {}).clubData || {}; }
/** @deprecated Phase 3.1 — Firebase calls đã chuyển sang FinanceService / StudentService */

// ════════════════════════════════════════════════════════════════
// EXPORT CHÍNH
// ════════════════════════════════════════════════════════════════

/**
 * initFinance() — Đăng ký toàn bộ window functions tài chính.
 *
 * Gọi từ main.js SAU khi app.js đã chạy xong (window.__appLoaded = true).
 * Tất cả window.X bên dưới OVERRIDE những gì app.js đã set trước.
 * Đây là delegation pattern đã kiểm chứng từ Phase 2a–2d.
 */
export function openComboModal() {
    const modal = typeof document !== 'undefined' ? document.getElementById('comboModal') : null;
    if (!modal) return false;
    modal.style.display = 'flex';
    return true;
}

export function registerFinanceUiGlobals() {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
    const result = GlobalOwnershipRegistry.register('openComboModal', openComboModal, {
        owner: 'js/modules/finance.js',
        risk: 'ui-only',
        policy: 'module-primary',
    });
    if (!result.ok) {
        console.warn('[4K-6S] openComboModal ownership registration failed:', result);
    }
    return result;
}

export function initFinance() {

    // ════════════════════════════════════════════════════════════
    // Phase 4K-5L-C: Expose StudentService lên window để finance.js
    // và các module khác không bị ReferenceError: StudentService is not defined
    // ════════════════════════════════════════════════════════════
    if (typeof window !== 'undefined') {
        window.StudentService = window.StudentService || StudentService;
    }

    // Phase 4K-6S: formatMonthCompact is owned by js/utils/format.js.
    // finance.js imports the pure helper directly and must not overwrite the global.

    // ════════════════════════════════════════════════════════════
    // 2. skipMonth & removeSkip — Quản lý báo nghỉ tháng
    // ════════════════════════════════════════════════════════════

    /**
     * Đánh dấu miễn học phí một tháng (báo nghỉ).
     * Dùng arrayUnion để an toàn khi nhiều người cùng thao tác.
     *
     * @param {string} name   — Tên võ sinh (doc ID trong Firestore)
     * @param {string} month  — Tháng cần miễn, định dạng YYYY-MM
     */
    window.skipMonth = async (name, month) => {
        const svc = window.StudentService || StudentService;

        if (!svc || typeof svc.addSkippedMonth !== 'function') {
            throw new Error('[skipMonth] StudentService.addSkippedMonth chưa sẵn sàng');
        }

        await svc.addSkippedMonth(name, month);

        if (typeof window.syncStudentSkippedMonthLocal === 'function') {
            window.syncStudentSkippedMonthLocal(name, month, 'add', 'skipMonth-finance');
        }

        if (typeof window.removeStudentFromDebtDom === 'function') {
            window.removeStudentFromDebtDom(name);
        }

        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(['students.debtList', 'dashboard.summary'], 'skipMonth-finance');
        }

        if (typeof window.invalidateList === 'function') {
            window.invalidateList('students.debtList', 'skipMonth-finance');
        }

        window.showToast?.('✅ Đã miễn phí tháng!');
    };

    /**
     * Hủy báo nghỉ tháng (khôi phục nợ học phí).
     * Yêu cầu xác nhận trước khi thực hiện.
     *
     * @param {string} name   — Tên võ sinh
     * @param {string} month  — Tháng YYYY-MM cần hủy miễn
     */
    window.removeSkip = async (name, month) => {
        if (window.userRole === 'viewer') return;
        if (!confirm(`Hủy báo nghỉ tháng ${formatMonth(month)} cho ${name}?`)) return;

        const svc = window.StudentService || StudentService;
        await svc.removeSkippedMonth(name, month);

        if (typeof window.syncStudentSkippedMonthLocal === 'function') {
            window.syncStudentSkippedMonthLocal(name, month, 'remove', 'removeSkip-finance');
        }

        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(['students.debtList', 'dashboard.summary'], 'removeSkip-finance');
        }

        if (typeof window.invalidateList === 'function') {
            window.invalidateList('students.debtList', 'removeSkip-finance');
        }

        // Đóng modal hồ sơ nếu đang mở
        if (typeof window.closeModal === 'function') window.closeModal('profileModal');
        window.showToast?.('✅ Đã khôi phục nợ!');
    };

    // ════════════════════════════════════════════════════════════
    // 3. handleQuitOption — Hỏi nghỉ hẳn hay báo nghỉ tháng
    // ════════════════════════════════════════════════════════════

    /**
     * Hiển thị lựa chọn khi võ sinh nợ: nghỉ hẳn hoặc chỉ miễn tháng này.
     * @param {string} name   — Tên võ sinh
     * @param {string} month  — Tháng YYYY-MM
     */
    window.handleQuitOption = (name, month) => {
        if (confirm(
            `Võ sinh ${name} có tiếp tục tập không?\n` +
            `- Bấm OK để báo NGHỈ TẬP luôn.\n` +
            `- Bấm Cancel để chỉ BÁO NGHỈ THÁNG NÀY (miễn học phí tháng ${formatMonth(month)}).`
        )) {
            const svc = window.StudentService || StudentService;
            const _quitData = { status: 'quit', quitDate: getLocalToday() };
            svc.updateProfile(name, _quitData)
                .then(() => {
                    window.showToast?.('✅ Đã chuyển trạng thái Nghỉ tập!');
                    if (typeof window.syncStudentStatusLocal === 'function') {
                        window.syncStudentStatusLocal(name, { status: 'quit', quitDate: _quitData.quitDate }, 'handleQuitOption-finance');
                    }
                    if (typeof window.removeStudentFromDebtDom === 'function') {
                        window.removeStudentFromDebtDom(name);
                    }
                    if (typeof window.refreshListsComputation === 'function') {
                        window.refreshListsComputation(
                            ['students.activeList', 'students.quitList', 'students.debtList', 'dashboard.summary'],
                            'handleQuitOption-finance'
                        );
                    }
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('students.debtList', 'handleQuitOption-finance');
                    }
                })
                .catch(console.error);
        } else {
            if (confirm(`Xác nhận miễn nợ học phí tháng ${formatMonth(month)} cho ${name}?`)) {
                window.skipMonth(name, month);
            }
        }
    };

    // ════════════════════════════════════════════════════════════
    // 4. deleteTx — Xóa giao dịch + cập nhật lại paidUntil
    // ════════════════════════════════════════════════════════════

    /**
     * Xóa một giao dịch tài chính.
     * - Nếu là học phí: tính lại paidUntil từ Firestore (KHÔNG dùng cache).
     * - Nếu có relatedInvId: xóa luôn bản ghi kho tương ứng.
     *
     * LƯU Ý: Dùng getDocs từ Firestore thay vì allTransactions vì
     *   allTransactions chỉ chứa tháng đang xem → tính sai khi xóa tháng cũ.
     *
     * @param {string} id             — Firestore transaction doc ID
     * @param {string} [relatedInvId] — Inventory doc ID liên kết (optional)
     */
    window.deleteTx = async (id, relatedInvId) => {
        if (window.userRole === 'viewer') return;

        const allTransactions = _transactions();

        // Lưu snapshot tx trước khi xóa
        const txToDelete = allTransactions.find(t => t.id === id);

        // Phase 4K-6E: Phân tích impact trước khi xóa
        const impact = window.TransactionDeleteIntegrity
            ? window.TransactionDeleteIntegrity.analyzeTransactionDeleteImpact(txToDelete || { id })
            : null;

        // Chặn xóa nếu không an toàn (bundle inventory thiếu rollback info)
        if (impact && !impact.safeToHardDelete) {
            alert(
                'Giao dịch này là giao dịch gộp có liên quan kho đồ/nợ kho và chưa đủ dữ liệu rollback an toàn.\n' +
                'Vui lòng không xóa trực tiếp. Hãy xử lý bằng chức năng hủy giao dịch chuyên dụng ở phase sau.\n\n' +
                'Lý do: ' + (impact.blockers || []).join(', ')
            );
            return;
        }

        // Tạo message confirm có thông tin học phí
        let confirmMsg = '⚠️ Bạn có chắc muốn xóa giao dịch này?\n' +
            '(Nếu là giao dịch kho sẽ không tự hoàn trả số dư, ' +
            'hãy chủ động cập nhật lại kho sau khi xóa)';

        if (impact && impact.hasTuition && impact.tuitionMonths.length > 0) {
            const monthLabels = impact.tuitionMonths.map(m => {
                const parts = m.split('-');
                return parts.length === 2 ? parts[1] + '/' + parts[0] : m;
            }).join(', ');
            confirmMsg =
                'Giao dịch này có học phí tháng: ' + monthLabels + '.\n' +
                'Sau khi xóa, hệ thống sẽ cập nhật lại trạng thái học phí của võ sinh.\n' +
                'Bạn chắc chắn muốn xóa?';
        }

        if (!confirm(confirmMsg)) return;

        // Xóa giao dịch chính
        await FinanceService.deleteTransaction(id);

        // Xóa bản ghi kho liên kết (nếu có)
        if (relatedInvId && relatedInvId !== 'undefined') {
            await FinanceService.deleteRelatedInventory(relatedInvId);
        }

        // Phase 4K-6E: Reconcile profile sau khi xóa — thay thế logic paidUntil cũ
        if (impact && impact.requiresProfileReconcile && impact.studentName) {
            try {
                await window.reconcileStudentTuitionAfterDeletedTransaction(
                    impact.studentName,
                    txToDelete,
                    { reason: 'delete-transaction' }
                );
            } catch (reconcileErr) {
                console.warn('[deleteTx] reconcile error (non-fatal):', reconcileErr);
            }
        } else if (!impact && txToDelete && (
            txToDelete.type === 'Học phí' ||
            txToDelete.type === 'Học phí + Lệ phí thi'
        )) {
            // Fallback: logic cũ nếu TransactionDeleteIntegrity chưa load
            const studentName = (txToDelete.description || '').trim();
            if (studentName) {
                const stuTxDocs = await FinanceService.getStudentTuitionTxs(studentName);
                const remainingMonths = [];
                stuTxDocs.forEach(({ id: txId, data: td }) => {
                    if (txId === id) return;
                    if (td.type !== 'Học phí' && td.type !== 'Học phí + Lệ phí thi') return;
                    if (td.packageMonths) remainingMonths.push(...td.packageMonths);
                    else if (td.txMonth) remainingMonths.push(td.txMonth);
                });
                const sortedRemaining = [...new Set(remainingMonths)].sort();
                const deletedMonths = txToDelete.packageMonths ||
                    (txToDelete.txMonth ? [txToDelete.txMonth] : []);
                const deleteProfile = profiles[studentName] || {};
                const newPaidUntil = typeof window.derivePaidThroughAfterTuitionRemoval === 'function'
                    ? window.derivePaidThroughAfterTuitionRemoval(deleteProfile, sortedRemaining, deletedMonths)
                    : (sortedRemaining.length > 0 ? sortedRemaining[sortedRemaining.length - 1] : '');
                await FinanceService.updateProfileAfterTxDelete(studentName, newPaidUntil, deletedMonths);
            }
        }

        // Refresh exam nếu có exam component
        if (impact && impact.requiresExamRefresh) {
            if (typeof window.renderExamList === 'function') window.renderExamList();
        }

        // Refresh dashboard và lists
        if (typeof window.invalidateDashboard === 'function') {
            window.invalidateDashboard('delete-transaction-reconcile');
        }
        if (typeof window.invalidateList === 'function') {
            window.invalidateList('tx.txList',         'delete-transaction-reconcile');
            window.invalidateList('students.debtList', 'delete-transaction-reconcile');
        }

        window.showToast('✅ Đã xóa!');
    };

    // ════════════════════════════════════════════════════════════
    // 5. quickPay — Thu học phí nhanh (từ tab Danh sách Nợ)
    // ════════════════════════════════════════════════════════════

    /**
     * Thu học phí cho một võ sinh, ghi giao dịch và cập nhật paidUntil.
     *
     * Logic tính tháng thực tế:
     *   Nếu feePerMonth > 0 và đóng nhiều tháng → tính số tháng = floor(amount/fee)
     *   → tránh đánh dấu dư tháng chưa thực sự đóng đủ tiền.
     *
     * Fix date: thu bù tháng cũ → date = tháng-01, không dùng hôm nay
     *   → giao dịch xuất hiện đúng khi lọc theo tháng.
     *
     * Fix paidUntil: không cho thụt lùi — so sánh với paidUntil hiện tại.
     *
     * @param {string}  name         — Tên võ sinh
     * @param {string}  monthsStr    — Tháng nợ, cách nhau bởi dấu phẩy (YYYY-MM)
     * @param {string}  branch       — Mã cơ sở (CS1, CS2, ...)
     * @param {string}  defaultFee   — Học phí mặc định (string)
     * @param {boolean} skipPrompt   — Bỏ qua prompt, dùng defaultFee trực tiếp
     */
    window.quickPay = async (name, monthsStr, branch, defaultFee, skipPrompt) => {
        if (window.userRole === 'viewer') {
            window.showToast('⚠️ Tài khoản khách không thể thu tiền!', 3000);
            return false;
        }

        const profiles = _profiles();

        // Làm sạch tên (tránh lỗi với tên có dấu nháy)
        const cleanName = name.replace(/\\'/g, "'");
        const monthsList = monthsStr
            ? monthsStr.split(',').map(s => normalizeYYYYMM(s.trim())).filter(Boolean)
            : [];
        if (!monthsList.length) {
            window.showToast('⚠️ Không xác định được tháng học phí cần thu.', 3500);
            return false;
        }
        const lastMonth = monthsList[monthsList.length - 1];
        const monthLabel = formatMonthCompact(monthsList.join(','));

        let amount;
        if (skipPrompt && defaultFee && Number(String(defaultFee).replace(/\D/g, '')) > 0) {
            amount = Number(String(defaultFee).replace(/\D/g, ''));
        } else {
            const defaultAmountStr = defaultFee
                ? parseInt(defaultFee, 10).toLocaleString('vi-VN')
                : '0';
            const inputAmount = prompt(
                `XÁC NHẬN THU HỌC PHÍ\nVõ sinh: ${cleanName}\nKỳ học phí: ${monthLabel}\n\nNhập số tiền thu (VNĐ):`,
                defaultAmountStr
            );
            if (inputAmount === null) return false;
            amount = Number(inputAmount.replace(/\D/g, ''));
            if (amount <= 0) {
                window.showToast('⚠️ Số tiền không hợp lệ!', 2500);
                return false;
            }
        }

        // Tính số tháng thực tế được đóng
        const profile = profiles[cleanName] || {};
        const feePerMonth = Number(profile.tuitionFee) || 0;
        let paidMonthsList = monthsList.slice();
        if (feePerMonth > 0 && monthsList.length > 1) {
            const monthsPaid = Math.min(
                Math.floor(amount / feePerMonth),
                monthsList.length
            );
            paidMonthsList = monthsList.slice(0, monthsPaid > 0 ? monthsPaid : 1);
        }
        const actualLastMonth = paidMonthsList[paidMonthsList.length - 1] || lastMonth;
        const actualMonthLabel = formatMonthCompact(paidMonthsList.join(','));
        const actionKey = `${_clubId()}::${cleanName}::${paidMonthsList.join('|')}`;

        if (_quickPayInFlight.has(actionKey)) {
            window.showToast('⏳ Khoản thu này đang được xử lý, vui lòng không bấm lại.', 3000);
            return false;
        }
        _quickPayInFlight.add(actionKey);
        window.__lastQuickPayState = {
            status: 'saving', studentName: cleanName, months: paidMonthsList.slice(), amount, startedAt: Date.now(), source: 'finance-module'
        };

        try {
            const today = getLocalToday();
            // Thu bù tháng cũ → date = YYYY-MM-01 để lọc đúng tháng
            const txDate = actualLastMonth < today.substring(0, 7)
                ? actualLastMonth + '-01'
                : today;

            const atomicResult = await FinanceService.addTuitionPaymentAtomic({
                studentName: cleanName,
                months: paidMonthsList,
                profile,
                reason: 'module-quick-pay-tuition',
                txData: {
                    branch: branch || 'CS1',
                    type: 'Học phí',
                    description: cleanName,
                    studentName: cleanName,
                    profileName: cleanName,
                    profileId: cleanName,
                    amount,
                    date: txDate,
                    txMonth: actualLastMonth,
                    packageMonths: paidMonthsList,
                    timestamp: Date.now(),
                },
            });
            const safePaidUntil = atomicResult.paidUntil;

            // Ghi audit log (không chặn luồng chính nếu lỗi)
            await FinanceService.addFeeAuditSilent({
                studentId: cleanName,
                amount,
                date: today,
                type: 'tuition',
                month: safePaidUntil,
                months: paidMonthsList,
                by: window.currentUserEmail || 'admin',
                timestamp: Date.now(),
            });

            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation(
                    ['students.debtList', 'tx.txList', 'dashboard.summary'],
                    'quick-pay-committed'
                );
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList('students.debtList', 'quick-pay-committed');
                window.invalidateList('tx.txList', 'quick-pay-committed');
            }
            window.invalidateDashboard?.('quick-pay-committed');

            // Toast phân biệt 1 tháng / nhiều tháng
            const toastMsg = paidMonthsList.length > 1
                ? `✅ Đã thu ${amount.toLocaleString('vi-VN')} ₫ của ${cleanName} — ${paidMonthsList.map(m => {
                    const [y, mo] = m.split('-');
                    return `T${parseInt(mo)}/${y}`;
                }).join(', ')}.`
                : `✅ Đã thu ${amount.toLocaleString('vi-VN')} ₫ của ${cleanName} — ${paidMonthsList.map(m => {
                    const [y, mo] = m.split('-');
                    return `T${parseInt(mo)}/${y}`;
                }).join(', ')}.`;
            window.showToast(toastMsg, 4500);

            window.__lastQuickPayState = {
                status: 'success', studentName: cleanName, months: paidMonthsList.slice(), amount,
                transactionId: atomicResult.id || '', completedAt: Date.now(), source: 'finance-module'
            };
            try {
                window.dispatchEvent(new CustomEvent('finance:quick-pay-committed', {
                    detail: { studentName: cleanName, months: paidMonthsList.slice(), amount, transactionId: atomicResult.id || '' }
                }));
            } catch (_) {}

            // Xuất biên lai (nếu có). Lỗi biên lai không được làm người dùng hiểu nhầm khoản thu thất bại.
            if (window.exportReceipt) {
                const breakdown = [{ label: 'Học phí ' + actualMonthLabel, amount }];
                try {
                    await window.exportReceipt(
                        cleanName, amount, 'Học phí', today,
                        paidMonthsList.join(','), branch || 'CS1', '', 'BIÊN LAI THU TIỀN', breakdown
                    );
                } catch (receiptError) {
                    console.warn('[finance.js] Thu tiền thành công nhưng xuất biên lai lỗi:', receiptError);
                    window.showToast('✅ Đã thu tiền. ⚠️ Không thể mở biên lai, có thể in lại trong tab Học phí.', 5000);
                }
            }
            return true;
        } catch (error) {
            console.error('[finance.js] quickPay lỗi:', error);
            const duplicate = error && (error.code === 'TUITION_ALREADY_PAID' || Array.isArray(error.duplicateMonths));
            if (duplicate) {
                const duplicateMonths = Array.isArray(error.duplicateMonths) ? error.duplicateMonths : paidMonthsList;
                window.showToast(
                    `ℹ️ Không thu lại: ${cleanName} đã đóng ${duplicateMonths.map(m => formatMonth(m)).join(', ')}. Danh sách sẽ được làm mới.`,
                    5000
                );
                window.refreshListsComputation?.(['students.debtList', 'tx.txList'], 'quick-pay-duplicate-detected');
                window.invalidateList?.('students.debtList', 'quick-pay-duplicate-detected');
                window.__lastQuickPayState = {
                    status: 'already-paid', studentName: cleanName, months: duplicateMonths.slice(), amount,
                    errorCode: 'TUITION_ALREADY_PAID', completedAt: Date.now(), source: 'finance-module'
                };
                return true;
            }
            const message = error && error.message ? error.message : 'Lỗi không xác định';
            window.showToast(`❌ Không thể thu tiền: ${message}`, 6000);
            window.__lastQuickPayState = {
                status: 'error', studentName: cleanName, months: paidMonthsList.slice(), amount,
                error: message, errorCode: error && error.code || '', completedAt: Date.now(), source: 'finance-module'
            };
            return false;
        } finally {
            _quickPayInFlight.delete(actionKey);
        }
    };

    // ════════════════════════════════════════════════════════════
    // 7. quickCollectExam — Thu lệ phí thi nhanh (tab Thi Đai)
    // ════════════════════════════════════════════════════════════

    /**
     * Thu lệ phí thi cho một võ sinh trong tab Thi Đai.
     * Tự động xác định đai kế tiếp từ BELT_NEXT.
     *
     * @param {string} name   — Tên võ sinh
     * @param {string} branch — Mã cơ sở
     */
    window.quickCollectExam = async (name, branch) => {
        if (window.userRole === 'viewer') {
            window.showToast('⛔ Tài khoản khách không thể thu tiền!');
            return;
        }

        const profiles = _profiles();

        const DEFAULT_EXAM_FEE = 250000;
        const feeEl = document.getElementById('exam_fee_all_actual');
        const defaultFee = feeEl && feeEl.value
            ? feeEl.value
            : (window.getClubExamFee ? window.getClubExamFee() : DEFAULT_EXAM_FEE);
        const inputAmount = prompt(`Nhập lệ phí thi của ${name}:`, defaultFee);
        if (!inputAmount) return;
        const amount = Number(inputAmount.replace(/\D/g, ''));
        if (amount <= 0) return;

        const curBelt = (profiles[name] && profiles[name].belt) || 'Đai trắng - Cấp 10';
        const nextBelt = (window.BELT_NEXT && window.BELT_NEXT[curBelt]) || curBelt;

        const filterMonthEl = document.getElementById('filterMonth');
        const examMonth = filterMonthEl
            ? (filterMonthEl.value || getLocalToday().substring(0, 7))
            : getLocalToday().substring(0, 7);
        const today = getLocalToday();
        const todayMonth = today.substring(0, 7);
        const examDate = examMonth === todayMonth
            ? today
            : (examMonth < todayMonth ? examMonth + '-28' : examMonth + '-01');

        await FinanceService.addTransaction({
            branch: branch || (profiles[name] && profiles[name].branch) || 'CS1',
            type: 'Lệ phí thi',
            description: `${name} (Thi lên ${nextBelt})`,
            studentName: name,
            profileName: name,
            profileId: name,
            amount,
            date: examDate,
            txMonth: examMonth,
            examTitle: `Thi lên ${nextBelt}`,
            currentBeltAtPayment: curBelt,
            examTargetBelt: nextBelt,
            timestamp: Date.now(),
        });

        window.showToast(`✅ Đã thu lệ phí thi cho ${name}!`);
        if (typeof window.renderExamList === 'function') window.renderExamList();
    };

    // ════════════════════════════════════════════════════════════
    // 8. processCombo — Thu gộp học phí 2 võ sinh cùng gia đình
    // ════════════════════════════════════════════════════════════

    /**
     * Xử lý thu gộp hoặc xuất phiếu báo cho 2 võ sinh cùng gia đình.
     * - action 'pay'    → ghi 2 giao dịch riêng + xuất biên lai gộp
     * - action 'report' → chỉ xuất phiếu báo, không ghi sổ
     *
     * @param {'pay'|'report'} action
     */
    window.processCombo = async (action) => {
        const profiles = _profiles();

        const n1 = ((document.getElementById('combo_name1') || {}).value || '').trim();
        const f1 = Number((document.getElementById('combo_fee1_actual') || {}).value) || 0;
        const m1 = (document.getElementById('combo_month1') || {}).value || '';
        const n2 = ((document.getElementById('combo_name2') || {}).value || '').trim();
        const f2 = Number((document.getElementById('combo_fee2_actual') || {}).value) || 0;
        const m2 = (document.getElementById('combo_month2') || {}).value || '';

        if (!n1 && !n2) return window.showToast('⚠️ Vui lòng chọn ít nhất 1 võ sinh!');
        if (f1 + f2 <= 0) return window.showToast('⚠️ Tổng tiền phải lớn hơn 0!');

        const comboNames = [];
        const comboMonths = new Set();
        const b1 = (profiles[n1] && profiles[n1].branch) || 'CS1';
        const b2 = (profiles[n2] && profiles[n2].branch) || 'CS1';
        const branch = b1 || b2 || 'CS1';

        if (n1) { comboNames.push(n1); if (m1) comboMonths.add(m1); }
        if (n2) { comboNames.push(n2); if (m2) comboMonths.add(m2); }

        const combinedNameStr = comboNames.join(' & ');
        const combinedMonthStr = Array.from(comboMonths).join(', ');
        const totalAmt = f1 + f2;

        try {
            if (action === 'pay') {
                const today = getLocalToday();
                const todayM = today.substring(0, 7);

                const familyEntries = [];
                if (n1 && f1 > 0) {
                    const d1 = m1 < todayM ? m1 + '-01' : today;
                    familyEntries.push({
                        studentName: n1,
                        months: [m1],
                        profile: profiles[n1] || {},
                        reason: 'module-family-pay-student-1',
                        txData: { branch: b1, type: 'Học phí', description: n1, amount: f1, date: d1, txMonth: m1, packageMonths: [m1], timestamp: Date.now() },
                    });
                }
                if (n2 && f2 > 0) {
                    const d2 = m2 < todayM ? m2 + '-01' : today;
                    familyEntries.push({
                        studentName: n2,
                        months: [m2],
                        profile: profiles[n2] || {},
                        reason: 'module-family-pay-student-2',
                        txData: { branch: b2, type: 'Học phí', description: n2, amount: f2, date: d2, txMonth: m2, packageMonths: [m2], timestamp: Date.now() + 1 },
                    });
                }
                const familyResults = familyEntries.length
                    ? await FinanceService.addTuitionPaymentsAtomic(familyEntries, 'module-family-tuition-payment')
                    : [];
                for (const entry of familyEntries) {
                    const result = familyResults.find(item => item.studentName === entry.studentName) || {};
                    await FinanceService.addFeeAuditSilent({
                        studentId: entry.studentName,
                        amount: entry.txData.amount,
                        date: today,
                        type: 'tuition',
                        month: result.paidUntil || entry.months[0],
                        months: entry.months,
                        by: window.currentUserEmail || 'admin',
                        timestamp: entry.txData.timestamp,
                    });
                }

                window.showToast('✅ Đã ghi sổ gộp thành công!');
                if (window.exportReceipt) {
                    window.exportReceipt(
                        combinedNameStr, totalAmt, 'Học phí', today,
                        combinedMonthStr, branch, 'Gộp Gia Đình', 'BIÊN LAI THU TIỀN'
                    );
                }
                document.getElementById('comboModal').style.display = 'none';

            } else if (action === 'report') {
                if (window.exportReceipt) {
                    window.exportReceipt(
                        combinedNameStr, totalAmt, 'Học phí', getLocalToday(),
                        combinedMonthStr, branch, 'Gộp Gia Đình', 'PHIẾU BÁO HỌC PHÍ'
                    );
                }
                document.getElementById('comboModal').style.display = 'none';
            }
        } catch (error) {
            console.error('[finance.js] processCombo lỗi:', error);
            window.showToast('❌ Lỗi khi xử lý thu gộp!');
        }
    };

    // Phase 4K-6S: openComboModal is registered once by registerFinanceUiGlobals().

    // ════════════════════════════════════════════════════════════════
    // 10. saveTx — Form thu tiền chính (transactionForm.onsubmit)
    // ════════════════════════════════════════════════════════════════

    /**
     * Xử lý form "Thu tiền" (transactionForm).
     * Override onsubmit handler của app.js để dùng bridge pattern.
     *
     * Hỗ trợ:
     *  - Học phí (1 tháng / gói nhiều tháng)
     *  - Học phí + Lệ phí thi (combo)
     *  - Chi phí, Thu Võ phục, Thu khác, ...
     *
     * Fix races condition: chỉ ghi paidUntil/paidMonths — KHÔNG ghi đè
     * belt/branch/status từ snapshot cũ trong bộ nhớ.
     */
    const _txFormEl = document.getElementById('transactionForm');
    if (_txFormEl) {
        _txFormEl.onsubmit = async (e) => {
            e.preventDefault();
            if (window.userRole === 'viewer') return;

            const profiles = _profiles();
            const config = _config();

            const type    = document.getElementById('type').value;
            const name    = document.getElementById('description').value.trim();
            const amount  = Number(document.getElementById('amountActual').value);
            const date    = document.getElementById('date').value;
            const isSingleBranch = (config.branchCount === 1);
            const branch  = isSingleBranch
                ? 'Mặc định'
                : document.getElementById('branch').value;
            const txMonth = date.substring(0, 7);
            const packageCount = parseInt(document.getElementById('tx_package').value) || 1;

            if (!name) return;

            let txData = { branch, type, description: name, date, timestamp: Date.now() };
            let monthsToRecord = [];
            let newPaidUntil = '';
            const profile = profiles[name] || {};

            if (type === 'Học phí' || type === 'Học phí + Lệ phí thi') {
                let [y, m] = txMonth.split('-').map(Number);
                for (let i = 0; i < packageCount; i++) {
                    let curM = m + i;
                    let curY = y;
                    while (curM > 12) { curM -= 12; curY += 1; }
                    monthsToRecord.push(`${curY}-${curM.toString().padStart(2, '0')}`);
                }
                // Không cho paidUntil thụt lùi
                const lastRecorded = monthsToRecord[monthsToRecord.length - 1] || txMonth;
                const normSavePaid = normalizeYYYYMM(profile.paidUntil);
                newPaidUntil = lastRecorded > (normSavePaid || '')
                    ? lastRecorded
                    : (normSavePaid || lastRecorded);
            }

            if (type === 'Học phí + Lệ phí thi') {
                const examAmount = Number(document.getElementById('tx_exam_amountActual').value);
                const examTitle  = document.getElementById('tx_exam_title').value.trim();
                txData.tuitionAmount = amount;
                txData.examAmount    = examAmount;
                txData.examTitle     = examTitle;
                txData.amount        = amount + examAmount;
                txData.txMonth       = txMonth;
                txData.packageMonths = monthsToRecord;
            } else {
                txData.amount = amount;
                if (type === 'Học phí') {
                    txData.txMonth       = txMonth;
                    txData.packageMonths = monthsToRecord;
                }
            }

            if (monthsToRecord.length > 0) {
                const atomicResult = await FinanceService.addTuitionPaymentAtomic({
                    studentName: name,
                    months: monthsToRecord,
                    profile,
                    txData,
                    reason: 'module-transaction-form',
                });
                newPaidUntil = atomicResult.paidUntil;
                // Audit log (không chặn luồng chính)
                await FinanceService.addFeeAuditSilent({
                    studentId: name,
                    amount: txData.amount,
                    date: getLocalToday(),
                    type: 'tuition',
                    month: newPaidUntil,
                    months: monthsToRecord,
                    by: window.currentUserEmail || 'admin',
                    timestamp: Date.now(),
                });
            } else {
                await FinanceService.addTransaction(txData);
            }

            e.target.reset();
            document.getElementById('date').value = getLocalToday();
            document.getElementById('tx_package').value = '1';
            const discEl = document.getElementById('tx_discount');
            if (discEl) discEl.checked = false;
            const discPctEl = document.getElementById('tx_discount_pct');
            if (discPctEl) discPctEl.value = '10';
            const svdEl = document.getElementById('tx_discount_saved');
            if (svdEl) svdEl.style.display = 'none';
            const examAmtEl = document.getElementById('tx_exam_amountActual');
            if (examAmtEl) examAmtEl.value = '';
            if (typeof window.toggleTxFormType === 'function') window.toggleTxFormType();
            window.showToast('✅ Đã lưu khoản thu!');
        };
    }

    // Phase 4K-6U: Report/Excel ownership moved to reportExportFacade.js.
    // finance.js no longer installs duplicate report implementations.

    // ════════════════════════════════════════════════════════════════
    // DEBUG LOG — chỉ hiển thị khi chạy trên localhost / Replit
    // ════════════════════════════════════════════════════════════════

    if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.replit.dev') ||
        window.location.hostname.endsWith('.repl.co')
    ) {
        console.group('💰 Module Finance — Phase 2e ✅ (100%)');
        console.log('✅ window.quickPay               :', typeof window.quickPay);
        console.log('✅ window.openQuickPayModal      :', typeof window.openQuickPayModal);
        console.log('✅ window.deleteTx               :', typeof window.deleteTx);
        console.log('✅ window.skipMonth              :', typeof window.skipMonth);
        console.log('✅ window.removeSkip             :', typeof window.removeSkip);
        console.log('✅ window.processCombo           :', typeof window.processCombo);
        console.log('✅ window.openComboModal         :', typeof window.openComboModal);
        console.log('✅ window.quickCollectExam       :', typeof window.quickCollectExam);
        console.log('✅ window.handleQuitOption       :', typeof window.handleQuitOption);
        console.log('✅ transactionForm.onsubmit      :', !!document.getElementById('transactionForm')?.onsubmit);
        console.groupEnd();
    }
}

// ════════════════════════════════════════════════════════════════
// initTransactionPagination — Phase 3.2A
// ════════════════════════════════════════════════════════════════
/**
 * Khởi tạo server-side cursor pagination cho tab Giao dịch (tx).
 *
 * Phải gọi SAU initFinance().
 *
 * Mô hình "dual store":
 *   - window.__store.transactions         = ALL tx của tháng (onSnapshot — cho business logic)
 *   - store.pagination.transactions       = pagination state + currentItems (cho hiển thị #txList)
 *
 * Các hàm expose ra window:
 *   window._pgNext_transactions()   — load trang tiếp theo
 *   window._pgPrev_transactions()   — load trang trước
 *   window.reloadTransactionsPage() — reload trang hiện tại (sau add/delete)
 *
 * NOTE: Pagination hoạt động theo txMonth. Khi đổi tháng (#filterMonth),
 *       pagination tự reset về trang 1.
 */
export function initTransactionPagination() {
    import('../utils/pagination.js').then(({
        createPaginationState, resetPagination, processPage,
        prepareNextPage, preparePreviousPage,
        renderPaginationControls, PAGE_SIZE,
    }) => {
        import('../services/finance.service.js?v=quick-pay-commit-acknowledgement-20260618-v3f2').then(({ FinanceService }) => {

            const store = window.__store;
            if (!store) { console.warn('[pagination/transactions] __store chưa sẵn sàng'); return; }

            // Khởi tạo pagination state nếu chưa có
            if (!store.pagination) store.pagination = {};
            store.pagination.transactions = createPaginationState(PAGE_SIZE);
            const pgState = store.pagination.transactions;

            // ── Lấy tháng hiện tại từ DOM ──────────────────────────────
            function _getCurrentMonth() {
                const el = document.getElementById('filterMonth');
                return el ? el.value : '';
            }

            // ── Lấy search hiện tại từ DOM ──────────────────────────────
            function _getCurrentSearch() {
                const el = document.getElementById('txSearch') ||
                           document.getElementById('searchInput') ||
                           document.querySelector('#tx input[type="search"]');
                return el ? el.value.trim().toLowerCase() : '';
            }

            // ── Render pagination controls vào DOM ──────────────────────
            // Phase 4K-5H: helper lấy host container bên NGOÀI table cho controls
            function _getTxControlsHost() {
                const txList = document.getElementById('txList');
                if (!txList) return null;
                const table   = txList.closest ? txList.closest('table') : txList.parentElement;
                const wrapper = table && table.closest ? table.closest('.table-wrapper') : null;
                const card    = wrapper ? wrapper.parentElement : (table ? table.parentElement : null);
                return {
                    txList,
                    table,
                    wrapper,
                    hostParent:  card || wrapper || (table && table.parentElement),
                    insertAfter: wrapper || table
                };
            }

            function _injectControls() {
                const from = pgState.currentPage > 0
                    ? (pgState.currentPage - 1) * PAGE_SIZE + 1
                    : 0;
                const to   = pgState.totalLoaded;
                let html = renderPaginationControls(pgState, 'transactions', from, to);

                // Phase 4K-5H: replace "Tiếp →" label thành rõ ràng hơn
                html = html.replace(/Tiếp\s*→/g, '⬇ Tải thêm giao dịch');

                // Phase 4K-5H: host nằm NGOÀI table (không chèn div vào trong <table>)
                const host = _getTxControlsHost();
                if (!host || !host.hostParent || !host.insertAfter) return;

                const ctrlId = 'pgWrap_txList';
                let ctrlEl   = document.getElementById(ctrlId);
                if (!ctrlEl) {
                    ctrlEl           = document.createElement('div');
                    ctrlEl.id        = ctrlId;
                    ctrlEl.className = 'tx-loadmore-controls';
                    host.hostParent.insertBefore(ctrlEl, host.insertAfter.nextSibling);
                }
                ctrlEl.innerHTML = html;
            }

            // ── Core: thực sự load một trang transactions ───────────────
            async function _doLoad(cursor, direction) {
                if (pgState.isLoading) return;
                pgState.isLoading = true;
                _injectControls(); // hiện spinner ngay

                const monthStr = _getCurrentMonth();
                const search   = _getCurrentSearch();

                try {
                    const snap = await FinanceService.getTransactionsPage({
                        pageSize: PAGE_SIZE,
                        cursor,
                        direction,
                        monthStr,
                        search,
                    });

                    // Phase 4K-4F: If snap has _mergedItems (from getTransactionsForMonthInclusive),
                    // use them directly to include packageMonths middle-month transactions
                    let items;
                    if (Array.isArray(snap._mergedItems)) {
                        // Phase 4K-5H: Lưu toàn bộ rawItems để load more append đúng
                        const rawItems = snap._mergedItems.map(t => {
                            const { _docSnap, ...rest } = t; // eslint-disable-line no-unused-vars
                            return rest;
                        });

                        pgState._mergedAllItems  = rawItems;
                        pgState._mergedPageSize  = PAGE_SIZE;

                        const firstSlice = rawItems.slice(0, PAGE_SIZE);
                        pgState.currentPage  = 1;
                        pgState.currentItems = firstSlice;
                        pgState.totalLoaded  = firstSlice.length;
                        pgState.hasNext      = rawItems.length > firstSlice.length;
                        pgState.hasPrevious  = false;
                        pgState.enabled      = true;
                        pgState.isLoading    = false;

                        items = pgState.currentItems;
                    } else {
                        items = processPage(snap, pgState);
                    }
                    pgState.enabled     = true;
                    pgState.searchQuery = search;

                    // Cập nhật store để render.js có thể dùng
                    store.pagination.transactions = pgState;

                    // [GITHUB-FIX Task 5] Hydrate store.transactions từ pagination items
                    // Nếu transaction listener chính chưa kịp hydrate, dashboard vẫn có dữ liệu
                    (function _mergePaginationTransactionsIntoStore(txItems, reason) {
                        if (!Array.isArray(txItems) || txItems.length === 0) return;
                        const st = window.__store || store;
                        if (!st) return;
                        if (!Array.isArray(st.transactions)) st.transactions = [];
                        const seen = new Map();
                        st.transactions.forEach(function(tx) { if (tx && tx.id) seen.set(tx.id, tx); });
                        txItems.forEach(function(tx) { if (tx && tx.id) seen.set(tx.id, tx); });
                        st.transactions = Array.from(seen.values());
                        if (window.__store) {
                            window.__store.transactions = st.transactions;
                            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                            window.__store._lastTxHydrateReason = reason || 'tx-pagination-hydrate';
                        }
                    })(pgState.currentItems, 'tx-pagination-page');

                    // Phase 3.5D: Pagination chỉ ảnh hưởng tx.txList island — dùng list-level
                    // invalidation thay vì invalidateFinance() (tránh cross-domain dashboard).
                    // Fallback cascade an toàn: invalidateList → invalidateFinance → legacy.
                    // Virtualization-ready boundary: 'tx.txList' là stable list boundary.
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('tx.txList', 'tx-pagination');
                    } else if (typeof window.invalidateFinance === 'function') {
                        window.invalidateFinance('tx-pagination');
                    } else if (typeof window._moduleRenderApp === 'function') {
                        window._moduleRenderApp();
                    } else if (typeof window.scheduleRender === 'function') {
                        window.scheduleRender();
                    }

                    // [GITHUB-FIX Task 5] Thêm invalidation cho finance + dashboard
                    // Doanh thu tháng không bị giữ 0 khi tx listener chưa hydrate
                    if (typeof window.invalidateFinance === 'function') {
                        window.invalidateFinance('tx-pagination-data-hydrated');
                    }
                    if (typeof window.invalidateDashboard === 'function') {
                        window.invalidateDashboard('tx-pagination-data-hydrated');
                    }
                    if (typeof window.refreshListsComputation === 'function') {
                        window.refreshListsComputation([
                            'tx.txList',
                            'dashboard.summary',
                        ], 'tx-pagination-data-hydrated');
                    }

                    // Phase 4K-DATA-HYDRATION: Direct row inject vào #txList
                    // Nếu island (tx.txList) không render được từ allTransactions listener data
                    // (allTransactions chưa populate hoặc listener chưa ready), render trực tiếp
                    // từ pgState.currentItems để tránh tình trạng footer "1-9" nhưng rows trống.
                    // Chỉ chạy nếu island chưa inject rows (tr[data-tx-id] chưa có).
                    try {
                        const _txEl = document.getElementById('txList');
                        if (_txEl && pgState.currentItems && pgState.currentItems.length > 0) {
                            const _hasRows = _txEl.querySelector('tr[data-tx-id]');
                            if (!_hasRows) {
                                const { renderTxRow } = await import('../ui/render/computation/financeRenderer.js');
                                const _html = pgState.currentItems.map(function(tx) {
                                    return renderTxRow(tx, {
                                        isSingleBranch: true,
                                        isAdmin:        false,
                                        branchTdHTML:   '',
                                        btnDel:         '',
                                    });
                                }).join('');
                                _txEl.innerHTML = _html ||
                                    '<tr><td colspan="10" style="text-align:center;color:#64748b;padding:16px;">Không có giao dịch</td></tr>';
                                console.info('[pagination/transactions] Direct row render (island fallback):', pgState.currentItems.length, 'rows → #txList');
                            }
                        }
                    } catch (_rowErr) {
                        console.warn('[pagination/transactions] Direct row render lỗi (non-blocking):', _rowErr && _rowErr.message);
                    }
                } catch (err) {
                    pgState.isLoading = false;
                    const errMsg = (err && err.message) || String(err);
                    const isIndexErr = errMsg.includes('failed-precondition') ||
                                       errMsg.includes('requires an index') ||
                                       errMsg.includes('The query requires an index');
                    if (isIndexErr) {
                        console.error('[pagination/transactions] Thiếu Firestore index cho truy vấn giao dịch. Hãy deploy firestore.indexes.json hoặc tạo index từ link Firebase Console trong console.');
                        const linkMatch = errMsg.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
                        if (linkMatch) console.info('[pagination/transactions] 🔗 Tạo index nhanh (bấm link):', linkMatch[0]);
                        const txList = document.getElementById('txList');
                        if (txList) {
                            txList.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px 16px;color:#b91c1c;font-weight:600;line-height:1.6;">' +
                                '⚠️ Thiếu Firestore index — danh sách giao dịch chưa tải được.<br>' +
                                '<span style="font-weight:400;font-size:0.9em;">Admin cần deploy <code>firestore.indexes.json</code> hoặc bấm link tạo index trong Console trình duyệt.</span>' +
                                '</td></tr>';
                        }
                    } else {
                        console.error('[pagination/transactions] Lỗi load trang:', err);
                    }
                }

                _injectControls();
            }

            // ── API: Load trang đầu tiên ────────────────────────────────
            async function loadFirstPage() {
                resetPagination(pgState);
                pgState.currentPage = 1;
                await _doLoad(null, 'first');
            }

            // ── API: Trang tiếp theo ────────────────────────────────────
            window._pgNext_transactions = async function () {
                // Phase 4K-5H: nếu tháng dùng _mergedAllItems thì append client-side
                if (Array.isArray(pgState._mergedAllItems) && pgState._mergedAllItems.length) {
                    const currentLen = Array.isArray(pgState.currentItems) ? pgState.currentItems.length : 0;
                    const nextSlice  = pgState._mergedAllItems.slice(currentLen, currentLen + PAGE_SIZE);

                    if (!nextSlice.length) {
                        pgState.hasNext = false;
                        _injectControls();
                        return;
                    }

                    // Dedup by id
                    const byId = new Map();
                    (pgState.currentItems || []).forEach(t => { if (t && t.id) byId.set(t.id, t); });
                    nextSlice.forEach(t => { if (t && t.id) byId.set(t.id, t); });

                    pgState.currentItems = Array.from(byId.values());
                    pgState.totalLoaded  = pgState.currentItems.length;
                    pgState.currentPage  = (pgState.currentPage || 1) + 1;
                    pgState.hasNext      = pgState.currentItems.length < pgState._mergedAllItems.length;
                    pgState.enabled      = true;

                    if (window.__store) {
                        window.__store.pagination.transactions = pgState;
                        window.__store.transactions = pgState.currentItems;
                        window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
                    }

                    if (typeof window.refreshListsComputation === 'function') {
                        window.refreshListsComputation(['tx.txList', 'dashboard.summary'], 'load-more-tuition-merged');
                    }
                    if (typeof window.invalidateList === 'function') {
                        window.invalidateList('tx.txList', 'load-more-tuition-merged');
                    } else if (typeof window.invalidateFinance === 'function') {
                        window.invalidateFinance('load-more-tuition-merged');
                    }

                    _injectControls();
                    return;
                }

                const cursor = prepareNextPage(pgState);
                if (!cursor) return;
                await _doLoad(cursor, 'next');
            };

            // ── API: Trang trước ────────────────────────────────────────
            window._pgPrev_transactions = async function () {
                const cursor = preparePreviousPage(pgState);
                if (cursor === null && !pgState.hasPrevious) return;
                if (cursor === null) {
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    await _doLoad(null, 'first');
                } else {
                    await _doLoad(cursor, 'prev');
                }
            };

            // ── API: Reload (sau add/delete tx) ────────────────────────
            window.reloadTransactionsPage = async function () {
                resetPagination(pgState);
                pgState.currentPage = 1;
                await _doLoad(null, 'first');
            };

            // ── Bind: Reset pagination khi đổi tháng ──────────────────
            function _bindMonthReset() {
                const el = document.getElementById('filterMonth');
                if (!el || el.__pgTxBound) return;
                el.__pgTxBound = true;
                el.addEventListener('change', () => {
                    resetPagination(pgState);
                    pgState.currentPage = 1;
                    _doLoad(null, 'first');
                });
            }

            // ── Bind: Reset pagination khi search thay đổi ─────────────
            function _bindSearchReset() {
                const el = document.getElementById('txSearch') ||
                           document.querySelector('#tx input[type="search"]');
                if (!el || el.__pgTxSearchBound) return;
                el.__pgTxSearchBound = true;
                let _debounce = null;
                el.addEventListener('input', () => {
                    clearTimeout(_debounce);
                    _debounce = setTimeout(() => {
                        resetPagination(pgState);
                        pgState.currentPage = 1;
                        _doLoad(null, 'first');
                    }, 350);
                });
            }

            // ── Auto-start ──────────────────────────────────────────────
            setTimeout(() => {
                _bindMonthReset();
                _bindSearchReset();
                // Chỉ load nếu tab tx đang active
                const curTab = (window.__store || {}).currentTab || '';
                if (curTab === 'tx' || document.getElementById('txList')) {
                    loadFirstPage();
                }
            }, 700);

            console.info('[finance.js] ✅ Phase 3.2A — initTransactionPagination() OK, PAGE_SIZE =', PAGE_SIZE);

        }).catch(err => console.error('[initTransactionPagination] import finance.service:', err));
    }).catch(err => console.error('[initTransactionPagination] import pagination.js:', err));
}

// ════════════════════════════════════════════════════════════════
// Phase 4K-5G — Load More: HỌC PHÍ tab (global API)
// ════════════════════════════════════════════════════════════════
window.loadMoreTuitionTransactions = function loadMoreTuitionTransactions() {
    if (typeof window._pgNext_transactions === 'function') {
        window._pgNext_transactions();
    } else {
        console.warn('[loadMoreTuitionTransactions] _pgNext_transactions chưa sẵn sàng');
    }
};

window.loadNextTransactionsPage = window.loadMoreTuitionTransactions;

