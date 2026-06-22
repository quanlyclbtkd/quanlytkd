/**
 * Phase 4K-6V4C1 — Trusted Device Firestore Cache Policy
 *
 * Classic bootstrap script loaded before app.js.
 * - Trusted device: persistent multi-tab Firestore cache.
 * - Shared/public device: memory-only Firestore cache.
 * - One primary Firestore instance shared by legacy app.js and module runtime.
 * - Diagnostics only; no Firestore reads/writes are created by this policy.
 */
(function initFirestoreCachePolicy(global) {
    'use strict';

    if (global.FirestoreCachePolicy && global.FirestoreCachePolicy.version === '4K-6V4C1') return;

    const VERSION = '4K-6V4C1';
    const PREF_KEY = 'tst_trusted_device_v1';
    const USER_KEY = 'tst_trusted_device_uid_v1';
    const APP_CACHE_DB = 'taekwondo_cache';

    const state = {
        trusted: false,
        mode: 'uninitialized',
        initializedAt: 0,
        fallbackReason: '',
        db: null,
        uiBound: false,
        reloadRequestedAt: 0,
    };

    function readPreference() {
        try {
            return global.localStorage && global.localStorage.getItem(PREF_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function writePreference(enabled) {
        try {
            if (global.localStorage) global.localStorage.setItem(PREF_KEY, enabled ? '1' : '0');
            return true;
        } catch (_) {
            return false;
        }
    }

    function initialize(app) {
        if (state.db) return state.db;
        if (global.__primaryFirestoreDb) {
            state.db = global.__primaryFirestoreDb;
            state.mode = global.__firestoreCacheMode || 'existing';
            state.trusted = readPreference();
            return state.db;
        }

        const sdk = global._fb_init || {};
        const trusted = readPreference();
        state.trusted = trusted;

        try {
            if (typeof sdk.initializeFirestore === 'function') {
                if (
                    trusted &&
                    typeof sdk.persistentLocalCache === 'function' &&
                    typeof sdk.persistentMultipleTabManager === 'function'
                ) {
                    state.db = sdk.initializeFirestore(app, {
                        localCache: sdk.persistentLocalCache({
                            tabManager: sdk.persistentMultipleTabManager(),
                        }),
                    });
                    state.mode = 'persistent-multi-tab';
                } else if (typeof sdk.memoryLocalCache === 'function') {
                    state.db = sdk.initializeFirestore(app, {
                        localCache: sdk.memoryLocalCache(),
                    });
                    state.mode = 'memory-only';
                }
            }
        } catch (error) {
            state.fallbackReason = error && error.message ? error.message : String(error || 'initializeFirestore-failed');
            state.db = null;
        }

        if (!state.db) {
            if (typeof sdk.getFirestore !== 'function') {
                throw new Error('[FirestoreCachePolicy] Firebase Firestore SDK chưa sẵn sàng');
            }
            state.db = sdk.getFirestore(app);
            state.mode = trusted ? 'fallback-getFirestore-trusted-requested' : 'fallback-getFirestore-memory';
        }

        state.initializedAt = Date.now();
        global.__primaryFirestoreDb = state.db;
        global.__firestoreCacheMode = state.mode;
        global.__firestoreTrustedDevice = trusted;
        return state.db;
    }

    function syncUi() {
        const checkbox = global.document && global.document.getElementById('trustedDeviceCheckbox');
        const hint = global.document && global.document.getElementById('trustedDeviceHint');
        const clearBtn = global.document && global.document.getElementById('clearTrustedDeviceCacheBtn');
        const trusted = readPreference();
        if (checkbox) checkbox.checked = trusted;
        if (hint) {
            hint.textContent = trusted
                ? 'Đang dùng cache bền trên thiết bị này. F5/reconnect ngắn sẽ hạn chế tải lại dữ liệu.'
                : 'Máy dùng chung: dữ liệu chỉ lưu trong bộ nhớ và mất khi tải lại trang.';
        }
        if (clearBtn) clearBtn.style.display = trusted ? 'inline-flex' : 'none';
    }

    async function setTrustedFromUi(enabled) {
        const next = enabled === true;
        const current = readPreference();
        if (next === current) {
            syncUi();
            return true;
        }

        const message = next
            ? 'Bật thiết bị tin cậy sẽ lưu cache dữ liệu CLB trên máy này để giảm Reads khi F5/đăng nhập lại. Chỉ bật trên máy cá nhân. Tải lại trang ngay?'
            : 'Tắt thiết bị tin cậy sẽ xóa cache Firestore bền trên máy và chuyển sang cache bộ nhớ. Tải lại trang ngay?';
        const accepted = typeof global.confirm === 'function' ? global.confirm(message) : true;
        if (!accepted) {
            syncUi();
            return false;
        }

        writePreference(next);
        if (!next) {
            try { global.localStorage && global.localStorage.removeItem(USER_KEY); } catch (_) {}
            await clearPersistenceInternal();
        }
        state.reloadRequestedAt = Date.now();
        if (global.location && typeof global.location.reload === 'function') global.location.reload();
        return true;
    }

    function deleteAppIndexedDb() {
        return new Promise((resolve) => {
            try {
                if (!global.indexedDB) return resolve(false);
                const req = global.indexedDB.deleteDatabase(APP_CACHE_DB);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    function removeAppSnapshotKeys() {
        try {
            if (!global.localStorage) return;
            const keys = [];
            for (let i = 0; i < global.localStorage.length; i++) {
                const key = global.localStorage.key(i);
                if (key && (key.startsWith('tst_snapshot_') || key.startsWith('tst_sync_'))) keys.push(key);
            }
            keys.forEach((key) => global.localStorage.removeItem(key));
        } catch (_) {}
    }

    async function clearPersistenceInternal() {
        const sdk = global._fb_init || {};
        const db = state.db || global.__primaryFirestoreDb || null;
        let ok = true;
        try {
            if (db && typeof sdk.terminate === 'function') await sdk.terminate(db);
        } catch (error) {
            ok = false;
            console.warn('[FirestoreCachePolicy] terminate before clear failed:', error);
        }
        try {
            if (db && typeof sdk.clearIndexedDbPersistence === 'function') {
                await sdk.clearIndexedDbPersistence(db);
            }
        } catch (error) {
            ok = false;
            console.warn('[FirestoreCachePolicy] clearIndexedDbPersistence failed:', error);
        }
        await deleteAppIndexedDb();
        removeAppSnapshotKeys();
        state.db = null;
        global.__primaryFirestoreDb = null;
        return ok;
    }

    async function bindAuthenticatedUser(uid) {
        const userId = String(uid || '').trim();
        if (!readPreference() || !userId) return true;
        let previous = '';
        try { previous = global.localStorage ? (global.localStorage.getItem(USER_KEY) || '') : ''; } catch (_) {}
        if (!previous) {
            try { global.localStorage && global.localStorage.setItem(USER_KEY, userId); } catch (_) {}
            return true;
        }
        if (previous === userId) return true;

        // Persistent Firestore cache is project-scoped, not automatically separated by Auth UID.
        // Clear it before a different account can hydrate application state on this device.
        try { global.localStorage && global.localStorage.setItem(USER_KEY, userId); } catch (_) {}
        const cleared = await clearPersistenceInternal();
        if (!cleared) {
            writePreference(false);
            try { global.localStorage && global.localStorage.removeItem(USER_KEY); } catch (_) {}
        }
        state.reloadRequestedAt = Date.now();
        if (global.location && typeof global.location.reload === 'function') global.location.reload();
        return false;
    }

    async function clearTrustedDeviceData() {
        const accepted = typeof global.confirm === 'function'
            ? global.confirm('Xóa cache Firestore và cache ứng dụng trên thiết bị này? Dữ liệu trên máy chủ không bị xóa.')
            : true;
        if (!accepted) return false;

        writePreference(false);
        try { global.localStorage && global.localStorage.removeItem(USER_KEY); } catch (_) {}
        await clearPersistenceInternal();

        if (global.location && typeof global.location.reload === 'function') global.location.reload();
        return true;
    }

    function bindLoginUi() {
        if (state.uiBound) return;
        const bind = () => {
            const checkbox = global.document && global.document.getElementById('trustedDeviceCheckbox');
            if (!checkbox) return;
            state.uiBound = true;
            checkbox.addEventListener('change', function onTrustedDeviceChange() {
                void setTrustedFromUi(checkbox.checked);
            });
            const clearBtn = global.document.getElementById('clearTrustedDeviceCacheBtn');
            if (clearBtn) clearBtn.addEventListener('click', clearTrustedDeviceData);
            syncUi();
        };
        if (global.document && global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', bind, { once: true });
        } else {
            bind();
        }
    }

    function diagnostics() {
        return {
            version: VERSION,
            trustedPreference: readPreference(),
            mode: state.mode,
            initializedAt: state.initializedAt,
            fallbackReason: state.fallbackReason,
            hasDb: !!(state.db || global.__primaryFirestoreDb),
            uiBound: state.uiBound,
            userBindingPresent: (() => {
                try { return !!(global.localStorage && global.localStorage.getItem(USER_KEY)); } catch (_) { return false; }
            })(),
        };
    }

    function printDiagnostics() {
        const result = diagnostics();
        if (global.console && typeof global.console.table === 'function') {
            console.group('[FirestoreCachePolicy] V4C1');
            console.table(result);
            console.groupEnd();
        }
        return result;
    }

    function optimizationDiagnostics() {
        let listenerMetrics = null;
        try {
            if (typeof global.getListenerMetrics === 'function') listenerMetrics = global.getListenerMetrics();
        } catch (_) {}
        const activeEntries = listenerMetrics && Array.isArray(listenerMetrics.activeEntries)
            ? listenerMetrics.activeEntries
            : [];
        return {
            cache: diagnostics(),
            inventoryDebt: {
                mounted: global.__inventoryDebtListenerMounted === true,
                completeness: global.__inventoryDebtCompleteness || 'not-initialized',
                mountReason: global.__inventoryDebtListenerMountReason || '',
                count: Array.isArray(global.__completeInventoryDebts) ? global.__completeInventoryDebts.length : 0,
            },
            adminNotifications: {
                mounted: global.__adminNotificationListenerMounted === true,
                listenerCount: activeEntries.filter((entry) => String(entry.key || '').includes('global:notif:')).length,
                unreadRendered: Array.isArray(global._pendingNotifIds) ? global._pendingNotifIds.length : 0,
            },
            listeners: listenerMetrics ? {
                activeCount: listenerMetrics.activeCount,
                duplicatePreventedBeforeCreate: listenerMetrics.duplicatePreventedBeforeCreate,
                activeEntries,
            } : null,
        };
    }

    function printOptimizationStatus() {
        const result = optimizationDiagnostics();
        if (global.console) {
            console.group('[Firestore Reads Optimization] Phase 4K-6V4C1');
            console.log('Cache:', result.cache);
            console.table({
                inventoryDebtMounted: { value: result.inventoryDebt.mounted },
                inventoryDebtCompleteness: { value: result.inventoryDebt.completeness },
                inventoryDebtMountReason: { value: result.inventoryDebt.mountReason || '—' },
                adminNotificationListenerMounted: { value: result.adminNotifications.mounted },
                notificationListenerCount: { value: result.adminNotifications.listenerCount },
            });
            if (result.listeners && Array.isArray(result.listeners.activeEntries)) {
                console.table(result.listeners.activeEntries);
            }
            console.groupEnd();
        }
        return result;
    }

    const api = {
        version: VERSION,
        initialize,
        readPreference,
        setTrustedFromUi,
        clearTrustedDeviceData,
        bindAuthenticatedUser,
        bindLoginUi,
        syncUi,
        diagnostics,
        printDiagnostics,
        optimizationDiagnostics,
        printOptimizationStatus,
    };

    global.FirestoreCachePolicy = api;
    global.setTrustedDeviceCache = setTrustedFromUi;
    global.clearTrustedDeviceCache = clearTrustedDeviceData;
    global.bindFirestoreCacheUser = bindAuthenticatedUser;
    global.printFirestoreCachePolicy = printDiagnostics;
    global.getFirestoreOptimizationStatus = optimizationDiagnostics;
    global.printFirestoreOptimizationStatus = printOptimizationStatus;
    bindLoginUi();
})(window);
