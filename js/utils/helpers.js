/**
 * utils/helpers.js
 * ────────────────────────────────────────────────────────────────
 * Hàm tiện ích DOM và logic thuần — không phụ thuộc Firebase,
 * không phụ thuộc shared state (store).
 *
 * /// NEW ARCHITECTURE — trích và bổ sung mới từ pattern trong app.js
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Escape ký tự đặc biệt để dùng an toàn trong HTML attribute onclick="...".
 * Quan trọng với tên võ sinh có dấu nháy đơn (Ví dụ: Nguyễn O'Brien).
 * @param {string} str
 * @returns {string}
 */
export function escapeForAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/**
 * Thoát HTML để hiển thị an toàn — ngăn XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Lấy giá trị an toàn của input theo ID.
 * @param {string} id — DOM element ID
 * @returns {string}
 */
export function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

/**
 * Set giá trị input theo ID (no-op nếu element không tồn tại).
 * @param {string} id
 * @param {string|number} val
 */
export function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

/**
 * Format số tiền VND — ví dụ 350000 → '350.000 ₫'
 * @param {number} amount
 * @returns {string}
 */
export function formatVND(amount) {
    if (!amount && amount !== 0) return '';
    return Number(amount).toLocaleString('vi-VN') + ' ₫';
}

/**
 * Parse chuỗi tiền VND về số nguyên — bỏ tất cả ký tự không phải số.
 * Ví dụ: '350.000 ₫' → 350000
 * @param {string} str
 * @returns {number}
 */
export function parseVND(str) {
    if (!str) return 0;
    return Number(String(str).replace(/\D/g, '')) || 0;
}

/**
 * Debounce — trì hoãn thực thi hàm fn sau delay ms.
 * Mỗi lần gọi lại reset bộ đếm.
 * @param {Function} fn
 * @param {number} delay — ms
 * @returns {Function}
 */
export function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Tính tuổi từ chuỗi ngày sinh YYYY-MM-DD.
 * @param {string} dob
 * @returns {number|null}
 */
export function calcAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    const now   = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
}

/**
 * So sánh hai chuỗi YYYY-MM — an toàn hơn so sánh string thuần.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareYYYYMM(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

// ════════════════════════════════════════════════════════════════
// PHASE 4.0B-4J-8A — Search Index Helpers
// ════════════════════════════════════════════════════════════════

/**
 * Bỏ dấu tiếng Việt — dùng cho search index.
 * Giống removeVietnameseTonesForQR trong app.js nhưng export ra module.
 * @param {string} str
 * @returns {string}
 */
export function removeVietnameseTones(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

/**
 * Chuẩn hoá text để lưu vào search index.
 * Bỏ dấu tiếng Việt + lowercase + chuẩn hoá khoảng trắng.
 * @param {string} value
 * @returns {string}
 */
export function normalizeSearchText(value) {
    return removeVietnameseTones(String(value || ''))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Chuẩn hoá số điện thoại — chỉ giữ chữ số.
 * @param {string} value
 * @returns {string}
 */
export function normalizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
}

/**
 * Kiểm tra keyword có dạng số điện thoại không (≥6 chữ số).
 * @param {string} keyword
 * @returns {boolean}
 */
export function looksLikePhone(keyword) {
    return /^\d{6,}$/.test(String(keyword || '').replace(/[^\d]/g, ''));
}

/**
 * Xây dựng search index object cho profile võ sinh.
 * Gắn vào profile khi add/edit để hỗ trợ server-side search.
 *
 * @param {Object} profile   — profile data (chưa có id)
 * @param {string} docId     — Firestore document ID (tên võ sinh)
 * @returns {{ searchName: string, searchPhone: string, searchCode: string, searchKeywords: string[] }}
 */
export function buildStudentSearchIndex(profile, docId) {
    const name  = profile?.name || docId || '';
    const phone = profile?.phone || profile?.parentPhone || profile?.phoneNumber || '';
    const code  = profile?.studentCode || profile?.memberId || profile?.code || profile?.memberId || '';

    const sName  = normalizeSearchText(name);
    const sPhone = normalizePhone(phone);
    const sCode  = normalizeSearchText(code);

    return {
        searchName:     sName,
        searchPhone:    sPhone,
        searchCode:     sCode,
        searchKeywords: [sName, sPhone, sCode].filter(Boolean),
    };
}
