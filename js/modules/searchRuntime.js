/**
 * js/modules/searchRuntime.js
 * ────────────────────────────────────────────────────────────────
 * Phase 4K-2: Unified Search Runtime + Real Search Cache + SearchBlob
 *
 * Single #searchInput handler — tab-aware dispatch — real result cache
 * (key: tab|month|branch|normalizedTerm) — SearchBlob pre-compute for
 * profiles / transactions / inventory — stale request guard.
 *
 * Exports: initGlobalSearchRuntime, disposeGlobalSearchRuntime,
 *          getSearchRuntimeState, invalidateSearchCache
 * ────────────────────────────────────────────────────────────────
 */

// ── Internal state ────────────────────────────────────────────────────────────

const _state = {
    mounted:         false,
    lastTerm:        '',
    lastTab:         '',
    lastRunAt:       0,
    runCount:        0,
    skippedSameTerm: 0,
    pendingTimer:    null,
    // Phase 4K-2: stale request guard — incremented before each async dispatch
    currentSearchToken: 0,
    // Phase 4K-2: performance metrics
    cacheHits:   0,
    cacheMisses: 0,
    blobHits:    0,
    blobBuilds:  0,
    staleDropped: 0,
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
        p.nickname,
        p.memberId,
        p.studentCode,
        p.code,
        p.belt,
        p.notes,
        p.phone,
        p.parentPhone,
        p.contactPhone,
        p.guardianPhone,
        p.address,
        p.email,
        p.branch,
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

// ── Phase 4K-5Q: Search Route Map ─────────────────────────────────────────────

function _getSearchRoute(tab) {
    if (tab === 'active') {
        return { domain: 'students', mode: 'active', listKey: 'students.activeList', strategy: 'profiles-client-first' };
    }
    if (tab === 'quit') {
        return { domain: 'students', mode: 'quit', listKey: 'students.quitList', strategy: 'profiles-client-first' };
    }
    if (tab === 'debt') {
        return { domain: 'students', mode: 'debt', listKey: 'students.debtList', strategy: 'debt-full-profiles' };
    }
    if (tab === 'tx' || tab === 'expense') {
        return { domain: 'finance', mode: 'transactions', listKey: 'tx.txList', strategy: 'transactions-local-first' };
    }
    if (tab === 'inventory') {
        return { domain: 'inventory', mode: 'inventory', listKey: 'inventory.inventoryList', strategy: 'inventory-local-first' };
    }
    if (tab === 'dashboard') {
        return { domain: 'dashboard', mode: 'dashboard', listKey: 'dashboard.summary', strategy: 'invalidate-only' };
    }
    return { domain: 'misc', mode: tab || 'unknown', listKey: '', strategy: 'invalidate-current-tab' };
}

window.getSearchRouteForCurrentTab = function() {
    return _getSearchRoute(_getCurrentTab());
};

// ── Phase 4K-5Q: Client-side profile search ────────────────────────────────────

function _clientSearchProfiles(term, mode) {
    const st       = window.__store || {};
    const profiles = st.profiles || {};
    const q        = _normalizeSearch(term);
    const items    = [];

    Object.entries(profiles).forEach(([name, p]) => {
        const statusKind = typeof window.classifyProfileStatus === 'function'
            ? window.classifyProfileStatus(p)
            : (p.status === 'quit' ? 'quit' : 'active');

        if (mode === 'active' && statusKind !== 'active') return;
        if (mode === 'quit'   && statusKind !== 'quit')   return;

        const blob = typeof window.getProfileSearchBlob === 'function'
            ? window.getProfileSearchBlob(name, p)
            : getProfileSearchBlob(name, p);

        if (!q || blob.includes(q)) {
            items.push({ id: name, ...p });
        }
    });

    return items;
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

    // Phase 4K-5Q: Student tabs — client-first search when full profiles available
    if (tab === 'active' || tab === 'quit') {
        const st             = window.__store || {};
        const profilesCount  = Object.keys(st.profiles || {}).length;
        const hasFullProfiles = profilesCount >= 50 || st._profilesFullLoadedForDebt || st._profilesHydrated;

        if (hasFullProfiles) {
            const items = _clientSearchProfiles(term, tab);
            const PAGE_SIZE = 100;

            try {
                const pgState = st.pagination && st.pagination.students;
                if (pgState) {
                    pgState.currentItems = items.slice(0, PAGE_SIZE);
                    pgState.searchActive = term !== '';
                    pgState.enabled      = true;
                }
                if (st) {
                    st._studentsPaginationVersion = (st._studentsPaginationVersion || 0) + 1;
                    st._dataVersion               = (st._dataVersion || 0) + 1;
                }
            } catch (_) {}

            const listKey = tab === 'quit' ? 'students.quitList' : 'students.activeList';
            if (refreshKeys) refreshKeys([listKey], 'search-client-first');
            if (invalidateList) invalidateList(listKey, 'search-client-first');

            if (typeof window.setSearchStatus === 'function') {
                window.setSearchStatus(
                    items.length > 0
                        ? 'Tìm thấy ' + items.length + ' kết quả'
                        : 'Không tìm thấy kết quả',
                    items.length > 0 ? 'found' : 'empty'
                );
            }

            return { items: items.slice(0, PAGE_SIZE), totalLoaded: items.length, hasNext: false };
        }

        // Fallback: server search khi chưa có full profiles
        let result = { items: [], totalLoaded: 0, hasNext: false };
        if (term.length >= 2 && typeof window.runStudentSearchPagination === 'function') {
            await window.runStudentSearchPagination(term, { searchToken: token });
            try {
                const pgState = st.pagination && st.pagination.students;
                if (pgState && Array.isArray(pgState.currentItems)) {
                    result = {
                        items:       pgState.currentItems.slice(),
                        totalLoaded: pgState.totalLoaded || pgState.currentItems.length,
                        hasNext:     !!pgState.hasNext,
                    };
                }
            } catch (_) {}
        }

        if (typeof window.setSearchStatus === 'function') {
            window.setSearchStatus(
                result.items.length > 0
                    ? 'Tìm thấy ' + result.totalLoaded + ' kết quả'
                    : 'Không tìm thấy kết quả',
                result.items.length > 0 ? 'found' : 'empty'
            );
        }
        return result;
    }

    if (tab === 'debt') {
        // Phase 4K-5Q: Debt search — reset render limit + refresh full debt source
        window.__debtRenderLimit = 50;
        if (refreshKeys) refreshKeys(['students.debtList'], 'search-debt');
        if (invalidateList) invalidateList('students.debtList', 'search-debt');
        if (typeof window.setSearchStatus === 'function') {
            window.setSearchStatus('Đang lọc nợ...', 'info');
        }
        return {};
    }

    if (tab === 'tx' || tab === 'expense') {
        // Phase 4K-5Q: TX search — chỉ refresh tx, KHÔNG refresh students/debt/dashboard
        if (refreshKeys) refreshKeys(['tx.txList'], 'search-tx');
        if (invalidateCurrentTab) invalidateCurrentTab('search-tx');
        return {};
    }

    if (tab === 'inventory') {
        // Phase 4K-5Q: Inventory search — chỉ refresh inventory, KHÔNG refresh students
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

// Phase 4K-5Q: Search status UI helper
window.setSearchStatus = function(text, kind) {
    kind = kind || 'info';
    const el2 = document.getElementById('searchStatusMsg_students') ||
                document.getElementById('searchStatusMsg') ||
                null;
    if (!el2) return;
    el2.textContent = text || '';
    el2.dataset.kind = kind;
};

export function initGlobalSearchRuntime() {
    if (_state.mounted) {
        console.debug('[SearchRuntime] already mounted — skip');
        return;
    }

    const el = document.getElementById('searchInput') ||
               document.getElementById('search') ||
               document.querySelector('input[placeholder*="tên"]');

    if (!el) {
        console.warn('[SearchRuntime] #searchInput không tìm thấy — abort init');
        return;
    }

    if (el.__searchRuntimeBound) {
        console.debug('[SearchRuntime] element already bound — skip');
        return;
    }
    el.__searchRuntimeBound = true;

    // Phase 4K-5Q: Disable legacy inline oninput once unified runtime is mounted.
    try {
        if (el.oninput) {
            el.__legacyOnInputBackup = el.oninput;
            el.oninput = null;
        }
    } catch (_) {}

    const SEARCH_DEBOUNCE_MS  = 380;

    el.addEventListener('input', () => {
        clearTimeout(_state.pendingTimer);

        const raw        = el.value || '';
        const normalized = _normalizeSearch(raw);

        _state.lastRawInput        = raw;
        _state.lastNormalizedInput = normalized;
        _state.inputCount          = (_state.inputCount || 0) + 1;

        if (typeof window.setSearchStatus === 'function') {
            window.setSearchStatus('Đang tìm...', 'info');
        }

        _state.pendingTimer = setTimeout(() => {
            _dispatchSearch(raw);
        }, SEARCH_DEBOUNCE_MS);
    }, { passive: true });

    _state.mounted = true;
    window.__searchRuntimeMounted          = true;
    window.__SEARCH_ROUTER_V2_ACTIVE       = true;
    window.__studentSearchControllerMounted = true;
    window.__searchRuntimeState            = _state;

    // Phase 4K-2: Expose SearchBlob builders globally
    // Guard getProfileSearchBlob: main.js may already expose a version-aware implementation
    // (window.__searchTextCache with dataVersion-based invalidation). Only set if missing.
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
    const el = document.getElementById('searchInput') ||
               document.getElementById('search') ||
               document.querySelector('input[placeholder*="tên"]');
    if (el && el.__searchRuntimeBound) {
        el.__searchRuntimeBound = false;
    }
    clearTimeout(_state.pendingTimer);
    _state.mounted                 = false;
    window.__searchRuntimeMounted  = false;
    _resultCache.clear();
    _profileBlobCache.clear();
    _txBlobCache.clear();
    _invBlobCache.clear();
    console.info('[SearchRuntime] disposed.');
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
// ── Phase 4K-5Q: debugSearchRouterV2 ─────────────────────────────────────────

window.debugSearchRouterV2 = function(term) {
    term = typeof term === 'string' ? term : '';
    const input = document.getElementById('searchInput');
    const route = typeof window.getSearchRouteForCurrentTab === 'function'
        ? window.getSearchRouteForCurrentTab()
        : null;
    const state = typeof window.getSearchRuntimeState === 'function'
        ? window.getSearchRuntimeState()
        : {};

    const result = {
        inputExists:             !!input,
        inputValue:              input ? input.value : '',
        testTerm:                term,
        currentTab:              typeof window.getCurrentActiveTabId === 'function'
                                     ? window.getCurrentActiveTabId()
                                     : '',
        route,
        searchRouterV2Active:    !!window.__SEARCH_ROUTER_V2_ACTIVE,
        searchRuntimeMounted:    !!window.__searchRuntimeMounted,
        studentControllerMounted: !!window.__studentSearchControllerMounted,
        hasInlineOnInput:        !!(input && input.oninput),
        legacyBackupExists:      !!(input && input.__legacyOnInputBackup),
        state
    };

    console.table(result);
    return result;
};

export function debugSearchPerformance() {
    const s = _state;
    const result = {
        mounted:            s.mounted,
        lastTerm:           s.lastTerm,
        lastTab:            s.lastTab,
        lastRunAt:          s.lastRunAt ? new Date(s.lastRunAt).toISOString() : '',
        runCount:           s.runCount,
        skippedSameTerm:    s.skippedSameTerm,
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
