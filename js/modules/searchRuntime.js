/**
 * js/modules/searchRuntime.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-2: Unified Search Runtime + Real Search Cache + SearchBlob
 * Phase 4K-6K-C: Adaptive fast search response + latency diagnostics
 *
 * Single #searchInput handler — tab-aware dispatch — real result cache
 * (key: tab|month|branch|normalizedTerm) — SearchBlob pre-compute for
 * profiles / transactions / inventory — stale request guard.
 *
 * Exports: initGlobalSearchRuntime, disposeGlobalSearchRuntime,
 *          getSearchRuntimeState, invalidateSearchCache
 * ────────────────────────────────────────────────────────────────
 */

import { StudentSearchIndex } from '../core/studentSearchIndex.js';

// ── Internal state ────────────────────────────────────────────────────────────

const _state = {
    // ── Phase 4K-5Q: Search Runtime V2 state ──────────────────────────────
    mounted:            false,
    inputEl:            null,
    inputHandler:       null,   // named handler ref — needed for removeEventListener
    compositionHandler: null,   // compositionstart ref
    compositionEndHandler: null,// compositionend ref
    compositionActive:  false,  // blocks input events during IME composition
    debounceMs:         450,    // V2 server-safe debounce (kept for compatibility checks)
    fastDebounceMs:     90,     // Phase 4K-6K-C: fast local/debt search response
    mediumDebounceMs:   150,    // Phase 4K-6K-C: finance/inventory local invalidation
    clearDebounceMs:    0,      // Phase 4K-6K-C: clear search immediately
    lastScheduledDelay: null,
    scheduledCount:     0,
    fastScheduledCount: 0,
    immediateRuns:      0,
    localStudentRuns:   0,
    studentIndexRuns:   0,
    studentIndexFallbacks: 0,
    lastStudentIndexResult: null,
    localDebtRuns:      0,
    localNonStudentRuns: 0,
    inFlight:           false,  // only one search in flight at a time
    queuedTerm:         null,   // latest term queued while inFlight
    errors:             [],     // recent error log (last 20)
    // ── Legacy / carried over ─────────────────────────────────────────────
    lastTerm:           '',
    lastTab:            '',
    lastRunAt:          0,
    runCount:           0,
    skippedSameTerm:    0,
    tabSwitchReplays:   0,
    forcedReplays:      0,
    lastReplay:         null,
    pendingTimer:       null,
    currentSearchToken: 0,
    cacheHits:          0,
    cacheMisses:        0,
    blobHits:           0,
    blobBuilds:         0,
    staleDropped:       0,
};

/** Phase 4K-2: Real search result cache — key: tab|month|branch|normalizedTerm
 *  Stored value: { at, items?, totalLoaded?, hasNext?, hasMore? }
 */
const _resultCache = new Map();

/** Phase 4K-2: SearchBlob cache — keyed by item identity (id or index) */
const _profileBlobCache = new Map();
const _txBlobCache      = new Map();
const _invBlobCache     = new Map();

// ── Filter helpers ─────────────────────────────────────────────────────────────

function _getFilterMonth() {
    const el = document.getElementById('filterMonth');
    return el ? el.value : '';
}

function _getFilterBranch() {
    const el = document.getElementById('filterBranch');
    return el ? el.value : '';
}

function _getCurrentTab() {
    if (typeof window.getCurrentActiveTabId === 'function') {
        return window.getCurrentActiveTabId();
    }
    const active = document.querySelector('.tab-content.active');
    return active ? active.id.replace(/^tab_/, '') : '';
}

function _normalizeSearch(raw) {
    if (typeof window.normalizeVNForSearch === 'function') {
        return window.normalizeVNForSearch(raw);
    }
    return String(raw || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase().trim().replace(/\s+/g, ' ');
}


function _searchTokens(raw) {
    return _normalizeSearch(raw).split(' ').filter(Boolean);
}

function _isPlainStudentGivenNameLookup(term, raw) {
    const q = _normalizeSearch(term);
    return !!q && !q.includes(' ') && /^[a-z]+$/.test(q) && !/[0-9@._-]/.test(String(raw || term || ''));
}

function _matchesGivenNameOnly(name, term) {
    const toks = _searchTokens(name);
    const q = _normalizeSearch(term);
    const last = toks[toks.length - 1] || '';
    return !!q && (last === q || (q.length >= 2 && last.startsWith(q)));
}

// ── Phase 4K-6K-C: Adaptive search latency helpers ──────────────────────────
function _getProfileCount() {
    try {
        const st = window.__store || {};
        if (st.profiles && typeof st.profiles === 'object') {
            return Object.keys(st.profiles).length;
        }
        if (window.studentProfileStore && typeof window.studentProfileStore.getAllProfilesCompat === 'function') {
            const compat = window.studentProfileStore.getAllProfilesCompat() || {};
            return Object.keys(compat).length;
        }
    } catch (_) {}
    return 0;
}

function _isStudentTab(tab) {
    return tab === 'active' || tab === 'quit';
}

function _getAdaptiveSearchDelay(raw, reason) {
    const tab = _getCurrentTab();
    const term = _normalizeSearch(raw);
    const rs = String(reason || '').toLowerCase();

    if (!term) return _state.clearDebounceMs;
    if (rs.includes('tab-switch-search-replay') || rs.includes('switch-tab-search-replay') || rs.includes('force')) return 0;
    if (term.length < 2) return Math.min(_state.fastDebounceMs, 80);

    // Fast path: student profiles are already hydrated locally, so no need to wait
    // 450ms before filtering the in-memory search blob cache.
    if (_isStudentTab(tab) && _getProfileCount() > 0) return _state.fastDebounceMs;

    // Debt / finance / inventory are local invalidation filters; keep them responsive
    // while still preventing excessive rerenders during fast typing.
    if (tab === 'debt') return 110;
    if (tab === 'tx' || tab === 'expense' || tab === 'inventory') return _state.mediumDebounceMs;

    // Server/potential fallback paths keep the conservative debounce.
    return _state.debounceMs;
}

function _recordScheduledDelay(delay, raw, reason) {
    _state.scheduledCount++;
    _state.lastScheduledDelay = delay;
    if (delay <= _state.fastDebounceMs) _state.fastScheduledCount++;
    if (delay === 0) _state.immediateRuns++;
    window.__searchRuntimeLatency = window.__searchRuntimeLatency || {
        recent: [], byDelay: {}, scheduledCount: 0, fastScheduledCount: 0
    };
    const lat = window.__searchRuntimeLatency;
    lat.scheduledCount++;
    if (delay <= _state.fastDebounceMs) lat.fastScheduledCount++;
    lat.byDelay[delay] = (lat.byDelay[delay] || 0) + 1;
    lat.recent.push({ at: Date.now(), delay, reason: reason || '', termLength: String(raw || '').length, tab: _getCurrentTab() });
    if (lat.recent.length > 30) lat.recent.shift();
}

// Phase 4K-2B: Domain-aware cache keys for correct invalidation by domain
function _domainForTab(tab) {
    if (tab === 'active' || tab === 'quit' || tab === 'debt') return 'students';
    if (tab === 'tx' || tab === 'expense') return 'finance';
    if (tab === 'inventory') return 'inventory';
    if (tab === 'dashboard') return 'dashboard';
    return 'misc';
}

function _cacheKey(tab, term) {
    const domain = _domainForTab(tab);
    return `${domain}:${tab}|${_getFilterMonth()}|${_getFilterBranch()}|${term}`;
}

// ── Phase 4K-2: SearchBlob builders ───────────────────────────────────────────

/**
 * Build a pre-normalized search blob string for a student profile.
 * Concatenates all searchable fields into one lowercase, accent-stripped string.
 * Cached by profile key (name or id) until invalidated.
 *
 * @param {string} name   — profile key (student name / id)
 * @param {object} profile — profile data object
 * @returns {string} normalized blob for substring matching
 */
function getProfileSearchBlob(name, profile) {
    const cacheKey = String(name || '');
    if (_profileBlobCache.has(cacheKey)) {
        _state.blobHits++;
        return _profileBlobCache.get(cacheKey);
    }
    _state.blobBuilds++;
    const p = profile || {};
    const parts = [
        name,
        p.name,
        p.fullName,
        p.studentName,
        p.nickname,
        p.memberId,
        p.studentCode,
        p.code,
        p.idCode,
        p.vtfCode,
        p.vtfId,
        p.vtf,
        p.vtfMemberId,
        p.maVTF,
        p.maVtf,
        p.maHoiVienVTF,
        p.maHoiVienVtf,
        p.belt,
        p.notes,
        p.phone,
        p.parentPhone,
        p.contactPhone,
        p.guardianPhone,
        p.address,
        p.email,
        p.branchCode,
        p.branch,
        p.branchName,
    ];
    const blob = parts
        .filter(Boolean)
        .map(v => _normalizeSearch(String(v)))
        .join(' ');
    _profileBlobCache.set(cacheKey, blob);
    return blob;
}

/**
 * Build a pre-normalized search blob string for a transaction record.
 *
 * @param {object} tx — transaction data
 * @returns {string} normalized blob
 */
function getTransactionSearchBlob(tx) {
    const t = tx || {};
    const cacheKey = String(t.id || t._id || '');
    if (cacheKey && _txBlobCache.has(cacheKey)) {
        _state.blobHits++;
        return _txBlobCache.get(cacheKey);
    }
    _state.blobBuilds++;
    // Phase 4K-5E: Include bundle fields + component fields for bundle search
    const _compParts = Array.isArray(t.components) ? t.components.flatMap(function(c) {
        return [
            c.label, c.type, c.kind, c.category, c.size, c.examTitle,
            Array.isArray(c.packageMonths) ? c.packageMonths.join(' ') : '',
        ];
    }) : [];
    const parts = [
        t.desc,
        t.description,
        t.name,
        t.type,
        t.branch,
        t.note,
        t.notes,
        t.studentName,
        t.memberId,
        t.bundleTypeLabel,
        t.bundleSummaryLine,
        t.componentSummary,
        t.examTitle,
        Array.isArray(t.packageMonths) ? t.packageMonths.join(' ') : '',
        ..._compParts,
    ];
    const blob = parts
        .filter(Boolean)
        .map(v => _normalizeSearch(String(v)))
        .join(' ');
    if (cacheKey) _txBlobCache.set(cacheKey, blob);
    return blob;
}

/**
 * Build a pre-normalized search blob string for an inventory item.
 *
 * @param {object} item — inventory item data
 * @returns {string} normalized blob
 */
function getInventorySearchBlob(item) {
    const t = item || {};
    const cacheKey = String(t.id || t._id || '');
    if (cacheKey && _invBlobCache.has(cacheKey)) {
        _state.blobHits++;
        return _invBlobCache.get(cacheKey);
    }
    _state.blobBuilds++;
    const parts = [
        t.desc,
        t.description,
        t.name,
        t.type,
        t.size,
        t.category,
        t.notes,
        t.examTitle,
        t.branch,
    ];
    const blob = parts
        .filter(Boolean)
        .map(v => _normalizeSearch(String(v)))
        .join(' ');
    if (cacheKey) _invBlobCache.set(cacheKey, blob);
    return blob;
}

// ── Phase 4K-2: Cache hit apply ───────────────────────────────────────────────

/**
 * Apply a cached search result for active/quit tabs: restore cached
 * pagination items into pgState and trigger render without Firestore.
 */
// Phase 4K-2C: Accept tab param so cache hit renders the CORRECT list (activeList vs quitList)
function _applyCachedStudentResult(cached, tab) {
    try {
        const pgState = window.__store &&
                        window.__store.pagination &&
                        window.__store.pagination.students;
        if (!pgState) return false;
        if (!Array.isArray(cached.items)) return false;

        pgState.currentItems = cached.items;
        pgState.totalLoaded  = cached.totalLoaded != null ? cached.totalLoaded : cached.items.length;
        pgState.hasNext      = !!cached.hasNext;
        pgState.hasPrevious  = false;
        pgState.searchActive = true;
        pgState.enabled      = true;

        if (window.__store) {
            window.__store._studentsPaginationVersion = (window.__store._studentsPaginationVersion || 0) + 1;
            window.__store._dataVersion = (window.__store._dataVersion || 0) + 1;
        }

        // Phase 4K-2C: Render the correct list based on current tab
        const listKey = tab === 'quit' ? 'students.quitList' : 'students.activeList';
        const _keys = [listKey, 'dashboard.summary'];
        if (typeof window.refreshListsComputation === 'function') {
            window.refreshListsComputation(_keys, 'search-cache-hit');
        }
        if (typeof window.invalidateList === 'function') {
            window.invalidateList(listKey, 'search-cache-hit');
        } else if (typeof window.invalidateStudents === 'function') {
            window.invalidateStudents('search-cache-hit');
        }
        return true;
    } catch (_e) {
        return false;
    }
}

// ── Tab-aware dispatch ─────────────────────────────────────────────────────────

async function _dispatchSearch(rawTerm) {
    const tab  = _getCurrentTab();
    const term = _normalizeSearch(rawTerm);

    // Skip nếu cùng term + cùng tab từ lần trước
    if (term === _state.lastTerm && tab === _state.lastTab && term !== '') {
        _state.skippedSameTerm++;
        console.debug('[SearchRuntime] skip — same term+tab:', term, tab);
        return;
    }

    // Phase 4K-2: Real cache check — includes pagination items for student tabs
    const ck = _cacheKey(tab, term);
    if (term !== '' && _resultCache.has(ck)) {
        const cached = _resultCache.get(ck);
        console.debug('[SearchRuntime] cache hit:', ck);
        _state.cacheHits++;
        _state.lastTerm  = term;
        _state.lastTab   = tab;
        _state.lastRunAt = Date.now();
        _state.runCount++;

        if ((tab === 'active' || tab === 'quit') && Array.isArray(cached.items)) {
            // Restore cached items into pagination state — no Firestore round-trip
            _applyCachedStudentResult(cached, tab);
        } else {
            // Non-student tabs: just re-trigger current-tab render using computation cache
            _applyInvalidateForTabOnly(tab);
        }
        return;
    }

    _state.cacheMisses++;

    // Phase 4K-2: Stale request guard — each async dispatch gets its own token
    const token = ++_state.currentSearchToken;

    _state.lastTerm  = term;
    _state.lastTab   = tab;
    _state.lastRunAt = Date.now();
    _state.runCount++;

    console.debug('[SearchRuntime] dispatch term=%o tab=%o token=%o', term, tab, token);

    // Guard: if a newer request arrived while we were waiting, abort
    if (token !== _state.currentSearchToken) {
        _state.staleDropped++;
        console.debug('[SearchRuntime] stale drop before dispatch — token', token);
        return;
    }

    const result = await _applyInvalidateForTab(tab, term, token);

    // Guard: stale check after await
    if (token !== _state.currentSearchToken) {
        _state.staleDropped++;
        console.debug('[SearchRuntime] stale drop after dispatch — token', token);
        return;
    }

    // Store real result in cache
    if (term !== '') {
        _resultCache.set(ck, Object.assign({ at: Date.now() }, result || {}));
    }
}

/**
 * Pure UI re-trigger for cache hits on non-student tabs (no Firestore).
 */
function _applyInvalidateForTabOnly(tab) {
    const invalidateCurrentTab = typeof window.invalidateCurrentTab === 'function'
        ? window.invalidateCurrentTab : null;
    const refreshKeys = typeof window.refreshListsComputation === 'function'
        ? window.refreshListsComputation : null;

    if (tab === 'debt') {
        if (refreshKeys) refreshKeys(['students.debtList'], 'search-cache-hit-debt');
        if (typeof window.invalidateList === 'function') window.invalidateList('students.debtList', 'search-cache-hit');
        return;
    }
    if (tab === 'tx' || tab === 'expense') {
        if (refreshKeys) refreshKeys(['tx.txList'], 'search-cache-hit-tx');
        if (invalidateCurrentTab) invalidateCurrentTab('search-cache-hit-tx');
        return;
    }
    if (tab === 'inventory') {
        if (refreshKeys) refreshKeys(['inventory.inventoryList', 'inventory.uniformTxList'], 'search-cache-hit-inv');
        if (invalidateCurrentTab) invalidateCurrentTab('search-cache-hit-inv');
        return;
    }
    if (invalidateCurrentTab) invalidateCurrentTab('search-cache-hit-tab');
}

/**
 * Execute a full tab-aware search dispatch (may call Firestore for student tabs).
 * Returns a result object to store in cache.
 */
// Phase 4K-2C: token passed through so students.js stale guard is actually armed
async function _applyInvalidateForTab(tab, term, token) {
    const invalidateList = typeof window.invalidateList === 'function'
        ? window.invalidateList : null;
    const invalidateCurrentTab = typeof window.invalidateCurrentTab === 'function'
        ? window.invalidateCurrentTab : null;
    const refreshKeys = typeof window.refreshListsComputation === 'function'
        ? window.refreshListsComputation : null;

    // Phase 4K-2: Student tabs — server-side pagination search
    if (tab === 'active' || tab === 'quit') {
        let result = { items: [], totalLoaded: 0, hasNext: false };
        if (typeof window.runStudentSearchPagination === 'function') {
            // Phase 4K-2C: pass token so students.js stale guard works
            await window.runStudentSearchPagination(term, { searchToken: token });
            // Capture result from pgState for caching
            try {
                const pgState = window.__store &&
                                window.__store.pagination &&
                                window.__store.pagination.students;
                if (pgState && Array.isArray(pgState.currentItems)) {
                    result = {
                        items:       pgState.currentItems.slice(),
                        totalLoaded: pgState.totalLoaded || pgState.currentItems.length,
                        hasNext:     !!pgState.hasNext,
                    };
                }
            } catch (_) {}
        }
        return result;
    }

    if (tab === 'debt') {
        if (refreshKeys) refreshKeys(['students.debtList'], 'search-debt');
        if (invalidateList) invalidateList('students.debtList', 'search-debt');
        return {};
    }

    if (tab === 'tx' || tab === 'expense') {
        if (refreshKeys) refreshKeys(['tx.txList'], 'search-tx');
        if (invalidateCurrentTab) invalidateCurrentTab('search-tx');
        return {};
    }

    if (tab === 'inventory') {
        if (refreshKeys) refreshKeys(['inventory.inventoryList', 'inventory.uniformTxList'], 'search-inventory');
        if (invalidateCurrentTab) invalidateCurrentTab('search-inventory');
        return {};
    }

    if (tab === 'dashboard') {
        if (refreshKeys) refreshKeys(['dashboard.summary'], 'search-dashboard');
        return {};
    }

    // Fallback — only invalidate current tab (not global refresh)
    if (invalidateCurrentTab) {
        invalidateCurrentTab('search-unknown-tab');
    }
    return {};
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Phase 4K-5Q: Search Runtime V2 — scheduler + latest-only queue ──────────

function _scheduleSearch(raw, reason) {
    clearTimeout(_state.pendingTimer);
    const delay = _getAdaptiveSearchDelay(raw, reason);
    _recordScheduledDelay(delay, raw, reason);
    if (delay <= 0) {
        _state.pendingTimer = null;
        Promise.resolve().then(function() { return _runSearchLatestOnly(raw, reason); });
        return;
    }
    _state.pendingTimer = setTimeout(function() {
        _runSearchLatestOnly(raw, reason);
    }, delay);
}

async function _runSearchLatestOnly(raw, reason, options = {}) {
    options = options || {};
    const term = _normalizeSearch(raw);
    const tab  = options.tab || _getCurrentTab();

    if (!options.force && term === _state.lastTerm && tab === _state.lastTab && term !== '') {
        _state.skippedSameTerm++;
        return;
    }

    if (!term) {
        _clearSearchV2ForTab(tab);
        return;
    }

    // Only 1 char — local-only, no server
    if (term.length < 2) {
        _runLocalOnlySearch(tab, term);
        return;
    }

    if (_state.inFlight) {
        _state.queuedTerm = raw;
        return;
    }

    _state.inFlight = true;
    const token = ++_state.currentSearchToken;
    _state.lastTerm  = term;
    _state.lastTab   = tab;
    _state.lastRunAt = Date.now();
    _state.runCount++;

    // Phase 4K-6A: đo hiệu năng search
    const _perfToken = window.PerformanceMonitor?.markStart('search:' + tab, {
        termLength: term.length,
        reason: reason
    });

    try {
        const _searchResult = await _dispatchSearchV2(term, tab, token);
        window.PerformanceMonitor?.markEnd('search:' + tab, _perfToken, {
            source:      _searchResult && _searchResult.source,
            resultCount: _searchResult && Array.isArray(_searchResult.items)
                ? _searchResult.items.length : undefined
        });
    } catch (err) {
        window.PerformanceMonitor?.markEnd('search:' + tab, _perfToken, { error: true });
        if (_state.errors.length > 20) _state.errors.shift();
        _state.errors.push({
            message: err && err.message || String(err),
            tab: tab, term: term, time: new Date().toISOString()
        });
        if (typeof window.recordRuntimeError === 'function') {
            window.recordRuntimeError('search-runtime-v2', err, { tab, term, reason });
        }
    } finally {
        _state.inFlight = false;
        if (_state.queuedTerm != null) {
            const next = _state.queuedTerm;
            _state.queuedTerm = null;
            _scheduleSearch(next, 'queued-latest');
        }
    }
}

function _runLocalOnlySearch(tab, term) {
    // For 1-char search — do local filter but no Firestore
    if (tab === 'debt') {
        _state.localDebtRuns++;
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['students.debtList'], 'search-v2-local-debt');
    } else if (tab === 'tx' || tab === 'expense') {
        _state.localNonStudentRuns++;
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['tx.txList'], 'search-v2-local-tx');
    } else if (tab === 'inventory') {
        _state.localNonStudentRuns++;
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['inventory.inventoryList', 'inventory.uniformTxList'], 'search-v2-local-inv');
    }
    // For active/quit with 1 char: skip, too broad
}

function _clearSearchV2ForTab(tab) {
    const st = window.__store || {};
    st._globalSearchTerm = '';
    st._dataVersion = (st._dataVersion || 0) + 1;
    _state.lastTerm = '';
    _state.lastTab  = '';

    if (st.pagination && st.pagination.students) {
        st.pagination.students.searchActive = false;
        st.pagination.students.searchQuery  = '';
    }

    if (tab === 'active' && typeof window.resetActiveRenderLimit === 'function') {
        window.resetActiveRenderLimit('search-clear');
    }

    if (typeof window.refreshListsComputation === 'function') {
        window.refreshListsComputation([
            'students.activeList',
            'students.quitList',
            'students.debtList',
            'tx.txList',
            'inventory.inventoryList',
            'inventory.uniformTxList'
        ], 'search-v2-clear');
    }

    if (typeof window.invalidateCurrentTab === 'function') {
        window.invalidateCurrentTab('search-v2-clear');
    }
}

async function _dispatchSearchV2(term, tab, token) {
    if (tab === 'active' || tab === 'quit') {
        return _searchStudentsV2(term, tab, token);
    }
    if (tab === 'debt') {
        _state.localDebtRuns++;
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['students.debtList'], 'search-v2-debt');
        if (typeof window.invalidateList === 'function')
            window.invalidateList('students.debtList', 'search-v2-debt');
        return {};
    }
    if (tab === 'tx' || tab === 'expense') {
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['tx.txList'], 'search-v2-tx');
        if (typeof window.invalidateCurrentTab === 'function')
            window.invalidateCurrentTab('search-v2-tx');
        return {};
    }
    if (tab === 'inventory') {
        const st = window.__store || {};
        st._globalSearchTerm = term;
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation(['inventory.inventoryList', 'inventory.uniformTxList'], 'search-v2-inventory');
        if (typeof window.invalidateCurrentTab === 'function')
            window.invalidateCurrentTab('search-v2-inventory');
        return {};
    }
    // Unknown tab — fall back to legacy dispatch
    return _applyInvalidateForTab(tab, term, token);
}

async function _searchStudentsV2(term, tab, token) {
    const st       = window.__store || {};
    const profiles = st.profiles || {};
    const profileCount = Object.keys(profiles).length;

    if (profileCount > 0) {
        _state.localStudentRuns++;

        // Phase 4K-6K-E: Unified Student Search Index Accuracy Gate.
        // Search local hydrated profiles through one shared index for consistent
        // name/phone/memberId/VTF matching across tabs without Firestore reads.
        let indexResult = null;
        try {
            if (window.StudentSearchIndex && typeof window.StudentSearchIndex.searchStudents === 'function') {
                indexResult = window.StudentSearchIndex.searchStudents(term, {
                    mode: tab,
                    branch: _getFilterBranch(),
                    limit: 100
                });
            } else if (StudentSearchIndex && typeof StudentSearchIndex.searchStudents === 'function') {
                indexResult = StudentSearchIndex.searchStudents(term, {
                    mode: tab,
                    branch: _getFilterBranch(),
                    limit: 100
                });
            }
        } catch (e) {
            _state.studentIndexFallbacks++;
            console.warn('[SearchRuntime] StudentSearchIndex failed, falling back to legacy blob search:', e && e.message || e);
        }

        let items = [];
        let source = 'local-full-profiles';
        if (indexResult && Array.isArray(indexResult.items)) {
            _state.studentIndexRuns++;
            source = 'student-search-index';
            items = indexResult.items;
            _state.lastStudentIndexResult = {
                term,
                tab,
                total: indexResult.total,
                returned: items.length,
                source,
                at: Date.now()
            };
        } else {
            _state.studentIndexFallbacks++;
            items = Object.entries(profiles)
                .filter(function([name, p]) {
                    if (typeof window.filterStudentItemsForMode === 'function') {
                        const modeItems = window.filterStudentItemsForMode([Object.assign({ id: name }, p)], tab);
                        if (!modeItems.length) return false;
                    } else if (tab === 'active') {
                        if (typeof window.shouldShowActiveStudentByNewFilter === 'function') {
                            if (!window.shouldShowActiveStudentByNewFilter(name, p)) return false;
                        }
                    }
                    if (_isPlainStudentGivenNameLookup(term, term)) {
                        return _matchesGivenNameOnly(p.name || p.fullName || p.studentName || p.displayName || p.hoTen || name || '', term);
                    }
                    const blob = typeof window.getProfileSearchBlob === 'function'
                        ? window.getProfileSearchBlob(p.name || p.fullName || p.studentName || p.displayName || p.hoTen || name, p)
                        : _normalizeSearch([
                            p.name || p.fullName || p.studentName || p.displayName || p.hoTen || name, p.name, p.phone, p.parentPhone, p.memberId, p.studentCode,
                            p.code, p.idCode, p.vtfCode, p.vtfId, p.vtf, p.vtfMemberId,
                            p.maVTF, p.maVtf, p.maHoiVienVTF, p.maHoiVienVtf, p.belt, p.branch, p.notes
                          ].filter(Boolean).join(' '));
                    return blob.includes(term);
                })
                .slice(0, 100)
                .map(function([name, p]) { return Object.assign({ id: name }, p); });
        }

        if (token !== _state.currentSearchToken) {
            _state.staleDropped++;
            return { stale: true };
        }

        const pgState = st.pagination && st.pagination.students;
        if (pgState) {
            pgState.currentItems  = items;
            pgState.totalLoaded   = items.length;
            pgState.hasNext       = false;
            pgState.hasPrevious   = false;
            pgState.searchActive  = true;
            pgState.searchQuery   = term;
            pgState.enabled       = true;
            pgState.searchSource  = source;
        }
        if (st) {
            st._studentsPaginationVersion = (st._studentsPaginationVersion || 0) + 1;
            st._dataVersion               = (st._dataVersion || 0) + 1;
            st._globalSearchTerm          = term;
        }

        const listKey = tab === 'quit' ? 'students.quitList' : 'students.activeList';
        if (typeof window.refreshListsComputation === 'function')
            window.refreshListsComputation([listKey, 'dashboard.summary'], 'search-v2-students-index');
        if (typeof window.invalidateList === 'function')
            window.invalidateList(listKey, 'search-v2-students-index');
        else if (typeof window.invalidateStudents === 'function')
            window.invalidateStudents('search-v2-students-index');

        return { items, source };
    }

    // Server fallback only when profiles are not hydrated. Do not query Firebase
    // for normal local searches when the profile store is ready.
    if (typeof window.runStudentSearchPagination === 'function') {
        await window.runStudentSearchPagination(term, { searchToken: token });
        return { source: 'server-pagination' };
    }
    return { source: 'none', items: [] };
}


// ── Phase 4K-6K-B: Cross-tab search replay ────────────────────────────────
function _getSearchInputValue() {
    const el = document.getElementById('searchInput') || document.getElementById('search');
    return el ? String(el.value || '') : '';
}

function _studentTabListKey(tab) {
    if (tab === 'quit') return 'students.quitList';
    if (tab === 'debt') return 'students.debtList';
    return 'students.activeList';
}

async function _replaySearchForTab(tabId, options = {}) {
    const tab = tabId || _getCurrentTab();
    const raw = options.raw != null ? String(options.raw || '') : _getSearchInputValue();
    const term = _normalizeSearch(raw);
    const reason = options.reason || 'tab-switch-search-replay';
    const force = options.force !== false;
    const delay = Number(options.delay || 0);

    if (!term) {
        return { ok: true, skipped: true, reason: 'empty-term', tab, term: '' };
    }

    const run = async () => {
        _state.tabSwitchReplays++;
        if (force) _state.forcedReplays++;
        _state.lastReplay = { tab, term, reason, at: Date.now(), force };

        // Ensure active DOM tab has settled before replaying the search.
        if (typeof window.getCurrentActiveTabId === 'function') {
            const cur = window.getCurrentActiveTabId();
            if (cur && cur !== tab) {
                return { ok: false, skipped: true, reason: 'tab-not-active', tab, currentTab: cur, term };
            }
        }

        // For active/quit tabs, the previous tab may have left pgState with a debt/default page.
        // Force a fresh SearchRuntime dispatch so pagination.currentItems belongs to the new tab.
        if (tab === 'active' || tab === 'quit' || tab === 'debt') {
            if (window.__store) {
                window.__store._globalSearchTerm = term;
            }
            await _runSearchLatestOnly(raw, reason, { force, tab });
            const listKey = _studentTabListKey(tab);
            if (typeof window.refreshListsComputation === 'function') {
                window.refreshListsComputation([listKey], reason + '-refresh');
            }
            if (typeof window.invalidateList === 'function') {
                window.invalidateList(listKey, reason + '-invalidate');
            } else if (typeof window.invalidateCurrentTab === 'function') {
                window.invalidateCurrentTab(reason + '-invalidate-current');
            }
            return { ok: true, tab, term, reason, force };
        }

        await _runSearchLatestOnly(raw, reason, { force, tab });
        return { ok: true, tab, term, reason, force };
    };

    if (delay > 0) {
        return new Promise(resolve => setTimeout(() => {
            Promise.resolve(run()).then(resolve).catch(err => {
                if (_state.errors.length > 20) _state.errors.shift();
                _state.errors.push({ message: err && err.message || String(err), tab, term, time: new Date().toISOString(), source: 'tab-replay' });
                resolve({ ok: false, error: err && err.message || String(err), tab, term, reason });
            });
        }, delay));
    }
    return run();
}

// ── Phase 4K-5Q: debugUnifiedSearchV2 ────────────────────────────────────────

window.debugUnifiedSearchV2 = function() {
    const el = document.getElementById('searchInput') || document.getElementById('search');
    const st = window.__store || {};
    const pg = (st.pagination && st.pagination.students) || {};

    const result = {
        mounted:             _state.mounted,
        inputBound:          !!(el && el.__searchRuntimeV2Bound),
        debounceMs:          _state.debounceMs,
        fastDebounceMs:      _state.fastDebounceMs,
        mediumDebounceMs:    _state.mediumDebounceMs,
        lastScheduledDelay:  _state.lastScheduledDelay,
        scheduledCount:      _state.scheduledCount,
        fastScheduledCount:  _state.fastScheduledCount,
        immediateRuns:       _state.immediateRuns,
        localStudentRuns:    _state.localStudentRuns,
        studentIndexRuns:    _state.studentIndexRuns,
        studentIndexFallbacks: _state.studentIndexFallbacks,
        lastStudentIndexResult: _state.lastStudentIndexResult,
        studentSearchIndex:  window.StudentSearchIndex?.getStats?.('debugUnifiedSearchV2') || null,
        localDebtRuns:       _state.localDebtRuns,
        localNonStudentRuns: _state.localNonStudentRuns,
        profileCountForFastPath: _getProfileCount(),
        inFlight:            _state.inFlight,
        queuedTerm:          _state.queuedTerm,
        currentSearchToken:  _state.currentSearchToken,
        lastTerm:            _state.lastTerm,
        lastTab:             _state.lastTab,
        runCount:            _state.runCount,
        tabSwitchReplays:    _state.tabSwitchReplays,
        forcedReplays:       _state.forcedReplays,
        lastReplay:          _state.lastReplay,
        staleDropped:        _state.staleDropped,
        errors:              _state.errors.slice(-10),
        pgSearchActive:      !!pg.searchActive,
        pgSearchQuery:       pg.searchQuery || '',
        pgSearchSource:      pg.searchSource || '',
        pgItems:             Array.isArray(pg.currentItems) ? pg.currentItems.length : 0,
        profileCount:        Object.keys(st.profiles || {}).length,
        performance:         (window.__perfStats && window.__perfStats.searches) || {}
    };
    console.table(result);
    return result;
};


// ── Phase 4K-6K-C: Search latency debug ─────────────────────────────────────
window.debugSearchLatency = function() {
    const input = document.getElementById('searchInput') || document.getElementById('search');
    const result = {
        currentTab: _getCurrentTab(),
        inputValue: input ? input.value : '',
        normalizedTerm: _normalizeSearch(input ? input.value : ''),
        baseDebounceMs: _state.debounceMs,
        fastDebounceMs: _state.fastDebounceMs,
        mediumDebounceMs: _state.mediumDebounceMs,
        adaptiveDelayNow: _getAdaptiveSearchDelay(input ? input.value : '', 'debug'),
        lastScheduledDelay: _state.lastScheduledDelay,
        scheduledCount: _state.scheduledCount,
        fastScheduledCount: _state.fastScheduledCount,
        immediateRuns: _state.immediateRuns,
        localStudentRuns: _state.localStudentRuns,
        studentIndexRuns: _state.studentIndexRuns,
        studentIndexFallbacks: _state.studentIndexFallbacks,
        lastStudentIndexResult: _state.lastStudentIndexResult,
        studentSearchIndexReady: !!window.__studentSearchIndexReady,
        localDebtRuns: _state.localDebtRuns,
        localNonStudentRuns: _state.localNonStudentRuns,
        profileCount: _getProfileCount(),
        inFlight: _state.inFlight,
        queuedTerm: _state.queuedTerm,
        cacheHits: _state.cacheHits,
        cacheMisses: _state.cacheMisses,
        blobHits: _state.blobHits,
        blobBuilds: _state.blobBuilds,
        recentLatency: (window.__searchRuntimeLatency && window.__searchRuntimeLatency.recent) || []
    };
    console.table(result);
    return result;
};

export function initGlobalSearchRuntime() {
    if (_state.mounted) {
        console.debug('[SearchRuntime V2] already mounted — skip');
        return;
    }

    const el = document.getElementById('searchInput') ||
               document.getElementById('search');

    if (!el) {
        console.warn('[SearchRuntime V2] #searchInput không tìm thấy — abort init');
        return;
    }

    // Guard: already bound by V2
    if (el.__searchRuntimeV2Bound) {
        console.debug('[SearchRuntime V2] element already bound — skip');
        return;
    }

    // Build named handler references for safe removeEventListener
    _state.inputEl = el;

    _state.compositionHandler = function _onCompositionStart() {
        _state.compositionActive = true;
    };
    _state.compositionEndHandler = function _onCompositionEnd() {
        _state.compositionActive = false;
        _scheduleSearch(el.value || '', 'compositionend');
    };
    _state.inputHandler = function _onInput() {
        if (_state.compositionActive) return;
        const raw = el.value || '';
        _scheduleSearch(raw, 'input');
    };

    el.addEventListener('compositionstart', _state.compositionHandler);
    el.addEventListener('compositionend',   _state.compositionEndHandler);
    el.addEventListener('input',            _state.inputHandler);

    el.__searchRuntimeV2Bound = true;

    _state.mounted = true;
    window.__searchRuntimeMounted   = true;
    window.__searchRuntimeV2Mounted = true; // Phase 4K-5Q
    window.__searchRuntimeState     = _state;


    // Phase 4K-6K-B: expose cross-tab search replay helpers.
    window.replaySearchForTab = function(tabId, options) {
        return _replaySearchForTab(tabId, options || {});
    };
    window.replaySearchForCurrentTab = function(options) {
        return _replaySearchForTab(_getCurrentTab(), options || {});
    };
    window.debugSearchTabReplay = function() {
        const input = document.getElementById('searchInput') || document.getElementById('search');
        const pg = (window.__store && window.__store.pagination && window.__store.pagination.students) || {};
        const result = {
            mounted: _state.mounted,
            currentTab: _getCurrentTab(),
            inputValue: input ? input.value : '',
            normalizedTerm: _normalizeSearch(input ? input.value : ''),
            lastTerm: _state.lastTerm,
            lastTab: _state.lastTab,
            tabSwitchReplays: _state.tabSwitchReplays,
            forcedReplays: _state.forcedReplays,
            lastReplay: _state.lastReplay,
            pgSearchActive: !!pg.searchActive,
            pgSearchQuery: pg.searchQuery || '',
            pgItems: Array.isArray(pg.currentItems) ? pg.currentItems.length : 0,
            errors: _state.errors.slice(-10)
        };
        console.table(result);
        return result;
    };

    // Phase 4K-2: Expose SearchBlob builders globally
    // Guard getProfileSearchBlob: main.js may already expose a version-aware implementation
    // (window.__searchTextCache with dataVersion-based invalidation). Only set if missing.
    // V5G: overwrite stale legacy helpers so all tab render paths use final-token search.
    window.isPlainStudentGivenNameLookup = _isPlainStudentGivenNameLookup;
    window.matchesStudentGivenNameOnly = _matchesGivenNameOnly;
    window.matchesStudentProfileSearch = function(name, profile, term) {
        const p = profile || {};
        const displayName = p.name || p.fullName || p.studentName || p.displayName || p.hoTen || name || '';
        if (_isPlainStudentGivenNameLookup(term, term)) return _matchesGivenNameOnly(displayName, term);
        const blob = typeof window.getProfileSearchBlob === 'function' ? window.getProfileSearchBlob(displayName, p) : getProfileSearchBlob(displayName, p);
        return blob.includes(_normalizeSearch(term));
    };
    if (!window.getProfileSearchBlob) window.getProfileSearchBlob = getProfileSearchBlob;
    window.getTransactionSearchBlob = getTransactionSearchBlob;
    window.getInventorySearchBlob   = getInventorySearchBlob;

    // Expose PHẦN 5 cache clearer (full clear)
    window.clearSearchRuntimeCache = function(reason) {
        const before = _resultCache.size;
        _resultCache.clear();
        _profileBlobCache.clear();
        _txBlobCache.clear();
        _invBlobCache.clear();
        if (window.invalidateStudentSearchIndex) window.invalidateStudentSearchIndex(reason || 'search-cache-clear');
        _state.lastTerm = '';   // force re-run even same term
        console.info('[SearchRuntime] cache cleared (' + before + ' entries) —', reason || 'manual');
    };

    // Phase 4K-2: Tab-scoped cache invalidation — called by loadFullProfilesFallback
    // Only clears entries for the current tab, not the entire cache.
    // Phase 4K-2C: use domain-aware prefix (domain:tab|) matching 4K-2B _cacheKey format
    window.invalidateSearchCacheForCurrentTab = function(reason) {
        const curTab = _getCurrentTab();
        const domain = _domainForTab(curTab);
        const prefix = domain + ':' + curTab + '|';

        let cleared = 0;
        for (const k of Array.from(_resultCache.keys())) {
            if (k.startsWith(prefix)) {
                _resultCache.delete(k);
                cleared++;
            }
        }

        // Invalidate the correct blob cache for this domain
        if (domain === 'students') _profileBlobCache.clear();
        if (domain === 'finance')  _txBlobCache.clear();
        if (domain === 'inventory') _invBlobCache.clear();

        _state.lastTerm = '';
        console.debug('[SearchRuntime] tab-cache invalidated tab=' + curTab + ' prefix=' + prefix + ' (' + cleared + ') —', reason || 'manual');
    };

    console.info('[SearchRuntime] ✅ Phase 4K-2 Unified search controller mounted.');
}

export function disposeGlobalSearchRuntime() {
    // Phase 4K-5Q: Remove named handlers properly (no stale listeners on re-init)
    const el = _state.inputEl ||
               document.getElementById('searchInput') ||
               document.getElementById('search');

    if (el) {
        if (_state.inputHandler)           el.removeEventListener('input',            _state.inputHandler);
        if (_state.compositionHandler)     el.removeEventListener('compositionstart', _state.compositionHandler);
        if (_state.compositionEndHandler)  el.removeEventListener('compositionend',   _state.compositionEndHandler);
        el.__searchRuntimeV2Bound = false;
        el.__searchRuntimeBound   = false;
    }

    clearTimeout(_state.pendingTimer);
    _state.mounted               = false;
    _state.inputEl               = null;
    _state.inputHandler          = null;
    _state.compositionHandler    = null;
    _state.compositionEndHandler = null;
    _state.compositionActive     = false;
    _state.inFlight              = false;
    _state.queuedTerm            = null;
    window.__searchRuntimeMounted   = false;
    window.__searchRuntimeV2Mounted = false;
    _resultCache.clear();
    _profileBlobCache.clear();
    _txBlobCache.clear();
    _invBlobCache.clear();
    if (window.invalidateStudentSearchIndex) window.invalidateStudentSearchIndex('search-runtime-dispose');
    console.info('[SearchRuntime V2] disposed.');
}

export function getSearchRuntimeState() {
    return {
        ..._state,
        cacheSize:        _resultCache.size,
        profileBlobSize:  _profileBlobCache.size,
        txBlobSize:       _txBlobCache.size,
        invBlobSize:      _invBlobCache.size,
    };
}

// ── Phase 4K-2: Invalidate cache khi dữ liệu thay đổi ────────────────────────

/**
 * Gọi khi profiles/transactions/inventory snapshot thay đổi, month/branch filter thay đổi.
 * domain: 'active' | 'quit' | 'debt' | 'tx' | 'inventory' | 'all'
 */
export function invalidateSearchCache(domain, reason) {
    let cleared = 0;
    if (!domain || domain === 'all') {
        cleared = _resultCache.size;
        _resultCache.clear();
    } else {
        // Phase 4K-2B: domain-prefix matching using format `${domain}:${tab}|...`
        // If domain is a logical domain ('students', 'finance', 'inventory', 'dashboard'),
        // clear all keys starting with `${domain}:`.
        // If domain is a specific tab ('active', 'quit', 'debt', 'tx', 'inventory'),
        // clear keys containing `:${tab}|` to match only that tab's entries.
        const logicalDomains = ['students', 'finance', 'inventory', 'dashboard', 'misc'];
        const isLogicalDomain = logicalDomains.includes(domain);

        for (const k of _resultCache.keys()) {
            let match = false;
            if (isLogicalDomain) {
                // Match `students:active|...`, `students:debt|...`, etc.
                match = k.startsWith(domain + ':');
            } else {
                // domain is a tab like 'active', 'quit', 'debt', 'tx'
                // Map tab to its logical domain then match full prefix
                const mappedDomain = _domainForTab(domain);
                match = k.startsWith(mappedDomain + ':' + domain + '|');
            }
            if (match) {
                _resultCache.delete(k);
                cleared++;
            }
        }
    }
    if (cleared > 0) {
        console.debug('[SearchRuntime] cache invalidated (' + cleared + ') — domain:', domain, 'reason:', reason);
    }
    _state.lastTerm = ''; // force re-run
}

// ── Phase 4K-2: Debug helper ──────────────────────────────────────────────────

/**
 * debugSearchPerformance() — print search runtime metrics to console.
 * Callable from DevTools: window.debugSearchPerformance()
 */
export function debugSearchPerformance() {
    const s = _state;
    const result = {
        mounted:            s.mounted,
        lastTerm:           s.lastTerm,
        lastTab:            s.lastTab,
        lastRunAt:          s.lastRunAt ? new Date(s.lastRunAt).toISOString() : '',
        runCount:           s.runCount,
        skippedSameTerm:    s.skippedSameTerm,
        tabSwitchReplays:   s.tabSwitchReplays,
        forcedReplays:      s.forcedReplays,
        lastReplay:         s.lastReplay,
        cacheHits:          s.cacheHits,
        cacheMisses:        s.cacheMisses,
        cacheSize:          _resultCache.size,
        cacheHitRate:       s.runCount > 0
            ? ((s.cacheHits / s.runCount) * 100).toFixed(1) + '%'
            : '0%',
        staleDropped:       s.staleDropped,
        currentSearchToken: s.currentSearchToken,
        blobHits:           s.blobHits,
        blobBuilds:         s.blobBuilds,
        profileBlobSize:    _profileBlobCache.size,
        txBlobSize:         _txBlobCache.size,
        invBlobSize:        _invBlobCache.size,
        cacheKeys:          Array.from(_resultCache.keys()),
    };
    console.group('[SearchRuntime] 🔍 Performance Metrics (Phase 4K-2)');
    console.table({
        runCount:        { value: result.runCount },
        cacheHits:       { value: result.cacheHits },
        cacheMisses:     { value: result.cacheMisses },
        cacheHitRate:    { value: result.cacheHitRate },
        staleDropped:    { value: result.staleDropped },
        blobHits:        { value: result.blobHits },
        blobBuilds:      { value: result.blobBuilds },
        cacheSize:       { value: result.cacheSize },
        profileBlobSize: { value: result.profileBlobSize },
    });
    console.log('lastTerm     :', result.lastTerm || '(empty)');
    console.log('lastTab      :', result.lastTab  || '(unknown)');
    console.log('lastRunAt    :', result.lastRunAt || '(never)');
    console.log('token        :', result.currentSearchToken);
    if (result.cacheKeys.length) {
        console.log('cache keys   :', result.cacheKeys);
    }
    console.groupEnd();
    return result;
}
