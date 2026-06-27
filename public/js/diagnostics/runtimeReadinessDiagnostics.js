/**
 * Phase 4K-6T — Runtime Readiness Diagnostics
 *
 * Read-only diagnostic helpers extracted from app.js. This module may inspect
 * DOM/store state and issue bounded Firestore reads with limit(1), but it never
 * writes Firestore, subscribes to snapshots, mutates business data, or owns any
 * authentication/render/recovery kernel flow.
 */

function getStore() {
    return (typeof window !== 'undefined' && window.__store) || {};
}

function getContext() {
    if (typeof window === 'undefined') return {};
    try {
        return typeof window.getAppContext === 'function'
            ? (window.getAppContext('runtime-readiness-diagnostics') || {})
            : {};
    } catch (_) {
        return {};
    }
}

function getFirestoreReadApi() {
    const fb = (typeof window !== 'undefined' && window._fb_init) || {};
    return {
        collection: fb.collection,
        getDocs: fb.getDocs,
        query: fb.query,
        limit: fb.limit,
    };
}

export function debugMobileSuperAdminGate() {
    const btn = document.getElementById('mmsAdminBtn');
    const result = {
        userRole:        window.userRole || '',
        storeRole:       (window.__store && window.__store.userRole) || '',
        isSuperAdmin:    typeof window.isSuperAdminRole === 'function'
                             ? window.isSuperAdminRole()
                             : false,
        buttonExists:    !!btn,
        buttonDisplay:   btn ? getComputedStyle(btn).display : '',
        canOpenNewClubModal: typeof window.openNewClubModal === 'function'
    };
    console.table(result);
    return result;
}

export function printDataHydrationStatus() {
    const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
    const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
    const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];
    const m        = window.__dataHydrationMetrics || {};

    const result = {
        clubId:                  window.__store && (window.__store.clubId || window.__store.currentClubId) || window.currentClubId || '',
        appContextReady:         !!(window.__appContextReadyState && window.__appContextReadyState.ready),
        profilesDocCount:        m.profilesDocCount         != null ? m.profilesDocCount         : null,
        transactionsDocCount:    m.transactionsDocCount     != null ? m.transactionsDocCount     : null,
        inventoryDocCount:       m.inventoryDocCount        != null ? m.inventoryDocCount        : null,
        storeProfilesCount:      Object.keys(profiles).length,
        storeTransactionsCount:  Array.isArray(tx)  ? tx.length  : 0,
        storeInventoryCount:     Array.isArray(inv) ? inv.length : 0,
        settingsLoaded:          !!m.settingsLoaded,
        clubLoaded:              !!m.clubLoaded,
        lastReason:              m.lastReason || ''
    };

    console.table(result);
    return result;
}

export function printTabDataStatus() {
    const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
    const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
    const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];

    const selectedMonth =
        (document.getElementById('filterMonth') && document.getElementById('filterMonth').value) ||
        (document.getElementById('monthFilter') && document.getElementById('monthFilter').value) ||
        '';

    const txInMonth = Array.isArray(tx)
        ? tx.filter(function(t) {
            return !selectedMonth ||
                t.txMonth === selectedMonth ||
                (t.date && String(t.date).startsWith(selectedMonth));
          }).length
        : 0;

    const result = {
        currentTab:                  window.currentTab || (window.__store && window.__store.currentTab) || '',
        selectedMonth,
        profilesCount:               Object.keys(profiles).length,
        transactionsCount:           Array.isArray(tx)  ? tx.length  : 0,
        transactionsInSelectedMonth: txInMonth,
        inventoryCount:              Array.isArray(inv) ? inv.length : 0,
        tuitionTabCanRender:         Object.keys(profiles).length > 0 || txInMonth > 0,
        debtTabCanRender:            Object.keys(profiles).length > 0,
        inventoryTabCanRender:       Array.isArray(inv) && inv.length > 0,
        dashboardCanRender:          Object.keys(profiles).length > 0 || (Array.isArray(tx) && tx.length > 0) || (Array.isArray(inv) && inv.length > 0)
    };

    console.table(result);
    return result;
}

export async function printFirestorePathStatus() {
    const store = getStore();
    const ctx = getContext();
    const _db = store.db || ctx.db || window.db || window._db || null;
    const _clubId = store.clubId || store.currentClubId || ctx.currentClubId || window.currentClubId || '';
    const { collection, getDocs, query, limit } = getFirestoreReadApi();

    if (!_db || !_clubId || !collection || !getDocs || !query || !limit) {
        console.warn('[printFirestorePathStatus] db, clubId hoặc Firebase read API chưa sẵn sàng.', {
            hasDb: !!_db,
            clubId: _clubId,
            hasReadApi: !!(collection && getDocs && query && limit),
        });
        return null;
    }

    async function _hasDoc(path) {
        try {
            const parts = path.split('/').filter(Boolean);
            const ref = collection(_db, ...parts);
            const snap = await getDocs(query(ref, limit(1)));
            return snap && snap.size > 0;
        } catch (e) {
            if (e && e.code === 'permission-denied') return 'permission-denied';
            return 'error: ' + (e && e.message ? e.message.slice(0, 60) : 'unknown');
        }
    }

    console.log('[printFirestorePathStatus] Đang kiểm tra Firestore paths (limit 1)...');

    const [pProf, pTx, pInv, lProf, lTx, lInv] = await Promise.all([
        _hasDoc('clubs/' + _clubId + '/profiles'),
        _hasDoc('clubs/' + _clubId + '/transactions'),
        _hasDoc('clubs/' + _clubId + '/inventory'),
        _hasDoc('tst_profiles'),
        _hasDoc('tst_transactions'),
        _hasDoc('tst_inventory')
    ]);

    const primaryHasAny = pProf === true || pTx === true || pInv === true;
    const legacyHasAny  = lProf === true || lTx === true || lInv === true;
    let recommendation;
    if (primaryHasAny)      recommendation = 'primary — dùng clubs/' + _clubId;
    else if (legacyHasAny)  recommendation = 'legacy-root — gọi window.activateLegacyRootFallback()';
    else                    recommendation = 'empty — kiểm tra clubId hoặc nhập dữ liệu';

    const result = {
        clubId:      _clubId,
        primary:     { profilesHasDocs: pProf, transactionsHasDocs: pTx, inventoryHasDocs: pInv },
        legacy:      { profilesHasDocs: lProf, transactionsHasDocs: lTx, inventoryHasDocs: lInv },
        recommendation
    };

    console.table({ clubId: _clubId, recommendation });
    console.group('[printFirestorePathStatus] Primary path: clubs/' + _clubId);
    console.table(result.primary);
    console.groupEnd();
    console.group('[printFirestorePathStatus] Legacy root collections');
    console.table(result.legacy);
    console.groupEnd();
    console.log('[printFirestorePathStatus] ✅ Hoàn thành (chỉ kiểm tra, không ghi data).');
    return result;
}

export function printPilotTabReadiness() {
    const profiles = window.__store && window.__store.profiles ? window.__store.profiles : {};
    const tx       = window.__store && window.__store.transactions ? window.__store.transactions : [];
    const inv      = window.__store && window.__store.inventory    ? window.__store.inventory    : [];
    const metrics  = window.__firestoreDataSourceMetrics || {};

    const _classifyFn = typeof window.classifyProfileStatus === 'function'
        ? window.classifyProfileStatus
        : function(p) {
            return p && (p.status === 'quit' || p.status === 'retired' || p.status === 'inactive') ? 'quit' : 'active';
        };
    const activeProfiles = Object.values(profiles).filter(function(p) {
        return p && _classifyFn(p) !== 'quit';
    });
    const quitProfiles = Object.values(profiles).filter(function(p) {
        return p && _classifyFn(p) === 'quit';
    });

    const warnings = [];
    if (!metrics.activeDataSource) warnings.push('activeDataSource chưa xác định — gọi resolveActiveDataSource() trước');
    if (Object.keys(profiles).length === 0) warnings.push('Profiles rỗng — kiểm tra Firestore path hoặc bật legacy fallback');
    if (Array.isArray(tx) && tx.length === 0) warnings.push('Transactions rỗng');
    if (Array.isArray(inv) && inv.length === 0) warnings.push('Inventory rỗng');

    const result = {
        activeDataSource:    metrics.activeDataSource || 'unknown',
        profilesCount:       Object.keys(profiles).length,
        transactionsCount:   Array.isArray(tx)  ? tx.length  : 0,
        inventoryCount:      Array.isArray(inv) ? inv.length : 0,
        tuitionReady:        Object.keys(profiles).length > 0 && Array.isArray(tx),
        debtReady:           Object.keys(profiles).length > 0,
        activeStudentsReady: activeProfiles.length > 0,
        quitStudentsReady:   quitProfiles.length > 0 || Object.keys(profiles).length > 0,
        inventoryReady:      Array.isArray(inv) && inv.length > 0,
        dashboardReady:      Object.keys(profiles).length > 0 || (Array.isArray(tx) && tx.length > 0),
        warnings:            warnings.length > 0 ? warnings.join(' | ') : 'none'
    };

    console.table(result);
    if (warnings.length) {
        warnings.forEach(function(w) { console.warn('[PilotReadiness] ⚠️', w); });
    } else {
        console.info('[PilotReadiness] ✅ Tất cả tabs sẵn sàng cho pilot!');
    }
    return result;
}

export function printPilotLaunchStatus() {
    let tab = null;
    try {
        if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
    } catch (_) {}

    let health = null;
    try {
        if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
    } catch (_) {}

    const rr = window.__runtimeRecoveryState || {};
    const activeDataSource =
        (window.__store && window.__store.activeDataSource) ||
        (window.__firestoreDataSourceMetrics && window.__firestoreDataSourceMetrics.activeDataSource) ||
        'unknown';

    const readyForOneClubPilot = !!(tab && tab.tuitionReady && tab.debtReady);
    const pilotBlockers = [];
    if (!readyForOneClubPilot) pilotBlockers.push('readyForOneClubPilot = false');
    if (activeDataSource !== 'primary' && activeDataSource !== 'legacy-root') pilotBlockers.push('activeDataSource = ' + activeDataSource);
    if (!tab || !(tab.profilesCount > 0)) pilotBlockers.push('profilesCount = 0');
    if (!tab || !tab.tuitionReady) pilotBlockers.push('tuitionReady = false');
    if (!tab || !tab.debtReady) pilotBlockers.push('debtReady = false');
    if (!tab || !tab.dashboardReady) pilotBlockers.push('dashboardReady = false');
    if (!rr.completed && activeDataSource !== 'primary') pilotBlockers.push('runtimeRecovery not completed and activeDataSource != primary');
    if (rr.error) pilotBlockers.push('runtimeRecovery.error exists');
    if (health && health.criticalMissing && health.criticalMissing.length > 0) pilotBlockers.push('critical runtime health missing');

    const result = {
        runtimeRecovery: rr,
        activeDataSource,
        profilesCount:     (tab && tab.profilesCount)     || 0,
        transactionsCount: (tab && tab.transactionsCount) || 0,
        inventoryCount:    (tab && tab.inventoryCount)    || 0,
        tuitionReady:      !!(tab && tab.tuitionReady),
        debtReady:         !!(tab && tab.debtReady),
        inventoryReady:    !!(tab && tab.inventoryReady),
        dashboardReady:    !!(tab && tab.dashboardReady),
        readyForInternalTest: !!((tab && tab.profilesCount > 0) || (tab && tab.transactionsCount > 0)),
        readyForOneClubPilot,
        readyForTenClubPilot: pilotBlockers.length === 0,
        pilotBlockers
    };

    console.table(result);
    return result;
}

export function printTenClubPilotReadiness() {
    let launch = null;
    try {
        if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
    } catch (_) {}

    let health = null;
    try {
        if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
    } catch (_) {}

    let hydration = null;
    try {
        if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
    } catch (_) {}

    let tab = null;
    try {
        if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
    } catch (_) {}

    const blockers = [];
    if (!launch || !launch.readyForOneClubPilot) blockers.push('Not ready for 1-CLB pilot yet');
    if (!tab || !(tab.profilesCount > 0)) blockers.push('No profiles loaded');
    if (!tab || !tab.tuitionReady) blockers.push('Tuition tab not ready');
    if (!tab || !tab.debtReady) blockers.push('Debt tab not ready');
    if (!tab || !tab.dashboardReady) blockers.push('Dashboard not ready');
    if (health && health.criticalMissing && health.criticalMissing.length > 0) blockers.push('Runtime critical checks missing: ' + health.criticalMissing.join(', '));
    if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error) blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));

    const result = {
        activeDataSource:      launch ? launch.activeDataSource      : 'unknown',
        profilesCount:         tab    ? (tab.profilesCount      || 0) : 0,
        transactionsCount:     tab    ? (tab.transactionsCount || 0) : 0,
        inventoryCount:        tab    ? (tab.inventoryCount    || 0) : 0,
        readyForOneClubPilot:  !!(launch && launch.readyForOneClubPilot),
        readyForTenClubPilot:  blockers.length === 0,
        blockers
    };

    console.table(result);
    return result;
}

export async function generatePilotLaunchSnapshot() {
    const timestamp = new Date().toISOString();

    let dataSource = null;
    try {
        if (typeof window.resolveActiveDataSource === 'function') dataSource = await window.resolveActiveDataSource();
    } catch (e) {
        dataSource = { error: String(e).slice(0, 200) };
    }

    let hydration = null;
    try {
        if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
    } catch (_) {}

    let tab = null;
    try {
        if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
    } catch (_) {}

    let launch = null;
    try {
        if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
    } catch (_) {}

    let tenClub = null;
    try {
        if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
    } catch (_) {}

    const snapshot = {
        snapshotAt: timestamp,
        activeDataSource: dataSource,
        dataHydration: hydration,
        tabReadiness: tab,
        pilotLaunchStatus: launch,
        tenClubPilotReadiness: tenClub,
        runtimeRecoveryState: window.__runtimeRecoveryState || null,
        firestoreDataSourceMetrics: window.__firestoreDataSourceMetrics || null
    };

    console.group('[generatePilotLaunchSnapshot] Pilot Launch Snapshot — ' + timestamp);
    console.log('activeDataSource:', snapshot.activeDataSource);
    console.log('readyForOneClubPilot:', launch && launch.readyForOneClubPilot);
    console.log('readyForTenClubPilot:', launch && launch.readyForTenClubPilot);
    console.log('pilotBlockers:', (launch && launch.pilotBlockers) || []);
    console.groupEnd();

    return snapshot;
}

export function printOneClubPilotGate() {
    let tab = null;
    try {
        if (typeof window.printPilotTabReadiness === 'function') tab = window.printPilotTabReadiness();
    } catch (_) {}

    let launch = null;
    try {
        if (typeof window.printPilotLaunchStatus === 'function') launch = window.printPilotLaunchStatus();
    } catch (_) {}

    let tenClub = null;
    try {
        if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
    } catch (_) {}

    let health = null;
    try {
        if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
    } catch (_) {}

    const activeDataSource = (launch && launch.activeDataSource) || 'unknown';
    const profilesCount    = (tab && tab.profilesCount) || 0;
    const tuitionReady     = !!(tab && tab.tuitionReady);
    const debtReady        = !!(tab && tab.debtReady);
    const dashboardReady   = !!(tab && tab.dashboardReady);
    const inventoryReady   = !!(tab && tab.inventoryReady);

    const blockers = [];
    if (activeDataSource === 'unknown') blockers.push('activeDataSource unknown — login chưa hoàn tất hoặc chưa resolve data source');
    if (!(profilesCount > 0)) blockers.push('profilesCount = 0 — chưa load dữ liệu võ sinh');
    if (!tuitionReady) blockers.push('tuitionReady = false — tab học phí chưa sẵn sàng');
    if (!debtReady) blockers.push('debtReady = false — tab báo nợ chưa sẵn sàng');
    if (!dashboardReady) blockers.push('dashboardReady = false — tab tổng quan chưa sẵn sàng');
    if (health && health.criticalMissing && health.criticalMissing.length > 0) blockers.push('Critical runtime health missing: ' + health.criticalMissing.join(', '));
    if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error) blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));

    const readyForInternalTest = !!(profilesCount > 0 || ((tab && tab.transactionsCount) > 0));
    const readyForOneClubPilot = tuitionReady && debtReady && profilesCount > 0 && (activeDataSource === 'primary' || activeDataSource === 'legacy-root');
    const readyForTenClubPilot = !!(tenClub && tenClub.readyForTenClubPilot);

    const gate = {
        readyForInternalTest,
        readyForOneClubPilot,
        readyForTenClubPilot,
        activeDataSource,
        profilesCount,
        transactionsCount: (tab && tab.transactionsCount) || 0,
        inventoryCount:    (tab && tab.inventoryCount) || 0,
        tuitionReady,
        debtReady,
        dashboardReady,
        inventoryReady,
        blockers
    };

    console.table(gate);
    if (blockers.length > 0) {
        console.warn('[printOneClubPilotGate] ⚠️  NO-GO — ' + blockers.length + ' blocker(s):');
        blockers.forEach((b, i) => console.warn('  [' + (i + 1) + '] ' + b));
    } else {
        console.info('[printOneClubPilotGate] ✅ GO — sẵn sàng pilot 1 CLB.');
    }

    return gate;
}

export const RuntimeReadinessDiagnostics = Object.freeze({
    debugMobileSuperAdminGate,
    printDataHydrationStatus,
    printTabDataStatus,
    printFirestorePathStatus,
    printPilotTabReadiness,
    printPilotLaunchStatus,
    printTenClubPilotReadiness,
    generatePilotLaunchSnapshot,
    printOneClubPilotGate,
});

export default RuntimeReadinessDiagnostics;
