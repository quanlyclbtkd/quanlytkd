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

import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

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
        let raw = String(s || '').trim();
        if (!raw) return '';
        if (raw && typeof raw.toDate === 'function') {
            try {
                const d = raw.toDate();
                if (d && !Number.isNaN(d.getTime())) {
                    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                }
            } catch (_) {}
        }

        // Phase 4K-6V4B8: chuẩn hóa cả tháng tiếng Việt dạng chữ.
        // Ví dụ: "Tháng tư 2026", "Tháng Tư năm 2026", "thang muoi mot 2026".
        // Lỗi cũ: các chuỗi này parse rỗng → Báo nợ chỉ tính 1 tháng hoặc bị ẩn
        // khi bật bộ lọc nợ từ 2 tháng trở lên.
        function _foldMonthText(v) {
            return String(v || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
        }
        function _monthWordToNumber(phrase) {
            let key = _foldMonthText(phrase)
                .replace(/\b(thang|month|t)\b/g, ' ')
                .replace(/\b(nam|year)\b\s*$/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!key) return 0;
            const numeric = key.match(/\b(1[0-2]|0?[1-9])\b/);
            if (numeric) return Number(numeric[1]);
            const map = {
                'mot': 1, 'm ot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'tu': 4,
                'nam': 5, 'lam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9,
                'muoi': 10, 'muoi mot': 11, 'muoi lam': 15, 'muoi hai': 12,
                'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
                'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
                'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
                'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
            };
            if (map[key] >= 1 && map[key] <= 12) return map[key];
            if (key.includes('muoi hai')) return 12;
            if (key.includes('muoi mot')) return 11;
            if (key.includes('muoi')) return 10;
            return 0;
        }

        const foldedRaw = _foldMonthText(raw);
        const yearMatch = foldedRaw.match(/\b(20\d{2})\b/);
        if (yearMatch) {
            const year = yearMatch[1];
            const beforeYear = foldedRaw.slice(0, yearMatch.index).trim();
            const afterYear = foldedRaw.slice(yearMatch.index + year.length).trim();
            let wordMonth = _monthWordToNumber(beforeYear) || _monthWordToNumber(afterYear);
            if (wordMonth >= 1 && wordMonth <= 12) return year + '-' + String(wordMonth).padStart(2, '0');
        }

        raw = raw
            .replace(/tháng/gi, '')
            .replace(/thang/gi, '')
            .replace(/^t\s*/i, '')
            .replace(/\s+/g, '')
            .replace(/[.]/g, '-')
            .trim();
        let m = raw.match(/^(20\d{2})[-\/](\d{1,2})(?:[-\/]\d{1,2})?$/);
        if (m) {
            const mo = Number(m[2]);
            if (mo >= 1 && mo <= 12) return m[1] + '-' + String(mo).padStart(2, '0');
        }
        m = raw.match(/^(\d{1,2})[-\/](20\d{2})$/);
        if (m) {
            const mo = Number(m[1]);
            if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
        }
        m = raw.match(/^(?:T)?(\d{1,2})[-\/]?(20\d{2})$/i);
        if (m) {
            const mo = Number(m[1]);
            if (mo >= 1 && mo <= 12) return m[2] + '-' + String(mo).padStart(2, '0');
        }
        return '';
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
 * Đăng ký canonical owner cho pure helper window.formatMonthCompact.
 * Classic fallback is preserved for file:// and module-load rollback.
 */
export function registerFormatGlobals() {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
    const result = GlobalOwnershipRegistry.register('formatMonthCompact', formatMonthCompact, {
        owner: 'js/utils/format.js',
        risk: 'pure-helper',
        policy: 'module-primary',
    });
    if (!result.ok) {
        console.warn('[4K-6S] formatMonthCompact ownership registration failed:', result);
    }
    return result;
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
