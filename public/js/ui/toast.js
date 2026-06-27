/**
 * ui/toast.js
 * Toast notification system — độc lập, không cần store.
 * Phase 4K-6S: canonical window.showToast ownership is registered centrally.
 */

import { GlobalOwnershipRegistry } from '../core/globalOwnershipRegistry.js';

/**
 * Hiển thị toast notification.
 * Require HTML element: <div id="toastMessage">
 *
 * @param {string}  msg       Nội dung hiển thị
 * @param {number}  duration  Thời gian hiển thị (ms), mặc định 3000
 * @param {boolean} isLoading Hiện spinner thay vì text thường
 * @returns {boolean}
 */
export function showToast(msg, duration = 3000, isLoading = false) {
    const toast = typeof document !== 'undefined'
        ? document.getElementById('toastMessage')
        : null;
    if (!toast) return false;

    const timeout = Number(duration);
    const safeDuration = Number.isFinite(timeout) && timeout >= 0 ? timeout : 3000;
    toast.innerText = String(msg ?? '');
    if (isLoading) toast.classList.add('loading');
    else           toast.classList.remove('loading');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), safeDuration);
    return true;
}

/**
 * Đăng ký canonical owner cho window.showToast.
 * Classic fallback remains available in GlobalOwnershipRegistry for rollback.
 */
export function registerToastGlobal() {
    if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
    const result = GlobalOwnershipRegistry.register('showToast', showToast, {
        owner: 'js/ui/toast.js',
        risk: 'ui-only',
        policy: 'module-primary',
    });
    if (!result.ok) {
        console.warn('[4K-6S] showToast ownership registration failed:', result);
    }
    return result;
}
