/**
 * js/data/quitProfileBoundary.js — Phase 4K-6V5R
 * Single-source lock for the Đã nghỉ tab.
 *
 * RULE:
 * - Before the authoritative full snapshot is complete: legacy/canonical sources
 *   may be unioned only as a temporary preview.
 * - After completeness is confirmed: ONLY studentProfileStore.quitProfiles is
 *   allowed to supply rows/search results. This prevents stale allProfiles or
 *   pagination caches from re-inserting restored students into Đã nghỉ.
 *
 * This module performs NO Firestore reads/writes.
 */

import { classifyProfileStatus } from './profileStatusConfig.js';
import { rankStudentNameSearchResults } from '../core/studentSearchIndex.js?v=student-given-name-priority-20260811-v5u3';

const VERSION = '4K-6V5S-quit-context-render-loop-guard-20260722';

const _metrics = {
    version: VERSION,
    mapBuilds: 0,
    ensureCalls: 0,
    ensureSingleFlightHits: 0,
    ensureBackoffSuppressions: 0,
    ensureFailures: 0,
    filteredBuilds: 0,
    lastCount: 0,
    lastFilteredCount: 0,
    lastSources: {},
    lastMode: 'none',
    lastReason: '',
    lastAt: 0,
};

let _ensurePromise = null;
let _ensureBackoffUntil = 0;
const ENSURE_RETRY_BACKOFF_MS = 1200;

function _safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
}

function _identity(id, profile) {
    const p = profile || {};
    const strong = p.profileId || p.firestoreId || p.docId || p.id;
    if (strong) return 'id:' + String(strong).trim().toLowerCase();
    const member = p.memberId || p.studentCode || p.code;
    if (member) return 'member:' + String(member).trim().toLowerCase();
    const name = p.name || p.fullName || p.displayName || id;
    return 'name:' + _normalizeSearch(name || '');
}

function _putQuit(target, identityIndex, id, profile, sourceCounts, source) {
    const key = String(id || '').trim();
    if (!key || !profile || typeof profile !== 'object') return;
    if (classifyProfileStatus(profile) !== 'quit') return;

    // Temporary preview sources may use name keys while canonical sources use
    // Firestore ids. De-duplicate by stable identity and let later sources win.
    const identity = _identity(key, profile);
    const previousKey = identityIndex[identity];
    if (previousKey && previousKey !== key) delete target[previousKey];
    identityIndex[identity] = key;
    target[key] = profile;
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
}

function _entriesFromCanonicalStore() {
    const store = window.__profileCanonicalStore || null;
    const list = store && Array.isArray(store.quitProfiles) ? store.quitProfiles : [];
    return list.map(item => {
        const id = item && (item.rawId || item.profileId || item.displayName || item.id);
        const raw = item && (item.raw || item.profile || item.data);
        return [id, raw];
    });
}

export function isQuitAuthorityComplete() {
    if (typeof window.isQuitProfilesComplete === 'function') {
        try { return window.isQuitProfilesComplete() === true; } catch (_) {}
    }
    const m = _safe(() => window.getProfilesListenerMetrics?.() || {}, {});
    return m.quitCompletenessReconciled === true && m.quitAuthorityState === 'complete';
}

/**
 * Build the quit map.
 * Complete mode is a strict single source: studentProfileStore.quitProfiles.
 * Preview mode is a compatibility union while the full snapshot is loading.
 */
export function getAuthoritativeQuitMap(reason = 'read') {
    const out = {};
    const identities = {};
    const sources = {};
    const complete = isQuitAuthorityComplete();

    const dedicated = _safe(() => window.studentProfileStore?.getQuitProfiles?.() || {}, {});

    if (complete) {
        Object.entries(dedicated || {}).forEach(([id, profile]) => {
            _putQuit(out, identities, id, profile, sources, 'studentProfileStore.quitProfiles');
        });
        _metrics.lastMode = 'complete-single-source';
    } else {
        // Preview only. These sources must never survive as authorities after
        // the full snapshot is marked complete.
        const broadSources = [
            ['window.allProfiles.preview', _safe(() => window.allProfiles || {}, {})],
            ['store.profiles.preview', _safe(() => (window.__store && window.__store.profiles) || {}, {})],
            ['store.compat.preview', _safe(() => window.studentProfileStore?.getAllProfilesCompat?.() || {}, {})],
        ];
        broadSources.forEach(([source, map]) => {
            Object.entries(map || {}).forEach(([id, profile]) => _putQuit(out, identities, id, profile, sources, source));
        });

        _entriesFromCanonicalStore().forEach(([id, profile]) => {
            _putQuit(out, identities, id, profile, sources, 'canonical.quitProfiles.preview');
        });

        // Dedicated cache wins over all preview sources.
        Object.entries(dedicated || {}).forEach(([id, profile]) => {
            _putQuit(out, identities, id, profile, sources, 'studentProfileStore.quitProfiles.preview');
        });
        _metrics.lastMode = 'loading-preview-union';
    }

    _metrics.mapBuilds++;
    _metrics.lastCount = Object.keys(out).length;
    _metrics.lastSources = sources;
    _metrics.lastReason = reason;
    _metrics.lastAt = Date.now();
    return out;
}

function _normalizeSearch(value) {
    if (typeof window.normalizeVNForSearch === 'function') return window.normalizeVNForSearch(value || '');
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
}

function _profileBlob(id, profile) {
    if (typeof window.getProfileSearchBlob === 'function') return window.getProfileSearchBlob(id, profile);
    const p = profile || {};
    return _normalizeSearch([
        id, p.name, p.fullName, p.displayName, p.nickname, p.phone, p.parentPhone,
        p.memberId, p.studentCode, p.code, p.vtfCode, p.vtfId, p.belt, p.branch,
        p.branchCode, p.notes
    ].filter(Boolean).join(' '));
}

function _branchPass(profile, selectedBranch) {
    const branch = String(selectedBranch || 'all').trim();
    if (!branch || branch === 'all') return true;
    if (typeof window.profileBranchMatchesFilter === 'function') {
        return window.profileBranchMatchesFilter(profile || {}, branch);
    }
    const value = String((profile && (profile.branch || profile.branchCode || profile.branchId || profile.coSo)) || 'CS1').trim();
    if (window.BranchIdentity?.normalize) {
        return window.BranchIdentity.normalize(value, { fallback: 'CS1' }) === window.BranchIdentity.normalize(branch, { fallback: branch });
    }
    return value === branch;
}

export function getFilteredQuitEntries(options = {}) {
    const search = _normalizeSearch(options.search || '');
    const selectedBranch = options.branch || 'all';
    const map = getAuthoritativeQuitMap(options.reason || 'filter');
    const entries = Object.entries(map).filter(([id, profile]) => {
        if (!_branchPass(profile, selectedBranch)) return false;
        if (!search) return true;
        return _profileBlob(id, profile).includes(search);
    });
    if (search) {
        // Phase 4K-6V5U3: filter/result set is unchanged; only presentation order
        // is ranked by the shared canonical name helper. Stable ties preserve the
        // authoritative map order. No Firestore read or fallback source is added.
        const ranked = rankStudentNameSearchResults(entries, search, ([id, profile]) =>
            String(profile?.name || profile?.fullName || profile?.displayName || profile?.studentName || id || '')
        );
        entries.splice(0, entries.length, ...ranked);
    } else {
        // Blank search retains the existing Đã nghỉ alphabetical behavior.
        entries.sort((a, b) => {
            const an = String(a[1]?.name || a[1]?.fullName || a[1]?.displayName || a[0] || '');
            const bn = String(b[1]?.name || b[1]?.fullName || b[1]?.displayName || b[0] || '');
            return an.localeCompare(bn, 'vi');
        });
    }
    _metrics.filteredBuilds++;
    _metrics.lastFilteredCount = entries.length;
    return entries;
}

export function ensureQuitAuthority(reason = 'quit-boundary') {
    _metrics.ensureCalls++;
    if (isQuitAuthorityComplete()) {
        _ensureBackoffUntil = 0;
        return Promise.resolve(true);
    }
    if (_ensurePromise) {
        _metrics.ensureSingleFlightHits++;
        return _ensurePromise;
    }
    if (Date.now() < _ensureBackoffUntil) {
        _metrics.ensureBackoffSuppressions++;
        return Promise.resolve(false);
    }

    const loader = typeof window.ensureQuitProfilesComplete === 'function'
        ? window.ensureQuitProfilesComplete
        : (typeof window.loadQuitProfilesIfNeeded === 'function' ? window.loadQuitProfilesIfNeeded : null);
    if (!loader) {
        _metrics.ensureFailures++;
        _ensureBackoffUntil = Date.now() + ENSURE_RETRY_BACKOFF_MS;
        return Promise.resolve(false);
    }

    _ensurePromise = Promise.resolve()
        .then(() => loader(reason))
        .then(ok => {
            const complete = isQuitAuthorityComplete();
            if (ok === true || complete) {
                _ensureBackoffUntil = 0;
                return true;
            }
            _metrics.ensureFailures++;
            _ensureBackoffUntil = Date.now() + ENSURE_RETRY_BACKOFF_MS;
            return false;
        })
        .catch(() => {
            _metrics.ensureFailures++;
            _ensureBackoffUntil = Date.now() + ENSURE_RETRY_BACKOFF_MS;
            return false;
        })
        .finally(() => {
            _ensurePromise = null;
        });
    return _ensurePromise;
}

export function getQuitBoundaryMetrics() {
    return { ..._metrics, complete: isQuitAuthorityComplete() };
}

export function initQuitProfileBoundary() {
    const api = {
        version: VERSION,
        getMap: getAuthoritativeQuitMap,
        getEntries: getFilteredQuitEntries,
        ensureComplete: ensureQuitAuthority,
        isComplete: isQuitAuthorityComplete,
        getMetrics: getQuitBoundaryMetrics,
    };
    window.QuitProfileBoundary = api;
    window.getAuthoritativeQuitProfiles = getAuthoritativeQuitMap;
    window.getFilteredQuitProfiles = getFilteredQuitEntries;
    window.ensureQuitProfileAuthority = ensureQuitAuthority;
    window.getQuitBoundaryMetrics = getQuitBoundaryMetrics;

    // Context can become ready after the user opens Đã nghỉ. Reset the short
    // backoff and allow exactly one guarded retry; renderQuitIsland owns the DOM.
    const onContextReady = () => {
        _ensureBackoffUntil = 0;
        if (window.getCurrentActiveTabId?.() === 'quit' && !isQuitAuthorityComplete()) {
            ensureQuitAuthority('quit-boundary-context-ready')
                .then(ok => {
                    if (ok === true && typeof window.renderQuitList === 'function') {
                        window.renderQuitList({ reason: 'quit-boundary-context-ready' });
                    }
                })
                .catch(() => {});
        }
    };
    try {
        window.addEventListener('app:context-ready', onContextReady);
        window.addEventListener('app:db-ready', onContextReady);
    } catch (_) {}
    return api;
}

export const QuitProfileBoundary = {
    version: VERSION,
    getMap: getAuthoritativeQuitMap,
    getEntries: getFilteredQuitEntries,
    ensureComplete: ensureQuitAuthority,
    isComplete: isQuitAuthorityComplete,
    getMetrics: getQuitBoundaryMetrics,
    init: initQuitProfileBoundary,
};
