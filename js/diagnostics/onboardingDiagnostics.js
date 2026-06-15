/**
 * Phase 4K-6T — Onboarding Diagnostics (lazy-loaded)
 * Read-only orchestration. No Firebase write API and no business-state mutation.
 */

export async function runOnboardingGate(clubIdOrOptions) {
    const checkedAt = new Date().toISOString();

    let opts = {};
    if (typeof clubIdOrOptions === 'string') {
        opts = { clubId: clubIdOrOptions };
    } else if (clubIdOrOptions && typeof clubIdOrOptions === 'object') {
        opts = clubIdOrOptions;
    }

    const clubId = opts.clubId
        || (window.__store && (window.__store.clubId || window.__store.currentClubId))
        || window.currentClubId
        || null;

    const blockers = [];
    const warnings = [];

    if (!clubId) blockers.push('clubId missing — truyền clubId hoặc login trước');

    let dataSource = null;
    try {
        if (typeof window.resolveActiveDataSource === 'function') dataSource = await window.resolveActiveDataSource();
    } catch (e) {
        dataSource = { source: 'error', error: String(e).slice(0, 200) };
    }
    const activeDataSource = (dataSource && dataSource.source) || 'unknown';
    if (activeDataSource === 'unknown') blockers.push('activeDataSource unknown — login chưa hoàn tất hoặc chưa resolve data source');
    if (activeDataSource === 'permission-error' || (dataSource && dataSource.permissionDenied)) {
        blockers.push('Permission denied while checking Firestore path — kiểm tra Firestore rules cho clubId này');
    }

    let hydration = null;
    try {
        if (typeof window.printDataHydrationStatus === 'function') hydration = window.printDataHydrationStatus();
    } catch (_) {}

    let tabData = null;
    try {
        if (typeof window.printTabDataStatus === 'function') tabData = window.printTabDataStatus();
    } catch (_) {}

    let tabReady = null;
    try {
        if (typeof window.printPilotTabReadiness === 'function') tabReady = window.printPilotTabReadiness();
    } catch (_) {}

    let gate = null;
    try {
        if (typeof window.printOneClubPilotGate === 'function') gate = window.printOneClubPilotGate();
    } catch (_) {}

    let tenClub = null;
    try {
        if (typeof window.printTenClubPilotReadiness === 'function') tenClub = window.printTenClubPilotReadiness();
    } catch (_) {}

    const profilesCount     = (tabReady && tabReady.profilesCount)      || (gate && gate.profilesCount)      || 0;
    const transactionsCount = (tabReady && tabReady.transactionsCount) || (gate && gate.transactionsCount) || 0;
    const inventoryCount    = (tabReady && tabReady.inventoryCount)    || (gate && gate.inventoryCount)    || 0;
    const tuitionReady      = !!(tabReady && tabReady.tuitionReady)    || !!(gate && gate.tuitionReady);
    const debtReady         = !!(tabReady && tabReady.debtReady)       || !!(gate && gate.debtReady);
    const inventoryReady    = !!(tabReady && tabReady.inventoryReady)  || !!(gate && gate.inventoryReady);
    const dashboardReady    = !!(tabReady && tabReady.dashboardReady)  || !!(gate && gate.dashboardReady);
    const readyForInternalTest = !!(gate && gate.readyForInternalTest);
    const readyForOneClubPilot = !!(gate && gate.readyForOneClubPilot);
    const readyForTenClubPilot = !!(tenClub && tenClub.readyForTenClubPilot);

    if (!(profilesCount > 0)) blockers.push('No profiles loaded — profilesCount = 0');
    if (!tuitionReady) blockers.push('Tuition tab not ready');
    if (!debtReady) blockers.push('Debt tab not ready');
    if (!dashboardReady) blockers.push('Dashboard not ready');
    if (window.__runtimeRecoveryState && window.__runtimeRecoveryState.error) {
        blockers.push('Runtime recovery error: ' + String(window.__runtimeRecoveryState.error).slice(0, 100));
    }

    let health = null;
    try {
        if (typeof window.getRuntimeHealthStatus === 'function') health = window.getRuntimeHealthStatus({ phase: 'all' });
    } catch (_) {}
    if (health && health.criticalMissing && health.criticalMissing.length > 0) {
        blockers.push('Critical runtime health missing: ' + health.criticalMissing.join(', '));
    }

    if (opts.expectedClubName) {
        const actualName = window.__store && (window.__store.clubName || window.__store.club && window.__store.club.name);
        if (actualName && actualName !== opts.expectedClubName) blockers.push('Club name mismatch — tên CLB không khớp với expectedClubName');
    }
    if (opts.expectedAdminEmail) {
        const actualEmail = window.__store && window.__store.currentUser && window.__store.currentUser.email;
        if (actualEmail && actualEmail !== opts.expectedAdminEmail) warnings.push('Admin email mismatch — email đang login không khớp expectedAdminEmail');
    }

    if (opts.requireInventory && !inventoryReady) blockers.push('Inventory tab not ready (requireInventory = true)');
    if (opts.requireTransactions && !(transactionsCount > 0)) warnings.push('No transactions loaded yet (requireTransactions = true)');

    const result = {
        clubId,
        activeDataSource,
        readyForInternalTest,
        readyForOneClubPilot,
        readyForTenClubPilot,
        profilesCount,
        transactionsCount,
        inventoryCount,
        tuitionReady,
        debtReady,
        inventoryReady,
        dashboardReady,
        blockers,
        warnings,
        checkedAt
    };

    const status = blockers.length === 0 ? '✅ PASS' : '❌ FAIL';
    console.group('[runOnboardingGate] ' + status + ' — clubId: ' + (clubId || '(not set)') + ' — ' + checkedAt);
    console.table({
        clubId: clubId || '(not set)',
        activeDataSource,
        readyForOneClubPilot,
        readyForTenClubPilot,
        profilesCount,
        transactionsCount,
        inventoryCount,
        tuitionReady,
        debtReady,
        dashboardReady,
        blockers: blockers.length > 0 ? blockers.join(' | ') : 'none',
        warnings: warnings.length > 0 ? warnings.join(' | ') : 'none'
    });
    if (blockers.length > 0) {
        console.warn('[runOnboardingGate] BLOCKERS (' + blockers.length + '):');
        blockers.forEach(function(b, i) { console.warn('  [' + (i + 1) + '] ' + b); });
    }
    console.groupEnd();

    return result;
}

export async function printOnboardingGate(clubIdOrOptions) {
    return runOnboardingGate(clubIdOrOptions);
}

export async function generateOnboardingReportText(options) {
    const result = await runOnboardingGate(options);
    const lines = [
        '# Onboarding Gate Report',
        '',
        '- Club ID: ' + (result.clubId || '(not set)'),
        '- Active Data Source: ' + result.activeDataSource,
        '- Profiles Count: ' + result.profilesCount,
        '- Transactions Count: ' + result.transactionsCount,
        '- Inventory Count: ' + result.inventoryCount,
        '- Tuition Ready: ' + result.tuitionReady,
        '- Debt Ready: ' + result.debtReady,
        '- Inventory Ready: ' + result.inventoryReady,
        '- Dashboard Ready: ' + result.dashboardReady,
        '- Ready For One Club Pilot: ' + result.readyForOneClubPilot,
        '- Ready For Ten Club Pilot: ' + result.readyForTenClubPilot,
        '- Blockers: ' + (result.blockers.length > 0 ? result.blockers.join('; ') : 'none'),
        '- Warnings: ' + (result.warnings.length > 0 ? result.warnings.join('; ') : 'none'),
        '- Checked At: ' + result.checkedAt
    ];

    const text = lines.join('\n');
    console.log('[generateOnboardingReportText] Copy text bên dưới:\n\n' + text);
    return text;
}

export const OnboardingDiagnostics = Object.freeze({
    runOnboardingGate,
    printOnboardingGate,
    generateOnboardingReportText,
});

export default OnboardingDiagnostics;
