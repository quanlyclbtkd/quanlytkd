/**
 * legacyDiagnostics.js — Phase 4K-6F/4K-6G: Legacy Diagnostics Module
 *
 * Exposes diagnostics/readiness functions as module-safe window globals.
 * Uses window.__store for state instead of app.js closures.
 *
 * No Firestore writes. No data mutation. No side effects.
 */

// ── LegacyDiagnostics object ──────────────────────────────────────────────────
export const LegacyDiagnostics = {

    printPilotLaunchStatus() {
        const st      = window.__store || {};
        const db      = st.db || window.db;
        const clubId  = st.clubId || window.currentClubId || '';
        const result  = {
            hasDb:              !!db,
            hasClubId:          !!clubId,
            clubId:             clubId,
            hasStore:           !!window.__store,
            appBuildVersion:    window.APP_BUILD_VERSION || '',
            hasRenderApp:       typeof window.renderApp === 'function',
            hasScheduleRender:  typeof window.scheduleRender === 'function',
            hasInvalidateList:  typeof window.invalidateList === 'function',
            source:             'LegacyDiagnostics-module'
        };
        console.log('[printPilotLaunchStatus]', result);
        return result;
    },

    printTenClubPilotReadiness() {
        const launch = typeof window.printPilotLaunchStatus === 'function'
            ? window.printPilotLaunchStatus()
            : null;
        const result = {
            pilotLaunch:     launch,
            appBuildVersion: window.APP_BUILD_VERSION || '',
            tenClubCapacity: 'readiness checks deferred to app.js pilot module',
            source:          'LegacyDiagnostics-module'
        };
        console.log('[printTenClubPilotReadiness]', result);
        return result;
    },

    async generatePilotLaunchSnapshot() {
        const timestamp = new Date().toISOString();
        let launch = null;
        let tenClub = null;
        try {
            if (typeof window.printPilotLaunchStatus === 'function')
                launch = window.printPilotLaunchStatus();
            if (typeof window.printTenClubPilotReadiness === 'function')
                tenClub = window.printTenClubPilotReadiness();
        } catch (e) {
            console.warn('[generatePilotLaunchSnapshot] error:', e);
        }
        const snap = { timestamp, launch, tenClub, source: 'LegacyDiagnostics-module' };
        console.group('[generatePilotLaunchSnapshot] Pilot Launch Snapshot — ' + timestamp);
        console.log(snap);
        console.groupEnd();
        return snap;
    },

    printOneClubPilotGate() {
        let launch = null;
        let tenClub = null;
        try {
            if (typeof window.printPilotLaunchStatus === 'function')
                launch = window.printPilotLaunchStatus();
            if (typeof window.printTenClubPilotReadiness === 'function')
                tenClub = window.printTenClubPilotReadiness();
        } catch (e) {
            console.warn('[printOneClubPilotGate] error:', e);
        }
        const blockers = [];
        if (!launch || !launch.hasDb)     blockers.push('missing db');
        if (!launch || !launch.hasClubId) blockers.push('missing clubId');
        const gate = { go: blockers.length === 0, blockers, launch, tenClub, source: 'LegacyDiagnostics-module' };
        if (blockers.length > 0) {
            console.warn('[printOneClubPilotGate] ⚠️  NO-GO — ' + blockers.length + ' blocker(s):', blockers);
        } else {
            console.info('[printOneClubPilotGate] ✅ GO — sẵn sàng pilot 1 CLB.');
        }
        return gate;
    },

    async printOnboardingGate(clubIdOrOptions) {
        const opts   = (clubIdOrOptions && typeof clubIdOrOptions === 'object') ? clubIdOrOptions : {};
        const st     = window.__store || {};
        const clubId = opts.clubId || st.clubId || window.currentClubId || '';
        const text   = typeof window.generateOnboardingReportText === 'function'
            ? await window.generateOnboardingReportText({ clubId })
            : null;
        const result = { clubId, reportText: text, source: 'LegacyDiagnostics-module' };
        console.log('[printOnboardingGate]', result);
        return result;
    },

    async generateOnboardingReportText(options) {
        options = options || {};
        const st     = window.__store || {};
        const clubId = options.clubId || st.clubId || window.currentClubId || '';
        const db     = st.db || window.db;
        if (!db || !clubId) {
            console.warn('[generateOnboardingReportText] missing db/clubId');
            return null;
        }
        const lines = [
            '# Onboarding Report — ' + clubId,
            'Generated: ' + new Date().toISOString(),
            'Source: LegacyDiagnostics-module (app.js version may have richer data)',
            '',
            'appBuildVersion: ' + (window.APP_BUILD_VERSION || ''),
            'hasStore: ' + !!window.__store,
            'hasDb: ' + !!db
        ];
        const text = lines.join('\n');
        console.log('[generateOnboardingReportText] Copy text bên dưới:\n\n' + text);
        return text;
    },

    async printSuperAdminAudit(options) {
        const text = typeof window.generateSuperAdminAuditReportText === 'function'
            ? await window.generateSuperAdminAuditReportText(options)
            : null;
        const result = { reportText: text, source: 'LegacyDiagnostics-module' };
        console.log('[printSuperAdminAudit]', result);
        return result;
    },

    async generateSuperAdminAuditReportText(options) {
        options = options || {};
        const st     = window.__store || {};
        const db     = st.db || window.db;
        const clubId = st.clubId || window.currentClubId || '';
        if (!db) {
            console.warn('[generateSuperAdminAuditReportText] missing db');
            return null;
        }
        const lines = [
            '# SuperAdmin Audit Report',
            'Generated: ' + new Date().toISOString(),
            'Source: LegacyDiagnostics-module (app.js version may have richer data)',
            '',
            'appBuildVersion: ' + (window.APP_BUILD_VERSION || ''),
            'clubId: ' + clubId,
            'hasStore: ' + !!window.__store,
            'hasDb: ' + !!db
        ];
        const text = lines.join('\n');
        console.log('[generateSuperAdminAuditReportText] Copy markdown text bên dưới:\n\n' + text);
        return text;
    }
};

// ── initLegacyDiagnostics ─────────────────────────────────────────────────────
export function initLegacyDiagnostics() {
    window.LegacyDiagnostics = window.LegacyDiagnostics || LegacyDiagnostics;

    window.printPilotLaunchStatus = window.printPilotLaunchStatus || function() {
        return window.LegacyDiagnostics.printPilotLaunchStatus.apply(window.LegacyDiagnostics, arguments);
    };

    window.printTenClubPilotReadiness = window.printTenClubPilotReadiness || function() {
        return window.LegacyDiagnostics.printTenClubPilotReadiness.apply(window.LegacyDiagnostics, arguments);
    };

    window.generatePilotLaunchSnapshot = window.generatePilotLaunchSnapshot || function() {
        return window.LegacyDiagnostics.generatePilotLaunchSnapshot.apply(window.LegacyDiagnostics, arguments);
    };

    window.printOneClubPilotGate = window.printOneClubPilotGate || function() {
        return window.LegacyDiagnostics.printOneClubPilotGate.apply(window.LegacyDiagnostics, arguments);
    };

    window.generateOnboardingReportText = window.generateOnboardingReportText || function() {
        return window.LegacyDiagnostics.generateOnboardingReportText.apply(window.LegacyDiagnostics, arguments);
    };

    window.printOnboardingGate = window.printOnboardingGate || function() {
        return window.LegacyDiagnostics.printOnboardingGate.apply(window.LegacyDiagnostics, arguments);
    };

    window.generateSuperAdminAuditReportText = window.generateSuperAdminAuditReportText || function() {
        return window.LegacyDiagnostics.generateSuperAdminAuditReportText.apply(window.LegacyDiagnostics, arguments);
    };

    window.printSuperAdminAudit = window.printSuperAdminAudit || function() {
        return window.LegacyDiagnostics.printSuperAdminAudit.apply(window.LegacyDiagnostics, arguments);
    };
}
