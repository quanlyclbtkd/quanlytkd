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

// ── Module-local branch-name helper ──────────────────────────────────────────
const _getBrN = (br) =>
    (window.getBranchNameDisplay && window.getBranchNameDisplay(br))
        ? window.getBranchNameDisplay(br)
        : br;

// ── Smart-name helpers (moved from render.js) ─────────────────────────────────
const _strip = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase();
const _disp  = (k) => k.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();

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
    return `<tr data-debt-id="${safeNameEsc}" ${rowBg}><td><span class="badge ${countBadgeCls}">${unpaidMonthsCount} Tháng</span></td><td>${lastPaidLabel}</td>${branchTdHTML}<td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEsc}')">${_disp(name)}${yrBadge}${isOverdue ? ' <span title="Nợ từ 2 tháng trở lên" class="text-rose-500">⚠️</span>' : ''}</td><td class="action-btns"><button type="button" class="btn-sm bg-indigo-50 text-indigo-700 border border-indigo-200" onclick="generateMultiMonthPaymentRequest('${safeNameEsc}', '${safeOwedMonths}', '${safeBranch}', '${totalDebtAmount}')">📱 QR</button>${isAdmin ? `<button type="button" class="btn-sm bg-emerald-600 text-white shadow-sm" onclick="openQuickPayModal('${safeNameEsc}', '${safeOwedMonths}', '${safeBranch}')">💰 Thu</button>` : ''}<button type="button" class="btn-sm bg-[#0068FF] text-white shadow-sm" onclick="copyAndOpenZalo('${safeNameEsc}', '${safeOwedMonths}', '${p.phone || ''}')">💬 Zalo</button>${isAdmin ? `<button type="button" class="btn-sm bg-slate-100 text-slate-700 border border-slate-200" onclick="handleQuitOption('${safeNameEsc}', '${selMonth}')">🚫</button>` : ''}</td></tr>`;
}

/**
 * Render a single quit student row.
 * Stable identity: data-quit-id="${name}"
 */
export function renderQuitRow(name, p, opts = {}) {
    const { beltHTML = '', branchTdHTML = '', yrBadge = '', isAdmin = false } = opts;
    const safeNameEsc = name.replace(/'/g, "\\'");
    return `<tr data-quit-id="${safeNameEsc}"><td class="name-link text-[0.95rem]" onclick="openProfile('${safeNameEsc}')">${_disp(name)}${yrBadge}</td><td class="text-[0.7rem] font-bold text-slate-500">${p.memberId || '-'}</td><td>${beltHTML}</td>${branchTdHTML}<td>${formatDate(p.dob)}</td><td>${formatDate(p.quitDate)}</td><td>${isAdmin ? `<button type="button" class="btn-sm bg-emerald-50 text-emerald-700 border border-emerald-200" onclick="openProfile('${safeNameEsc}')">🔄 Khôi phục</button>` : ''}</td></tr>`;
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
    const paramsKey   = `${curTabId}|${selMonth}|${selBranch}|${search}|${activePage}|${debtPage}|${quitPage}|${pgStudentsActive ? '1' : '0'}`;
    const dataVersion = (window.__store || {})._dataVersion || 0;
    if (
        _cache.summary !== null &&
        _cache.paramsKey   === paramsKey &&
        _cache.dataVersion === dataVersion
    ) {
        _metrics.cacheHits++;
        return;
    }

    const t0 = performance.now();
    _metrics.computations++;

    // ── Page limits ──
    const _PAGE_LIMIT   = 50;
    const _activeLimit  = activePage * _PAGE_LIMIT;
    const _debtLimit    = debtPage   * _PAGE_LIMIT;
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

    if (!buildActive && !buildDebt && !buildQuit) {
        _metrics.skippedHiddenTab++;
    }

    let activeRows = buildActive ? '' : null;
    let debtRows   = buildDebt   ? '' : null;
    let quitRows   = buildQuit   ? '' : null;

    // ── Pre-compute nameNCount for year-badge disambiguation ──
    const nameNCount = {};
    Object.keys(allProfiles).forEach(n => {
        const k = _strip(n);
        nameNCount[k] = (nameNCount[k] || 0) + 1;
    });

    // ── PASS 1: Full iteration for stats + debt calc + non-paginated display ──
    Object.keys(allProfiles).sort().forEach(name => {
        const p = allProfiles[name];
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
            const newBadge  = (p.createdAt && p.createdAt >= selMonth + '-01')
                ? `<span class="badge bg-blue-100 text-blue-600 text-[0.6rem] ml-1">MỚI</span>`
                : '';
            const nickBadge = p.nickname
                ? `<span class="text-[0.7rem] text-slate-400 ml-1">(${p.nickname})</span>`
                : '';
            const isSkipped = p.skippedMonths && p.skippedMonths.includes(selMonth);
            if (isSkipped) m_skipped++;

            let passFilter = true;
            if (!isSingleBranch && selBranch !== 'all' && safeBranch !== selBranch) passFilter = false;
            if (search && !name.toLowerCase().includes(search) &&
                !(p.nickname || '').toLowerCase().includes(search) &&
                !(p.memberId || '').toLowerCase().includes(search)) passFilter = false;

            if (passFilter) {
                _activeTotalCount++;
                if (!pgStudentsActive && buildActive && _activeRendered < _activeLimit) {
                    _activeRendered++;
                    activeRows += renderActiveRow(name, p, {
                        beltHTML, branchTdHTML, yrBadge, newBadge, nickBadge, paidBadge, isAdmin,
                    });
                }
            }

            if (p.createdAt && p.createdAt.substring(0, 7) === selMonth) m_new++;

            // ── Debt check (Phase 3: Cloud Function flags → client fallback) ──
            let isDebt = false, unpaidMonthsCount = 0, owedMonths = [];

            if (!p.feeExempt) {
                if (p.isOwed !== undefined) {
                    const allOwed = Array.isArray(p.owedMonths) ? p.owedMonths : [];
                    owedMonths = allOwed.filter(m => m <= selMonth);
                    isDebt = owedMonths.length > 0;
                    unpaidMonthsCount = owedMonths.length;
                } else {
                    if (!p.skippedMonths || !p.skippedMonths.includes(selMonth)) {
                        const _normPU = normalizeYYYYMM(p.paidUntil);
                        if (!_normPU || _normPU < selMonth) {
                            let firstUnpaid = _normPU
                                ? addMonthsToYYYYMM(_normPU, 1)
                                : (p.createdAt ? p.createdAt.substring(0, 7) : selMonth);
                            let cur = firstUnpaid;
                            while (cur <= selMonth && owedMonths.length < 24) {
                                if (!p.skippedMonths || !p.skippedMonths.includes(cur)) owedMonths.push(cur);
                                cur = addMonthsToYYYYMM(cur, 1);
                            }
                            unpaidMonthsCount = owedMonths.length;
                            if (unpaidMonthsCount > 0) isDebt = true;
                        }
                    }
                }
            }

            if (isDebt) {
                debtCount++;
                if (bStats[safeBranch] !== undefined) bStats[safeBranch].debt++;
                const totalDebtAmount = unpaidMonthsCount * (Number(p.tuitionFee) || 0);
                totalDebtEst += totalDebtAmount;
                _debtTotalCount++;
                if (buildDebt && _debtRendered < _debtLimit) {
                    _debtRendered++;
                    const owedMonthsStr = owedMonths.join(',') || selMonth;
                    debtRows += renderDebtRow(name, p, {
                        unpaidMonthsCount, owedMonthsStr, branchTdHTML, isAdmin, selMonth, yrBadge,
                    });
                }
            }
        } else {
            if (p.quitDate && p.quitDate.substring(0, 7) === selMonth) m_quit++;
            if (!pgStudentsActive && buildQuit) {
                _quitTotalCount++;
                if (_quitRendered < _quitLimit) {
                    _quitRendered++;
                    quitRows += renderQuitRow(name, p, { beltHTML, branchTdHTML, yrBadge, isAdmin });
                }
            }
        }
    });

    // ── PASS 2 (Phase 3.2A): Override active/quit from server-side pagination ──
    if (pgStudentsActive && pgStudents) {
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
                if (search && !name.toLowerCase().includes(search) &&
                    !(p.nickname || '').toLowerCase().includes(search) &&
                    !(p.memberId || '').toLowerCase().includes(search)) passFilter = false;

                if (passFilter) {
                    _activeTotalCount++;
                    const paidBadge = p.paidUntil
                        ? `<span class="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[0.7rem]">${formatMonth(p.paidUntil)}</span>`
                        : `<span class="badge bg-rose-50 text-rose-600 border border-rose-200 text-[0.7rem]">Chưa thu</span>`;
                    const newBadge  = (p.createdAt && p.createdAt >= selMonth + '-01')
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

    // ── Append "Load more" fallback buttons — mirrors render.js lines 494-501 ──
    // Buttons are stored as part of the cached HTML so islands render the complete list.
    const _moreColspan = isSingleBranch ? 8 : 9;
    const _moreStyle   = 'style="padding:10px;text-align:center;"';
    const _moreBtnSt   = 'class="btn-sm" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;font-size:0.78rem;cursor:pointer;"';
    if (!pgStudentsActive) {
        if (buildActive && _activeTotalCount > _activeLimit) {
            activeRows += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnSt} onclick="_loadMore('active')">⬇ Tải thêm — còn ${_activeTotalCount - _activeRendered} võ sinh nữa</button></td></tr>`;
        }
        if (buildDebt && _debtTotalCount > _debtLimit) {
            debtRows += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnSt} onclick="_loadMore('debt')">⬇ Tải thêm — còn ${_debtTotalCount - _debtRendered} võ sinh nữa</button></td></tr>`;
        }
        if (buildQuit && _quitTotalCount > _quitLimit) {
            quitRows += `<tr><td colspan="${_moreColspan}" ${_moreStyle}><button type="button" ${_moreBtnSt} onclick="_loadMore('quit')">⬇ Tải thêm — còn ${_quitTotalCount - _quitRendered} võ sinh nữa</button></td></tr>`;
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
    if (ms > 16) {
        console.warn(`[studentsRenderer] 🐢 Slow computation: ${ms.toFixed(1)}ms (${Object.keys(allProfiles).length} profiles)`);
    }

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
