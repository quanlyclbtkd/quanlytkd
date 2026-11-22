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
 *     → khi Profiles authority server-fresh thay đổi và Exam đang active
 *       → requestExamPresentationRefresh() dùng chính presentation owner này
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

// R2R5.2B: Exam presentation đã có một scheduler rAF tại owner này. Dùng lại
// chính scheduler đó cho Profile→Exam refresh để tab-entry + profile hydration
// trong cùng turn chỉ tạo một render, không dựng Exam invalidator/scheduler V2.
let _examRenderScheduled = false;
let _pendingExamRenderReason = '';
let _pendingProfileAuthorityToken = '';
let _lastRenderedProfileAuthorityToken = '';

function _isExamActive() {
    return typeof window.getCurrentActiveTabId === 'function'
        && window.getCurrentActiveTabId() === 'exam';
}

function _profileAuthorityToken(explicit = null) {
    if (explicit && typeof explicit === 'object') {
        const clubId = String(explicit.clubId || '');
        const sessionEpoch = explicit.sessionEpoch ?? '';
        const ownerUid = String(explicit.ownerUid || '');
        const version = Number(explicit.version);
        if (clubId && ownerUid && Number.isFinite(version)) {
            return `${clubId}|${sessionEpoch}|${ownerUid}|${version}`;
        }
    }
    try {
        const m = typeof window.getProfilesListenerMetrics === 'function'
            ? window.getProfilesListenerMetrics() : null;
        if (!m) return '';
        const clubId = String(m.authorityClubId || m.clubId || '');
        const ownerUid = String(m.activeOwnerUid || '');
        const version = Number(m.authoritySnapshotVersion);
        if (!clubId || !ownerUid || !Number.isFinite(version)) return '';
        return `${clubId}|${m.authoritySessionEpoch ?? ''}|${ownerUid}|${version}`;
    } catch (_) {
        return '';
    }
}

function _triggerExamRender(reason, { dedupeProfileAuthority = false, profileAuthority = null } = {}) {
    // Keep the canonical Exam owner explicit: inherited recovery gates and tab-entry
    // semantics require _triggerExamRender itself to own the direct presentation call.
    const _renderCurrentExam = () => {
        if (typeof window.renderExamList === 'function') window.renderExamList();
        if (typeof window.updateNextBeltPreview === 'function') window.updateNextBeltPreview();
    };

    if (!_isExamActive()) return { accepted: false, reason: 'exam-not-active' };

    const token = _profileAuthorityToken(profileAuthority);
    if (dedupeProfileAuthority && token && token === _lastRenderedProfileAuthorityToken && !_examRenderScheduled) {
        return { accepted: true, deduped: true };
    }

    _pendingExamRenderReason = reason || 'exam-refresh';
    if (token) _pendingProfileAuthorityToken = token;
    if (_examRenderScheduled) return { accepted: true, coalesced: true };

    _examRenderScheduled = true;
    try {
        requestAnimationFrame(function() {
            _examRenderScheduled = false;
            // Canonical active-tab authority is rechecked at execution time. If
            // the user left Exam before paint, hidden Exam does zero DOM work;
            // the normal tab-entry owner will render latest RAM when reopened.
            if (!_isExamActive()) {
                _pendingExamRenderReason = '';
                _pendingProfileAuthorityToken = '';
                return;
            }

            const renderReason = _pendingExamRenderReason || reason || 'exam-refresh';
            const pendingToken = _pendingProfileAuthorityToken;
            _pendingExamRenderReason = '';
            _pendingProfileAuthorityToken = '';

            _renderCurrentExam();

            _lastRenderedProfileAuthorityToken = _profileAuthorityToken() || pendingToken || '';
            if (window.__store) {
                window.__store._lastExamRenderReason = renderReason;
                window.__store._lastExamRenderAt = Date.now();
                window.__store._lastExamProfileAuthorityToken = _lastRenderedProfileAuthorityToken;
            }
        });
    } catch (e) {
        _examRenderScheduled = false;
        _pendingExamRenderReason = '';
        _pendingProfileAuthorityToken = '';
        console.warn('[exam.listeners] direct render failed:', e);
        return { accepted: false, reason: 'schedule-failed' };
    }
    return { accepted: true };
}

/**
 * Route một Profiles server-fresh authority change tới existing Exam
 * presentation owner. Không đọc Firestore, không render khi Exam hidden.
 *
 * @param {string} reason
 * @param {{clubId?:string,sessionEpoch?:number|string,ownerUid?:string,version?:number}} [profileAuthority]
 * @returns {{accepted:boolean,coalesced?:boolean,deduped?:boolean,reason?:string}}
 */
export function requestExamPresentationRefresh(reason = 'profiles-server-fresh', profileAuthority = null) {
    return _triggerExamRender(reason, {
        dedupeProfileAuthority: true,
        profileAuthority,
    });
}

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
