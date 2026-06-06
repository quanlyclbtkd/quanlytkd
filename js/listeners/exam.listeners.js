/**
 * listeners/exam.listeners.js — Phase 3.6B Listener Registration Safety
 * ────────────────────────────────────────────────────────────────
 * Quản lý lifecycle listener tab Thi Đai.
 *
 * TRẠNG THÁI PHASE 3.6B:
 *   exam.js là STUB — app.js xử lý toàn bộ logic thi đai.
 *   Không có Firestore onSnapshot riêng cho tab exam.
 *   Dữ liệu thi đai lấy từ global listeners:
 *     - allProfiles (profiles global listener)
 *     - allTransactions (finance global listener — lệ phí thi)
 *
 *   [3.6B] Pseudo-listener đã MIGRATE sang safeRegisterSnapshot():
 *     → safeRegisterSnapshot() kiểm tra key TRƯỚC khi đăng ký pseudo-entry
 *     → tránh duplicate entry khi switch tab nhiều lần
 *     → markListenerSnapshot(key) ghi nhận mỗi lần trigger render từ tab
 *
 *   Tab mount:
 *     → safeRegisterSnapshot() guard — không mount trùng
 *     → nếu đã mount: chỉ trigger render thôi
 *     → trigger renderExamList() + updateNextBeltPreview()
 *
 *   Tab cleanup (khi rời tab):
 *     → xóa pseudo-entry
 *     → không có Firestore unsub thực
 *
 *   Snapshot invalidation:
 *     → khi allProfiles thay đổi → invalidateByDomain('exam') từ app.js
 *     → khi transactions thay đổi → invalidateFinance() → exam cũng re-render
 *       vì examExpense dùng allTransactions
 *
 * TODO Phase 3.6C:
 *   Khi exam.js được extract hoàn chỉnh khỏi app.js:
 *   → Nếu cần realtime exam list, mount onSnapshot ở đây
 *   → cleanup khi rời tab
 *   → invalidateByDomain('exam', 'exam-listener-snapshot') trong callback
 * ────────────────────────────────────────────────────────────────
 */

import {
    safeRegisterSnapshot,
    hasListener,
    removeListener,
    markListenerSnapshot,
} from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDER
// ─────────────────────────────────────────────────────────────────

/**
 * Key cho exam pseudo-listener.
 * Scope: tab — lifecycle = tab session.
 * @param {string} clubId
 * @returns {string}
 */
function _examKey(clubId) {
    return `exam:tab:${clubId}`;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Mount exam tab listeners.
 *
 * [3.6B] Dùng safeRegisterSnapshot() thay vì registerListener() trực tiếp.
 * An toàn gọi nhiều lần — hasListener() guard chống duplicate.
 * Nếu đã mount rồi, chỉ trigger re-render.
 *
 * @param {{ clubId?: string }} [context]
 */
export function mountExamListeners(context = {}) {
    const clubId = (context && context.clubId)
        || (window.__store && window.__store.clubId)
        || 'unknown';
    const key = _examKey(clubId);

    if (hasListener(key)) {
        // Đã mount — trigger render thôi
        markListenerSnapshot(key);
        _triggerExamRender('exam-tab-remount');
        return;
    }

    // [3.6B] safeRegisterSnapshot: kiểm tra key TRƯỚC khi tạo pseudo-entry
    // exam dùng global data → pseudo-listener (noop unsub)
    safeRegisterSnapshot(
        key,
        () => () => {}, // createUnsubscribe: trả về noop (không có onSnapshot thực)
        {
            owner:  'exam',
            scope:  'tab',
            tabId:  'exam',
            reason: 'mount-exam-tab',
        }
    );

    markListenerSnapshot(key);
    _triggerExamRender('exam-tab-mount');
}

/**
 * Cleanup exam tab listeners — gọi khi rời tab.
 * @param {string} [reason]
 */
export function cleanupExamListeners(reason = 'tab-leave') {
    const clubId = (window.__store && window.__store.clubId) || 'unknown';
    removeListener(_examKey(clubId), reason);
}

// ─────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Trigger render exam sau khi mount/remount.
 * @param {string} reason
 */
function _triggerExamRender(reason) {
    // Phase 4K-6A-B: call renderExamList directly — invalidateByDomain('exam') not supported
    try {
        requestAnimationFrame(function() {
            if (typeof window.renderExamList === 'function') {
                window.renderExamList();
            }

            if (typeof window.updateNextBeltPreview === 'function') {
                window.updateNextBeltPreview();
            }

            if (window.__store) {
                window.__store._lastExamRenderReason = reason || '';
                window.__store._lastExamRenderAt = Date.now();
            }
        });
    } catch (e) {
        console.warn('[exam.listeners] direct render failed:', e);
    }
}
