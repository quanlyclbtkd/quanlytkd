/**
 * utils/format.js
 * ────────────────────────────────────────────────────────────────
 * Hàm định dạng thuần (pure functions) — không phụ thuộc Firebase,
 * không phụ thuộc DOM, không phụ thuộc shared state.
 * An toàn để import ở bất kỳ module nào.
 *
 * /// NEW ARCHITECTURE — trích từ app.js dòng 175–199 + formatMonthCompact + getBeltBadge
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Trả về ngày hôm nay dạng YYYY-MM-DD theo múi giờ địa phương.
 * QUAN TRỌNG: KHÔNG dùng new Date().toISOString() vì trả về UTC
 * → lệch ngày ở Việt Nam (UTC+7) vào ban đêm.
 */
export function getLocalToday() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

/**
 * Chuyển YYYY-MM-DD → DD/MM/YYYY (hiển thị UI).
 * Nếu đã có dấu '/' thì trả về nguyên bản.
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    return dateStr.split('-').reverse().join('/');
}

/**
 * Chuyển YYYY-MM → MM/YYYY (hiển thị UI).
 */
export function formatMonth(monthStr) {
    return monthStr ? monthStr.split('-').reverse().join('/') : '';
}

/**
 * Cộng / trừ số tháng vào chuỗi YYYY-MM.
 * Xử lý đúng overflow 12 tháng và underflow về tháng 1.
 * @param {string} yymm  — ví dụ '2025-03'
 * @param {number} count — số tháng cần cộng (âm = trừ)
 * @returns {string}     — ví dụ '2025-05'
 */
export function addMonthsToYYYYMM(yymm, count) {
    if (!yymm) return getLocalToday().substring(0, 7);
    let [y, m] = yymm.split('-').map(Number);
    m += count;
    while (m > 12) { m -= 12; y++; }
    while (m < 1)  { m += 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Chuẩn hóa tháng về YYYY-MM có zero-pad.
 * Phòng trường hợp Firestore trả về '2025-1' thay vì '2025-01'
 * → so sánh string YYYY-MM luôn chính xác 100%.
 * @param {string} s
 * @returns {string}
 */
export function normalizeYYYYMM(s) {
    if (!s) return '';
    const parts = s.split('-');
    if (parts.length !== 2) return s;
    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
}

/**
 * Rút gọn danh sách tháng thành chuỗi hiển thị.
 * Ví dụ: '2025-01,2025-02,2025-03' → 'T1, T2, T3/2025'
 * @param {string} monthsStr — chuỗi các tháng cách nhau bằng dấu phẩy
 * @returns {string}
 */
export function formatMonthCompact(monthsStr) {
    if (!monthsStr || !monthsStr.includes(',')) return formatMonth(monthsStr);
    const months = monthsStr.split(',').map(s => s.trim());
    const byYear = {};
    months.forEach(m => {
        const [y, mo] = m.split('-');
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(parseInt(mo));
    });
    return Object.keys(byYear).sort().map(y =>
        byYear[y].sort((a, b) => a - b).map(mo => `T${mo}`).join(', ') + `/${y}`
    ).join('; ');
}

/**
 * Tạo badge HTML hiển thị màu đai võ sinh.
 * @param {string} belt — tên đai (VD: 'Đai vàng - Cấp 8')
 * @returns {string} HTML string
 */
export function getBeltBadge(belt) {
    if (!belt) belt = 'Đai trắng - Cấp 10';
    let bg = '#fff', col = '#334155', border = '1px solid #cbd5e1', extra = '';
    if      (belt.includes('trắng'))                              { bg = '#fff'; col = '#334155'; }
    else if (belt.includes('vàng'))                               { bg = 'var(--belt-yellow)'; border = 'none'; }
    else if (belt.includes('xanh lá'))                            { bg = 'var(--belt-green)'; col = '#fff'; border = 'none'; }
    else if (belt.includes('xanh dương'))                         { bg = 'var(--belt-blue)'; col = '#fff'; border = 'none'; }
    else if (belt.includes('Đen - Đỏ') || belt.includes('Đỏ - Đen')) {
        bg = 'linear-gradient(to bottom, #1e293b 50%, #C8102E 50%)';
        col = '#fff'; border = 'none'; extra = 'text-shadow:0 1px 3px rgba(0,0,0,0.6);';
    }
    else if (belt.includes('đỏ'))                                 { bg = 'var(--belt-red)'; col = '#fff'; border = 'none'; }
    else if (belt.includes('Đen'))                                 { bg = 'var(--belt-black)'; col = '#fff'; border = 'none'; }
    return `<span class="badge shadow-sm" style="background:${bg};color:${col};border:${border};font-weight:800;${extra}">${belt}</span>`;
}
