/**
 * ui/modal.js
 * ────────────────────────────────────────────────────────────────
 * Helper mở / đóng modal — wrapper ngắn gọn thay vì gọi
 * document.getElementById('...').style.display trực tiếp.
 *
 * /// NEW ARCHITECTURE — utility thuần, không cần store
 * // PHẦN 2 FIX: Legacy-compatible defaults để closeModal() không arg đóng profileModal
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Mở modal theo ID.
 * @param {string} [modalId='profileModal']
 * @param {'flex'|'block'|'grid'} [display='flex']
 */
export function openModal(modalId = 'profileModal', display = 'flex') {
    const id = modalId || 'profileModal';
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

/**
 * Đóng modal theo ID.
 * Default là 'profileModal' để tương thích với onclick="closeModal()" không có arg.
 * @param {string} [modalId='profileModal']
 */
export function closeModal(modalId = 'profileModal') {
    const id = modalId || 'profileModal';
    const el = document.getElementById(id);
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
 * PHẦN 2 FIX: Giữ compatibility với app.js legacy closeModal.
 */
export function registerModalGlobals() {
    const legacyClose = window.closeModal;

    window.openModal = openModal;
    window.closeModal = function(modalId) {
        if (modalId) return closeModal(modalId);
        return closeModal('profileModal');
    };

    window.closeModalLegacy = legacyClose;
    window.closeModalOnOverlay = closeModalOnOverlay;
}
