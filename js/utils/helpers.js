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
