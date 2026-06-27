/**
 * legacyDiagnostics.js — Phase 4K-6T compatibility facade
 *
 * Runtime readiness helpers are eager, while onboarding and SuperAdmin audit
 * implementations are lazy-loaded on first use. This keeps the historical
 * initLegacyDiagnostics() entrypoint without retaining duplicate implementations
 * inside app.js.
 */

import {
    RuntimeReadinessDiagnostics,
    debugMobileSuperAdminGate,
    printDataHydrationStatus,
    printTabDataStatus,
    printFirestorePathStatus,
    printPilotTabReadiness,
    printPilotLaunchStatus,
    printTenClubPilotReadiness,
    generatePilotLaunchSnapshot,
    printOneClubPilotGate,
} from './runtimeReadinessDiagnostics.js';

const RUNTIME_OWNER = 'js/diagnostics/runtimeReadinessDiagnostics.js';
const LAZY_OWNER = 'js/diagnostics/legacyDiagnostics.js';

let onboardingModulePromise = null;
let superAdminModulePromise = null;

export function ensureOnboardingDiagnostics() {
    if (!onboardingModulePromise) {
        onboardingModulePromise = import('./onboardingDiagnostics.js').catch((error) => {
            onboardingModulePromise = null;
            throw error;
        });
    }
    return onboardingModulePromise;
}

export function ensureSuperAdminAuditDiagnostics() {
    if (!superAdminModulePromise) {
        superAdminModulePromise = import('./superAdminAuditDiagnostics.js').catch((error) => {
            superAdminModulePromise = null;
            throw error;
        });
    }
    return superAdminModulePromise;
}

async function runOnboardingGate() {
    const mod = await ensureOnboardingDiagnostics();
    return mod.runOnboardingGate.apply(null, arguments);
}

async function printOnboardingGate() {
    const mod = await ensureOnboardingDiagnostics();
    return mod.printOnboardingGate.apply(null, arguments);
}

async function generateOnboardingReportText() {
    const mod = await ensureOnboardingDiagnostics();
    return mod.generateOnboardingReportText.apply(null, arguments);
}

async function runSuperAdminAudit() {
    const mod = await ensureSuperAdminAuditDiagnostics();
    return mod.runSuperAdminAudit.apply(null, arguments);
}

async function printSuperAdminAudit() {
    const mod = await ensureSuperAdminAuditDiagnostics();
    return mod.printSuperAdminAudit.apply(null, arguments);
}

async function generateSuperAdminAuditReportText() {
    const mod = await ensureSuperAdminAuditDiagnostics();
    return mod.generateSuperAdminAuditReportText.apply(null, arguments);
}

export const LegacyDiagnostics = Object.freeze({
    ...RuntimeReadinessDiagnostics,
    runOnboardingGate,
    printOnboardingGate,
    generateOnboardingReportText,
    runSuperAdminAudit,
    printSuperAdminAudit,
    generateSuperAdminAuditReportText,
});

const RUNTIME_GLOBALS = Object.freeze({
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

const LAZY_GLOBALS = Object.freeze({
    runOnboardingGate,
    printOnboardingGate,
    generateOnboardingReportText,
    runSuperAdminAudit,
    printSuperAdminAudit,
    generateSuperAdminAuditReportText,
});

function registerGlobal(name, implementation, owner, risk) {
    const registry = window.GlobalOwnershipRegistry;
    if (registry && typeof registry.register === 'function') {
        const result = registry.register(name, implementation, {
            owner,
            risk,
            policy: 'module-primary',
        });
        if (!result.ok) {
            console.warn('[LegacyDiagnostics] ownership registration failed:', name, result.reason || result);
        }
        return result;
    }
    window[name] = implementation;
    return { ok: true, fallbackRegistryUnavailable: true };
}

export function initLegacyDiagnostics() {
    if (typeof window === 'undefined') return LegacyDiagnostics;
    if (window.__diagnosticsToolingIsolationInitialized) return LegacyDiagnostics;

    window.LegacyDiagnostics = LegacyDiagnostics;
    window.RuntimeReadinessDiagnostics = RuntimeReadinessDiagnostics;
    window.ensureOnboardingDiagnostics = ensureOnboardingDiagnostics;
    window.ensureSuperAdminAuditDiagnostics = ensureSuperAdminAuditDiagnostics;

    Object.entries(RUNTIME_GLOBALS).forEach(([name, implementation]) => {
        registerGlobal(name, implementation, RUNTIME_OWNER, 'diagnostics-readonly');
    });
    Object.entries(LAZY_GLOBALS).forEach(([name, implementation]) => {
        registerGlobal(name, implementation, LAZY_OWNER, 'diagnostics-lazy-readonly');
    });

    window.__diagnosticsToolingIsolationInitialized = true;
    window.debugDiagnosticsToolingIsolation = function debugDiagnosticsToolingIsolation() {
        const registry = window.GlobalOwnershipRegistry;
        const names = [...Object.keys(RUNTIME_GLOBALS), ...Object.keys(LAZY_GLOBALS)];
        const ownership = names.map((name) => ({
            name,
            owner: registry && typeof registry.getOwner === 'function'
                ? registry.getOwner(name)?.owner || ''
                : '',
            installed: typeof window[name] === 'function',
        }));
        const result = {
            ok: ownership.every((item) => item.installed && !!item.owner),
            phase: '4K-6T-legacy-diagnostics-pilot-audit-tooling-isolation',
            runtimeGlobalCount: Object.keys(RUNTIME_GLOBALS).length,
            lazyGlobalCount: Object.keys(LAZY_GLOBALS).length,
            onboardingLoaded: !!onboardingModulePromise,
            superAdminAuditLoaded: !!superAdminModulePromise,
            ownership,
        };
        console.log('[debugDiagnosticsToolingIsolation]', result);
        if (console.table) console.table(ownership);
        return result;
    };

    return LegacyDiagnostics;
}

export default LegacyDiagnostics;
