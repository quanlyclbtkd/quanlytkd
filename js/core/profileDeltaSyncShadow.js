/**
 * Phase 4K-6V4C1 — Active Profiles Delta-Sync Shadow Readiness
 *
 * This module creates NO Firestore reads, listeners or writes.
 * It observes the already-loaded active profile map and records metadata only:
 * count, field coverage and a non-reversible fingerprint. It prepares V4C2
 * without changing the authoritative listener used by Học phí/Báo nợ/Search.
 */
(function initProfileDeltaSyncShadow(global) {
    'use strict';

    if (global.ProfileDeltaSyncShadow && global.ProfileDeltaSyncShadow.version === '4K-6V4C1-shadow') return;

    const VERSION = '4K-6V4C1-shadow';
    const KEY_PREFIX = 'tst_sync_shadow_profiles_';
    const state = {
        snapshots: 0,
        latest: null,
        previous: null,
        lastError: '',
    };

    function normalizeTimestamp(value) {
        if (!value) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        if (typeof value.toMillis === 'function') {
            try { return Number(value.toMillis()) || 0; } catch (_) { return 0; }
        }
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        return 0;
    }

    function fnv1a(value) {
        let hash = 0x811c9dc5;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function scope(context) {
        const ctx = context || {};
        const store = global.__store || {};
        return {
            clubId: String(ctx.clubId || store.clubId || store.currentClubId || global.currentClubId || 'unknown'),
            role: String(ctx.role || store.userRole || global.userRole || 'unknown'),
            branch: String(ctx.branch || store.coachBranch || global.coachBranch || 'all'),
        };
    }

    function storageKey(ctx) {
        return KEY_PREFIX + [ctx.clubId, ctx.role, ctx.branch]
            .map((value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_'))
            .join('__');
    }

    function readPrevious(key) {
        try {
            const raw = global.localStorage && global.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function persist(key, metadata) {
        try {
            const trusted = global.FirestoreCachePolicy && typeof global.FirestoreCachePolicy.readPreference === 'function'
                ? global.FirestoreCachePolicy.readPreference()
                : false;
            if (trusted && global.localStorage) global.localStorage.setItem(key, JSON.stringify(metadata));
        } catch (_) {}
    }

    function buildMetadata(profiles, context) {
        const map = profiles && typeof profiles === 'object' ? profiles : {};
        const entries = Object.entries(map).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'vi'));
        let updatedAtCount = 0;
        let syncVersionCount = 0;
        let stableIdCount = 0;
        let maxUpdatedAtMs = 0;
        const fingerprintParts = [];

        entries.forEach(([id, profile]) => {
            const data = profile || {};
            const updatedAtMs = normalizeTimestamp(data.updatedAt || data.modifiedAt || data.lastUpdatedAt);
            const syncVersion = Number(data.syncVersion || 0);
            const stableId = String(data.profileId || data.docId || data.id || id || '').trim();
            if (updatedAtMs > 0) updatedAtCount++;
            if (syncVersion > 0) syncVersionCount++;
            if (stableId) stableIdCount++;
            if (updatedAtMs > maxUpdatedAtMs) maxUpdatedAtMs = updatedAtMs;
            fingerprintParts.push([
                stableId,
                String(data.status || data.active || ''),
                String(data.branch || ''),
                String(updatedAtMs),
                String(syncVersion),
            ].join('|'));
        });

        const count = entries.length;
        const pct = (value) => count ? Math.round((value / count) * 10000) / 100 : 100;
        const ctx = scope(context);
        return {
            version: VERSION,
            shadowOnly: true,
            cutoverAllowed: false,
            clubId: ctx.clubId,
            role: ctx.role,
            branch: ctx.branch,
            source: String((context && context.source) || 'active-profile-store'),
            recordedAt: Date.now(),
            count,
            updatedAtCoveragePct: pct(updatedAtCount),
            syncVersionCoveragePct: pct(syncVersionCount),
            stableIdCoveragePct: pct(stableIdCount),
            maxUpdatedAtMs,
            fingerprint: fnv1a(fingerprintParts.join('\n')),
            readyForV4C2WriteBoundary: count === 0 || (updatedAtCount === count && syncVersionCount === count && stableIdCount === count),
        };
    }

    function recordSnapshot(profiles, context) {
        try {
            const metadata = buildMetadata(profiles, context);
            const key = storageKey(metadata);
            const previous = readPrevious(key) || state.latest;
            state.previous = previous || null;
            state.latest = Object.assign({}, metadata, {
                changedSincePrevious: !!previous && previous.fingerprint !== metadata.fingerprint,
                previousCount: previous ? Number(previous.count || 0) : null,
            });
            state.snapshots++;
            persist(key, state.latest);
            return state.latest;
        } catch (error) {
            state.lastError = error && error.message ? error.message : String(error);
            return null;
        }
    }

    function diagnostics() {
        return {
            version: VERSION,
            snapshots: state.snapshots,
            latest: state.latest ? Object.assign({}, state.latest) : null,
            previous: state.previous ? Object.assign({}, state.previous) : null,
            lastError: state.lastError,
            note: 'Shadow only: authoritative active profiles listener remains unchanged.',
        };
    }

    function printDiagnostics() {
        const result = diagnostics();
        if (global.console) {
            console.group('[Profile Delta Sync Shadow] V4C1');
            if (result.latest) console.table(result.latest);
            else console.log('Chưa có active profile snapshot.');
            console.log(result.note);
            console.groupEnd();
        }
        return result;
    }

    const api = {
        version: VERSION,
        buildMetadata,
        recordSnapshot,
        diagnostics,
        printDiagnostics,
    };

    global.ProfileDeltaSyncShadow = api;
    global.recordProfileDeltaShadowSnapshot = recordSnapshot;
    global.getProfileDeltaShadowReadiness = diagnostics;
    global.printProfileDeltaShadowReadiness = printDiagnostics;
})(window);
