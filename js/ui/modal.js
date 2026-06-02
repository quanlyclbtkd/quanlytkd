/**
 * ui/modal.js
 * ────────────────────────────────────────────────────────────────
 * Helper mở / đóng modal — wrapper ngắn gọn thay vì gọi
 * document.getElementById('...').style.display trực tiếp.
 *
 * /// NEW ARCHITECTURE — utility thuần, không cần store
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Mở modal theo ID.
 * @param {string} modalId
 * @param {'flex'|'block'|'grid'} [display='flex']
 */
export function openModal(modalId, display = 'flex') {
    const el = document.getElementById(modalId);
    if (el) el.style.display = display;
}

/**
 * Đóng modal theo ID.
 * @param {string} modalId
 */
export function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

/**
 * Đóng modal khi click vào overlay (backdrop).
 * Dùng trong attribute: onclick="if(event.target===this) closeModalOnOverlay(event, 'myModal')"
 * @param {Event} event
 * @param {string} modalId
 */
export function closeModalOnOverlay(event, modalId) {
    if (event.target === event.currentTarget) closeModal(modalId);
}

/**
 * Đăng ký các helper lên window (cần cho onclick="" trong HTML).
 */
export function registerModalGlobals() {
    window.openModal  = openModal;
    window.closeModal = closeModal;
}
