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
import { FinanceService } from '../services/finance.service.js';

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
export function initFinance() {

    // ════════════════════════════════════════════════════════════
    // 1. formatMonthCompact — Expose module version ra window
    //    Override bản app.js (bản app.js có bug nhỏ khi ghép năm)
    // ════════════════════════════════════════════════════════════

    /**
     * Rút gọn danh sách tháng thành chuỗi hiển thị.
     * Ví dụ: '2025-01,2025-02,2025-03' → 'T1, T2, T3/2025'
     */
    window.formatMonthCompact = formatMonthCompact;

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
        await StudentService.addSkippedMonth(name, month);
        window.showToast('✅ Đã miễn phí tháng!');
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
        await StudentService.removeSkippedMonth(name, month);
        // Đóng modal hồ sơ nếu đang mở
        if (typeof window.closeModal === 'function') window.closeModal('profileModal');
        window.showToast('✅ Đã khôi phục nợ!');
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
            StudentService.updateProfile(name, { status: 'quit', quitDate: getLocalToday() })
                .then(() => window.showToast('✅ Đã chuyển trạng thái Nghỉ tập!'));
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
        if (!confirm(
            '⚠️ Bạn có chắc muốn xóa giao dịch này?\n' +
            '(Nếu là giao dịch kho sẽ không tự hoàn trả số dư, ' +
            'hãy chủ động cập nhật lại kho sau khi xóa)'
        )) return;

        const allTransactions = _transactions();

        // Lưu snapshot tx trước khi xóa để tính lại paidUntil
        const txToDelete = allTransactions.find(t => t.id === id);

        // Xóa giao dịch chính
        await FinanceService.deleteTransaction(id);

        // Xóa bản ghi kho liên kết (nếu có)
        if (relatedInvId && relatedInvId !== 'undefined') {
            await FinanceService.deleteRelatedInventory(relatedInvId);
        }

        // Nếu là giao dịch học phí → tính lại paidUntil từ Firestore
        if (txToDelete && (
            txToDelete.type === 'Học phí' ||
            txToDelete.type === 'Học phí + Lệ phí thi'
        )) {
            const studentName = (txToDelete.description || '').trim();
            if (studentName) {
                // Truy vấn TOÀN BỘ lịch sử học phí từ Firestore — không giới hạn tháng
                const stuTxDocs = await FinanceService.getStudentTuitionTxs(studentName);
                const remainingMonths = [];
                stuTxDocs.forEach(({ id: txId, data: td }) => {
                    if (txId === id) return; // bỏ qua tx vừa xóa
                    if (td.type !== 'Học phí' && td.type !== 'Học phí + Lệ phí thi') return;
                    if (td.packageMonths) remainingMonths.push(...td.packageMonths);
                    else if (td.txMonth) remainingMonths.push(td.txMonth);
                });

                const sortedRemaining = [...new Set(remainingMonths)].sort();
                const newPaidUntil = sortedRemaining.length > 0
                    ? sortedRemaining[sortedRemaining.length - 1]
                    : '';
                const deletedMonths = txToDelete.packageMonths ||
                    (txToDelete.txMonth ? [txToDelete.txMonth] : []);

                await FinanceService.updateProfileAfterTxDelete(studentName, newPaidUntil, deletedMonths);
            }
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
            return;
        }

        const profiles = _profiles();

        // Làm sạch tên (tránh lỗi với tên có dấu nháy)
        const cleanName = name.replace(/\\'/g, "'");
        const monthsList = monthsStr
            ? monthsStr.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const lastMonth = monthsList.length > 0 ? monthsList[monthsList.length - 1] : monthsStr;
        const monthLabel = formatMonthCompact(monthsStr);

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
            if (inputAmount === null) return;
            amount = Number(inputAmount.replace(/\D/g, ''));
            if (amount <= 0) {
                window.showToast('⚠️ Số tiền không hợp lệ!', 2500);
                return;
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

        try {
            const today = getLocalToday();
            // Thu bù tháng cũ → date = YYYY-MM-01 để lọc đúng tháng
            const txDate = actualLastMonth < today.substring(0, 7)
                ? actualLastMonth + '-01'
                : today;

            await FinanceService.addTransaction({
                branch: branch || 'CS1',
                type: 'Học phí',
                description: cleanName,
                amount,
                date: txDate,
                txMonth: actualLastMonth,
                packageMonths: paidMonthsList,
                timestamp: Date.now(),
            });

            // Không cho paidUntil thụt lùi về trước hiện tại
            const normPaid = normalizeYYYYMM(profile.paidUntil);
            const safePaidUntil = actualLastMonth > (normPaid || '')
                ? actualLastMonth
                : (normPaid || actualLastMonth);

            // Chỉ ghi field thanh toán — KHÔNG ghi đè belt/branch/status/createdAt
            await FinanceService.updateStudentPayment(cleanName, {
                paidUntil: safePaidUntil,
                paidMonths: FinanceService._arrayUnion(...paidMonthsList),
            });

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

            // Toast phân biệt 1 tháng / nhiều tháng
            const toastMsg = paidMonthsList.length > 1
                ? `✅ ${cleanName} đóng học phí ${paidMonthsList.map(m => {
                    const [y, mo] = m.split('-');
                    return `tháng ${parseInt(mo)}/${y}`;
                }).join(', ')} (${paidMonthsList.length} tháng)!`
                : `✅ ${cleanName} đóng học phí ${paidMonthsList.map(m => {
                    const [y, mo] = m.split('-');
                    return `tháng ${parseInt(mo)}/${y}`;
                }).join(', ')}!`;
            window.showToast(toastMsg);

            // Xuất biên lai (nếu có)
            if (window.exportReceipt) {
                const breakdown = [{ label: 'Học phí ' + actualMonthLabel, amount }];
                await window.exportReceipt(
                    cleanName, amount, 'Học phí', today,
                    paidMonthsList.join(','), branch || 'CS1', '', 'BIÊN LAI THU TIỀN', breakdown
                );
            }
        } catch (error) {
            console.error('[finance.js] quickPay lỗi:', error);
            window.showToast('⚠️ Lỗi hệ thống, vui lòng thử lại!', 4000);
        }
    };

    // ════════════════════════════════════════════════════════════
    // 6. openQuickPayModal — Mở modal chọn số tháng thu
    // ════════════════════════════════════════════════════════════

    /**
     * Hiển thị modal chọn số tháng học phí cần thu.
     * Fallback về quickPay trực tiếp nếu modal không có trong DOM.
     *
     * @param {string} name          — Tên võ sinh
     * @param {string} owedMonthsStr — Chuỗi tháng nợ (YYYY-MM, phẩy-separated)
     * @param {string} branch        — Mã cơ sở
     */
    window.openQuickPayModal = (name, owedMonthsStr, branch) => {
        if (window.userRole === 'viewer') {
            window.showToast('⚠️ Tài khoản khách không thể thu tiền!', 3000);
            return;
        }

        const cleanName = name.replace(/\\'/g, "'");
        const monthsList = owedMonthsStr
            ? owedMonthsStr.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const profiles = _profiles();
        const profile = profiles[cleanName] || {};
        const feePerMonth = Number(profile.tuitionFee) || 0;
        const totalMonths = monthsList.length;
        const modal = document.getElementById('quickPayModal');

        // Không có modal trong DOM → fallback quickPay trực tiếp
        if (!modal) {
            window.quickPay(name, owedMonthsStr, branch, (feePerMonth * totalMonths).toString(), true);
            return;
        }

        // Tiêu đề modal
        document.getElementById('qpm_name').textContent =
            `${cleanName} — ${totalMonths} tháng chưa nộp`;

        // Xây dựng các nút chọn tháng
        const optionsEl = document.getElementById('qpm_options');
        optionsEl.innerHTML = '';

        for (let i = 1; i <= totalMonths; i++) {
            const months = monthsList.slice(0, i);
            const amount = feePerMonth > 0 ? feePerMonth * i : 0;
            const monthsStr = months.join(',');
            const label = months
                .map(m => { const p = m.split('-'); return `T${parseInt(p[1])}/${p[0]}`; })
                .join(', ');
            const isAll = (i === totalMonths);

            const btn = document.createElement('button');
            btn.setAttribute('type', 'button');
            btn.style.cssText = [
                'width:100%;padding:11px 14px;border-radius:11px;',
                `border:2px solid ${isAll ? '#059669' : '#e2e8f0'};`,
                `background:${isAll ? '#ecfdf5' : '#f8fafc'};`,
                'cursor:pointer;display:flex;justify-content:space-between;',
                'align-items:center;margin-bottom:6px;transition:opacity 0.15s;',
            ].join('');
            const amtText = amount > 0
                ? amount.toLocaleString('vi-VN') + ' ₫'
                : '(Tự nhập)';
            btn.innerHTML =
                `<span style="font-weight:700;color:#1e293b;font-size:0.88rem;">${i} tháng ` +
                `<span style="font-weight:500;color:#64748b;font-size:0.78rem;">(${label})</span></span>` +
                `<span style="font-weight:900;color:${isAll ? '#059669' : '#0033A0'};font-size:0.95rem;">${amtText}</span>`;
            btn.onclick = () => {
                modal.style.display = 'none';
                window.quickPay(
                    name, monthsStr, branch,
                    amount > 0 ? String(amount) : String(feePerMonth * i),
                    true
                );
            };
            optionsEl.appendChild(btn);
        }

        // Nút nhập số tiền tùy chỉnh
        const customBtn = document.createElement('button');
        customBtn.setAttribute('type', 'button');
        customBtn.style.cssText = [
            'width:100%;padding:9px 14px;border-radius:11px;',
            'border:1px dashed #cbd5e1;background:#fff;cursor:pointer;',
            'color:#64748b;font-weight:600;font-size:0.82rem;margin-top:4px;',
        ].join('');
        customBtn.textContent = '✏️ Nhập số tiền tùy chỉnh';
        customBtn.onclick = () => {
            customBtn.style.display = 'none';
            const row = document.createElement('div');
            row.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';
            const defaultVal = feePerMonth > 0
                ? (feePerMonth * totalMonths).toLocaleString('vi-VN')
                : '';
            row.innerHTML =
                `<input type="tel" id="qpm_custom_input" placeholder="Nhập số tiền (₫)..."` +
                ` style="flex:1;padding:9px 12px;border:1.5px solid #0033A0;border-radius:9px;` +
                `font-size:0.88rem;font-weight:700;outline:none;box-sizing:border-box;" value="${defaultVal}" />` +
                `<button type="button" id="qpm_custom_ok" style="padding:9px 14px;background:#059669;` +
                `color:#fff;border:none;border-radius:9px;font-weight:800;font-size:0.85rem;` +
                `cursor:pointer;white-space:nowrap;">✓ Thu</button>`;
            optionsEl.appendChild(row);

            const inp = document.getElementById('qpm_custom_input');
            if (inp) { inp.focus(); inp.select(); }

            const doConfirm = () => {
                const raw = (inp ? inp.value : '').replace(/\D/g, '');
                const v = Number(raw);
                if (!v || v <= 0) { window.showToast('⚠️ Số tiền không hợp lệ!', 2500); return; }
                modal.style.display = 'none';
                window.quickPay(name, owedMonthsStr, branch, String(v), true);
            };
            const okBtn = document.getElementById('qpm_custom_ok');
            if (okBtn) okBtn.onclick = doConfirm;
            if (inp) inp.addEventListener('keypress', ev => { if (ev.key === 'Enter') doConfirm(); });
        };
        optionsEl.appendChild(customBtn);
        modal.style.display = 'flex';
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

        const feeEl = document.getElementById('exam_fee_all_actual');
        const defaultFee = feeEl ? (feeEl.value || 250000) : 250000;
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
            amount,
            date: examDate,
            txMonth: examMonth,
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

                // Võ sinh 1
                if (n1 && f1 > 0) {
                    const d1 = m1 < todayM ? m1 + '-01' : today;
                    await FinanceService.addTransaction({
                        branch: b1, type: 'Học phí', description: n1,
                        amount: f1, date: d1, txMonth: m1, packageMonths: [m1],
                        timestamp: Date.now(),
                    });
                    // Chỉ ghi paidUntil, không ghi đè các field khác
                    const cu1 = normalizeYYYYMM((profiles[n1] && profiles[n1].paidUntil) || '');
                    const np1 = m1 > cu1 ? m1 : cu1;
                    await FinanceService.patchProfile(n1, { paidUntil: np1 });
                    await FinanceService.addFeeAuditSilent({
                        studentId: n1, amount: f1, date: today,
                        type: 'tuition', month: np1, months: [m1],
                        by: window.currentUserEmail || 'admin', timestamp: Date.now(),
                    });
                }

                // Võ sinh 2
                if (n2 && f2 > 0) {
                    const d2 = m2 < todayM ? m2 + '-01' : today;
                    await FinanceService.addTransaction({
                        branch: b2, type: 'Học phí', description: n2,
                        amount: f2, date: d2, txMonth: m2, packageMonths: [m2],
                        timestamp: Date.now() + 1,
                    });
                    const cu2 = normalizeYYYYMM((profiles[n2] && profiles[n2].paidUntil) || '');
                    const np2 = m2 > cu2 ? m2 : cu2;
                    await FinanceService.patchProfile(n2, { paidUntil: np2 });
                    await FinanceService.addFeeAuditSilent({
                        studentId: n2, amount: f2, date: today,
                        type: 'tuition', month: np2, months: [m2],
                        by: window.currentUserEmail || 'admin', timestamp: Date.now() + 1,
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

    // ════════════════════════════════════════════════════════════════
    // 9. openComboModal — Mở modal thu gộp gia đình
    // ════════════════════════════════════════════════════════════════

    /**
     * Hiển thị modal nhập thông tin thu gộp 2 võ sinh cùng gia đình.
     * Nội dung modal được điền sẵn bởi code trong index.html.
     */
    window.openComboModal = () => {
        const modal = document.getElementById('comboModal');
        if (modal) modal.style.display = 'flex';
    };

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

            await FinanceService.addTransaction(txData);

            if (monthsToRecord.length > 0) {
                await FinanceService.updateStudentPayment(name, {
                    paidUntil: newPaidUntil,
                    paidMonths: FinanceService._arrayUnion(...monthsToRecord),
                });
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

    // ════════════════════════════════════════════════════════════════
    // 11. openExcelExportModal + updateExcelPeriodOptions
    //     Mở modal xuất Excel, cập nhật options kỳ
    // ════════════════════════════════════════════════════════════════

    /**
     * Mở modal xuất báo cáo Excel.
     * Viewer không được xuất.
     */
    window.openExcelExportModal = () => {
        if (window.userRole === 'viewer') {
            window.showToast('⛔ Tài khoản khách không thể tải File!');
            return;
        }
        const modal = document.getElementById('excelExportModal');
        if (modal) modal.style.display = 'flex';
        window.updateExcelPeriodOptions();
    };

    /**
     * Cập nhật danh sách kỳ xuất (tháng/quý/6 tháng/cả năm) theo loại được chọn.
     */
    window.updateExcelPeriodOptions = () => {
        const typeEl = document.getElementById('excel_periodType');
        const sel    = document.getElementById('excel_periodValue');
        if (!typeEl || !sel) return;
        const type = typeEl.value;
        sel.innerHTML = '';
        if (type === 'month') {
            for (let i = 1; i <= 12; i++) sel.innerHTML += `<option value="${i}">Tháng ${i}</option>`;
        } else if (type === 'quarter') {
            for (let i = 1; i <= 4; i++) sel.innerHTML += `<option value="${i}">Quý ${i}</option>`;
        } else if (type === 'half') {
            sel.innerHTML = '<option value="1">6 tháng đầu năm</option><option value="2">6 tháng cuối năm</option>';
        } else {
            sel.innerHTML = '<option value="1">Cả năm</option>';
        }
    };

    // Alias: window.exportToExcel → openExcelExportModal
    window.exportToExcel = window.openExcelExportModal;

    // ════════════════════════════════════════════════════════════════
    // 12. executeExcelExport — Xuất báo cáo đa sheet sang Excel (XLSX)
    // ════════════════════════════════════════════════════════════════

    /**
     * Thực hiện xuất file Excel báo cáo gồm 6 sheet:
     *  1. Tổng Quan   — thu/chi tổng hợp, theo cơ sở
     *  2. Thu Chi     — bảng giao dịch chi tiết
     *  3. Danh Sách Võ Sinh — võ sinh đang tập
     *  4. Kho Võ Phục — nhập/xuất trang phục
     *  5. Báo Cáo Nợ  — danh sách nợ học phí
     *  6. Thi Đai     — danh sách đăng ký và đã nộp phí thi
     *
     * Dùng thư viện XLSX (SheetJS CDN) đã có sẵn trong index.html.
     *
     * FIX: Query 2 chiều (theo date VÀ txMonth) để không bỏ sót
     * giao dịch bù tháng cũ (đóng T1 vào ngày T2).
     */
    window.executeExcelExport = async () => {
        if (window.userRole === 'viewer') return;

        const config    = _config();
        const profiles  = _profiles();
        const clubData  = _clubData();

        const yearEl  = document.getElementById('excel_year');
        const pTypeEl = document.getElementById('excel_periodType');
        const pValEl  = document.getElementById('excel_periodValue');
        if (!yearEl || !pTypeEl || !pValEl) return;

        const year   = parseInt(yearEl.value);
        const pType  = pTypeEl.value;
        const pVal   = pValEl.value;
        const pLabel = pValEl.options[pValEl.selectedIndex].text;

        let startStr, endStr;
        if (pType === 'month') {
            const m = String(pVal).padStart(2, '0');
            startStr = `${year}-${m}-01`;
            endStr   = `${year}-${m}-31`;
        } else if (pType === 'quarter') {
            const ms = (parseInt(pVal) - 1) * 3 + 1;
            const me = ms + 2;
            startStr = `${year}-${String(ms).padStart(2, '0')}-01`;
            endStr   = `${year}-${String(me).padStart(2, '0')}-31`;
        } else if (pType === 'half') {
            if (pVal === '1') { startStr = `${year}-01-01`; endStr = `${year}-06-30`; }
            else              { startStr = `${year}-07-01`; endStr = `${year}-12-31`; }
        } else {
            startStr = `${year}-01-01`;
            endStr   = `${year}-12-31`;
        }

        const periodTitle = `${pLabel} năm ${year}`;
        window.showToast('⏳ Đang xuất dữ liệu...', 15000, true);

        try {
            // Query 1: theo ngày thực tế
            const txAll = await FinanceService.queryTxByDateRange(startStr, endStr);

            // Query 2: theo txMonth để bắt giao dịch bù tháng cũ (cross-month)
            const startM = startStr.substring(0, 7);
            const endM   = endStr.substring(0, 7);
            const txByMonth = await FinanceService.queryTxByTxMonthRange(startM, endM);
            const seenIds = new Set(txAll.map(d => d.id));
            txByMonth.forEach(d => {
                if (!seenIds.has(d.id)) txAll.push(d);
            });
            txAll.sort((a, b) => (a.date > b.date ? 1 : -1));

            const invAll = await FinanceService.queryInvByDateRange(startStr, endStr);
            invAll.sort((a, b) => (a.date > b.date ? 1 : -1));

            // ── Cell factory helpers ─────────────────────────────────────────
            const borderAll  = { top:{style:'thin',color:{rgb:'BBBBBB'}}, bottom:{style:'thin',color:{rgb:'BBBBBB'}}, left:{style:'thin',color:{rgb:'BBBBBB'}}, right:{style:'thin',color:{rgb:'BBBBBB'}} };
            const borderBold = { top:{style:'medium',color:{rgb:'0033A0'}}, bottom:{style:'medium',color:{rgb:'0033A0'}}, left:{style:'medium',color:{rgb:'0033A0'}}, right:{style:'medium',color:{rgb:'0033A0'}} };
            const hdrFill    = { patternType:'solid', fgColor:{rgb:'0033A0'} };
            const subFill    = { patternType:'solid', fgColor:{rgb:'EEF2FF'} };
            const totalFill  = { patternType:'solid', fgColor:{rgb:'DCFCE7'} };
            const warnFill   = { patternType:'solid', fgColor:{rgb:'FEF9C3'} };
            const hdrFont    = { bold:true, color:{rgb:'FFFFFF'}, sz:11, name:'Arial' };
            const boldFont   = { bold:true, sz:11, name:'Arial' };
            const normFont   = { sz:11, name:'Arial' };
            const titleFont  = { bold:true, sz:14, name:'Arial', color:{rgb:'0033A0'} };
            const centerAlign = { horizontal:'center', vertical:'center', wrapText:true };
            const leftAlign   = { horizontal:'left',   vertical:'center', wrapText:true };
            const rightAlign  = { horizontal:'right',  vertical:'center' };

            const makeCell = (v, font, fill, border, alignment, numFmt) => {
                const c = { v, t: typeof v === 'number' ? 'n' : 's', s: { font: font || normFont, alignment: alignment || leftAlign } };
                if (fill)   c.s.fill   = fill;
                if (border) c.s.border = border;
                if (numFmt) c.s.numFmt = numFmt;
                return c;
            };
            const hc    = (v) => makeCell(v, hdrFont,  hdrFill,   borderBold, centerAlign);
            const nc    = (v) => makeCell(v, normFont, null,       borderAll,  leftAlign);
            const bc    = (v) => makeCell(v, boldFont, null,       borderAll,  leftAlign);
            const rc    = (v) => makeCell(v, normFont, null,       borderAll,  rightAlign); // eslint-disable-line no-unused-vars
            const nNum  = (v) => makeCell(Number(v) || 0, normFont, null,      borderAll,  rightAlign, '#,##0');
            const bNum  = (v) => makeCell(Number(v) || 0, boldFont, null,      borderAll,  rightAlign, '#,##0');
            const totNum = (v) => makeCell(Number(v) || 0, { ...boldFont, color:{rgb:'166534'} }, totalFill, borderAll, rightAlign, '#,##0');
            const totTxt = (v) => makeCell(v,              { ...boldFont, color:{rgb:'166534'} }, totalFill, borderAll, leftAlign);
            const warnTxt = (v) => makeCell(v,             { ...boldFont, color:{rgb:'854D0E'} }, warnFill,  borderAll, leftAlign);
            const warnNum = (v) => makeCell(Number(v) || 0, { ...boldFont, color:{rgb:'854D0E'} }, warnFill, borderAll, rightAlign, '#,##0');

            const titleRow = (text, cols) => {
                const r = [makeCell(text, titleFont, { patternType:'solid', fgColor:{rgb:'EFF6FF'} }, borderBold, centerAlign)];
                for (let i = 1; i < cols; i++) r.push(makeCell('', normFont, { patternType:'solid', fgColor:{rgb:'EFF6FF'} }, borderBold, centerAlign));
                return r;
            };

            const wb        = XLSX.utils.book_new();
            const clubName  = clubData.clubName || 'CLB';
            const isSingle  = config.branchCount === 1;
            const bCount    = config.branchCount || 1;
            const getBranch = (code) => window.getBranchNameDisplay ? window.getBranchNameDisplay(code) : (code || '');

            // ── SHEET 1: TỔNG QUAN ─────────────────────────────────────────────
            let incTuition = 0, incExam = 0, incOther = 0, incUniform = 0,
                expUniform = 0, exp = 0, expExam = 0;
            const bIncome = {};
            for (let i = 1; i <= bCount; i++) bIncome['CS' + i] = 0;
            txAll.forEach(t => {
                const a  = Number(t.amount) || 0;
                const tb = t.branch || 'CS1';
                if (t.type === 'Học phí')               { incTuition += a; if (bIncome[tb] !== undefined) bIncome[tb] += a; }
                else if (t.type === 'Học phí + Lệ phí thi') {
                    incTuition += Number(t.tuitionAmount) || 0;
                    incExam    += Number(t.examAmount)    || 0;
                    if (bIncome[tb] !== undefined) bIncome[tb] += a;
                }
                else if (t.type === 'Lệ phí thi')       { incExam    += a; if (bIncome[tb] !== undefined) bIncome[tb] += a; }
                else if (t.type === 'Thu Võ phục' || t.type === 'Võ phục') incUniform += a;
                else if (t.type === 'Chi Võ phục')      expUniform  += a;
                else if (t.type === 'Chi phí')          exp         += a;
                else if (t.type === 'Chi phí kỳ thi')   expExam     += a;
                else if (t.type === 'Thu khác')         { incOther  += a; if (bIncome[tb] !== undefined) bIncome[tb] += a; }
            });
            const totalInc = incTuition + incExam + incOther + incUniform;
            const totalExp = exp + expExam + expUniform;
            const profit   = totalInc - totalExp;

            const ovRows = [
                titleRow(`BÁO CÁO TỔNG QUAN — ${periodTitle.toUpperCase()} — ${clubName.toUpperCase()}`, 3),
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [hc('KHOẢN MỤC'), hc('CHI TIẾT'), hc('SỐ TIỀN (VNĐ)')],
                [bc('THU HỌC PHÍ'),    nc('Học phí các tháng'),      bNum(incTuition)],
                [bc('THU LỆ PHÍ THI'), nc('Kỳ thi thăng đai'),       bNum(incExam)],
                [bc('THU VÕ PHỤC'),    nc('Bán trang phục'),          bNum(incUniform)],
                [bc('THU KHÁC'),       nc('Dịch vụ & phát sinh'),     bNum(incOther)],
                [totTxt('TỔNG THU'),   totTxt(''),                    totNum(totalInc)],
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [bc('CHI PHÍ HOẠT ĐỘNG'), nc('Lương, thuê mặt bằng...'), bNum(exp)],
                [bc('CHI PHÍ KỲ THI'),    nc('Giám khảo, băng rôn...'),  bNum(expExam)],
                [bc('CHI NHẬP VÕ PHỤC'),  nc('Mua hàng từ nhà CC'),      bNum(expUniform)],
                [warnTxt('TỔNG CHI'), warnTxt(''), warnNum(totalExp)],
                [makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)],
                [
                    makeCell('LỢI NHUẬN RÒNG', { ...boldFont, sz:13, color:{rgb: profit>=0?'166534':'991B1B'} }, { patternType:'solid', fgColor:{rgb: profit>=0?'DCFCE7':'FEE2E2'} }, borderBold, centerAlign),
                    makeCell('',  normFont, { patternType:'solid', fgColor:{rgb: profit>=0?'DCFCE7':'FEE2E2'} }, borderBold),
                    makeCell(profit, { ...boldFont, sz:13, color:{rgb: profit>=0?'166534':'991B1B'} }, { patternType:'solid', fgColor:{rgb: profit>=0?'DCFCE7':'FEE2E2'} }, borderBold, rightAlign, '#,##0'),
                ],
            ];
            const ovMerges = [{ s:{r:0,c:0}, e:{r:0,c:2} }, { s:{r:14,c:0}, e:{r:14,c:1} }];
            if (bCount > 1) {
                ovRows.push([makeCell('',normFont,null,null), makeCell('',normFont,null,null), makeCell('',normFont,null,null)]);
                const brTitleIdx = ovRows.length;
                ovRows.push(titleRow('THỐNG KÊ DOANH THU THEO CƠ SỞ', 3));
                ovRows.push([hc('CƠ SỞ'), hc('DOANH THU (VNĐ)'), hc('VÕ SINH ĐANG TẬP')]);
                for (let i = 1; i <= bCount; i++) {
                    const key   = 'CS' + i;
                    const bName = config['branchName' + i] || ('Cơ sở ' + i);
                    const bAct  = Object.values(profiles).filter(p => p.status === 'active' && (p.branch || 'CS1') === key).length;
                    ovRows.push([bc(bName), bNum(bIncome[key] || 0), bNum(bAct)]);
                }
                ovMerges.push({ s:{r:brTitleIdx,c:0}, e:{r:brTitleIdx,c:2} });
            }
            const wsOv = XLSX.utils.aoa_to_sheet(ovRows);
            wsOv['!cols']   = [{ wch:28 }, { wch:32 }, { wch:22 }];
            wsOv['!rows']   = [{ hpt:22 }];
            wsOv['!merges'] = ovMerges;
            XLSX.utils.book_append_sheet(wb, wsOv, '1. Tong Quan');

            // ── SHEET 2: THU CHI ───────────────────────────────────────────────
            const cols2 = isSingle
                ? ['Ngày','Phân loại','Võ sinh / Nội dung','Kỳ T.Thu','Số tiền (VNĐ)']
                : ['Ngày','Cơ sở','Phân loại','Võ sinh / Nội dung','Kỳ T.Thu','Số tiền (VNĐ)'];
            const txRows = [
                titleRow(`BẢNG THU CHI — ${periodTitle.toUpperCase()}`, cols2.length),
                cols2.map(hc),
            ];
            let txTotal = 0;
            txAll
                .filter(t => !['Chi Võ phục','Thu Võ phục','Võ phục','Tặng Võ phục'].includes(t.type))
                .forEach(t => {
                    const a = Number(t.amount) || 0;
                    const isIncome = !t.type.startsWith('Chi');
                    const amtCell  = { v:a, t:'n', s:{ font:{ ...normFont, color:{rgb:isIncome?'166534':'991B1B'}, bold:true }, border:borderAll, alignment:rightAlign, numFmt:'#,##0' } };
                    const txMonthStr = t.txMonth
                        ? formatMonth(t.txMonth)
                        : (t.date || '').substring(0,7).split('-').reverse().join('/');
                    if (isSingle) txRows.push([nc(formatDate(t.date)), nc(t.type||''), nc(t.description||''), nc(txMonthStr), amtCell]);
                    else          txRows.push([nc(formatDate(t.date)), nc(getBranch(t.branch)), nc(t.type||''), nc(t.description||''), nc(txMonthStr), amtCell]);
                    if (isIncome) txTotal += a; else txTotal -= a;
                });
            const totRow2 = isSingle
                ? [totTxt('TỔNG'), totTxt(''), totTxt(''), totTxt(''), totNum(txTotal)]
                : [totTxt('TỔNG'), totTxt(''), totTxt(''), totTxt(''), totTxt(''), totNum(txTotal)];
            txRows.push(totRow2);
            const wsTx = XLSX.utils.aoa_to_sheet(txRows);
            wsTx['!cols']   = isSingle ? [{wch:12},{wch:22},{wch:32},{wch:12},{wch:18}] : [{wch:12},{wch:14},{wch:22},{wch:32},{wch:12},{wch:18}];
            wsTx['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:cols2.length-1} }];
            XLSX.utils.book_append_sheet(wb, wsTx, '2. Thu Chi');

            // ── SHEET 3: DANH SÁCH VÕ SINH ────────────────────────────────────
            const stuCols = isSingle
                ? ['STT','Họ và Tên','Mã HV','Cấp đai','Ngày sinh','SĐT','Đã đóng tới','Học phí/Tháng']
                : ['STT','Họ và Tên','Mã HV','Cơ sở','Cấp đai','Ngày sinh','SĐT','Đã đóng tới','Học phí/Tháng'];
            const stuRows = [
                titleRow(`DANH SÁCH VÕ SINH ĐANG TẬP — ${clubName.toUpperCase()}`, stuCols.length),
                stuCols.map(hc),
            ];
            let stt = 1;
            Object.keys(profiles).sort().forEach(name => {
                const p = profiles[name];
                if (p.status !== 'active') return;
                const row = isSingle
                    ? [nc(String(stt++)), bc(name), nc(p.memberId||'-'), nc(p.belt||''), nc(p.dob||''), nc(p.phone||''), nc(p.paidUntil ? formatMonth(p.paidUntil) : ''), nNum(p.tuitionFee||0)]
                    : [nc(String(stt++)), bc(name), nc(p.memberId||'-'), nc(getBranch(p.branch)), nc(p.belt||''), nc(p.dob||''), nc(p.phone||''), nc(p.paidUntil ? formatMonth(p.paidUntil) : ''), nNum(p.tuitionFee||0)];
                stuRows.push(row);
            });
            const wsStu = XLSX.utils.aoa_to_sheet(stuRows);
            wsStu['!cols']   = isSingle ? [{wch:5},{wch:28},{wch:14},{wch:24},{wch:14},{wch:14},{wch:14},{wch:16}] : [{wch:5},{wch:28},{wch:14},{wch:14},{wch:24},{wch:14},{wch:14},{wch:14},{wch:16}];
            wsStu['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:stuCols.length-1} }];
            XLSX.utils.book_append_sheet(wb, wsStu, '3. Danh Sach Vo Sinh');

            // ── SHEET 4: KHO VÕ PHỤC ──────────────────────────────────────────
            const invRows = [
                titleRow(`KHO VÕ PHỤC — ${periodTitle.toUpperCase()}`, 6),
                ['Ngày','Size','Loại','Người giao dịch','SL','Thành tiền (VNĐ)'].map(hc),
            ];
            let invIn = 0, invOut = 0;
            invAll.forEach(t => {
                const isImport = t.type === 'Nhập kho';
                const a = Number(t.amount) || 0;
                if (isImport) invOut += a; else invIn += a;
                const amtCell = { v:a, t:'n', s:{ font:{ ...normFont, color:{rgb:isImport?'991B1B':'166534'}, bold:true }, border:borderAll, alignment:rightAlign, numFmt:'#,##0' } };
                invRows.push([nc(formatDate(t.date)), nc(t.size||''), nc(t.type||''), nc(t.desc||''), nc(String(t.qty||1)), amtCell]);
            });
            invRows.push([totTxt('TỔNG THU BÁN'), totTxt(''), totTxt(''), totTxt(''), totTxt(''), totNum(invIn)]);
            invRows.push([warnTxt('TỔNG CHI NHẬP'), warnTxt(''), warnTxt(''), warnTxt(''), warnTxt(''), warnNum(invOut)]);
            const profitInv = invIn - invOut;
            invRows.push([
                makeCell('LỢI NHUẬN KHO', { ...boldFont, color:{rgb:profitInv>=0?'166534':'991B1B'} }, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderBold, leftAlign),
                makeCell('', normFont, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderAll),
                makeCell('', normFont, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderAll),
                makeCell('', normFont, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderAll),
                makeCell('', normFont, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderAll),
                makeCell(profitInv, { ...boldFont, color:{rgb:profitInv>=0?'166534':'991B1B'} }, { patternType:'solid', fgColor:{rgb:profitInv>=0?'DCFCE7':'FEE2E2'} }, borderBold, rightAlign, '#,##0'),
            ]);
            const wsInv = XLSX.utils.aoa_to_sheet(invRows);
            wsInv['!cols']   = [{ wch:12 }, { wch:12 }, { wch:14 }, { wch:28 }, { wch:6 }, { wch:20 }];
            wsInv['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:5} }, { s:{r:invRows.length-1,c:0}, e:{r:invRows.length-1,c:4} }];
            XLSX.utils.book_append_sheet(wb, wsInv, '4. Kho Vo Phuc');

            // ── SHEET 5: DANH SÁCH NỢ ─────────────────────────────────────────
            const selMonthEl = document.getElementById('filterMonth');
            const selMonth   = selMonthEl ? selMonthEl.value : endM;
            const debtCols   = isSingle ? 4 : 5;
            const debtHeaders = isSingle
                ? ['Họ và Tên','Số tháng nợ','Học phí/Tháng','Ước tính nợ (VNĐ)']
                : ['Họ và Tên','Cơ sở','Số tháng nợ','Học phí/Tháng','Ước tính nợ (VNĐ)'];
            const debtRows = [
                titleRow(`BÁO CÁO NỢ HỌC PHÍ — ${periodTitle.toUpperCase()}`, debtCols),
                debtHeaders.map(hc),
            ];
            let totalDebt = 0;
            Object.keys(profiles).sort().forEach(name => {
                const p = profiles[name];
                if (p.status !== 'active' || !p.paidUntil) return;
                if (p.feeExempt) return;
                if (p.paidUntil >= selMonth) return;
                const [yP, mP] = p.paidUntil.split('-').map(Number);
                const [yS, mS] = selMonth.split('-').map(Number);
                const months   = (yS - yP) * 12 + (mS - mP);
                if (months <= 0) return;
                const debt = months * (Number(p.tuitionFee) || 0);
                totalDebt += debt;
                const row = isSingle
                    ? [bc(name), nc(`${months} tháng`), nNum(p.tuitionFee||0), warnNum(debt)]
                    : [bc(name), nc(getBranch(p.branch)), nc(`${months} tháng`), nNum(p.tuitionFee||0), warnNum(debt)];
                debtRows.push(row);
            });
            const totDebtRow = isSingle
                ? [totTxt('TỔNG DỰ THU'), totTxt(''), totTxt(''), totNum(totalDebt)]
                : [totTxt('TỔNG DỰ THU'), totTxt(''), totTxt(''), totTxt(''), totNum(totalDebt)];
            debtRows.push(totDebtRow);
            const wsDebt = XLSX.utils.aoa_to_sheet(debtRows);
            wsDebt['!cols']   = isSingle ? [{wch:28},{wch:14},{wch:16},{wch:20}] : [{wch:28},{wch:14},{wch:14},{wch:16},{wch:20}];
            wsDebt['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:debtCols-1} }];
            XLSX.utils.book_append_sheet(wb, wsDebt, '5. Bao Cao No');

            // ── SHEET 6: THI ĐAI ──────────────────────────────────────────────
            const paidExam = {};
            txAll.forEach(t => {
                if (t.type === 'Lệ phí thi' || t.type === 'Học phí + Lệ phí thi') {
                    let stuName = '';
                    if (t.type === 'Học phí + Lệ phí thi') {
                        stuName = (t.description || '').trim();
                    } else {
                        const m = (t.description || '').match(/^(.*?)\s*\(Thi lên/);
                        stuName = m ? m[1].trim() : (t.description || '').trim();
                    }
                    if (stuName) paidExam[stuName] = {
                        amount: t.type === 'Học phí + Lệ phí thi' ? t.examAmount : t.amount,
                        belt: t.examTitle || '',
                    };
                }
            });
            const examColCount = isSingle ? 6 : 7;
            const examHeaders  = isSingle
                ? ['STT','Họ và Tên','Mã HV','Cấp đai','Đăng ký thi lên','Trạng thái phí']
                : ['STT','Họ và Tên','Mã HV','Cơ sở','Cấp đai','Đăng ký thi lên','Trạng thái phí'];
            const examRows = [
                titleRow(`DANH SÁCH VÕ SINH KỲ THI — ${periodTitle.toUpperCase()}`, examColCount),
                examHeaders.map(hc),
            ];
            let stt2 = 1;
            Object.keys(paidExam).sort().forEach(name => {
                const p    = profiles[name] || {};
                const paid = paidExam[name];
                const paidCell = { v:`Đã nộp (${Number(paid.amount||0).toLocaleString()} đ)`, t:'s', s:{ font:{ ...boldFont, color:{rgb:'166534'} }, fill:{ patternType:'solid', fgColor:{rgb:'DCFCE7'} }, border:borderAll, alignment:leftAlign } };
                const row = isSingle
                    ? [nc(String(stt2++)), bc(name), nc(p.memberId||'-'), nc(p.belt||''), nc(paid.belt||''), paidCell]
                    : [nc(String(stt2++)), bc(name), nc(p.memberId||'-'), nc(getBranch(p.branch)), nc(p.belt||''), nc(paid.belt||''), paidCell];
                examRows.push(row);
            });
            const wsExam = XLSX.utils.aoa_to_sheet(examRows);
            wsExam['!cols']   = isSingle ? [{wch:5},{wch:28},{wch:14},{wch:24},{wch:24},{wch:22}] : [{wch:5},{wch:28},{wch:14},{wch:14},{wch:24},{wch:24},{wch:22}];
            wsExam['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:examColCount-1} }];
            XLSX.utils.book_append_sheet(wb, wsExam, '6. Ket Qua Thi Dai');

            // ── Ghi file ──────────────────────────────────────────────────────
            const fileName = `BaoCao_${clubName.replace(/\s/g,'_')}_${pLabel.replace(/\s/g,'_')}_${year}.xlsx`;
            XLSX.writeFile(wb, fileName);

            // Ẩn toast loading
            const toastEl = document.getElementById('toastMessage');
            if (toastEl) toastEl.classList.remove('show');
            window.showToast(`✅ Đã xuất file: ${fileName}`);
            const expModal = document.getElementById('excelExportModal');
            if (expModal) expModal.style.display = 'none';

        } catch (err) {
            console.error('[finance.js] executeExcelExport lỗi:', err);
            const toastEl = document.getElementById('toastMessage');
            if (toastEl) toastEl.classList.remove('show');
            window.showToast('❌ Lỗi xuất Excel: ' + err.message);
        }
    };

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
        console.log('✅ window.openExcelExportModal   :', typeof window.openExcelExportModal);
        console.log('✅ window.updateExcelPeriodOptions:', typeof window.updateExcelPeriodOptions);
        console.log('✅ window.executeExcelExport     :', typeof window.executeExcelExport);
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
        import('../services/finance.service.js').then(({ FinanceService }) => {

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
            function _injectControls() {
                const from = pgState.currentPage > 0
                    ? (pgState.currentPage - 1) * PAGE_SIZE + 1
                    : 0;
                const to   = pgState.totalLoaded;
                const html = renderPaginationControls(pgState, 'transactions', from, to);

                const txList = document.getElementById('txList');
                if (!txList) return;

                const ctrlId = 'pgWrap_txList';
                let ctrlEl   = document.getElementById(ctrlId);
                if (!ctrlEl) {
                    ctrlEl      = document.createElement('div');
                    ctrlEl.id   = ctrlId;
                    txList.parentNode.insertBefore(ctrlEl, txList.nextSibling);
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

                    const items = processPage(snap, pgState);
                    pgState.enabled     = true;
                    pgState.searchQuery = search;

                    // Cập nhật store để render.js có thể dùng
                    store.pagination.transactions = pgState;

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
                } catch (err) {
                    console.error('[pagination/transactions] Lỗi load trang:', err);
                    pgState.isLoading = false;
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

