/**
 * functions/src/helpers.js — Shared Utilities cho Cloud Functions
 * ─────────────────────────────────────────────────────────────────────
 * Các hàm tiện ích dùng chung giữa debtCalculation.js và statsAggregation.js
 *
 * KHÔNG import firebase-admin ở đây — mỗi module tự quản lý instance của mình.
 * ─────────────────────────────────────────────────────────────────────
 */

// ════════════════════════════════════════════════════════════════
// DATE UTILITIES
// ════════════════════════════════════════════════════════════════

/**
 * Cộng thêm N tháng vào chuỗi YYYY-MM.
 * @param {string} yyyymm - Tháng gốc, ví dụ: '2026-05'
 * @param {number} n      - Số tháng cần cộng (có thể âm)
 * @returns {string} Tháng mới dạng YYYY-MM
 */
function addMonth(yyyymm, n) {
    if (!yyyymm) return yyyymm;
    const [y, m] = yyyymm.split('-').map(Number);
    let ny = y;
    let nm = m + n;
    while (nm > 12) { nm -= 12; ny += 1; }
    while (nm < 1)  { nm += 12; ny -= 1; }
    return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Chuẩn hóa trường paidUntil về định dạng YYYY-MM.
 * Xử lý cả hai dạng: YYYY-MM-DD và YYYY-MM.
 * @param {string} val - Giá trị cần chuẩn hóa
 * @returns {string} Chuỗi YYYY-MM hoặc '' nếu không hợp lệ
 */
function normalizeYYYYMM(val) {
    if (!val) return '';
    const s = String(val).trim();
    // YYYY-MM-DD → YYYY-MM (lấy 7 ký tự đầu)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.substring(0, 7);
    // YYYY-MM → giữ nguyên
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    return '';
}

/**
 * Lấy tháng hiện tại theo giờ Việt Nam (UTC+7).
 * Cloud Functions chạy ở múi giờ UTC, cần điều chỉnh thủ công.
 * @returns {string} Tháng dạng YYYY-MM, ví dụ: '2026-05'
 */
function getCurrentMonthVN() {
    // Cộng thêm 7 tiếng (7 * 3600 * 1000 ms) để ra giờ Việt Nam
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    return now.toISOString().substring(0, 7);
}

/**
 * Lấy txMonth từ một transaction object.
 * Fallback về 7 ký tự đầu của date nếu txMonth không có.
 * @param {Object} tx - Transaction Firestore data
 * @returns {string|null} YYYY-MM hoặc null nếu không xác định được
 */
function getTxMonth(tx) {
    if (!tx) return null;
    if (tx.txMonth && /^\d{4}-\d{2}$/.test(tx.txMonth)) return tx.txMonth;
    if (tx.date && tx.date.length >= 7) return tx.date.substring(0, 7);
    return null;
}

// ════════════════════════════════════════════════════════════════
// DEBT CALCULATION
// ════════════════════════════════════════════════════════════════

/**
 * Tính trạng thái nợ học phí cho một võ sinh.
 *
 * Logic:
 *   - Nếu status !== 'active' hoặc feeExempt = true → không nợ
 *   - Nếu paidUntil >= currentMonth → không nợ
 *   - Nếu paidUntil < currentMonth → tính danh sách tháng nợ
 *   - Loại bỏ các tháng có trong skippedMonths (báo nghỉ tháng)
 *   - Tối đa 24 tháng để tránh vòng lặp vô hạn
 *
 * @param {Object} profile      - Profile data từ Firestore
 * @param {string} currentMonth - Tháng hiện tại dạng YYYY-MM
 * @returns {{ isOwed: boolean, owedMonths: string[], owedCount: number }}
 */
function calcDebt(profile, currentMonth) {
    // Không active hoặc được miễn → không nợ
    if (!profile) return { isOwed: false, owedMonths: [], owedCount: 0 };
    if (profile.status !== 'active') return { isOwed: false, owedMonths: [], owedCount: 0 };
    if (profile.feeExempt) return { isOwed: false, owedMonths: [], owedCount: 0 };

    const paidUntil     = normalizeYYYYMM(profile.paidUntil);
    const skippedMonths = profile.skippedMonths || [];

    // Đã đóng tới tháng hiện tại hoặc hơn → không nợ
    if (paidUntil && paidUntil >= currentMonth) {
        return { isOwed: false, owedMonths: [], owedCount: 0 };
    }

    // Tháng đầu tiên chưa đóng
    let firstUnpaid;
    if (paidUntil) {
        // Đã đóng một phần → tháng tiếp theo của paidUntil
        firstUnpaid = addMonth(paidUntil, 1);
    } else {
        // Chưa đóng bao giờ → tính từ tháng gia nhập
        const joinMonth = profile.createdAt
            ? String(profile.createdAt).substring(0, 7)
            : currentMonth;
        firstUnpaid = normalizeYYYYMM(joinMonth) || joinMonth.substring(0, 7);
    }

    // Liệt kê tất cả tháng nợ, loại bỏ tháng đã báo nghỉ
    const owedMonths = [];
    let cur = firstUnpaid;
    let safety = 0;

    while (cur <= currentMonth && safety++ < 24) {
        if (!skippedMonths.includes(cur)) {
            owedMonths.push(cur);
        }
        cur = addMonth(cur, 1);
    }

    return {
        isOwed:    owedMonths.length > 0,
        owedMonths,
        owedCount: owedMonths.length,
    };
}

// ════════════════════════════════════════════════════════════════
// TRANSACTION CLASSIFICATION
// ════════════════════════════════════════════════════════════════

/**
 * Phân loại một transaction vào đúng field của stats doc.
 *
 * Trả về:
 *   - null nếu transaction không ảnh hưởng stats (ví dụ: Tặng Võ phục)
 *   - { field, value } hoặc [{ field, value }, ...] cho các loại phức tạp
 *
 * @param {Object} tx - Transaction Firestore data
 * @returns {null | { field: string, value: number } | Array<{ field: string, value: number }>}
 */
function classifyTx(tx) {
    const type   = (tx.type || '').trim();
    const amount = Number(tx.amount) || 0;

    switch (type) {
        case 'Học phí':
            return { field: 'income.tuition', value: amount };

        case 'Học phí + Lệ phí thi':
            // Tách thành 2 phần riêng: học phí và lệ phí thi
            return [
                { field: 'income.tuition', value: Number(tx.tuitionAmount) || 0 },
                { field: 'income.exam',    value: Number(tx.examAmount)    || 0 },
            ];

        case 'Lệ phí thi':
            return { field: 'income.exam', value: amount };

        case 'Thu Võ phục':
        case 'Võ phục':
            return { field: 'income.uniform', value: amount };

        case 'Thu khác':
            return { field: 'income.other', value: amount };

        case 'Chi phí':
            return { field: 'expense.operations', value: amount };

        case 'Chi phí kỳ thi':
            return { field: 'expense.exam', value: amount };

        case 'Chi Võ phục':
            return { field: 'expense.uniform', value: amount };

        default:
            // Tặng Võ phục, các loại không tính vào stats → bỏ qua
            return null;
    }
}

module.exports = {
    addMonth,
    normalizeYYYYMM,
    getCurrentMonthVN,
    getTxMonth,
    calcDebt,
    classifyTx,
};
