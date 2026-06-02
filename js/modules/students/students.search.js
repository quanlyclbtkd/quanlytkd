/**
 * modules/students/students.search.js — Phase 4J-9B
 * ────────────────────────────────────────────────────────────────────
 * Bridge module cho search controller võ sinh.
 *
 * KHÔNG phải Stub nữa. Controller chính được mount bởi students.js
 * (hàm _bindSearchReset trong initStudentPagination).
 *
 * FILE NÀY:
 *   1. Export helpers chuẩn cho các module khác sử dụng.
 *   2. Quản lý guard window.__studentSearchControllerMounted.
 *   3. normalizeSearchInput: mirror normalizeSearchText trong app.js.
 *
 * PHÂN CẤP CONTROLLER:
 *   PRIMARY:  students.js _bindSearchReset (350ms debounce + server-side search)
 *   FALLBACK: students.events.js initStudentsEvents (chỉ chạy nếu PRIMARY chưa mount)
 *   LEGACY:   app.js oninput (chỉ chạy nếu PRIMARY chưa mount)
 *
 * /// Phase 4J-9B — Search Binding Consolidation
 * ────────────────────────────────────────────────────────────────────
 */

/**
 * normalizeSearchInput(str) — Chuẩn hoá chuỗi tìm kiếm.
 * Mirror normalizeSearchText trong app.js (no import to avoid circular dep).
 * Bỏ dấu tiếng Việt, lowercase, trim, collapse whitespace.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeSearchInput(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * isStudentSearchControllerMounted() — Kiểm tra PRIMARY controller đã active chưa.
 * PRIMARY controller set window.__studentSearchControllerMounted = true khi bind xong.
 *
 * @returns {boolean}
 */
export function isStudentSearchControllerMounted() {
    return !!window.__studentSearchControllerMounted;
}

/**
 * initStudentSearchController() — Hook kiểm tra trạng thái controller.
 * PRIMARY controller được mount trong students.js (_bindSearchReset).
 * Hàm này KHÔNG tự mount; chỉ kiểm tra và log trạng thái.
 *
 * Gọi từ module khác để verify xem search đã setup chưa.
 */
export function initStudentSearchController() {
    if (window.__studentSearchControllerMounted) {
        console.info('[students.search.js] ✅ PRIMARY search controller đã mount (students.js).');
        return;
    }
    console.warn('[students.search.js] ⚠️ PRIMARY controller chưa mount. Gọi initStudentPagination() trước.');
}

/**
 * disposeStudentSearchController() — Cleanup khi logout hoặc tab đóng.
 * Reset guard để cho phép re-mount sau khi login lại.
 */
export function disposeStudentSearchController() {
    window.__studentSearchControllerMounted = false;
    const el = document.getElementById('searchInput');
    if (el) {
        el.__pgStudentsbound = false;
        delete el.dataset.evtBound;
    }
    console.info('[students.search.js] disposeStudentSearchController — guard reset.');
}
