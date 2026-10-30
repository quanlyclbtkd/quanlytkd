/**
 * store.js
 * ────────────────────────────────────────────────────────────────
 * Singleton state management — thay thế các biến closure rải rác
 * trong app.js (allProfiles, allTransactions, currentClubId, v.v.)
 *
 * Phase 2g UPGRADE:
 *   - resetStore() tích hợp listeners.js (cleanupAll) thay vì
 *     dùng array-based cleanup cũ — tránh trường hợp listener
 *     không được đăng ký trong activeListeners nhưng vẫn đang chạy.
 *
 * Phase 3.2A UPGRADE:
 *   - store.pagination: namespace cho server-side cursor pagination
 *     students + transactions (PAGE_SIZE = 50)
 *   - resetStore() dọn dẹp pagination state khi logout
 *
 * ES Module singleton: file này chỉ được evaluate MỘT LẦN bởi browser.
 * Mọi module import store đều nhận cùng một object reference.
 *
 * /// NEW ARCHITECTURE — Phase 3.2A (Pagination)
 * ────────────────────────────────────────────────────────────────
 */

import { DEFAULT_CLUB_CONFIG } from './utils/constants.js';
import { cleanupAll }          from './utils/listeners.js';

/**
 * Singleton store chứa toàn bộ application state.
 *
 * MIGRATION: Các closure variables cũ trong app.js → store fields:
 *   currentClubId   → store.clubId
 *   allProfiles     → store.profiles
 *   allTransactions → store.transactions
 *   allInventory    → store.inventory
 *   inventoryStats  → store.inventoryStats
 *   clubConfig      → store.clubConfig
 *   clubData        → store.clubData
 *   db              → store.db         (set bởi firebase/config.js)
 *   auth            → store.auth       (set bởi firebase/config.js)
 *   colRef          → store.colRef     (set sau khi đăng nhập)
 *   profRef         → store.profRef    (set sau khi đăng nhập)
 *   invRef          → store.invRef     (set sau khi đăng nhập)
 */
export const store = {
    // ── Firebase refs (set bởi firebase/config.js) ──────────────
    db:   null,
    auth: null,
    secondaryAuth: null,

    // ── Firestore collection refs (set sau login) ────────────────
    colRef:  null,   // clubs/{clubId}/transactions
    profRef: null,   // clubs/{clubId}/profiles
    invRef:  null,   // clubs/{clubId}/inventory

    // ── Auth state ───────────────────────────────────────────────
    userRole:         'viewer', // 'admin' | 'coach' | 'viewer' | 'superadmin'
    currentUserEmail: '',
    coachBranch:      '',       // Chi nhánh HLV (rỗng = tất cả)

    // ── Club data ────────────────────────────────────────────────
    clubId:   '',
    clubData: {},
    clubConfig: { ...DEFAULT_CLUB_CONFIG },

    // ── Realtime data ────────────────────────────────────────────
    profiles:       {},    // { [name]: profileObject } — ALL profiles (full collection, for business logic)
    transactions:   [],    // Transaction[] — current month (onSnapshot, for business logic)
    inventory:      [],    // InventoryItem[]
    inventoryStats: {},

    // ── Custom inventory categories (loaded from Firestore) ──────
    invCustomCategories: [],

    // ── Render optimization ──────────────────────────────────────
    renderTimeout:        null,
    dataVersion:          0,
    // R2R5: RAM-only semantic source epochs. These are freshness signals only;
    // they are not business/security authority and reset with the session.
    _transactionsVersion:       0,
    _tuitionEvidenceVersion:    0,
    _inventoryTxVersion:        0,
    _examTxVersion:             0,
    _settingsVersion:           0,
    _inventoryCategoryVersion:  0,
    lastRenderedVersion:  -1,
    lastSizeSelectHtml:   '',
    tabHtmlCache:         {},

    // ── Listeners (Phase 2g: managed bởi listeners.js) ──────────
    // activeListeners vẫn giữ để tương thích với app.js bridge
    activeListeners:    [],   // Array<Unsubscribe> — legacy, dùng listeners.js thay thế
    currentTxUnsub:     null,

    // ── Chart instances (cleanup để tránh memory leak) ──────────
    financeChartInstance: null,
    memberChartInstance:  null,

    // ── Receipt / logo ───────────────────────────────────────────
    logoCanvasData: null,
    logoLoaded:     false,

    // ── Phase 3.2A: Server-side Pagination ───────────────────────
    // Mỗi field được khởi tạo bởi createPaginationState() khi module init.
    // null = chưa khởi tạo; object = đang hoạt động.
    //
    // students:     createPaginationState() từ modules/students.js
    // transactions: createPaginationState() từ modules/finance.js
    //
    // Reusable cho các module tương lai:
    //   store.pagination.attendance
    //   store.pagination.inventory
    //   store.pagination.exams
    pagination: {
        students:     null,
        transactions: null,
    },
};

/**
 * Reset toàn bộ state về trạng thái ban đầu (dùng khi logout).
 *
 * Phase 2g UPGRADE: Hủy listeners theo 2 cơ chế:
 *   1. listeners.js cleanupAll() — key-based Map (NEW)
 *   2. activeListeners array — legacy bridge với app.js (KEEP)
 *
 * Phase 3.2A UPGRADE: Reset pagination states
 *
 * Thứ tự cleanup:
 *   1. Hủy listeners (tránh callback gọi vào state đã reset)
 *   2. Hủy charts (tránh memory leak)
 *   3. Reset data fields
 *   4. Reset pagination state
 */
export function resetStore() {
    // 1a. Hủy listeners qua listeners.js (Phase 2g — key-based Map)
    try { cleanupAll(); } catch (_) {}

    // 1b. Hủy listeners legacy (bridge với app.js activeListeners array)
    store.activeListeners.forEach(unsub => { try { unsub(); } catch (_) {} });
    store.activeListeners = [];

    // 1c. Hủy tx listener riêng
    if (store.currentTxUnsub) {
        try { store.currentTxUnsub(); } catch (_) {}
        store.currentTxUnsub = null;
    }

    // 2. Hủy chart instances (tránh memory leak Chart.js)
    if (store.financeChartInstance) {
        store.financeChartInstance.destroy();
        store.financeChartInstance = null;
    }
    if (store.memberChartInstance) {
        store.memberChartInstance.destroy();
        store.memberChartInstance = null;
    }

    // 3. Reset tất cả data fields
    store.clubId              = '';
    store.clubData            = {};
    store.clubConfig          = { ...DEFAULT_CLUB_CONFIG };
    store.profiles            = {};
    store.transactions        = [];
    store.inventory           = [];
    store.inventoryStats      = {};
    store.invCustomCategories = [];
    store.colRef              = null;
    store.profRef             = null;
    store.invRef              = null;
    store.userRole            = 'viewer';
    store.currentUserEmail    = '';
    store.coachBranch         = '';
    store.tabHtmlCache        = {};
    store.lastSizeSelectHtml  = '';
    store.dataVersion                = 0;
    store._transactionsVersion       = 0;
    store._tuitionEvidenceVersion    = 0;
    store._inventoryTxVersion        = 0;
    store._examTxVersion             = 0;
    store._settingsVersion           = 0;
    store._inventoryCategoryVersion  = 0;
    store.lastRenderedVersion        = -1;

    // 4. Reset pagination states (Phase 3.2A)
    store.pagination = {
        students:     null,
        transactions: null,
    };
}


/**
 * R2R5 semantic freshness bridge for the legacy window.__store.
 *
 * The legacy app remains the canonical writer. This bridge only observes
 * authoritative RAM assignments and advances RAM-only epochs. It never reads
 * Firestore, writes business data, or decides authorization.
 */
export function installSemanticSourceEpochBridge(legacyStore, globalObject = window) {
    const target = legacyStore && typeof legacyStore === 'object' ? legacyStore : null;
    if (!target || target.__r2r5SemanticEpochBridgeInstalled) return target;

    const epochKeys = [
        '_transactionsVersion', '_tuitionEvidenceVersion', '_inventoryTxVersion',
        '_examTxVersion', '_settingsVersion', '_inventoryCategoryVersion',
    ];
    const resetEpochs = (reason = 'reset') => {
        epochKeys.forEach(key => { target[key] = 0; });
        target._lastSemanticEpochResetReason = reason;
        target._lastTransactionSemanticEffect = null;
    };
    epochKeys.forEach(key => { target[key] = Number(target[key] || 0); });

    const rowId = (row, index) => String(row && (row.id || row.txId) || `__idx_${index}`);
    const rowSignature = row => {
        try { return JSON.stringify(row || {}); } catch (_) { return String(row || ''); }
    };
    const effectsFor = row => {
        const tx = row || {};
        let components = [];
        try {
            components = typeof globalObject.getAccountingComponents === 'function'
                ? (globalObject.getAccountingComponents(tx) || [])
                : [];
        } catch (_) {}
        let tuitionEvidence = components.some(c => c && c.kind === 'tuition');
        if (typeof globalObject.isTuitionFinanceTransaction === 'function') {
            try { tuitionEvidence = globalObject.isTuitionFinanceTransaction(tx) === true; } catch (_) {}
        }
        const exam = components.some(c => c && c.kind === 'exam');
        let inventory = components.some(c => c && (c.kind === 'inventory' || c.kind === 'inventoryDebt'));
        if (!inventory && typeof globalObject.classifyInventoryFinanceTx === 'function') {
            try { inventory = globalObject.classifyInventoryFinanceTx(tx)?.isInventory === true; } catch (_) {}
        }
        return { tuitionEvidence: !!tuitionEvidence, inventory: !!inventory, exam: !!exam };
    };
    const diffTransactionEffects = (previousRows, nextRows) => {
        const prev = Array.isArray(previousRows) ? previousRows : [];
        const next = Array.isArray(nextRows) ? nextRows : [];
        const a = new Map(prev.map((row, index) => [rowId(row, index), { row, sig: rowSignature(row) }]));
        const b = new Map(next.map((row, index) => [rowId(row, index), { row, sig: rowSignature(row) }]));
        const effects = { changed: false, finance: false, tuitionEvidence: false, inventory: false, exam: false };
        new Set([...a.keys(), ...b.keys()]).forEach(id => {
            const oldItem = a.get(id), newItem = b.get(id);
            if (oldItem?.sig === newItem?.sig) return;
            effects.changed = effects.finance = true;
            for (const item of [oldItem, newItem]) {
                if (!item) continue;
                const e = effectsFor(item.row);
                effects.tuitionEvidence ||= e.tuitionEvidence;
                effects.inventory ||= e.inventory;
                effects.exam ||= e.exam;
            }
        });
        return effects;
    };

    let transactionsValue = Array.isArray(target.transactions) ? target.transactions : [];
    Object.defineProperty(target, 'transactions', {
        configurable: true,
        enumerable: true,
        get: () => transactionsValue,
        set: value => {
            const next = Array.isArray(value) ? value : value;
            const effects = diffTransactionEffects(transactionsValue, next);
            transactionsValue = next;
            if (!effects.changed) return;
            target._transactionsVersion += 1;
            if (effects.tuitionEvidence) target._tuitionEvidenceVersion += 1;
            if (effects.inventory) target._inventoryTxVersion += 1;
            if (effects.exam) target._examTxVersion += 1;
            target._lastTransactionSemanticEffect = { ...effects, at: Date.now() };
        },
    });

    let clubConfigValue = target.clubConfig;
    let clubConfigSignature = rowSignature(clubConfigValue);
    Object.defineProperty(target, 'clubConfig', {
        configurable: true,
        enumerable: true,
        get: () => clubConfigValue,
        set: value => {
            const nextSignature = rowSignature(value);
            clubConfigValue = value;
            if (nextSignature === clubConfigSignature) return;
            clubConfigSignature = nextSignature;
            target._settingsVersion += 1;
        },
    });

    let categoriesValue = Array.isArray(globalObject.invCustomCategories) ? globalObject.invCustomCategories : [];
    let categoriesSignature = rowSignature(categoriesValue);
    Object.defineProperty(globalObject, 'invCustomCategories', {
        configurable: true,
        enumerable: true,
        get: () => categoriesValue,
        set: value => {
            const nextSignature = rowSignature(value);
            categoriesValue = value;
            if (nextSignature === categoriesSignature) return;
            categoriesSignature = nextSignature;
            target._inventoryCategoryVersion += 1;
        },
    });

    let contextClubId = String(target.clubId || target.currentClubId || '');
    globalObject.addEventListener?.('app:context-ready', event => {
        const nextClubId = String(event?.detail?.clubId || target.clubId || target.currentClubId || '');
        if (contextClubId && nextClubId && contextClubId !== nextClubId) resetEpochs('club-switch');
        contextClubId = nextClubId;
    });

    target.__r2r5SemanticEpochBridgeInstalled = true;
    target.__r2r5ResetSemanticEpochs = resetEpochs;
    return target;
}
