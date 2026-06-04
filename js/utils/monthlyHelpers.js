/**
 * js/utils/monthlyHelpers.js — Phase 4K-4G
 * ─────────────────────────────────────────────────────────────────
 * Helper tháng dùng chung: tính lịch sử doanh thu 6 tháng,
 * phân bổ học phí gói nhiều tháng, load transactions inclusive,
 * sort võ sinh mới lên trên, debug helpers.
 *
 * Expose toàn bộ lên window.* để app.js legacy và module runtime cùng dùng.
 * ─────────────────────────────────────────────────────────────────
 */

// ── 1. getRecentMonths ───────────────────────────────────────────────────────

/**
 * Lấy danh sách N tháng liên tiếp kết thúc tại endMonth.
 * @param {string} endMonth - Tháng cuối dạng YYYY-MM (mặc định tháng hiện tại)
 * @param {number} count    - Số tháng cần lấy (mặc định 6)
 * @returns {string[]}      - Mảng YYYY-MM từ cũ đến mới
 */
export function getRecentMonths(endMonth, count = 6) {
    const raw = String(endMonth || '').trim();
    const base = /^\d{4}-\d{2}$/.test(raw)
        ? raw
        : (
            (typeof document !== 'undefined' && document.getElementById('filterMonth')?.value) ||
            new Date().toISOString().slice(0, 7)
        );

    let [y, m] = base.split('-').map(Number);
    const months = [];

    for (let i = count - 1; i >= 0; i--) {
        let mm = m - i;
        let yy = y;
        while (mm <= 0) { mm += 12; yy -= 1; }
        months.push(`${yy}-${String(mm).padStart(2, '0')}`);
    }

    return months;
}

// ── 2. formatMonthLabel ──────────────────────────────────────────────────────

/**
 * Format 'YYYY-MM' → 'MM/YYYY' (ví dụ '2026-05' → '05/2026').
 * @param {string} month
 * @returns {string}
 */
export function formatMonthLabel(month) {
    const parts = String(month || '').split('-');
    if (parts.length < 2 || !parts[0] || !parts[1]) return month || '';
    return `${parts[1]}/${parts[0]}`;
}

// ── 3. getTxAllocatedAmountForMonth ─────────────────────────────────────────

/**
 * Tính số tiền phân bổ của transaction cho tháng month.
 * - Học phí gói nhiều tháng (packageMonths) → chia đều
 * - Các loại khác → dùng txMatchesSelectedMonth hoặc fallback so sánh txMonth/date
 * @param {Object} tx    - Transaction object
 * @param {string} month - Tháng cần kiểm tra dạng YYYY-MM
 * @returns {number}     - Số tiền phân bổ (>= 0)
 */
export function getTxAllocatedAmountForMonth(tx, month) {
    const amount = Number(tx && tx.amount || 0);
    const m = String(month || '').trim();

    if (!tx || !m || amount <= 0) return 0;

    const type = String(tx.type || '').trim();

    // Học phí gói nhiều tháng: phân bổ đều theo packageMonths
    if (
        type === 'Học phí' &&
        Array.isArray(tx.packageMonths) &&
        tx.packageMonths.length > 0
    ) {
        if (!tx.packageMonths.includes(m)) return 0;
        return amount / tx.packageMonths.length;
    }

    // Dùng shared helper nếu có (Phase 4K-4F)
    if (typeof window !== 'undefined' && typeof window.txMatchesSelectedMonth === 'function') {
        return window.txMatchesSelectedMonth(tx, m) ? amount : 0;
    }

    // Fallback đơn giản: kiểm tra txMonth, paymentMonth, date
    if (tx.txMonth === m || tx.paymentMonth === m) return amount;
    if (tx.date && String(tx.date).startsWith(m)) return amount;

    return 0;
}

// ── 4. loadTransactionsForMonthsInclusive ───────────────────────────────────

/**
 * Load transactions cho nhiều tháng với 3 query: txMonth, date range, packageMonths.
 * Merge bằng id để không duplicate.
 * @param {string[]} months - Mảng YYYY-MM
 * @param {string}   reason - Lý do để log
 * @returns {Promise<Object[]>}
 */
export async function loadTransactionsForMonthsInclusive(months, reason = 'monthly-history') {
    const st      = (typeof window !== 'undefined' && window.__store) || {};
    const db      = st.db || (typeof window !== 'undefined' && window.db);
    const clubId  = st.clubId || st.currentClubId || (typeof window !== 'undefined' && window.currentClubId);

    if (!db || !clubId || !Array.isArray(months) || !months.length) {
        console.warn(`[${reason}] missing db/clubId/months`);
        return [];
    }

    const sdk = (typeof window !== 'undefined' && window._fb_init) || {};
    const { collection, query, where, getDocs, limit } = sdk;

    if (!collection || !query || !where || !getDocs) {
        console.warn(`[${reason}] Firebase query helpers missing`);
        return [];
    }

    const colRef = collection(db, 'clubs', clubId, 'transactions');
    const map    = new Map();

    for (const month of months) {
        const start = month + '-01';
        const end   = month + '-31';

        const queries = [
            query(colRef, where('txMonth', '==', month),                              limit(2000)),
            query(colRef, where('date', '>=', start), where('date', '<=', end),       limit(2000)),
            query(colRef, where('packageMonths', 'array-contains', month),             limit(2000)),
        ];

        const snaps = await Promise.allSettled(queries.map(q => getDocs(q)));

        snaps.forEach(res => {
            if (res.status !== 'fulfilled') {
                console.warn(`[${reason}] query failed for`, month, res.reason);
                return;
            }
            res.value.forEach(d => {
                map.set(d.id, { id: d.id, ...d.data() });
            });
        });
    }

    return Array.from(map.values());
}

// ── 5. computeMonthlyFinanceHistory ─────────────────────────────────────────

/**
 * Tính income/expense/profit theo từng tháng từ danh sách transactions.
 * Phân bổ gói học phí nhiều tháng đúng vào từng tháng.
 * @param {Object[]} transactions - Danh sách transactions
 * @param {string[]} months       - Danh sách tháng YYYY-MM cần tính
 * @returns {Object}              - { [month]: { income, expense, profit, tuition, ... } }
 */
export function computeMonthlyFinanceHistory(transactions, months) {
    const result = {};

    months.forEach(m => {
        result[m] = {
            month: m,
            income: 0, expense: 0, profit: 0,
            tuition: 0, exam: 0,
            inventoryIncome: 0, inventoryExpense: 0,
            otherIncome: 0, otherExpense: 0,
            txCount: 0,
        };
    });

    (transactions || []).forEach(tx => {
        months.forEach(month => {
            // Dùng window version nếu có (để tương thích txMatchesSelectedMonth)
            const allocated = typeof window !== 'undefined' && typeof window.getTxAllocatedAmountForMonth === 'function'
                ? window.getTxAllocatedAmountForMonth(tx, month)
                : getTxAllocatedAmountForMonth(tx, month);

            if (!allocated || allocated <= 0) return;

            const type = String(tx.type || '').trim();
            const row  = result[month];
            row.txCount++;

            const invClass = typeof window !== 'undefined' && typeof window.classifyInventoryFinanceTx === 'function'
                ? window.classifyInventoryFinanceTx(tx)
                : { isInventory: false };

            if (type === 'Học phí') {
                row.tuition += allocated;
                row.income  += allocated;
            } else if (type === 'Lệ phí thi' || type === 'Học phí + Lệ phí thi') {
                row.exam   += allocated;
                row.income += allocated;
            } else if (invClass.isInventory && invClass.direction === 'income') {
                row.inventoryIncome += allocated;
                row.income          += allocated;
            } else if (invClass.isInventory && invClass.direction === 'expense') {
                row.inventoryExpense += allocated;
                row.expense          += allocated;
            } else if (type === 'Chi phí' || type === 'Chi phí kỳ thi' || type.startsWith('Chi')) {
                row.otherExpense += allocated;
                row.expense      += allocated;
            } else {
                row.otherIncome += allocated;
                row.income      += allocated;
            }
        });
    });

    Object.values(result).forEach(row => {
        row.profit = row.income - row.expense;
    });

    return result;
}

// ── 6. getStudentJoinTimestamp ───────────────────────────────────────────────

/**
 * Lấy timestamp gia nhập của võ sinh — thử nhiều field để tương thích dữ liệu cũ.
 * @param {string} name    - Tên võ sinh (key trong profiles)
 * @param {Object} profile - Profile data object
 * @returns {number}       - Timestamp ms hoặc 0 nếu không tìm thấy
 */
export function getStudentJoinTimestamp(name, profile) {
    const p = profile || {};
    const candidates = [
        p.createdAt,
        p.joinedAt,
        p.joinDate,
        p.dateJoin,
        p.enrollDate,
        p.admissionDate,
        p.createdTime,
        p.timestamp,
    ];

    for (const v of candidates) {
        if (!v) continue;

        if (typeof v === 'number') return v;

        // Firestore Timestamp object
        if (typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();

        const s = String(v);

        // Date string (ISO or any format parseable by Date.parse)
        const d = Date.parse(s);
        if (!Number.isNaN(d)) return d;

        // YYYY-MM-DD fallback
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s);
    }

    return 0;
}

// ── 7. isNewStudent ──────────────────────────────────────────────────────────

/**
 * Kiểm tra võ sinh có phải mới nhập (trong N ngày gần đây) hay không.
 * @param {string} name    - Tên võ sinh
 * @param {Object} profile - Profile data
 * @param {number} days    - Số ngày coi là "mới" (mặc định 30)
 * @returns {boolean}
 */
export function isNewStudent(name, profile, days = 30) {
    const ts = getStudentJoinTimestamp(name, profile);
    if (!ts) return false;
    return Date.now() - ts <= days * 24 * 60 * 60 * 1000;
}

// ── 8. debugMonthlyRevenueAllocation ────────────────────────────────────────

/**
 * Debug: kiểm tra phân bổ doanh thu 6 tháng.
 * Dùng từ Console: await debugMonthlyRevenueAllocation()
 */
export async function debugMonthlyRevenueAllocation(endMonth) {
    const selectedMonth =
        (typeof endMonth === 'string' && endMonth) ||
        (typeof document !== 'undefined' && document.getElementById('filterMonth')?.value) ||
        (typeof window !== 'undefined' && (window.__store || {}).selectedMonth) ||
        new Date().toISOString().slice(0, 7);

    const months = typeof window !== 'undefined' && typeof window.getRecentMonths === 'function'
        ? window.getRecentMonths(selectedMonth, 6)
        : getRecentMonths(selectedMonth, 6);

    const txs = typeof window !== 'undefined' && typeof window.loadTransactionsForMonthsInclusive === 'function'
        ? await window.loadTransactionsForMonthsInclusive(months, 'debug-monthly-allocation')
        : ((typeof window !== 'undefined' && (window.__store || {}).transactions) || []);

    const history = typeof window !== 'undefined' && typeof window.computeMonthlyFinanceHistory === 'function'
        ? window.computeMonthlyFinanceHistory(txs, months)
        : computeMonthlyFinanceHistory(txs, months);

    const result = {
        selectedMonth,
        months,
        txCount: txs.length,
        history,
        chartLabels: months.map(m => typeof window !== 'undefined' && typeof window.formatMonthLabel === 'function'
            ? window.formatMonthLabel(m)
            : formatMonthLabel(m)),
        reportRows: typeof document !== 'undefined'
            ? document.querySelectorAll('#reportList tr').length
            : 0,
        hasAllocationHelper:  typeof window !== 'undefined' && typeof window.getTxAllocatedAmountForMonth       === 'function',
        hasInclusiveLoader:   typeof window !== 'undefined' && typeof window.loadTransactionsForMonthsInclusive === 'function',
        hasHistoryComputer:   typeof window !== 'undefined' && typeof window.computeMonthlyFinanceHistory        === 'function',
    };

    console.table(months.map(m => ({
        month:   m,
        income:  history[m]?.income  || 0,
        expense: history[m]?.expense || 0,
        profit:  history[m]?.profit  || 0,
        tuition: history[m]?.tuition || 0,
        txCount: history[m]?.txCount || 0,
    })));

    return result;
}

// ── 9. debugActiveStudentSort ────────────────────────────────────────────────

/**
 * Debug: xem thứ tự sort võ sinh ĐANG TẬP (newest-first).
 * Dùng từ Console: debugActiveStudentSort()
 */
export function debugActiveStudentSort(limit = 20) {
    const profiles = (typeof window !== 'undefined' && (window.__store || {}).profiles) || {};
    const _getTs = typeof window !== 'undefined' && typeof window.getStudentJoinTimestamp === 'function'
        ? window.getStudentJoinTimestamp
        : getStudentJoinTimestamp;

    const rows = Object.entries(profiles)
        .map(([name, p]) => ({
            name,
            joinTs:   _getTs(name, p),
            joinDate: (p && (p.joinDate || p.joinedAt || p.createdAt || p.timestamp)) || '',
        }))
        .sort((a, b) => {
            if (b.joinTs !== a.joinTs) return b.joinTs - a.joinTs;
            return a.name.localeCompare(b.name, 'vi');
        })
        .slice(0, limit);

    console.table(rows);
    return rows;
}

// ── Init: Đăng ký tất cả helpers lên window ─────────────────────────────────

/**
 * Đăng ký tất cả helpers lên window.*.
 * Gọi từ main.js trong quá trình bootstrap.
 */
export function initMonthlyHelpers() {
    if (typeof window === 'undefined') return;

    window.getRecentMonths                    = getRecentMonths;
    window.formatMonthLabel                   = formatMonthLabel;
    window.getTxAllocatedAmountForMonth       = getTxAllocatedAmountForMonth;
    window.loadTransactionsForMonthsInclusive = loadTransactionsForMonthsInclusive;
    window.computeMonthlyFinanceHistory       = computeMonthlyFinanceHistory;
    window.getStudentJoinTimestamp            = getStudentJoinTimestamp;
    window.isNewStudent                       = isNewStudent;
    window.debugMonthlyRevenueAllocation      = debugMonthlyRevenueAllocation;
    window.debugActiveStudentSort             = debugActiveStudentSort;

    console.info('[monthlyHelpers] ✅ Phase 4K-4G monthly helpers registered');
}
