/**
 * computation/studentsRenderer.js — Phase 3.5A Render Computation Isolation
 *
 * Isolated student/debt render computation.
 * Extracted from renderApp() PASS 1 + PASS 2 in render.js.
 *
 * Owns:
 *   - Active / Debt / Quit row HTML generation
 *   - Student summary statistics (activeCount, debtCount, m_new …)
 *   - "Load more" fallback button HTML (appended to rows before caching)
 *   - Module-local render cache (NOT window.__store.tabHtmlCache)
 *   - Explicit cache invalidation API
 *   - Lightweight render metrics
 *   - Smart-name helpers (_strip, _disp, _getYrBadge)
 *
 * KHÔNG:
 *   - Mutate DOM trực tiếp
 *   - Query Firestore
 *   - Gọi renderApp()
 *
 * Row identity:
 *   Every <tr> carries data-student-id / data-debt-id / data-quit-id
 *   for future virtualization keying.
 *
 * Branch stats augmentation:
 *   computeAndCacheStudents() receives the bStats object produced by
 *   financeRenderer and adds active/debt counts to each branch entry.
 *   render.js passes finSummary.bStats here; after this call bStats
 *   is fully populated and can be passed to renderBranchStats().
 *
 * Load-more buttons:
 *   Appended to the end of each section's cached HTML so islands render
 *   the complete list (rows + pagination button) in one replaceChildren call.
 */

import {
    formatDate,
    formatMonth,
    formatMonthCompact,
    normalizeYYYYMM,
    addMonthsToYYYYMM,
    getBeltBadge,
} from '../../../utils/format.js';

// Phase 4K-STUDENT-LIST: Classifier chung — không dùng p.status === 'quit' trực tiếp
import { classifyProfileStatus } from '../../../data/profileStatusConfig.js';
import { rankStudentNameSearchResults } from '../../../core/studentSearchIndex.js?v=student-given-name-priority-20260811-v5u3';

// ── Phase 4K-2B: Fallback blob builder (used when getProfileSearchBlob unavailable) ──
function _fallbackProfileBlob(name, p) {
    const _nvFn = window.normalizeVNForSearch || (v => String(v || '').toLowerCase().trim());
    const pp = p || {};
    return [
        name,
        pp.name, pp.nickname, pp.memberId, pp.studentCode,
        pp.code, pp.belt, pp.notes, pp.phone,
        pp.parentPhone, pp.contactPhone, pp.guardianPhone,
    ].filter(Boolean).map(v => _nvFn(String(v))).join(' ');
}


function _monthList(values) {
    return Array.isArray(values)
        ? values.map(m => normalizeYYYYMM(m)).filter(Boolean)
        : [];
}

function _fallbackChargeableTuitionMonths(profile, selectedMonth) {
    const p = profile || {};
    const selMonth = normalizeYYYYMM(selectedMonth || '');
    if (!selMonth || p.feeExempt === true) return [];
    const skipped = _monthList(p.skippedMonths);
    const rawPaidMonths = _monthList(p.paidMonths);
    const paidUntil = normalizeYYYYMM(p.paidUntil || '');
    // Phase 4K-6V4B11: `paidUntil` is the authoritative continuous paid boundary.
    // Do not let future stale paidMonths hide real debt after paidUntil.
    const paidMonths = paidUntil ? rawPaidMonths.filter(m => m <= paidUntil) : rawPaidMonths;
    let startMonth = paidUntil ? addMonthsToYYYYMM(paidUntil, 1) : '';
    if (!startMonth) {
        startMonth = normalizeYYYYMM(p.admissionDate || p.joinDate || p.joinedAt || p.createdAt || p.enrollDate || selMonth) || selMonth;
    }
    const result = [];
    let cur = startMonth;
    let guard = 0;
    while (cur && cur <= selMonth && guard < 36) {
        if (!skipped.includes(cur) && !paidMonths.includes(cur)) result.push(cur);
        cur = addMonthsToYYYYMM(cur, 1);
        guard++;
    }
    if (p.isOwed === true && Array.isArray(p.owedMonths)) {
        _monthList(p.owedMonths).forEach(m => {
            if (m <= selMonth && !skipped.includes(m) && !paidMonths.includes(m) && !result.includes(m)) result.push(m);
        });
        result.sort();
    }
    return result;
}

// ── Module-local branch-name helper ──────────────────────────────────────────
const _getBrN = (br) =>
    (window.getBranchNameDisplay && window.getBranchNameDisplay(br))
        ? window.getBranchNameDisplay(br)
        : br;

// Phase 4K-6V4B11: Branch filter must use the same canonical/alias rules as
// Coach attendance. Legacy profile.branch may be CS1, Mặc định, a configured
// branch display name, or an old free-text value. Direct string compare made
// Báo nợ silently miss some debtors when Admin selected a branch filter.
function _branchMatchesFilter(profileBranch, selectedBranch) {
    const sel = String(selectedBranch || 'all').trim();
    if (!sel || sel === 'all') return true;
    const raw = String(profileBranch || '').trim();
    if (!raw) return false;
    if (raw === sel) return true;
    const resolver = typeof window !== 'undefined' ? window.CoachBranchResolver : null;
    const cfg = (typeof window !== 'undefined' && (window.__store?.clubConfig || window.clubConfig)) || {};
    try {
        if (resolver && typeof resolver.normalize === 'function') {
            const a = resolver.normalize(raw, cfg);
            const b = resolver.normalize(sel, cfg);
            if (a && b && a === b) return true;
            if (typeof resolver.queryValues === 'function') {
                const aliases = new Set([...(resolver.queryValues(sel, cfg) || []), ...(resolver.queryValues(b, cfg) || [])].map(v => String(v || '').trim()).filter(Boolean));
                if (aliases.has(raw) || aliases.has(a)) return true;
            }
        }
    } catch (_) {}
    const fold = (typeof window !== 'undefined' && window.normalizeVNForSearch)
        ? window.normalizeVNForSearch
        : (v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim());
    return fold(raw) === fold(sel) || fold(_getBrN(raw)) === fold(sel) || fold(raw) === fold(_getBrN(sel));
}

// ── Smart-name helpers (moved from render.js) ─────────────────────────────────
const _strip = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
const _disp  = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
function _profileDisplayName(id, p) {
    const data = p || {};
    const candidates = [
        data.name,
        data.fullName,
        data.displayName,
        data.studentName,
        data.hoTen,
        id,
    ];
    for (const value of candidates) {
        const text = String(value || '').trim();
        if (text) return text;
    }
    return String(id || '').trim();
}

/**
 * Build year-disambiguation badge for duplicate display names.
 * Pure function — requires pre-computed nameNCount map.
 */
function _getYrBadge(name, p, nameNCount) {
    if ((nameNCount[_strip(name)] || 0) <= 1) return '';
    const dob = (p && p.dob) || '';
    let yr = dob.includes('/') ? dob.split('/')[2] : (dob.includes('-') ? dob.split('-')[0] : '');
    if (!yr) { const _m = (name || '').match(/\((\d{4})/); if (_m) yr = _m[1]; }
    return yr
        ? `<sup style="font-size:0.55rem;color:#94a3b8;font-weight:700;vertical-align:super;line-height:0;margin-left:2px;">${yr}</sup>`
        : '';
}

// ── Module-local render cache ─────────────────────────────────────────────────
const _cache = {
    activeRows:  null,
    debtRows:    null,
    quitRows:    null,
    /** @type {{ activeCount:number, debtCount:number, totalDebtEst:number,
     *           m_active_theo:number, m_new:number, m_quit:number, m_skipped:number,
     *           activeTotalCount:number, debtTotalCount:number, quitTotalCount:number,
     *           activeRendered:number, debtRendered:number, quitRendered:number,
     *           activeLimit:number, debtLimit:number, quitLimit:number,
     *           pgStudentsActive:boolean } | null} */
    summary:     null,
    paramsKey:   null,
    dataVersion: -1,
    _version:    0,
};

// ── Metrics ───────────────────────────────────────────────────────────────────
const _metrics = {
    computations:       0,
    cacheHits:          0,
    duplicatePrevented: 0,
    skippedHiddenTab:   0,
    lastComputeMs:      0,
};


// Phase 4K-6V4B12: normal production clubs can have 600+ profiles. A 20–45ms
// computation is expected on mobile/low-end CPUs and should not spam console.
// Keep warnings for severe cases or explicit local performance debugging only.
const _STUDENTS_SLOW_WARN_MS = 64;
function _shouldWarnStudentCompute(ms) {
    try {
        if (ms <= _STUDENTS_SLOW_WARN_MS) return false;
        const h = window.location && window.location.hostname || '';
        return !!window.__ENABLE_PERF_WARNINGS || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.replit.dev');
    } catch (_) { return false; }
}

// ── Explicit invalidation ─────────────────────────────────────────────────────

/**
 * @param {'activeList'|'debtList'|'quitList'|'summary'|'all'} section
 */
export function invalidateStudentsRender(section) {
    if (section === 'activeList' || section === 'all') _cache.activeRows = null;
    if (section === 'debtList'   || section === 'all') _cache.debtRows   = null;
    if (section === 'quitList'   || section === 'all') _cache.quitRows   = null;
    if (section === 'summary'    || section === 'all') _cache.summary    = null;
    if (section === 'all') {
        _cache.paramsKey   = null;
        _cache.dataVersion = -1;
    }
    _cache._version++;
}

// ── Row renderers ─────────────────────────────────────────────────────────────

/**
 * Render a single active student row.
 * Stable identity: data-student-id="${name}"
 */
export function renderActiveRow(name, p, opts = {}) {
    const {
        beltHTML = '', branchTdHTML = '', yrBadge = '',
        newBadge = '', nickBadge = '', paidBadge = '', isAdmin = false,
    } = opts;
    const safeNameEsc = name.replace(/'/g, "\\'");
    return `<tr data-student-id="${safeNameEsc}"><td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEsc}')">${_disp(name)}${yrBadge}${newBadge}${p.notes ? ` <span title="${p.notes}">📝</span>` : ''}${nickBadge}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>${beltHTML}</td>${branchTdHTML}<td>${formatDate(p.dob)}</td><td>${paidBadge}</td><td class="font-medium text-slate-600">${p.phone || ''}</td><td class="text-slate-500">${formatDate(p.createdAt)}</td><td><button type="button" class="btn-sm bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200" onclick="openProfile('${safeNameEsc}')">${isAdmin ? '✏️ Sửa' : '👁️ Xem'}</button></td></tr>`;
}

/**
 * Render a single debt/unpaid student row.
 * Stable identity: data-debt-id="${name}"
 */
export function renderDebtRow(name, p, opts = {}) {
    const {
        unpaidMonthsCount = 0, owedMonthsStr = '', branchTdHTML = '',
        isAdmin = false, selMonth = '', yrBadge = '',
    } = opts;
    const safeNameEsc    = name.replace(/'/g, "\\'");
    const safeBranch     = p.branch || 'CS1';
    const isOverdue      = unpaidMonthsCount >= 2;
    const rowBg          = isOverdue ? 'style="background:#fff1f2;"' : '';
    const countBadgeCls  = isOverdue
        ? 'bg-rose-600 text-white border-rose-700'
        : 'bg-rose-50 text-rose-700 border border-rose-200';
    const safeOwedMonths = owedMonthsStr.replace(/'/g, '');
    const totalDebtAmount = unpaidMonthsCount * (Number(p.tuitionFee) || 0);
    const lastPaidLabel  = `<span class="font-bold text-primary text-[0.8rem]">${formatMonthCompact(owedMonthsStr)}</span>`;
    return `<tr data-debt-id="${safeNameEsc}" ${rowBg}><td><span class="badge ${countBadgeCls}">${unpaidMonthsCount} Tháng</span></td><td>${lastPaidLabel}</td>${branchTdHTML}<td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEsc}')">${_disp(name)}${yrBadge}${isOverdue ? ' <span title="Nợ từ 2 tháng trở lên" class="text-rose-500">⚠️</span>' : ''}</td><td class="action-btns"><button type="button" class="btn-sm bg-indigo-50 text-indigo-700 border border-indigo-200" onclick="generateMultiMonthPaymentRequest('${safeNameEsc}', '${safeOwedMonths}', '${safeBranch}', '${totalDebtAmount}')">📱 QR</button>${isAdmin ? `<button type="button" class="btn-sm bg-emerald-600 text-white shadow-sm" onclick="openQuickPayModal('${safeNameEsc}', '${safeOwedMonths}', '${safeBranch}')">💰 Thu</button>` : ''}<button type="button" class="btn-sm bg-[#0068FF] text-white shadow-sm" onclick="copyAndOpenZalo('${safeNameEsc}', '${safeOwedMonths}', '${p.phone || ''}')">💬 Zalo</button>${isAdmin ? `<button type="button" class="btn-sm bg-rose-50 text-rose-700 border border-rose-200" title="Chuyển võ sinh sang Đã nghỉ" onclick="window.markStudentQuitFromDebt(event, '${safeNameEsc}', '${selMonth}')">🚫 Nghỉ</button><button type="button" class="btn-sm bg-amber-50 text-amber-700 border border-amber-200" title="Báo nghỉ / miễn học phí tháng này" onclick="window.skipDebtMonthFromDebt(event, '${safeNameEsc}', '${selMonth}')">⏸ Báo nghỉ</button>` : ''}</td></tr>`;
}

/**
 * Render a single quit student row.
 * Stable identity: data-quit-id="${name}"
 */
export function renderQuitRow(name, p, opts = {}) {
    const { beltHTML = '', branchTdHTML = '', yrBadge = '', isAdmin = false } = opts;
    const safeNameEsc = name.replace(/'/g, "\'");
    const displayName = _profileDisplayName(name, p);
    const safeDisplayAttr = String(displayName || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<tr data-quit-id="${safeNameEsc}" data-profile-name="${safeDisplayAttr}"><td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEsc}')">${_disp(displayName)}${yrBadge}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>${beltHTML}</td>${branchTdHTML}<td>${formatDate(p.dob)}</td><td>${formatDate(p.quitDate || p.ngayNghi || p.inactiveDate || p.stoppedDate || p.leftDate || p.nghiDate)}</td><td>${isAdmin ? `<button type="button" class="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200" onclick="openProfile('${safeNameEsc}')">🔄 Khôi phục</button>` : ''}</td></tr>`;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Full student computation: PASS 1 (all profiles for stats + HTML)
 * + PASS 2 (server-side pagination override).
 * Mirrors renderApp() lines 335-501 exactly.
 *
 * @param {Object} allProfiles     — { [name]: profileDoc }
 * @param {Object} params
 * @param {string}   params.curTabId
 * @param {string}   params.selMonth
 * @param {string}   params.selBranch
 * @param {string}   params.search
 * @param {boolean}  params.isSingleBranch
 * @param {boolean}  params.isAdmin
 * @param {Object}   params.bStats          — finance bStats to AUGMENT (active/debt)
 * @param {Object|null} params.pgStudents
 * @param {boolean}  params.pgStudentsActive
 * @param {number}   params.activePage
 * @param {number}   params.debtPage
 * @param {number}   params.quitPage
 */
export function computeAndCacheStudents(allProfiles, params) {
    const {
        curTabId        = 'active',
        selMonth        = '',
        selBranch       = 'all',
        search          = '',
        isSingleBranch  = true,
        isAdmin         = false,
        bStats          = {},
        pgStudents      = null,
        pgStudentsActive = false,
        activePage      = 1,
        debtPage        = 1,
        quitPage        = 1,
    } = params;

    // ── Cache-hit detection ──
    // Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: thêm pagination version/count/page vào cache key
    // Đảm bảo khi pgState.currentItems thay đổi nhưng _dataVersion chưa tăng, cache bị invalidate.
    // _studentsPaginationVersion tăng mỗi khi _doLoad() thành công trong students.js.
    const pgVersion   = (window.__store || {})._studentsPaginationVersion || 0;
    const pgCount     = pgStudents?.currentItems?.length || 0;
    const pgPage      = pgStudents?.currentPage || 0;
    const activeRenderLimitKey = window.__activeRenderLimit || 50;
    const debtRenderLimitKey   = window.__debtRenderLimit   || 50;
    // Phase 4K-6E-C: Include active-new-filter and admission month in cache key
    const activeNewFilterKey = typeof window.getActiveStudentNewFilter === 'function'
        ? window.getActiveStudentNewFilter()
        : (window.__activeStudentNewFilter || 'all');
    const admissionMonthKey = typeof window.getCurrentAdmissionMonth === 'function'
        ? window.getCurrentAdmissionMonth()
        : new Date().toISOString().slice(0, 7);
    const paramsKey   = `${curTabId}|${selMonth}|${selBranch}|${search}|${activePage}|${debtPage}|${quitPage}|${pgStudentsActive ? '1' : '0'}|pgv:${pgVersion}|pgc:${pgCount}|pgp:${pgPage}|arl:${activeRenderLimitKey}|drl:${debtRenderLimitKey}|anf:${activeNewFilterKey}|adm:${admissionMonthKey}`;
    const dataVersion = (window.__store || {})._dataVersion || 0;
    if (
        _cache.summary !== null &&
        _cache.paramsKey   === paramsKey &&
        _cache.dataVersion === dataVersion
    ) {
        _metrics.cacheHits++;
        window.PerformanceMonitor?.record('render:students.cacheHit', 0, { tab: curTabId });
        return;
    }

    const t0 = performance.now();
    _metrics.computations++;

    // ── Page limits ──
    const _PAGE_LIMIT   = 50;
    const _activeLimit  = window.__activeRenderLimit || activePage * _PAGE_LIMIT;
    const _debtLimit    = window.__debtRenderLimit || debtPage * _PAGE_LIMIT;
    const _quitLimit    = quitPage   * _PAGE_LIMIT;

    let _activeTotalCount = 0, _debtTotalCount = 0, _quitTotalCount = 0;
    let _activeRendered   = 0, _debtRendered   = 0, _quitRendered   = 0;
    let activeCount = 0, debtCount = 0;
    let m_active_theo = 0, m_new = 0, m_quit = 0, m_skipped = 0;
    let totalDebtEst  = 0;

    // ── Decide which HTML sections to build (hidden-tab skip) ──
    const buildActive = curTabId === 'active';
    const buildDebt   = curTabId === 'debt';
    const buildQuit   = curTabId === 'quit';
    // Phase 4K-6V5Q: one quit source/filter boundary for computation, search,
    // direct render and pagination. No shared active/search page can override it.
    const _quitBoundaryEntries = buildQuit && window.QuitProfileBoundary?.getEntries
        ? window.QuitProfileBoundary.getEntries({
            search,
            branch: selBranch,
            reason: 'studentsRenderer.compute'
          })
        : null;
    const _useQuitBoundary = Array.isArray(_quitBoundaryEntries);

    // Phase 4K-5J-3: Khai báo trước PASS 1 để tránh TDZ ReferenceError
    // Biến này dùng trong vòng lặp PASS 1 — phải khai báo tại đây, không được ở sau PASS 2
    const fullProfilesCount = Object.keys(allProfiles || {}).length;
    const useFullProfileActiveRender = buildActive && fullProfilesCount > 0 && !search;
    // Phase 4K-6V4B2: Quit tab must prefer the full/lazy quit profile store.
    // Pagination currentItems can belong to the Active tab or only one server page;
    // using it here causes missing quit students even when allProfiles already has them.
    const useFullProfileQuitRender = buildQuit && (_useQuitBoundary || fullProfilesCount > 0);

    if (!buildActive && !buildDebt && !buildQuit) {
        _metrics.skippedHiddenTab++;
    }

    let activeRows = buildActive ? '' : null;
    let debtRows   = buildDebt   ? '' : null;
    let quitRows   = buildQuit   ? '' : null;

    // Phase 4K-6V5U3: Debt qualification/calculation stays in PASS 1 exactly as
    // before. When search is non-empty we only collect already-qualified rows,
    // rank that presentation copy once, then render. Blank search keeps the
    // original newest-first/debt ordering byte-for-byte through the old path.
    const _debtSearchCandidates = buildDebt && String(search || '').trim() ? [] : null;

    // ── Pre-compute nameNCount for year-badge disambiguation ──
    const nameNCount = {};
    Object.keys(allProfiles).forEach(n => {
        const k = _strip(n);
        nameNCount[k] = (nameNCount[k] || 0) + 1;
    });
    if (_useQuitBoundary) {
        _quitBoundaryEntries.forEach(([n]) => {
            const k = _strip(n);
            nameNCount[k] = Math.max(1, nameNCount[k] || 0);
        });
    }

    // ── PASS 1: Full iteration for stats + debt calc + non-paginated display ──
    // Phase 4K-6E-C: Sort current-month-new first, then newest-first by join timestamp
    const _profileEntriesRaw = Object.entries(allProfiles || {});
    const _profileEntries = typeof window.sortActiveStudentEntries === 'function'
        ? window.sortActiveStudentEntries(_profileEntriesRaw, {
            currentMonth: typeof window.getCurrentAdmissionMonth === 'function'
                ? window.getCurrentAdmissionMonth()
                : ''
        })
        : _profileEntriesRaw.sort(([nameA, profA], [nameB, profB]) => {
            const ta = typeof window.getStudentJoinTimestamp === 'function'
                ? window.getStudentJoinTimestamp(nameA, profA)
                : 0;
            const tb = typeof window.getStudentJoinTimestamp === 'function'
                ? window.getStudentJoinTimestamp(nameB, profB)
                : 0;
            if (tb !== ta) return tb - ta;
            return String(nameA).localeCompare(String(nameB), 'vi');
        });
    _profileEntries.forEach(([name, p]) => {
        if (!p) return;

        // Phase 4K-STUDENT-LIST: Dùng classifier chung — xử lý data cũ thiếu status
        // Áp dụng nhất quán cho active list, debt list, quit list, active count, quit count
        const _pKind  = window.classifyProfileStatus
            ? window.classifyProfileStatus(p)
            : classifyProfileStatus(p);
        const isQuit  = _pKind === 'quit';
        const isActive = !isQuit;
        const safeBranch  = p.branch || 'CS1';
        const yrBadge     = _getYrBadge(name, p, nameNCount);
        const beltHTML    = getBeltBadge(p.belt);
        const branchTdHTML = isSingleBranch
            ? ''
            : `<td><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${_getBrN(safeBranch)}</span></td>`;

        if (isActive) {
            m_active_theo++;
            if (bStats[safeBranch]) bStats[safeBranch].active++;
            activeCount++;

            const paidBadge = p.paidUntil
                ? `<span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[0.7rem]">${formatMonth(p.paidUntil)}</span>`
                : `<span class="badge bg-rose-50 text-rose-600 border border-rose-200 text-[0.7rem]">Chưa thu</span>`;
            // Phase 4K-6E-C: Badge MỚI dùng tháng thực tế hiện tại, không theo filterMonth
            const isCurrentNew = typeof window.isCurrentMonthNewStudent === 'function'
                ? window.isCurrentMonthNewStudent(name, p)
                : (p.createdAt && String(p.createdAt).slice(0, 7) === new Date().toISOString().slice(0, 7));
            const newBadge = isCurrentNew
                ? `<span class="badge bg-blue-100 text-blue-600 text-[0.6rem] ml-1">MỚI</span>`
                : '';
            const nickBadge = p.nickname
                ? `<span class="text-[0.7rem] text-slate-400 ml-1">(${p.nickname})</span>`
                : '';
            // Phase 4K-6V4C2: skipped-month summary must use canonical month
            // normalization. Raw includes(selMonth) hides values like "Tháng Sáu 2026".
            const isSkipped = _monthList(p.skippedMonths).includes(normalizeYYYYMM(selMonth));
            if (isSkipped) m_skipped++;

            // Phase 4K-6V4B11: split shared filters from Active-only filters.
            // Debt list must obey branch + search + overdue filter, but must NOT be
            // hidden by Active tab's "new/returning student" filter.
            let branchPassFilter = true;
            if (!isSingleBranch && !_branchMatchesFilter(safeBranch, selBranch)) branchPassFilter = false;
            let searchPassFilter = true;
            // Phase 4K-2B PASS 1: Dùng getProfileSearchBlob() — pre-normalized blob, không normalize lại mỗi vòng lặp
            if (search) {
                const q = window.normalizeVNForSearch
                    ? window.normalizeVNForSearch(search)
                    : String(search || '').toLowerCase().trim();
                const blob = typeof window.getProfileSearchBlob === 'function'
                    ? window.getProfileSearchBlob(name, p)
                    : _fallbackProfileBlob(name, p);
                if (q && !blob.includes(q)) searchPassFilter = false;
            }
            const sharedPassFilter = branchPassFilter && searchPassFilter;
            let activePassFilter = sharedPassFilter;

            // Phase 4K-6E-C: Apply active new student filter ONLY to active list.
            if (
                activePassFilter &&
                typeof window.shouldShowActiveStudentByNewFilter === 'function' &&
                !window.shouldShowActiveStudentByNewFilter(name, p)
            ) {
                activePassFilter = false;
            }

            if (activePassFilter) {
                _activeTotalCount++;
                if ((!pgStudentsActive || useFullProfileActiveRender) && buildActive && _activeRendered < _activeLimit) {
                    _activeRendered++;
                    activeRows += renderActiveRow(name, p, {
                        beltHTML, branchTdHTML, yrBadge, newBadge, nickBadge, paidBadge, isAdmin,
                    });
                }
            }

            // Phase 4K-6E-C: m_new dựa trên tháng thực tế, không theo filterMonth
            if (isCurrentNew) m_new++;

            // ── Debt check — canonical tuition months only ──
            // Phase 4K-6V4B7: legacy isOwed/owedMonths may be stale and must not
            // suppress a real debt. A student paid through 05/2026 must appear in
            // 06/2026 even when isOwed=false or owedMonths=[] was left by old code.
            let isDebt = false, unpaidMonthsCount = 0, owedMonths = [];

            if (!p.feeExempt) {
                owedMonths = typeof window.getChargeableTuitionMonths === 'function'
                    ? window.getChargeableTuitionMonths(p, selMonth, { reason: 'studentsRenderer.debt-list' })
                    : _fallbackChargeableTuitionMonths(p, selMonth);
                unpaidMonthsCount = owedMonths.length;
                isDebt = unpaidMonthsCount > 0;
            }

            if (isDebt) {
                // Phase 4K-6V4B11: Báo nợ chỉ dùng filter chung branch/search.
                // Không dùng activePassFilter vì filter "võ sinh mới/quay lại" của tab
                // Đang tập có thể làm ẩn võ sinh nợ thật.
                const debtPassFilter = sharedPassFilter;
                // Phase 4K-5J-1: overdue months filter
                const _debtOverdueMin = typeof window.getDebtOverdueFilterValue === 'function'
                    ? window.getDebtOverdueFilterValue() : 0;
                const passDebtOverdueFilter = !_debtOverdueMin || unpaidMonthsCount >= _debtOverdueMin;
                if (debtPassFilter && passDebtOverdueFilter) {
                    debtCount++;
                    if (bStats[safeBranch] !== undefined) bStats[safeBranch].debt++;
                    const totalDebtAmount = unpaidMonthsCount * (Number(p.tuitionFee) || 0);
                    totalDebtEst += totalDebtAmount;
                    _debtTotalCount++;
                    if (buildDebt) {
                        const owedMonthsStr = owedMonths.join(',') || selMonth;
                        const renderOptions = {
                            unpaidMonthsCount, owedMonthsStr, branchTdHTML, isAdmin, selMonth, yrBadge,
                        };
                        if (_debtSearchCandidates) {
                            _debtSearchCandidates.push({ name, profile: p, renderOptions });
                        } else if (_debtRendered < _debtLimit) {
                            _debtRendered++;
                            debtRows += renderDebtRow(name, p, renderOptions);
                        }
                    }
                }
            }
        } else {
            if (p.quitDate && p.quitDate.substring(0, 7) === selMonth) m_quit++;
            if (!_useQuitBoundary && (!pgStudentsActive || useFullProfileQuitRender) && buildQuit) {
                _quitTotalCount++;
                if (_quitRendered < _quitLimit) {
                    _quitRendered++;
                    quitRows += renderQuitRow(name, p, { beltHTML, branchTdHTML, yrBadge, isAdmin });
                }
            }
        }
    });

    if (_debtSearchCandidates) {
        const rankedDebtCandidates = rankStudentNameSearchResults(
            _debtSearchCandidates,
            search,
            candidate => _profileDisplayName(candidate.name, candidate.profile)
        );
        _debtRendered = Math.min(rankedDebtCandidates.length, _debtLimit);
        debtRows = rankedDebtCandidates
            .slice(0, _debtLimit)
            .map(candidate => renderDebtRow(candidate.name, candidate.profile, candidate.renderOptions))
            .join('');
    }

    if (_useQuitBoundary) {
        quitRows = '';
        _quitTotalCount = _quitBoundaryEntries.length;
        _quitRendered = 0;
        _quitBoundaryEntries.slice(0, _quitLimit).forEach(([name, p]) => {
            const safeBranch = p.branch || p.branchCode || 'CS1';
            const yrBadge = _getYrBadge(name, p, nameNCount);
            const beltHTML = getBeltBadge(p.belt);
            const branchTdHTML = isSingleBranch
                ? ''
                : `<td><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${_getBrN(safeBranch)}</span></td>`;
            _quitRendered++;
            quitRows += renderQuitRow(name, p, { beltHTML, branchTdHTML, yrBadge, isAdmin });
        });
    }

    // ── PASS 2 (Phase 3.2A): Override active from server-side pagination only
    // Phase 4K-6V4B2: Do NOT override quit rows when full/lazy quit profiles exist.
    // Otherwise #quitList can lose names because pgStudents.currentItems may be an
    // active page or a partial status-query page.
    // useFullProfileActiveRender declared before PASS 1 to avoid TDZ ReferenceError
    if (pgStudentsActive && pgStudents && !useFullProfileActiveRender && !useFullProfileQuitRender) {
        activeRows = buildActive ? '' : null;
        quitRows   = buildQuit   ? '' : null;
        _activeTotalCount = 0;
        _quitTotalCount   = 0;

        pgStudents.currentItems.forEach(item => {
            const name = item.id;
            const p    = allProfiles[name] || item;
            if (!p) return;

            // Phase 4K-STUDENT-LIST: Dùng classifier chung trong PASS 2 (pagination override)
            const _pKind2  = window.classifyProfileStatus
                ? window.classifyProfileStatus(p)
                : classifyProfileStatus(p);
            const isQuit  = _pKind2 === 'quit';
            const isActive = !isQuit;
            const safeBranch  = p.branch || 'CS1';
            const yrBadge     = _getYrBadge(name, p, nameNCount);
            const beltHTML    = getBeltBadge(p.belt);
            const branchTdHTML = isSingleBranch
                ? ''
                : `<td><span class="badge bg-slate-100 text-slate-600 border border-slate-200">${_getBrN(safeBranch)}</span></td>`;

            if (isActive) {
                let passFilter = true;
                if (!isSingleBranch && selBranch !== 'all' && safeBranch !== selBranch) passFilter = false;
                // Phase 4K-2B PASS 2: Dùng getProfileSearchBlob() — same pattern as PASS 1
                if (search) {
                    const q = window.normalizeVNForSearch
                        ? window.normalizeVNForSearch(search)
                        : String(search || '').toLowerCase().trim();
                    const blob = typeof window.getProfileSearchBlob === 'function'
                        ? window.getProfileSearchBlob(name, p)
                        : _fallbackProfileBlob(name, p);
                    if (q && !blob.includes(q)) passFilter = false;
                }

                if (passFilter) {
                    _activeTotalCount++;
                    const paidBadge = p.paidUntil
                        ? `<span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[0.7rem]">${formatMonth(p.paidUntil)}</span>`
                        : `<span class="badge bg-rose-50 text-rose-600 border border-rose-200 text-[0.7rem]">Chưa thu</span>`;
                    // Phase 4K-6E-C: Badge MỚI dùng tháng thực tế, không theo filterMonth (PASS 2)
                    const _p2IsCurrentNew = typeof window.isCurrentMonthNewStudent === 'function'
                        ? window.isCurrentMonthNewStudent(name, p)
                        : (p.createdAt && String(p.createdAt).slice(0, 7) === new Date().toISOString().slice(0, 7));
                    const newBadge = _p2IsCurrentNew
                        ? `<span class="badge bg-blue-100 text-blue-600 text-[0.6rem] ml-1">MỚI</span>`
                        : '';
                    const nickBadge = p.nickname
                        ? `<span class="text-[0.7rem] text-slate-400 ml-1">(${p.nickname})</span>`
                        : '';
                    if (buildActive) {
                        activeRows += renderActiveRow(name, p, {
                            beltHTML, branchTdHTML, yrBadge, newBadge, nickBadge, paidBadge, isAdmin,
                        });
                    }
                }
            } else if (buildQuit) {
                _quitTotalCount++;
                quitRows += renderQuitRow(name, p, { beltHTML, branchTdHTML, yrBadge, isAdmin });
            }
        });
    }

    // ── [GITHUB-FIX Task 3] Pagination-based fallback summary ──────────────
    // Khi pagination có rows nhưng allProfiles rỗng (chưa hydrate),
    // tính activeCount/debtCount tối thiểu từ pageItems để badge không hiển thị 0 sai.
    // Đây là fallback an toàn — nguồn chính vẫn là full profiles.
    const allProfileCount = Object.keys(allProfiles || {}).length;
    const pageItems = Array.isArray(pgStudents && pgStudents.currentItems ? pgStudents.currentItems : [])
        ? (pgStudents && pgStudents.currentItems ? pgStudents.currentItems : [])
        : [];

    if (pgStudentsActive && allProfileCount === 0 && pageItems.length > 0) {
        let pageActive = 0;
        let pageQuit   = 0;
        let pageDebt   = 0;
        let pageDebtEst = 0;

        pageItems.forEach(function(item) {
            const kind = window.classifyProfileStatus
                ? window.classifyProfileStatus(item)
                : classifyProfileStatus(item);

            if (kind === 'quit') { pageQuit++; return; }
            pageActive++;

            if (!item.feeExempt) {
                const owed = typeof window.getChargeableTuitionMonths === 'function'
                    ? window.getChargeableTuitionMonths(item, selMonth, { reason: 'studentsRenderer.page-summary' })
                    : _fallbackChargeableTuitionMonths(item, selMonth);
                const unpaidMonthsCount = owed.length;
                if (unpaidMonthsCount > 0) {
                    pageDebt++;
                    pageDebtEst += unpaidMonthsCount * (Number(item.tuitionFee) || 0);
                }
            }
        });

        activeCount   = Math.max(activeCount,   pageActive);
        debtCount     = Math.max(debtCount,     pageDebt);
        totalDebtEst  = Math.max(totalDebtEst,  pageDebtEst);
        m_active_theo = Math.max(m_active_theo, pageActive);

        if (window.__store) {
            window.__store._summaryPartialFromPagination = true;
        }
    }

    // ── Append "Load more" fallback buttons — mirrors render.js lines 494-501 ──
    // Buttons are stored as part of the cached HTML so islands render the complete list.
    const _moreColspan = isSingleBranch ? 8 : 9;
    const _moreStyle   = 'style="padding:10px;text-align:center;"';
    const _moreBtnSt   = 'class="btn-sm" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;font-size:0.78rem;cursor:pointer;"';
    // Phase 4K-5J-1: BÁO NỢ load more tách riêng — không phụ thuộc pgStudentsActive
    if (buildDebt && _debtTotalCount > _debtRendered) {
        const _remainDebt = _debtTotalCount - _debtRendered;
        debtRows += (typeof window.renderLoadMoreRow === 'function')
            ? window.renderLoadMoreRow({ listId: 'debtList', label: 'võ sinh nợ', remaining: _remainDebt, colspan: _moreColspan, onclick: 'window.loadMoreDebtRows(event)' })
            : `<tr class="load-more-row" data-load-more-for="debtList"><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnSt} onclick="window.loadMoreDebtRows(event)">⬇ Tải thêm — còn ${_remainDebt} võ sinh nợ nữa</button></td></tr>`;
    }

    // Phase 4K-5Q: DISABLED — active load-more row inside table removed.
    // Single source of truth is #pgWrap_activeList (outside table), rendered by _injectControls.
    // if (buildActive && _activeTotalCount > _activeRendered) { ... }

    // Quit load more — chỉ khi không có server-side pagination
    if (!pgStudentsActive || useFullProfileQuitRender) {
        if (buildQuit && _quitTotalCount > _quitLimit) {
            quitRows += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnSt} onclick="_loadMore('quit')">⬇ Tải thêm — còn ${_quitTotalCount - _quitRendered} võ sinh nữa</button></td></tr>`;
        }
    }

    // ── Phase 4K-6V3D: debt coverage quality from the canonical read boundary ──
    const _boundaryStatus = typeof window.getDebtProfileCoverageStatus === 'function'
        ? window.getDebtProfileCoverageStatus()
        : null;
    const _boundaryReady = !!(_boundaryStatus && (
        _boundaryStatus.configVerified ||
        _boundaryStatus.sessionVerified ||
        String(_boundaryStatus.source || '').includes('full-fallback')
    ));
    const _legacyPartialSignal = Object.keys(allProfiles || {}).length <=
        ((pgStudents && pgStudents.currentItems ? pgStudents.currentItems.length : 0));
    const _debtSourceQuality = {
        profilesCount:       Object.keys(allProfiles || {}).length,
        paginationItems:     pgStudents ? (pgStudents.currentItems ? pgStudents.currentItems.length : 0) : 0,
        debtMayBePartial:    buildDebt && (_boundaryStatus ? !_boundaryReady : _legacyPartialSignal),
        coverageReady:       _boundaryReady,
        source:              _boundaryStatus ? (_boundaryStatus.source || 'unknown') : 'legacy-diagnostic',
    };
    if (window.__store) window.__store._lastDebtSourceQuality = _debtSourceQuality;
    if (buildDebt && _debtSourceQuality.debtMayBePartial && _debtSourceQuality.profilesCount > 0) {
        console.warn('[debt-list] Debt profile coverage is not verified yet',
            '(profiles:', _debtSourceQuality.profilesCount,
            ', source:', _debtSourceQuality.source, ')');
        if (typeof window.ensureDebtProfilesReady === 'function') {
            setTimeout(function() { window.ensureDebtProfilesReady('debt-partial-auto-trigger'); }, 800);
        }
    }

    // ── Store in module-local cache ──
    if (buildActive) _cache.activeRows = activeRows;
    if (buildDebt)   _cache.debtRows   = debtRows;
    if (buildQuit)   _cache.quitRows   = quitRows;

    _cache.summary = {
        activeCount, debtCount, totalDebtEst,
        m_active_theo, m_new, m_quit, m_skipped,
        activeTotalCount:  _activeTotalCount,
        debtTotalCount:    _debtTotalCount,
        quitTotalCount:    _quitTotalCount,
        activeRendered:    _activeRendered,
        debtRendered:      _debtRendered,
        quitRendered:      _quitRendered,
        activeLimit:       _activeLimit,
        debtLimit:         _debtLimit,
        quitLimit:         _quitLimit,
        pgStudentsActive,
    };
    _cache.paramsKey   = paramsKey;
    _cache.dataVersion = dataVersion;

    const ms = performance.now() - t0;
    _metrics.lastComputeMs = ms;
    if (_shouldWarnStudentCompute(ms)) {
        console.warn(`[studentsRenderer] 🐢 Slow computation: ${ms.toFixed(1)}ms (${Object.keys(allProfiles).length} profiles)`);
    }
    // Phase 4K-6A: record render performance
    window.PerformanceMonitor?.record('render:students.compute', ms, {
        tab:        curTabId,
        activeTotal: _activeTotalCount,
        debtTotal:   _debtTotalCount,
        quitTotal:   _quitTotalCount,
        cacheHit:    false
    });

    // ── [Phase 3.7C+D] Large list safety — track row counts per list ─────────
    // Virtualization boundary: mỗi list section (activeList, debtList, quitList)
    // là một isolated render boundary. Khi rowCount > 500, sẽ warn để chuẩn bị
    // virtual rendering trong Phase sau. KHÔNG block render, KHÔNG thay đổi output.
    //
    // Boundary markers (cho future virtual rendering):
    //   START: students.activeList  → vị trí bắt đầu render active rows
    //   START: students.debtList   → vị trí bắt đầu render debt rows
    //   START: students.quitList   → vị trí bắt đầu render quit rows
    //   END:   mỗi section kết thúc ở load-more button (nếu có) hoặc cuối rows
    if (typeof window.trackLargeListRender === 'function') {
        if (buildActive) {
            window.trackLargeListRender('students.activeList', _activeTotalCount, 'computeAndCacheStudents');
        }
        if (buildDebt) {
            window.trackLargeListRender('students.debtList', _debtTotalCount, 'computeAndCacheStudents');
        }
        if (buildQuit) {
            window.trackLargeListRender('students.quitList', _quitTotalCount, 'computeAndCacheStudents');
        }
    }
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * @param {'activeRows'|'debtRows'|'quitRows'} section
 * @returns {string}
 */
export function getStudentsCachedHtml(section) {
    return _cache[section] || '';
}

/**
 * @returns {Object|null}
 */
export function getStudentsSummary() {
    return _cache.summary;
}

/**
 * @returns {Object}
 */
export function getStudentsMetrics() {
    return { ..._metrics };
}

/**
 * Phase 4K-STUDENT-RENDER-OVERWRITE-FIX: Cache metrics cho debug helper.
 * Expose via window.getStudentsCacheMetrics = getStudentsCacheMetrics trong renderStudents.js.
 * @returns {{ activeRowsLength: number, debtRowsLength: number, quitRowsLength: number, paramsKey: string|null, dataVersion: number }}
 */
export function getStudentsCacheMetrics() {
    return {
        activeRowsLength: typeof _cache.activeRows === 'string' ? _cache.activeRows.length : -1,
        debtRowsLength:   typeof _cache.debtRows   === 'string' ? _cache.debtRows.length   : -1,
        quitRowsLength:   typeof _cache.quitRows   === 'string' ? _cache.quitRows.length   : -1,
        paramsKey:        _cache.paramsKey   || null,
        dataVersion:      _cache.dataVersion || 0,
    };
}
