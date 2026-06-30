/**
 * renderStudents.js — Phase 3.5A Render Computation Isolation
 *
 * Student list render islands. Each island owns exactly one DOM region.
 *
 * Islands registered:
 *   students.activeList → #activeList  (active student list)
 *   students.debtList   → #debtList    (debt/unpaid student list)
 *   students.quitList   → #quitList    (quit student list)
 *
 * Phase 3.4 → 3.5A CHANGE:
 *   HTML source moved from window.__store.tabHtmlCache
 *   → module-local studentsRenderCache (via getStudentsCachedHtml).
 *   tabHtmlCache is still populated by render.js for backward compat,
 *   but islands no longer read from it directly.
 *
 * Cached HTML includes "Load more" buttons (built by studentsRenderer).
 * Applies HTML via <template> + replaceChildren (DocumentFragment — minimal reflow).
 */

import { registerRender } from './renderRegistry.js';
import { getStudentsCachedHtml, getStudentsCacheMetrics } from './computation/studentsRenderer.js?v=coach-attendance-root-cause-recovery-20260630-v4d6';

// ─── Core DOM helper ────────────────────────────────────────────────────────

/**
 * Apply an HTML string to a container element using a DocumentFragment.
 * <template> parses HTML without needing a wrapper element context.
 * replaceChildren() atomically replaces all children in one DOM mutation.
 *
 * @param {Element|null} el   — target container
 * @param {string}       html — inner HTML string
 */
function _applyHtml(el, html) {
    if (!el) return;
    if (!html) {
        el.replaceChildren();
        return;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    el.replaceChildren(tpl.content);
}

function _ensureQuitMobileControl() {
    let ctrlEl = document.getElementById('pgWrap_quitList');
    if (ctrlEl) return ctrlEl;
    const target = document.getElementById('quitList');
    if (!target || !document.createElement) return null;
    const table = target.closest ? target.closest('table') : null;
    const wrapper = target.closest ? target.closest('.table-wrapper') : null;
    const anchor = wrapper || table || target;
    const parent = anchor && anchor.parentElement;
    if (!parent) return null;
    ctrlEl = document.createElement('div');
    ctrlEl.id = 'pgWrap_quitList';
    ctrlEl.setAttribute('data-mobile-quit-control', '1');
    ctrlEl.style.cssText = 'width:100%;margin-top:8px;';
    parent.insertBefore(ctrlEl, anchor.nextSibling);
    return ctrlEl;
}

function _escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function _escapeJs(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function _formatDateSafe(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.includes('/')) return text;
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return text;
}
function _isQuitMobileViewport() {
    try {
        const mm = window.matchMedia ? window.matchMedia.bind(window) : null;
        return (mm && (mm('(max-width: 1024px)').matches || mm('(pointer: coarse)').matches))
            || /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator && navigator.userAgent || ''))
            || Number(window.innerWidth || 0) <= 1024;
    } catch (_) {
        return false;
    }
}
function _profileDisplayName(id, profile) {
    const p = profile || {};
    return String(p.name || p.fullName || p.displayName || p.studentName || p.memberName || id || '').trim();
}
function _getAuthoritativeQuitProfiles() {
    const merged = {};
    try {
        const storeQuit = window.studentProfileStore && typeof window.studentProfileStore.getQuitProfiles === 'function'
            ? (window.studentProfileStore.getQuitProfiles() || {})
            : {};
        const compat = window.studentProfileStore && typeof window.studentProfileStore.getAllProfilesCompat === 'function'
            ? (window.studentProfileStore.getAllProfilesCompat() || {})
            : {};
        const localQuit = (window.__store && window.__store._localQuitProfiles) || {};
        Object.assign(merged, storeQuit, localQuit);
        Object.entries(compat).forEach(([id, profile]) => {
            const kind = typeof window.classifyProfileStatus === 'function'
                ? window.classifyProfileStatus(profile)
                : (profile && (profile.status === 'quit' || profile.status === 'inactive' || profile.active === false || profile.isActive === false || profile.quitDate || profile.ngayNghi) ? 'quit' : 'active');
            if (kind === 'quit' && id && !merged[id]) merged[id] = profile;
        });
    } catch (_) {}
    try {
        const canonicalStore = (window.__profileCanonicalStore || (window.ProfileCanonicalStore && window.ProfileCanonicalStore.ensure && window.ProfileCanonicalStore.ensure({ reason: 'quit-list-direct-fallback' }))) || null;
        const canonicalQuit = canonicalStore && Array.isArray(canonicalStore.quitProfiles) ? canonicalStore.quitProfiles : [];
        canonicalQuit.forEach(item => {
            const id = item && (item.rawId || item.profileId || item.displayName);
            const raw = item && item.raw;
            if (id && raw && !merged[id]) merged[id] = raw;
        });
    } catch (_) {}
    try {
        const profiles = Object.assign({}, window.allProfiles || {}, (window.__store && window.__store.profiles) || {});
        Object.entries(profiles).forEach(([id, profile]) => {
            const kind = typeof window.classifyProfileStatus === 'function'
                ? window.classifyProfileStatus(profile)
                : (profile && (profile.status === 'quit' || profile.status === 'inactive' || profile.active === false || profile.isActive === false || profile.quitDate || profile.ngayNghi) ? 'quit' : 'active');
            if (kind === 'quit' && id && !merged[id]) merged[id] = profile;
        });
    } catch (_) {}
    return merged;
}
function _buildAuthoritativeQuitRows(options = {}) {
    const profiles = _getAuthoritativeQuitProfiles();
    const entries = Object.entries(profiles).filter(([id, profile]) => {
        if (!id || !profile) return false;
        const kind = typeof window.classifyProfileStatus === 'function'
            ? window.classifyProfileStatus(profile)
            : (profile.status === 'quit' || profile.status === 'inactive' || profile.active === false || profile.isActive === false ? 'quit' : 'active');
        return kind === 'quit';
    }).sort((a, b) => _profileDisplayName(a[0], a[1]).localeCompare(_profileDisplayName(b[0], b[1]), 'vi'));
    const pageSize = (window.__store && window.__store.pagination && window.__store.pagination.students && window.__store.pagination.students.pageSize) || 50;
    // Phase 4K-6V4B6: mobile must show the full authoritative quit list.
    // Prior versions accepted the computation cache / page limit, so phones showed
    // only the first mobile page even though desktop and Firestore data were complete.
    const forceAll = options.forceAll === true || options.fullList === true || options.mobileFull === true || _isQuitMobileViewport();
    const limit = forceAll ? entries.length : (Math.max(1, window._quitPage || 1) * pageSize);
    const cfg = (window.__store && window.__store.clubConfig) || window.clubConfig || {};
    const isSingleBranch = Number(cfg.branchCount || 1) <= 1;
    const isAdmin = String(window.userRole || '').toLowerCase().includes('admin');
    const rows = entries.slice(0, limit).map(([id, p]) => {
        const display = _escapeHtml(_profileDisplayName(id, p));
        const safeIdAttr = _escapeHtml(id);
        const safeIdJs = _escapeJs(id);
        const belt = _escapeHtml(p.belt || '');
        const memberId = _escapeHtml(p.memberId || p.studentCode || p.code || '');
        const branchTd = isSingleBranch ? '' : '<td><span class="badge bg-slate-100 text-slate-600 border border-slate-200">' + _escapeHtml(typeof window.getBranchNameDisplay === 'function' ? window.getBranchNameDisplay(p.branch || '') : (p.branch || '')) + '</span></td>';
        const quitDate = _formatDateSafe(p.quitDate || p.ngayNghi || p.inactiveDate || p.stoppedDate || p.leftDate || p.nghiDate);
        return `<tr data-quit-id="${safeIdAttr}" data-profile-name="${display}"><td class="name-link text-[0.95rem]" onclick="openProfile('${safeIdJs}')">${display}</td><td class="text-[0.7rem] font-bold text-slate-500">${memberId || '-'}</td><td>${belt}</td>${branchTd}<td>${_formatDateSafe(p.dob)}</td><td>${_escapeHtml(quitDate) || '-'}</td><td>${isAdmin ? `<button type="button" class="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200" onclick="openProfile('${safeIdJs}')">🔄 Khôi phục</button>` : ''}</td></tr>`;
    }).join('');
    const remaining = Math.max(0, entries.length - limit);
    const colspan = isSingleBranch ? 6 : 7;
    const more = remaining > 0
        ? `<tr class="load-more-row" data-load-more-for="quitList"><td colspan="${colspan}" style="padding:10px;text-align:center;"><button type="button" class="btn-sm" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;font-size:0.78rem;cursor:pointer;" onclick="window._loadMore('quit')">⬇ Tải thêm — còn ${remaining} võ sinh đã nghỉ nữa</button></td></tr>`
        : '';
    return { html: rows + more, count: entries.length, limit, remaining };
}

function _syncQuitMobileControl() {
    const ctrlEl = _ensureQuitMobileControl();
    if (!ctrlEl) return;
    const quitLoaded = !!(window.studentProfileStore && typeof window.studentProfileStore.isQuitLoaded === 'function' && window.studentProfileStore.isQuitLoaded());
    const mobileFull = _isQuitMobileViewport();
    if (!quitLoaded) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Đang tải danh sách đã nghỉ...</div>';
        return;
    }
    let count = 0;
    try {
        count = Object.keys(_getAuthoritativeQuitProfiles()).length;
    } catch (_) { count = 0; }
    const pageSize = (window.__store && window.__store.pagination && window.__store.pagination.students && window.__store.pagination.students.pageSize) || 50;
    const limit = count;
    const remaining = Math.max(0, count - limit);
    const btnStyle = 'style="padding:0.45rem 1.2rem;font-size:0.85rem;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-weight:600;"';
    if (remaining > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.75rem 0;">'
            + '<button type="button" ' + btnStyle + ' onclick="window._loadMore(\'quit\')">'
            + '⬇ Tải thêm — còn ' + remaining + ' võ sinh đã nghỉ nữa'
            + '</button></div>';
    } else if (count > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">'
            + 'Đã hiển thị đủ ' + count + ' võ sinh đã nghỉ</div>';
    } else {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">Chưa có võ sinh đã nghỉ</div>';
    }
}

// ─── Island render functions ─────────────────────────────────────────────────

/** Render the active student list (#activeList). */
export function renderActiveIsland() {
    const _html = getStudentsCachedHtml('activeRows');
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX:
    // Nếu cache rỗng nhưng pagination có currentItems → KHÔNG xóa DOM.
    // Root cause bug: _applyHtml(el, '') gọi el.replaceChildren() → xóa toàn bộ
    // rows mà pagination fallback đã inject trước đó.
    if (!_html) {
        const _pgState    = window.__store?.pagination?.students;
        const _hasPgItems = _pgState?.enabled &&
            Array.isArray(_pgState.currentItems) &&
            _pgState.currentItems.length > 0;
        if (_hasPgItems) {
            // Phase 4K-5F: hard-filter active items before fallback render
            const _activeItems = typeof window.filterStudentItemsForMode === 'function'
                ? window.filterStudentItemsForMode(_pgState.currentItems, 'active')
                : _pgState.currentItems;
            const _fbHtml = typeof window.buildStudentsRowsFromPagination === 'function'
                ? window.buildStudentsRowsFromPagination(_activeItems, 'active')
                : '';
            if (_fbHtml) {
                _applyHtml(document.getElementById('activeList'), _fbHtml);
                return;
            }
            // Builder chưa sẵn → bảo toàn DOM (không clear rows đang hiển thị)
            console.warn('[renderActiveIsland] activeRows cache empty — pagination has',
                _pgState.currentItems.length, 'items. Preserving existing DOM rows.');
            return;
        }
    }
    _applyHtml(document.getElementById('activeList'), _html);
}

/** Render the debt/unpaid list (#debtList). */
export function renderDebtIsland() {
    _applyHtml(document.getElementById('debtList'), getStudentsCachedHtml('debtRows'));
}

/** Render the quit student list (#quitList). */
export function renderQuitIsland() {
    let _htmlQ = getStudentsCachedHtml('quitRows');
    const _target = document.getElementById('quitList');
    const _quitLoaded = !!(window.studentProfileStore && typeof window.studentProfileStore.isQuitLoaded === 'function' && window.studentProfileStore.isQuitLoaded());
    const _directPreview = _buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true, fullList: true });
    const _hasDirectQuit = _directPreview && _directPreview.count > 0;

    // Phase 4K-6V4D1A: V4D1 is read-only, but its audit store can be available
    // before the async quit lazy loader finishes. Do not show a partial/blank
    // Đã nghỉ tab when local authoritative quit profiles already exist in memory.
    if (!_quitLoaded && _hasDirectQuit) {
        _applyHtml(_target, _directPreview.html);
        _syncQuitMobileControl();
        return;
    }

    // Phase 4K-6V4B5: mobile authoritative render safety. Mobile can open the
    // tab while lazy quit reconciliation has completed but the computation cache
    // is still empty/stale. Never clear #quitList in that state; rebuild from
    // authoritative quitProfiles directly, then create an outside mobile control.
    if (_quitLoaded) {
        const _cachedQuitRows = ((_htmlQ || '').match(/data-quit-id=/g) || []).length;
        // Phase 4K-6V4D5: both web and mobile must prefer the authoritative full
        // quit union. Previous web path could keep a stale/page-limited cached
        // computation when counts were equal or cache had a load-more row.
        if (_hasDirectQuit && (_isQuitMobileViewport() || !_htmlQ || _directPreview.count >= _cachedQuitRows)) {
            _applyHtml(_target, _directPreview.html);
            _syncQuitMobileControl();
            return;
        }
        if (!_htmlQ && typeof window.refreshListComputation === 'function') {
            try {
                window.refreshListComputation('students.quitList', 'quit-mobile-authoritative-cache-miss');
                _htmlQ = getStudentsCachedHtml('quitRows');
            } catch (_) {}
        }
        if (!_htmlQ) {
            const direct = _buildAuthoritativeQuitRows({ forceAll: true, fullList: true });
            _applyHtml(_target, direct.html || '<tr data-quit-empty="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Chưa có võ sinh đã nghỉ</td></tr>');
            _syncQuitMobileControl();
            return;
        }
        _applyHtml(_target, _htmlQ);
        _syncQuitMobileControl();
        return;
    }

    // Before quit data is ready, preserve any existing DOM rows instead of
    // clearing the mobile table. This avoids a blank flash while lazy load runs.
    if (!_htmlQ) {
        const _hasRows = _target && _target.querySelector('tr[data-quit-id], tr[data-student-id]');
        if (_hasRows) return;
        if (_target) {
            _applyHtml(_target, '<tr data-quit-loading="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Đang tải danh sách đã nghỉ...</td></tr>');
        }
        _syncQuitMobileControl();
        return;
    }
    _applyHtml(_target, _htmlQ);
    _syncQuitMobileControl();
}

// ─── Island initialiser ──────────────────────────────────────────────────────

/**
 * Register all student render islands with the registry.
 * Call once during application bootstrap (main.js).
 */
export function initStudentIslands() {
    registerRender('students.activeList', renderActiveIsland, {
        selector: '#activeList',
        tabId:    'active',
    });
    registerRender('students.debtList', renderDebtIsland, {
        selector: '#debtList',
        tabId:    'debt',
    });
    registerRender('students.quitList', renderQuitIsland, {
        selector: '#quitList',
        tabId:    'quit',
    });
}

// ─── Legacy window shims ─────────────────────────────────────────────────────

export function registerStudentsLegacyGlobals() {
    window.renderActiveList = renderActiveIsland;
    window.renderDebtList   = renderDebtIsland;
    window.renderQuitList   = renderQuitIsland;
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: expose cache metrics cho debug helper
    window.getStudentsCacheMetrics = getStudentsCacheMetrics;
}
