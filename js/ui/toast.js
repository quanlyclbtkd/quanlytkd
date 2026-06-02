/**
 * ui/toast.js
 * ────────────────────────────────────────────────────────────────
 * Toast notification system — độc lập, không cần store.
 *
 * /// NEW ARCHITECTURE — trích từ app.js dòng 197–202
 * ────────────────────────────────────────────────────────────────
 */

/**
 * Hiển thị toast notification.
 * Require HTML element: <div id="toastMessage">
 *
 * @param {string}  msg       — Nội dung hiển thị
 * @param {number}  duration  — Thời gian hiển thị (ms), mặc định 3000
 * @param {boolean} isLoading — Hiện spinner thay vì text thường
 */
export function showToast(msg, duration = 3000, isLoading = false) {
    const toast = document.getElementById('toastMessage');
    if (!toast) return;
    toast.innerText = msg;
    if (isLoading) toast.classList.add('loading');
    else           toast.classList.remove('loading');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * Đăng ký showToast lên window để HTML onclick="" có thể gọi trực tiếp.
 * Gọi hàm này 1 lần trong main.js sau khi DOM ready.
 */
export function registerToastGlobal() {
    window.showToast = showToast;
}
