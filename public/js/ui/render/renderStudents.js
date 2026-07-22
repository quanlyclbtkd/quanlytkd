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
import { getStudentsCachedHtml, getStudentsCacheMetrics } from './computation/studentsRenderer.js?v=quit-context-render-loop-guard-20260722-v5s';

// Phase 4K-6V5S: single-flight authority request for the Đã nghỉ render island.
// A failed/missing-context ensure must never invalidate the same list again,
// otherwise requestRender → ensure(false) → invalidateList creates an endless loop.
let _quitRenderEnsurePromise = null;
let _quitRenderEnsureRetryAfter = 0;
const QUIT_RENDER_RETRY_BACKOFF_MS = 1200;

function _requestQuitAuthorityForRender(reason) {
    const boundary = window.QuitProfileBoundary;
    if (!boundary || boundary.isComplete?.() === true) return;
    if (_quitRenderEnsurePromise || Date.now() < _quitRenderEnsureRetryAfter) return;

    _quitRenderEnsurePromise = Promise.resolve(boundary.ensureComplete?.(reason || 'render-quit-island'))
        .then(ok => {
            const complete = boundary.isComplete?.() === true;
            if (ok === true && complete) {
                _quitRenderEnsureRetryAfter = 0;
                // Directly rebuild once from the authoritative map. Do not emit
                // invalidateList here; the authority loader already invalidates once.
                renderQuitIsland({ reason: 'quit-authority-complete' });
                return true;
            }
            _quitRenderEnsureRetryAfter = Date.now() + QUIT_RENDER_RETRY_BACKOFF_MS;
            return false;
        })
        .catch(() => {
            _quitRenderEnsureRetryAfter = Date.now() + QUIT_RENDER_RETRY_BACKOFF_MS;
            return false;
        })
        .finally(() => {
            _quitRenderEnsurePromise = null;
        });
}

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
        return (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) || Number(window.innerWidth || 0) <= 767;
    } catch (_) {
        return false;
    }
}
function _profileDisplayName(id, profile) {
    const p = profile || {};
    return String(p.name || p.fullName || p.displayName || p.studentName || p.memberName || id || '').trim();
}
function _getAuthoritativeQuitProfiles() {
    if (window.QuitProfileBoundary?.getMap) {
        return window.QuitProfileBoundary.getMap('renderStudents.direct-map');
    }
    const merged = {};
    try {
        const storeQuit = window.studentProfileStore && typeof window.studentProfileStore.getQuitProfiles === 'function'
            ? (window.studentProfileStore.getQuitProfiles() || {})
            : {};
        Object.assign(merged, storeQuit);
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
    const search = (() => { try { return (document.getElementById('searchInput')?.value || '').trim(); } catch (_) { return ''; } })();
    const branch = (() => { try { return document.getElementById('filterBranch')?.value || 'all'; } catch (_) { return 'all'; } })();
    const entries = window.QuitProfileBoundary?.getEntries
        ? window.QuitProfileBoundary.getEntries({ search, branch, reason: 'renderStudents.direct-rows' })
        : Object.entries(_getAuthoritativeQuitProfiles()).filter(([id, profile]) => {
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
    const forceAll = options.forceAll === true || (options.mobileFull === true && _isQuitMobileViewport());
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
    const quitLoaded = !!(window.isQuitProfilesComplete?.() || window.QuitProfileBoundary?.isComplete?.());
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
    const limit = mobileFull ? count : ((window._quitPage || 1) * pageSize);
    const remaining = Math.max(0, count - limit);
    const btnStyle = 'style="padding:0.45rem 1.2rem;font-size:0.85rem;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-weight:600;"';
    if (remaining > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.75rem 0;">'
            + '<button type="button" ' + btnStyle + ' onclick="window._loadMore(\'quit\')">'
            + '⬇ Tải thêm — còn ' + remaining + ' võ sinh đã nghỉ nữa'
            + '</button></div>';
    } else if (count > 0) {
        ctrlEl.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#94a3b8;font-size:0.8rem;">'
            + (mobileFull ? 'Đã hiển thị đủ ' : 'Đã tải hết ') + count + ' võ sinh đã nghỉ</div>';
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
    const target = document.getElementById('quitList');
    if (!target) return;

    // V5R single-render-source lock: once QuitProfileBoundary is available,
    // never restore #quitList from computation/legacy HTML caches. The DOM is
    // always built from the same authoritative map used by search and filters.
    if (window.QuitProfileBoundary) {
        const complete = window.QuitProfileBoundary.isComplete?.() === true;
        if (!complete) {
            _requestQuitAuthorityForRender('render-quit-island');

            const preview = _buildAuthoritativeQuitRows({ mobileFull: true, forceAll: _isQuitMobileViewport() });
            if (preview.count > 0) {
                _applyHtml(target, preview.html);
            } else if (!target.querySelector('tr[data-quit-id]')) {
                _applyHtml(target, '<tr data-quit-loading="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Đang đối chiếu toàn bộ danh sách đã nghỉ...</td></tr>');
            }
            _syncQuitMobileControl();
            return;
        }

        const direct = _buildAuthoritativeQuitRows({ mobileFull: true, forceAll: _isQuitMobileViewport() });
        _applyHtml(target, direct.html || '<tr data-quit-empty="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Chưa có võ sinh đã nghỉ</td></tr>');
        _syncQuitMobileControl();
        return;
    }

    // Standalone legacy fallback only when the V5R boundary module is absent.
    const cached = getStudentsCachedHtml('quitRows');
    if (cached) {
        _applyHtml(target, cached);
        return;
    }
    const direct = _buildAuthoritativeQuitRows({ mobileFull: true, forceAll: _isQuitMobileViewport() });
    _applyHtml(target, direct.html || '<tr data-quit-empty="1"><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px;font-size:0.82rem;">Chưa có võ sinh đã nghỉ</td></tr>');
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
