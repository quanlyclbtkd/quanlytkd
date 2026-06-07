/**
 * legacyAppAudit.js — Phase 4K-6F: Legacy App Kernel Audit Service
 *
 * Provides read-only diagnostics about the current state of the legacy app.js
 * kernel, global ownership, render summary, and reduction planning.
 *
 * No writes. No Firestore. No side effects.
 */

// ── Global Ownership Map ──────────────────────────────────────────────────────
const GLOBAL_OWNERSHIP = {
    switchTab:              { expectedOwner: 'js/ui/tabs.js',                                  legacyAllowed: true },
    renderApp:              { expectedOwner: 'app.js legacy fallback',                         legacyAllowed: true,  risk: 'high' },
    scheduleRender:         { expectedOwner: 'app.js/renderInvalidation fallback only',        legacyAllowed: true,  risk: 'high' },

    openAddModal:           { expectedOwner: 'js/modules/students.js',                         legacyAllowed: false },
    addNewStudent:          { expectedOwner: 'js/modules/students.js',                         legacyAllowed: false },
    openProfile:            { expectedOwner: 'js/modules/students.js',                         legacyAllowed: false },

    quickPay:               { expectedOwner: 'js/modules/finance.js or app.js legacy until guarded', legacyAllowed: true, risk: 'high' },
    processMultiItem:       { expectedOwner: 'app.js legacy until explicit migration',         legacyAllowed: true,  risk: 'very-high' },
    deleteTx:               { expectedOwner: 'finance module + transactionDeleteIntegrity',    legacyAllowed: true,  risk: 'high' },

    renderExamList:         { expectedOwner: 'exam legacy/module bridge',                      legacyAllowed: true },
    exportExamPaidList:     { expectedOwner: 'js/modules/reports.js',                         legacyAllowed: false },

    markInvPaid:            { expectedOwner: 'inventory module/app legacy until guarded',      legacyAllowed: true,  risk: 'high' },
    renderAttendanceList:   { expectedOwner: 'js/modules/attendance.js',                       legacyAllowed: true },

    loadSuperAdminData:     { expectedOwner: 'js/modules/superadmin.js',                       legacyAllowed: false },
    createNewClubSystem:    { expectedOwner: 'js/modules/superadmin.js or Cloud Functions later', legacyAllowed: true, risk: 'high' }
};

// ── LegacyAppAudit ────────────────────────────────────────────────────────────
export const LegacyAppAudit = {

    getRuntimeLegacySummary() {
        return {
            appBuildVersion:          window.APP_BUILD_VERSION || '',
            hasLegacyAppLoaded:       !!window.__appLoaded,
            hasMainLoaded:            !!window.__mainLoaded,
            hasStore:                 !!window.__store,
            hasDb:                    !!(window.__store && window.__store.db),
            clubId:                   (window.__store && window.__store.clubId) || window.currentClubId || '',
            hasLegacyRenderApp:       typeof window.renderApp === 'function',
            hasModuleRenderApp:       typeof window._moduleRenderApp === 'function',
            hasScheduleRender:        typeof window.scheduleRender === 'function',
            hasInvalidateCurrentTab:  typeof window.invalidateCurrentTab === 'function',
            hasInvalidateList:        typeof window.invalidateList === 'function',
            activeTab:                typeof window.getCurrentActiveTabId === 'function'
                ? window.getCurrentActiveTabId()
                : '',
            warning: 'app.js vẫn là legacy kernel/compatibility layer. Không xóa trực tiếp nếu chưa có migration gate.'
        };
    },

    getGlobalOwnershipMap() {
        const checked        = [];
        const moduleOwned    = [];
        const legacyAllowed  = [];
        const highRiskGlobals = [];
        const missingGlobals = [];
        const notes          = [];

        for (const [name, meta] of Object.entries(GLOBAL_OWNERSHIP)) {
            const exists = typeof window[name] === 'function' || window[name] !== undefined;
            checked.push(name);

            if (!exists) {
                missingGlobals.push(name);
                continue;
            }

            if (!meta.legacyAllowed) {
                moduleOwned.push(name);
            } else {
                legacyAllowed.push(name);
            }

            if (meta.risk === 'high' || meta.risk === 'very-high') {
                highRiskGlobals.push({ name: name, risk: meta.risk, owner: meta.expectedOwner });
            }
        }

        if (highRiskGlobals.length > 0) {
            notes.push('High-risk globals must not be migrated without explicit write-safety review.');
        }
        if (missingGlobals.length > 0) {
            notes.push('Missing globals: ' + missingGlobals.join(', ') + ' — may not be loaded yet.');
        }

        return {
            checked:          checked,
            moduleOwned:      moduleOwned,
            legacyAllowed:    legacyAllowed,
            highRiskGlobals:  highRiskGlobals,
            missingGlobals:   missingGlobals,
            notes:            notes
        };
    },

    getLegacyRenderSummary() {
        return {
            hasRenderApp:             typeof window.renderApp === 'function',
            hasModuleRenderApp:       typeof window._moduleRenderApp === 'function',
            hasScheduleRender:        typeof window.scheduleRender === 'function',
            hasInvalidateCurrentTab:  typeof window.invalidateCurrentTab === 'function',
            hasInvalidateList:        typeof window.invalidateList === 'function',
            hasRefreshListsComputation: typeof window.refreshListsComputation === 'function',
            hasSwitchTab:             typeof window.switchTab === 'function',
            legacyRenderMetrics:      window.__renderLegacyMetrics || null,
            note: 'renderApp and scheduleRender are still in app.js kernel — do not remove without a full module render bridge.'
        };
    },

    getAppJsReductionPlan() {
        return {
            currentPhase: '4K-6G-multiitem-inventory-hydration-legacy-diagnostics',
            completedInThisPhase: [
                '4K-6G đã sửa MultiItem Inventory Hydration trước: _refreshMiHistoryBadges async-safe, ensureMultiItemInventoryReady, resolveMultiItemInventoryDebts với Vietnamese-normalize match',
                '4K-6G đã extract low-risk diagnostics/readiness khỏi app.js vào js/diagnostics/legacyDiagnostics.js',
                '4K-6G đã thêm MultiItemInventorySafety module (js/core/multiItemInventorySafety.js)',
                '4K-6G: toggleMiInvCategory in app.js và inventory.js đã có fallback buildInventoryStockMapForMultiItem',
                '4K-6G: Modal Thu gộp auto-refresh khi inventory load xong'
            ],
            doNotExtractNow: [
                'Firebase/Auth bootstrap',
                'onAuthStateChanged',
                'initSaaSDatabase',
                'listenToData',
                'renderApp fallback',
                'scheduleRender fallback',
                'root __store bridge',
                'runtime data recovery write/sync functions',
                'processMultiItem — KHÔNG tách, KHÔNG rewrite',
                'quickPay',
                'cancelExamPayment',
                'openMultiItemModal',
                '_refreshMiHistoryBadges',
                'toggleMultiItemInv',
                'toggleMiInvCategory',
                'attendance write flow'
            ],
            extractedOrModuleOwnedNow: [
                'legacy diagnostics/readiness functions (legacyDiagnostics.js)',
                'pilot readiness report helpers (legacyDiagnostics.js)',
                'onboarding report text helpers (legacyDiagnostics.js)',
                'superadmin audit report text helpers (legacyDiagnostics.js)',
                'multiItem inventory safety (multiItemInventorySafety.js)',
                'Không tách finance/auth/listener/render kernel'
            ],
            nextSafeCandidates: [
                'receipt/QR helper extraction',
                'reports fallback cleanup',
                'settings helper extraction',
                'low-risk export helpers',
                'legacy debug-only helpers'
            ],
            nextPhase: '4K-6H — Extract Low-Risk Receipt/Settings/Export Helpers',
            warning: 'Không tách finance/tuition/multiItem/auth/listeners trong cùng phase.'
        };
    }
};
