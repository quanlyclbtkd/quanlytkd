/**
 * modules/exam.js — Phase 2g (Stub ổn định)
 * ────────────────────────────────────────────────────────────────
 * Quản lý kỳ thi đai: đăng ký, kết quả, chi phí thi.
 *
 * TRẠNG THÁI: STUB — app.js đang xử lý toàn bộ logic.
 *
 * Phase 2g UPGRADE:
 *   - Bỏ import store (không dùng trong stub)
 *   - console.info thay vì console.warn (không gây alarm ở dev)
 *   - Bridge helpers sẵn sàng để extract
 *   - DISABLED trong main.js — app.js không bị xung đột
 *
 * MIGRATION MAP (app.js → module này — Phase 3):
 * ┌─────────────────────────────────────┬────────────┐
 * │ Hàm / block                         │ Dòng app.js│
 * ├─────────────────────────────────────┼────────────┤
 * │ window.renderExamList               │ ~6038      │
 * │ window.openExamModal                │ ~4600      │
 * │ window.saveExamResult               │ ~4650      │
 * │ window.deleteExamEntry              │ ~4700      │
 * │ examExpenseForm.onsubmit            │ ~3875      │
 * │ window.quickCollectExam             │ ~4074      │
 * │ window.updateNextBeltPreview        │ ~6108      │
 * └─────────────────────────────────────┴────────────┘
 *
 * DEPENDENCY (khi extract): store.db, store.clubId, store.profiles,
 *             store.colRef (chi phí thi), listeners.js
 * ────────────────────────────────────────────────────────────────
 */

// Bridge helpers — bật khi extract
// function _db()       { return (window.__store || {}).db; }
// function _clubId()   { return (window.__store || {}).clubId; }
// function _profiles() { return (window.__store || {}).profiles || {}; }
// function _colRef()   { return (window.__store || {}).colRef; }
// function _sdk()      { return window._fb_init || {}; }

const _isDev = window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1';

/**
 * initExam() — Stub Phase 2g.
 * DISABLED trong main.js. app.js xử lý toàn bộ.
 */
export function initExam() {
    if (_isDev) {
        console.info('[exam.js] initExam() stub — app.js đang xử lý. Xem MIGRATION_NOTES.md §2g.');
    }
    // TODO Phase 3: Extract từ app.js theo migration map trên.
}
