/**
 * Phase 4K-6T — SuperAdmin Audit Diagnostics (lazy-loaded)
 * Bounded read-only Firestore probes. No writes, listeners, or migrations.
 */

function getReadContext() {
    const st = window.__store || {};
    let ctx = {};
    try {
        ctx = typeof window.getAppContext === 'function'
            ? (window.getAppContext('superadmin-audit-diagnostics') || {})
            : {};
    } catch (_) {}
    const fb = window._fb_init || {};
    return {
        db: st.db || ctx.db || window.db || window._db || null,
        collection: fb.collection,
        query: fb.query,
        limit: fb.limit,
        getDocs: fb.getDocs,
    };
}

export async function probeClubDataReadOnly(clubId, options) {
    options = options || {};
    const result = {
        clubId,
        primaryHasProfiles: false,
        primaryHasTransactions: false,
        primaryHasInventory: false,
        legacyHasProfiles: false,
        legacyHasTransactions: false,
        legacyHasInventory: false,
        permissionDenied: false,
        probeError: null
    };
    if (!clubId) {
        result.probeError = 'clubId missing';
        return result;
    }

    const { db, collection, query, limit, getDocs } = getReadContext();
    if (!db) {
        result.probeError = 'Firestore db not available in probe';
        return result;
    }

    async function hasAny(path) {
        try {
            let snap;
            if (collection && query && limit && getDocs) {
                const parts = path.split('/').filter(Boolean);
                const col = collection(db, ...parts);
                const q = query(col, limit(1));
                snap = await getDocs(q);
                return !snap.empty;
            }
            if (db.collection) {
                snap = await db.collection(path).limit(1).get();
                return !snap.empty;
            }
            return false;
        } catch (e) {
            const msg = String(e && (e.code || e.message || e));
            if (/permission.denied|PERMISSION_DENIED/i.test(msg)) throw new Error('permission-denied');
            return false;
        }
    }

    try {
        result.primaryHasProfiles     = await hasAny('clubs/' + clubId + '/profiles');
        result.primaryHasTransactions = await hasAny('clubs/' + clubId + '/transactions');
        result.primaryHasInventory    = await hasAny('clubs/' + clubId + '/inventory');
    } catch (e) {
        if (String(e).includes('permission-denied')) {
            result.permissionDenied = true;
            result.probeError = 'permission-denied while probing club data';
        } else {
            result.probeError = String(e).slice(0, 200);
        }
    }

    if (options.includeLegacyCheck && !result.permissionDenied) {
        try {
            result.legacyHasProfiles     = await hasAny('tst_profiles');
            result.legacyHasTransactions = await hasAny('tst_transactions');
            result.legacyHasInventory    = await hasAny('tst_inventory');
        } catch (_) {}
    }

    return result;
}

export async function runSuperAdminAudit(options) {
    options = options || {};
    const checkedAt = new Date().toISOString();
    const mode = options.mode || 'pilot';
    const limit$ = options.limit || 20;
    const includeLegacyCheck = options.includeLegacyCheck !== false;
    const includeTabReadiness = options.includeTabReadiness !== false;
    const onlyBlockers = !!options.onlyBlockers;

    let superAdminWarning = null;
    try {
        let isSA = false;
        if (typeof window.isSuperAdmin === 'function') isSA = window.isSuperAdmin();
        else if (window.__store && window.__store.superAdmin) isSA = true;
        else if (window.__store && window.__store.currentUser && window.__store.currentUser.isSuperAdmin) isSA = true;
        if (!isSA) superAdminWarning = 'SuperAdmin role not confirmed in runtime';
    } catch (_) {
        superAdminWarning = 'SuperAdmin role not confirmed in runtime';
    }

    let clubIds = [];
    if (options.clubIds && options.clubIds.length > 0) {
        clubIds = options.clubIds.slice(0, limit$);
    } else {
        const storeClubs = (window.__store && (window.__store.clubs || window.__store.superAdminClubs)) || null;
        if (storeClubs && typeof storeClubs === 'object') {
            if (Array.isArray(storeClubs)) clubIds = storeClubs.map(function(c) { return c.id || c.clubId || c; }).slice(0, limit$);
            else clubIds = Object.keys(storeClubs).slice(0, limit$);
        }
        if (clubIds.length === 0) {
            const currentId = (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId;
            if (currentId) clubIds = [currentId];
        }
    }

    const clubs = [];
    let readyForPilotCount = 0;
    let blockedCount = 0;
    let warningCount = 0;
    const blockersSummary = [];
    const currentLoginClubId = (window.__store && (window.__store.clubId || window.__store.currentClubId)) || window.currentClubId;

    for (let i = 0; i < clubIds.length; i++) {
        const cid = clubIds[i];
        const clubBlockers = [];
        const clubWarnings = [];
        const probe = await probeClubDataReadOnly(cid, { includeLegacyCheck });

        if (probe.permissionDenied) clubBlockers.push('permission-denied while probing club data');
        if (probe.probeError && !probe.permissionDenied) clubWarnings.push('probe error: ' + probe.probeError);

        let activeDataSource = 'unknown';
        if (probe.primaryHasProfiles) activeDataSource = 'primary';
        else if (probe.legacyHasProfiles) activeDataSource = 'legacy-root';
        else if (!probe.permissionDenied) activeDataSource = 'empty';
        else activeDataSource = 'permission-error';

        let gateResult = null;
        let tuitionReady = false;
        let debtReady = false;
        let inventoryReady = false;
        let dashboardReady = false;
        let readyForOneClubPilot = false;
        let readyForTenClubExpansion = false;
        const profilesReady = probe.primaryHasProfiles || probe.legacyHasProfiles;

        if (cid === currentLoginClubId && includeTabReadiness) {
            try {
                if (typeof window.runOnboardingGate === 'function') {
                    gateResult = await window.runOnboardingGate(cid);
                    tuitionReady = !!(gateResult && gateResult.tuitionReady);
                    debtReady = !!(gateResult && gateResult.debtReady);
                    inventoryReady = !!(gateResult && gateResult.inventoryReady);
                    dashboardReady = !!(gateResult && gateResult.dashboardReady);
                    readyForOneClubPilot = !!(gateResult && gateResult.readyForOneClubPilot);
                    readyForTenClubExpansion = !!(gateResult && gateResult.readyForTenClubPilot);
                    if (gateResult && gateResult.blockers) gateResult.blockers.forEach(function(b) { clubBlockers.push(b); });
                    if (gateResult && gateResult.warnings) gateResult.warnings.forEach(function(w) { clubWarnings.push(w); });
                }
            } catch (_) {
                clubWarnings.push('runtime gate failed for current club');
            }
        } else {
            if (!profilesReady) clubBlockers.push('No profiles in primary or legacy path');
            readyForOneClubPilot = profilesReady && !probe.permissionDenied;
            readyForTenClubExpansion = profilesReady && !probe.permissionDenied;
        }

        if (!profilesReady && !clubBlockers.some(function(b) { return b.includes('profile'); })) clubBlockers.push('No profiles loaded');
        if (superAdminWarning && i === 0) clubWarnings.push(superAdminWarning);

        if (clubBlockers.length === 0) readyForPilotCount++;
        else {
            blockedCount++;
            clubBlockers.forEach(function(b) {
                if (!blockersSummary.includes(b)) blockersSummary.push(b);
            });
        }
        if (clubWarnings.length > 0) warningCount++;

        const clubEntry = {
            clubId: cid,
            clubName: (window.__store && window.__store.clubs && window.__store.clubs[cid] && window.__store.clubs[cid].name) || '',
            activeDataSource,
            primaryHasProfiles: probe.primaryHasProfiles,
            primaryHasTransactions: probe.primaryHasTransactions,
            primaryHasInventory: probe.primaryHasInventory,
            legacyHasProfiles: probe.legacyHasProfiles,
            legacyHasTransactions: probe.legacyHasTransactions,
            legacyHasInventory: probe.legacyHasInventory,
            profilesReady,
            tuitionReady,
            debtReady,
            inventoryReady,
            dashboardReady,
            readyForOneClubPilot,
            readyForTenClubExpansion,
            blockers: clubBlockers,
            warnings: clubWarnings
        };

        if (!onlyBlockers || clubBlockers.length > 0) clubs.push(clubEntry);
    }

    const auditResult = {
        checkedAt,
        mode,
        totalClubs: clubIds.length,
        readyForPilotCount,
        blockedCount,
        warningCount,
        clubs,
        blockersSummary
    };

    console.group('[runSuperAdminAudit] Audit — ' + mode + ' — ' + checkedAt);
    console.log('totalClubs:', auditResult.totalClubs);
    console.log('readyForPilotCount:', auditResult.readyForPilotCount);
    console.log('blockedCount:', auditResult.blockedCount);
    console.log('blockersSummary:', auditResult.blockersSummary);
    console.groupEnd();
    return auditResult;
}

export async function printSuperAdminAudit(options) {
    const result = await runSuperAdminAudit(options || {});
    console.table(result.clubs.map(function(c) {
        return {
            clubId: c.clubId,
            clubName: c.clubName || '',
            activeDataSource: c.activeDataSource,
            profilesReady: c.profilesReady,
            tuitionReady: c.tuitionReady,
            debtReady: c.debtReady,
            inventoryReady: c.inventoryReady,
            dashboardReady: c.dashboardReady,
            readyForOneClubPilot: c.readyForOneClubPilot,
            readyForTenClubExpansion: c.readyForTenClubExpansion,
            blockers: (c.blockers && c.blockers.length) || 0
        };
    }));
    return result;
}

export async function generateSuperAdminAuditReportText(options) {
    const result = await runSuperAdminAudit(options || {});
    const lines = [
        '# SuperAdmin Multi-Club Audit Report',
        '',
        '## Summary',
        '- Checked at: ' + result.checkedAt,
        '- Total clubs: ' + result.totalClubs,
        '- Ready for pilot: ' + result.readyForPilotCount,
        '- Blocked: ' + result.blockedCount,
        '- Warnings: ' + result.warningCount,
        '',
        '## Club Results',
        '| Club ID | Club Name | Data Source | Profiles | Tuition | Debt | Inventory | Dashboard | Pilot Ready | Blockers |',
        '|---|---|---|---|---|---|---|---|---|---|'
    ];

    result.clubs.forEach(function(c) {
        lines.push(
            '| ' + (c.clubId || '') +
            ' | ' + (c.clubName || '') +
            ' | ' + (c.activeDataSource || '') +
            ' | ' + (c.profilesReady ? 'YES' : 'NO') +
            ' | ' + (c.tuitionReady ? 'YES' : 'NO') +
            ' | ' + (c.debtReady ? 'YES' : 'NO') +
            ' | ' + (c.inventoryReady ? 'YES' : 'NO') +
            ' | ' + (c.dashboardReady ? 'YES' : 'NO') +
            ' | ' + (c.readyForOneClubPilot ? 'YES' : 'NO') +
            ' | ' + ((c.blockers && c.blockers.length) || 0) + ' |'
        );
    });

    lines.push('');
    lines.push('## Blockers Summary');
    if (result.blockersSummary.length > 0) result.blockersSummary.forEach(function(b) { lines.push('- ' + b); });
    else lines.push('- none');

    const text = lines.join('\n');
    console.log('[generateSuperAdminAuditReportText] Copy markdown text bên dưới:\n\n' + text);
    return text;
}

export const SuperAdminAuditDiagnostics = Object.freeze({
    probeClubDataReadOnly,
    runSuperAdminAudit,
    printSuperAdminAudit,
    generateSuperAdminAuditReportText,
});

export default SuperAdminAuditDiagnostics;
