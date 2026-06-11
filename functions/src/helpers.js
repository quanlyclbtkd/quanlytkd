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
 * Phase 4K-4D: Phân loại giao dịch kho động (custom categories + backward compat).
 * Dùng relatedInvId làm signal nhận diện giao dịch kho nếu type chưa chuẩn.
 *
 * @param {string} type   - tx.type
 * @param {Object} tx     - toàn bộ transaction object (để đọc relatedInvId)
 * @returns {{ field: string, value: number } | null}
 */
function classifyInventoryTxType(type, tx) {
    const amount = Number((tx && tx.amount) || 0);
    const raw    = String(type || '').trim();

    // Backward compat: type cũ dùng tên danh mục làm type
    if (raw === 'Võ phục' || raw === 'Thu Võ phục') {
        return { field: 'income.uniform', value: amount };
    }
    if (raw === 'Chi Võ phục') {
        return { field: 'expense.uniform', value: amount };
    }
    if (raw === 'Tặng Võ phục') {
        return null; // Tặng không tính vào stats
    }

    // Dynamic: Thu <Category> / Chi <Category> với relatedInvId
    if (raw.startsWith('Thu ') && tx && tx.relatedInvId) {
        return { field: 'income.uniform', value: amount };
    }
    if (raw.startsWith('Chi ') && tx && tx.relatedInvId) {
        return { field: 'expense.uniform', value: amount };
    }
    if (raw.startsWith('Tặng ') && tx && tx.relatedInvId) {
        return null; // Tặng không tính
    }

    return null; // Không phải giao dịch kho
}


/**
 * Phase 4K-6K-G: "Thu nhập học" là nhãn nghiệp vụ, thống kê phải xem như Học phí.
 */
function normalizeFinanceType(type) {
    const raw = String(type || '').trim();
    return raw === 'Thu nhập học' ? 'Học phí' : raw;
}

function classifyComponentForStats(component) {
    const c = component || {};
    const value = Number(c.amount || 0);
    if (value <= 0) return null;
    if (c.kind === 'tuition') return { field: 'income.tuition', value };
    if (c.kind === 'exam') return { field: 'income.exam', value };
    if (c.kind === 'inventory' || c.kind === 'inventoryDebt') return { field: 'income.uniform', value };
    if (c.kind === 'other') return { field: 'income.other', value };
    return null;
}

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
    const type   = normalizeFinanceType((tx && tx.type) || '');
    const amount = tx ? Number(tx.amount) || 0 : 0;

    // Phase 4K-6K-G: bundle/components là nguồn kế toán chính.
    if (tx && Array.isArray(tx.components) && tx.components.length > 0) {
        const entries = tx.components
            .map(classifyComponentForStats)
            .filter(Boolean);
        return entries.length ? entries : null;
    }

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

        case 'Thu khác':
            return { field: 'income.other', value: amount };

        case 'Chi phí':
            return { field: 'expense.operations', value: amount };

        case 'Chi phí kỳ thi':
            return { field: 'expense.exam', value: amount };

        default: {
            // Phase 4K-4D: inventory classification (custom categories + backward compat)
            const inv = classifyInventoryTxType(type, tx);
            if (inv !== null) return inv;
            // Tặng Võ phục, Tặng <Category>, unknown → bỏ qua
            return null;
        }
    }
}

/**
 * Phân bổ học phí gói nhiều tháng cho đúng tháng M.
 * Dùng khi cần tính toán doanh thu tháng M từ giao dịch có packageMonths.
 *
 * @param {Object} tx    - Transaction Firestore data
 * @param {string} month - Tháng cần phân bổ dạng YYYY-MM
 * @returns {number}     - Số tiền phân bổ cho tháng M (>= 0)
 */
function allocateTuitionAmountForMonth(tx, month) {
    const amount = Number(tx && tx.amount || 0);
    if (!amount || !tx || !month) return 0;

    const type = normalizeFinanceType((tx && tx.type) || '');

    // Học phí gói nhiều tháng: phân bổ đều
    if (type === 'Học phí' && Array.isArray(tx.packageMonths) && tx.packageMonths.length > 0) {
        return tx.packageMonths.includes(month)
            ? amount / tx.packageMonths.length
            : 0;
    }

    // Học phí thường hoặc các loại khác: kiểm tra txMonth
    const txMonth = tx.txMonth || (tx.date ? String(tx.date).slice(0, 7) : '');
    return txMonth === month ? amount : 0;
}

module.exports = {
    addMonth,
    normalizeYYYYMM,
    getCurrentMonthVN,
    getTxMonth,
    calcDebt,
    classifyTx,
    classifyInventoryTxType,
    normalizeFinanceType,
    allocateTuitionAmountForMonth,
};
