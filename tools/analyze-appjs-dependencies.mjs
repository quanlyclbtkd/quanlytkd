/**
 * tools/analyze-appjs-dependencies.mjs — Phase 4.0C-1
 * ─────────────────────────────────────────────────────────────────────────
 * Quét app.js, index.html, js/modules/*, js/services/*, js/listeners/*
 * và tạo APPJS_DEPENDENCY_MAP.md.
 *
 * Chạy: node tools/analyze-appjs-dependencies.mjs
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readFile(rel) {
    const p = resolve(ROOT, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function readDir(rel, ext = '.js') {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) return [];
    return readdirSync(p)
        .filter(f => f.endsWith(ext))
        .map(f => ({ name: f, path: join(rel, f), content: readFileSync(join(p, f), 'utf8') }));
}

// ── Read source files ────────────────────────────────────────────────────────
const appJs     = readFile('app.js')     || '';
const indexHtml = readFile('index.html') || '';
const mainJs    = readFile('js/main.js') || '';

const allModules   = readDir('js/modules');
const allServices  = readDir('js/services');
const allListeners = existsSync(resolve(ROOT, 'js/listeners'))
    ? readDir('js/listeners') : [];
const allEventsListeners = existsSync(resolve(ROOT, 'js/eventslisteners'))
    ? readDir('js/eventslisteners') : [];

const allExtFiles = [...allModules, ...allServices, ...allListeners, ...allEventsListeners];

// ── 1. Function declarations in app.js ──────────────────────────────────────
const fnDeclRegex = /^\s{0,8}(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
const fnDeclarations = [];
let m;
while ((m = fnDeclRegex.exec(appJs)) !== null) {
    const lineNo = appJs.slice(0, m.index).split('\n').length;
    fnDeclarations.push({ name: m[1], line: lineNo });
}

// ── 2. window.* assignments ──────────────────────────────────────────────────
const winAssignRegex = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
const windowExports = new Map(); // name → first line
while ((m = winAssignRegex.exec(appJs)) !== null) {
    const name = m[1];
    if (/^__|\b(userRole|coachBranch|currentClubId|invCustomCategories)\b/.test(name)) continue;
    if (!windowExports.has(name)) {
        const lineNo = appJs.slice(0, m.index).split('\n').length;
        windowExports.set(name, lineNo);
    }
}

// ── 3. Inline handlers in index.html ────────────────────────────────────────
const handlerRegex = /on(?:click|change|input|submit)\s*=\s*"([^"]+)"/gi;
const handlerCalls = new Set();
const allHandlers  = [];
while ((m = handlerRegex.exec(indexHtml)) !== null) {
    allHandlers.push(m[1].trim());
    // Extract all function names called
    const fnCallRe = /([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\(/g;
    let fm;
    while ((fm = fnCallRe.exec(m[1])) !== null) {
        const raw = fm[1];
        // Skip DOM methods and keywords
        if (/^(document|window|event|this|if|return|true|false|click|style|value|toUpperCase|replace|stopPropagation)/.test(raw)) continue;
        const clean = raw.replace(/^window\./, '');
        handlerCalls.add(clean);
    }
}

// ── 4. Module-exported functions (defined outside app.js) ───────────────────
const externalFnMap = new Map(); // fnName → file
for (const f of allExtFiles) {
    const exportRe = /export\s+(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((m = exportRe.exec(f.content)) !== null) {
        externalFnMap.set(m[1], f.path);
    }
    // Also default export class / object methods
    const methodRe = /^\s{2,8}(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
    // (skip for now — only named exports matter)
}

// ── 5. Global state / closure vars in app.js ────────────────────────────────
const GLOBALS = [
    'db', 'auth', 'currentClubId', 'clubConfig', 'allProfiles', 'allTransactions',
    'allInventory', 'allAttendance', 'allNotifs', '__store', 'userRole', 'coachBranch',
    '__scaleConfig', '__loginPerfMetrics', '__queryScaleMetrics', 'invCustomCategories',
];

// ── 6. Domain classification ─────────────────────────────────────────────────
const DOMAIN_MAP = {
    // Bootstrap/Auth
    'markLoginPerf': 'Bootstrap/Auth',
    'measureLoginPerf': 'Bootstrap/Auth',
    'dispatchAppContextReady': 'Bootstrap/Auth',
    'handleLogin': 'Bootstrap/Auth',
    'handleLogout': 'Bootstrap/Auth',
    '_setLoginError': 'Bootstrap/Auth',
    '_clearLoginError': 'Bootstrap/Auth',
    '_recordLoginEvent': 'Bootstrap/Auth',
    'switchLoginTab': 'Bootstrap/Auth',
    'initSaaSDatabase': 'Bootstrap/Auth',
    'loadLogoForReceipt': 'Bootstrap/Auth',
    '_updateHydrationMetrics': 'Bootstrap/Auth',
    // Store/Bridge
    'getAppContext': 'Store/Bridge',
    'scheduleRender': 'Store/Bridge',
    'activateLegacyRootFallback': 'Store/Bridge',
    'resolveActiveDataSource': 'Store/Bridge',
    'syncProfilesToStudentStore': 'Store/Bridge',
    '_syncAllProfilesLegacy': 'Store/Bridge',
    'listenToData': 'Store/Bridge',
    'getBranchNameDisplay': 'Store/Bridge',
    'applyClubConfigUI': 'Store/Bridge',
    'switchTab': 'Store/Bridge',
    '_legacySwitchTab': 'Store/Bridge',
    'renderApp': 'Store/Bridge',
    '_moduleRenderApp': 'Store/Bridge',
    '_resetListPages': 'Store/Bridge',
    // Students/Profiles
    'addNewStudent': 'Students/Profiles',
    'updateProfile': 'Students/Profiles',
    'deleteProfile': 'Students/Profiles',
    'openProfile': 'Students/Profiles',
    'openAddModal': 'Students/Profiles',
    'closeAddModal': 'Students/Profiles',
    'closeModal': 'Students/Profiles',
    'handleQuitOption': 'Students/Profiles',
    'renderAchievements': 'Students/Profiles',
    'addAchievementRow': 'Students/Profiles',
    'removeAchievement': 'Students/Profiles',
    'selectPaidStudents': 'Students/Profiles',
    '_normalizeBranchForImport': 'Students/Profiles',
    '_showImportReport': 'Students/Profiles',
    'handleImportExcel': 'Students/Profiles',
    'downloadExcelTemplate': 'Students/Profiles',
    'processBatchUpgrade': 'Students/Profiles',
    'openBulkZaloModal': 'Students/Profiles',
    'closeBulkZaloModal': 'Students/Profiles',
    '_renderBulkZaloList': 'Students/Profiles',
    'startSequentialBulkZalo': 'Students/Profiles',
    'sendBulkZaloOne': 'Students/Profiles',
    'copyAndOpenZalo': 'Students/Profiles',
    // Finance/Học phí
    'quickPay': 'Finance',
    'quickCollectExam': 'Finance',
    'processCombo': 'Finance',
    'processMultiItem': 'Finance',
    'openComboModal': 'Finance',
    'openMultiItemModal': 'Finance',
    'updateAmountByPackage': 'Finance',
    'updateExamComboQuarter': 'Finance',
    'updateComboTotal': 'Finance',
    'updateMultiItemTotal': 'Finance',
    'updateMultiItemAutoFee': 'Finance',
    'toggleTxFormType': 'Finance',
    'toggleMultiItemExam': 'Finance',
    'toggleMultiItemInv': 'Finance',
    'toggleMultiItemOther': 'Finance',
    'skipMonth': 'Finance',
    'deleteTx': 'Finance',
    'toggleMiTuitionSection': 'Finance',
    'toggleMiHistory': 'Finance',
    'loadMiPaymentHistory': 'Finance',
    '_refreshMiHistoryBadges': 'Finance',
    'openQuickPayModal': 'Finance',
    'saveEditExpense': 'Finance',
    'openEditExpense': 'Finance',
    'setupMiCurrency': 'Finance',
    'updateAddPackageAmount': 'Finance',
    'generateMultiMonthPaymentRequest': 'Finance',
    '_ppAddM': 'Finance',
    '_ppClean': 'Finance',
    'updateExcelPeriodOptions': 'Finance',
    'updateTaxPeriodOptions': 'Finance',
    // Debt/Báo nợ
    'getInventoryDebtsForStudent': 'Debt',
    '_debtPage': 'Debt',
    // Inventory/Kho đồ
    'calcInv': 'Inventory',
    'calcMiInvTotal': 'Inventory',
    'toggleInvType': 'Inventory',
    'toggleInvCategory': 'Inventory',
    'toggleMiInvCategory': 'Inventory',
    'getInvCategories': 'Inventory',
    'getCategoryOptionHtml': 'Inventory',
    'populateInvCategorySelects': 'Inventory',
    'openManageCatModal': 'Inventory',
    'closeManageCatModal': 'Inventory',
    'renderManageCatList': 'Inventory',
    'addInvCategory': 'Inventory',
    'deleteInvCategory': 'Inventory',
    'loadInvCategories': 'Inventory',
    'markInvPaid': 'Inventory',
    'recalcMiInvDebt': 'Inventory',
    'openEditInv': 'Inventory',
    'saveEditInv': 'Inventory',
    'closeEditInvModal': 'Inventory',
    'toggleEditInvSize': 'Inventory',
    'toggleAddUniformGift': 'Inventory',
    // Attendance/Điểm danh
    'renderAttendanceList': 'Attendance',
    'renderAttMonthly': 'Attendance',
    'toggleAttendance': 'Attendance',
    'toggleAttendanceStatus': 'Attendance',
    'bulkCheckIn': 'Attendance',
    'showAttMemberHistory': 'Attendance',
    'copyAttReport': 'Attendance',
    'exportAttendanceExcel': 'Attendance',
    'syncOfflineAttendance': 'Attendance',
    '_saveAttOffline': 'Attendance',
    '_mapLegacyStatus': 'Attendance',
    '_getFilteredAttProfiles': 'Attendance',
    '_renderAttCards': 'Attendance',
    '_renderAdminBranchSummary': 'Attendance',
    '_loadCoachForBranchSummary': 'Attendance',
    '_updateAttSummary': 'Attendance',
    '_loadClubShifts': 'Attendance',
    '_renderShiftSelector': 'Attendance',
    '_renderShiftListInModal': 'Attendance',
    '_ensureClubShiftsLoaded': 'Attendance',
    'addShift': 'Attendance',
    'deleteShift': 'Attendance',
    'onShiftChange': 'Attendance',
    'openShiftModal': 'Attendance',
    'closeShiftModal': 'Attendance',
    'switchAttSubTab': 'Attendance',
    'finishExamSession': 'Attendance',
    'loadAllSessionNotes': 'Attendance',
    'loadSessionNote': 'Attendance',
    'saveSessionNote': 'Attendance',
    // Reports/Export
    'executeExcelExport': 'Reports',
    'executeTaxExport': 'Reports',
    'exportExamPaidList': 'Reports',
    'exportAchievementsExcel': 'Reports',
    'exportToExcel': 'Reports',
    'fetchAllPagesForExport': 'Reports',
    'legacyExecuteExcelExport': 'Reports',
    'legacyExecuteTaxExport': 'Reports',
    'legacyExportAchievementsExcel': 'Reports',
    'legacyExportExamPaidList': 'Reports',
    'openExcelExportModal': 'Reports',
    'openTaxModal': 'Reports',
    'closeTaxModal': 'Reports',
    '_resetHtmlStateForExport': 'Reports',
    '_showLoginHistoryRulesGuide': 'Reports',
    'renderExamList': 'Reports',
    'exportReceipt': 'Reports',
    'updateNextBeltPreview': 'Reports',
    'toggleAllExam': 'Reports',
    // Payment/QR/Bank
    'removeVietnameseTonesForQR': 'Payment/QR',
    'normalizeBranchKeyForPayment': 'Payment/QR',
    'getPaymentAccountForBranch': 'Payment/QR',
    'maskAccountNumber': 'Payment/QR',
    'generateVietQR': 'Payment/QR',
    'ppOpenTransferSheet': 'Payment/QR',
    'ppSelectBank': 'Payment/QR',
    'ppOpenWallet': 'Payment/QR',
    'ppTryBank': 'Payment/QR',
    'ppLookupLogin': 'Payment/QR',
    'copyParentCode': 'Payment/QR',
    'printPaymentAccountMapping': 'Payment/QR',
    'testPaymentAccountForBranch': 'Payment/QR',
    'generatePilotLaunchSnapshot': 'Payment/QR',
    // SuperAdmin
    'loadSuperAdminData': 'SuperAdmin',
    'loadLoginHistory': 'SuperAdmin',
    'saveClubExpiry': 'SuperAdmin',
    'lockClubAccount': 'SuperAdmin',
    'unlockClubAccount': 'SuperAdmin',
    'toggleExamFeature': 'SuperAdmin',
    'saOpenDeleteTxModal': 'SuperAdmin',
    'saDeleteTransactions': 'SuperAdmin',
    'filterSAClubs': 'SuperAdmin',
    'forceReplaceAdmin': 'SuperAdmin',
    'editClubName': 'SuperAdmin',
    'switchSATab': 'SuperAdmin',
    'saDownloadOriginal': 'SuperAdmin',
    'saDownloadObfuscated': 'SuperAdmin',
    'createNewClubSystem': 'SuperAdmin',
    '_renderSAClubRows': 'SuperAdmin',
    'isSuperAdmin': 'SuperAdmin',
    '_toggleSAConfig': 'SuperAdmin',
    '_saCfgOutside': 'SuperAdmin',
    'loadSARevenue': 'SuperAdmin',
    'saResetAdminPassword': 'SuperAdmin',
    'selectBranchCard': 'SuperAdmin',
    'saveBranchUpgrade': 'SuperAdmin',
    'openBranchUpgradeModal': 'SuperAdmin',
    'generateSuperAdminAuditReportText': 'SuperAdmin',
    'runSuperAdminAudit': 'SuperAdmin',
    'printSuperAdminAudit': 'SuperAdmin',
    'generateOnboardingReportText': 'SuperAdmin',
    'runOnboardingGate': 'SuperAdmin',
    'printOnboardingGate': 'SuperAdmin',
    'printOneClubPilotGate': 'SuperAdmin',
    'printTenClubPilotReadiness': 'SuperAdmin',
    'printPilotLaunchStatus': 'SuperAdmin',
    'printPilotTabReadiness': 'SuperAdmin',
    // UI/Modal/Toast
    'showToast': 'UI/Modal',
    'openSettingsModal': 'UI/Modal',
    'openChangePasswordModal': 'UI/Modal',
    'openNewClubModal': 'UI/Modal',
    'openExpiryModal': 'UI/Modal',
    'openMobileMenu': 'UI/Modal',
    'closeMobileMenu': 'UI/Modal',
    'openCoachAccountsModal': 'UI/Modal',
    'loadCoachAccounts': 'UI/Modal',
    'createCoachAccount': 'UI/Modal',
    'deleteCoachAccount': 'UI/Modal',
    'resetCoachPassword': 'UI/Modal',
    'migrateCoachAccounts': 'UI/Modal',
    'setupMiCurrency': 'UI/Modal',
    'formatMonthCompact': 'UI/Modal',
    '_renderHomeBirthdayBanner': 'UI/Modal',
    '_destroyDashboardCharts': 'UI/Modal',
    'checkAdminNotifications': 'UI/Modal',
    '_checkMonthlyReminder': 'UI/Modal',
    'dismissAdminNotifications': 'UI/Modal',
    '_dismissMonthlyReminder': 'UI/Modal',
    '_openMonthlyExport': 'UI/Modal',
    'trackLargeListRender': 'UI/Modal',
    'mountActiveProfilesListener': 'UI/Modal',
    'setupNotifListener': 'UI/Modal',
    'handleLogoUpload': 'UI/Modal',
    'handleSignatureUpload': 'UI/Modal',
    'saveClubSettings': 'UI/Modal',
    'getBeltBadge': 'UI/Modal',
    'BELT_NEXT': 'UI/Modal',
    // Debug/Diagnostics
    'printReadScaleMetrics': 'Debug/Diagnostics',
    'printScaleReadiness': 'Debug/Diagnostics',
    'printLoginPerformance': 'Debug/Diagnostics',
    'printDataHydrationStatus': 'Debug/Diagnostics',
    'printFirestorePathStatus': 'Debug/Diagnostics',
    'printTabDataStatus': 'Debug/Diagnostics',
    'getRuntimeHealthStatus': 'Debug/Diagnostics',
    'bumpRuntimeDataVersion': 'Debug/Diagnostics',
    'runRuntimeDataRecovery': 'Debug/Diagnostics',
    'probeClubDataReadOnly': 'Debug/Diagnostics',
    'recordReadMetric': 'Debug/Diagnostics',
    // Pure utilities
    'getLocalToday': 'Pure Utilities',
    'formatDate': 'Pure Utilities',
    'formatMonth': 'Pure Utilities',
    'addMonthsToYYYYMM': 'Pure Utilities',
    'normalizeYYYYMM': 'Pure Utilities',
    'removeVietnameseTonesForQR': 'Pure Utilities',
    'maskAccountNumber': 'Pure Utilities',
    '_ppAddM': 'Pure Utilities',
    '_ppClean': 'Pure Utilities',
};

function getDomain(name) {
    return DOMAIN_MAP[name] || 'Finance'; // fallback
}

// ── 7. Safety classification ─────────────────────────────────────────────────
const SAFE_TO_EXTRACT = new Set([
    'getLocalToday', 'formatDate', 'formatMonth', 'addMonthsToYYYYMM', 'normalizeYYYYMM',
    'removeVietnameseTonesForQR', 'maskAccountNumber', '_ppAddM', '_ppClean',
    'formatMonthCompact', 'getBeltBadge', 'showToast', 'trackLargeListRender',
    'normalizeBranchKeyForPayment',
]);

const UNSAFE_TO_EXTRACT = new Set([
    'initSaaSDatabase', 'handleLogin', 'handleLogout', 'renderApp', 'switchTab',
    'quickPay', 'quickCollectExam', 'exportReceipt', 'processCombo', 'processMultiItem',
    'toggleAttendance', 'bulkCheckIn', 'loadSuperAdminData', 'saveClubSettings',
    'listenToData', 'dispatchAppContextReady', 'getAppContext', 'scheduleRender',
    'loadCoachAccounts', 'renderAttendanceList', 'renderExamList', 'renderAttMonthly',
]);

// ── 8. Firestore read/write heuristics ──────────────────────────────────────
const READS_FS = new Set([
    'initSaaSDatabase', 'listenToData', 'loadSuperAdminData', 'loadLoginHistory',
    'loadSARevenue', 'probeClubDataReadOnly', 'loadCoachAccounts', 'ppLookupLogin',
    'filterSAClubs', 'loadAllSessionNotes', 'loadSessionNote', 'exportToExcel',
    'fetchAllPagesForExport', 'saDeleteTransactions', '_loadCoachForBranchSummary',
    '_loadClubShifts', 'loadInvCategories', 'loadMiPaymentHistory',
]);
const WRITES_FS = new Set([
    'initSaaSDatabase', 'addNewStudent', 'updateProfile', 'deleteProfile', 'quickPay',
    'quickCollectExam', 'processCombo', 'processMultiItem', 'deleteTx', 'skipMonth',
    'saveClubSettings', 'saveClubExpiry', 'lockClubAccount', 'unlockClubAccount',
    'toggleExamFeature', 'saDeleteTransactions', 'addShift', 'deleteShift',
    'saveSessionNote', 'toggleAttendance', 'toggleAttendanceStatus', 'bulkCheckIn',
    'syncOfflineAttendance', '_saveAttOffline', 'addInvCategory', 'deleteInvCategory',
    'markInvPaid', 'recalcMiInvDebt', 'createCoachAccount', 'deleteCoachAccount',
    'resetCoachPassword', 'createNewClubSystem', 'forceReplaceAdmin', 'editClubName',
    'saveBranchUpgrade', 'saResetAdminPassword', 'processBatchUpgrade',
    'submitChangePassword', 'handleImportExcel',
]);

// ── Collect all unique function names we know about ──────────────────────────
const allFunctions = new Map();

// From declarations
for (const fn of fnDeclarations) {
    allFunctions.set(fn.name, { name: fn.name, line: fn.line, source: 'declaration' });
}

// From window exports
for (const [name, line] of windowExports) {
    if (!allFunctions.has(name)) {
        allFunctions.set(name, { name, line, source: 'window-assign' });
    }
}

// ── Build per-function metadata ──────────────────────────────────────────────
function buildMeta(name, info) {
    const domain        = getDomain(name);
    const calledByHTML  = handlerCalls.has(name) ? 'yes' : 'no';
    const exposedWindow = windowExports.has(name) ? 'yes' : 'no';
    const readsFS       = READS_FS.has(name) ? 'yes' : (domain === 'Pure Utilities' ? 'no' : 'unknown');
    const writesFS      = WRITES_FS.has(name) ? 'yes' : (domain === 'Pure Utilities' ? 'no' : 'unknown');
    const closureDep    = ['Pure Utilities', 'Debug/Diagnostics'].includes(domain) ? 'no' : 'yes';
    const safe          = SAFE_TO_EXTRACT.has(name) ? 'yes' :
                          UNSAFE_TO_EXTRACT.has(name) ? 'no' : 'later';
    const target        = domain === 'Pure Utilities' ? 'js/core/utils.js' :
                          domain === 'Payment/QR' ? 'js/modules/payments.js' :
                          domain === 'Attendance' ? 'js/modules/attendance.js' :
                          domain === 'Students/Profiles' ? 'js/modules/students.js' :
                          domain === 'Finance' ? 'js/modules/finance.js' :
                          domain === 'Inventory' ? 'js/modules/inventory.js' :
                          domain === 'Reports' ? 'js/modules/reports.js' :
                          domain === 'SuperAdmin' ? 'js/modules/superadmin.js' :
                          domain === 'Debug/Diagnostics' ? 'js/core/diagnostics.js' :
                          domain === 'UI/Modal' ? 'js/modules/ui.js' :
                          domain === 'Bootstrap/Auth' ? 'app.js (keep)' :
                          domain === 'Store/Bridge' ? 'app.js (keep)' :
                          'app.js';
    const bridge        = calledByHTML === 'yes' || exposedWindow === 'yes' ? 'yes' : 'no';
    return {
        name, domain, calledByHTML, exposedWindow, readsFS, writesFS, closureDep,
        safe, target, bridge, line: info?.line || '?',
    };
}

// ── Generate the markdown report ──────────────────────────────────────────────
function pad(s, n) { return String(s).padEnd(n); }

const DOMAINS_ORDER = [
    'Bootstrap/Auth', 'Store/Bridge', 'Students/Profiles', 'Finance', 'Debt',
    'Inventory', 'Attendance', 'Reports', 'Payment/QR', 'SuperAdmin',
    'UI/Modal', 'Debug/Diagnostics', 'Pure Utilities',
];

// Collect all known names
const allNames = new Set([
    ...fnDeclarations.map(f => f.name),
    ...windowExports.keys(),
]);

const fnMetas = [...allNames].map(n => buildMeta(n, allFunctions.get(n)));

const byDomain = {};
for (const fn of fnMetas) {
    if (!byDomain[fn.domain]) byDomain[fn.domain] = [];
    byDomain[fn.domain].push(fn);
}

// Table helper
function mdTable(rows, cols) {
    const header = '| ' + cols.join(' | ') + ' |';
    const sep    = '| ' + cols.map(() => '---').join(' | ') + ' |';
    const body   = rows.map(r => '| ' + r.map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
    return [header, sep, body].join('\n');
}

let md = `# APPJS_DEPENDENCY_MAP — Phase 4.0C-1

> Generated by \`tools/analyze-appjs-dependencies.mjs\`
> Date: ${new Date().toISOString().split('T')[0]}

---

## Tổng quan

| Chỉ số | Số lượng |
| --- | --- |
| Function declarations trong app.js | ${fnDeclarations.length} |
| window.* exports trong app.js | ${windowExports.size} |
| Inline handlers trong index.html | ${allHandlers.length} |
| Function được HTML gọi trực tiếp | ${handlerCalls.size} |
| External modules scanned | ${allExtFiles.length} |

---

## 1. Function Declarations trong app.js

${fnDeclarations.map(f => `- \`${f.name}\` (line ${f.line})`).join('\n')}

---

## 2. window.* Exports trong app.js

${[...windowExports.entries()].map(([n, l]) => `- \`window.${n}\` (line ${l})`).join('\n')}

---

## 3. Inline Handlers trong index.html

### 3a. Danh sách function được HTML gọi trực tiếp

${[...handlerCalls].sort().map(n => `- \`${n}\``).join('\n')}

### 3b. Handler expressions mẫu (sample)

${allHandlers.slice(0, 30).map(h => `- \`${h.slice(0, 120)}\``).join('\n')}
${allHandlers.length > 30 ? `\n_... và ${allHandlers.length - 30} handlers khác_` : ''}

---

## 4. Global Variables / Closure State quan trọng

${GLOBALS.map(g => `- \`${g}\``).join('\n')}

---

## 5. Function Ownership Map theo Domain

`;

for (const domain of DOMAINS_ORDER) {
    const fns = byDomain[domain] || [];
    if (!fns.length) continue;
    md += `### ${domain}\n\n`;
    const rows = fns.sort((a,b) => a.name.localeCompare(b.name)).map(fn => [
        `\`${fn.name}\``,
        fn.domain,
        fn.calledByHTML,
        fn.exposedWindow,
        fn.readsFS,
        fn.writesFS,
        fn.closureDep,
        fn.safe,
        `\`${fn.target}\``,
        fn.bridge,
    ]);
    md += mdTable(rows, [
        'Function', 'Domain', 'HTML?', 'window?', 'Reads FS', 'Writes FS',
        'Closure dep', 'Safe extract', 'Target file', 'Bridge req',
    ]);
    md += '\n\n';
}

// ── 6. Safe extraction candidates ────────────────────────────────────────────
const safeNow = fnMetas.filter(f => f.safe === 'yes');
const safeLater = fnMetas.filter(f => f.safe === 'later');
const unsafeNow = fnMetas.filter(f => f.safe === 'no');

md += `---

## 6. Safe Extraction Candidates (Stage 1 — Pure Utilities)

Các function có thể tách sang \`js/core/utils.js\` ngay:

${safeNow.map(f => `- \`${f.name}\``).join('\n')}

---

## 7. Unsafe to Extract Now (High Risk)

Không tách trong phase này:

${unsafeNow.map(f => `- \`${f.name}\``).join('\n')}

---

## 8. Firestore Read/Write Functions

### Reads Firestore

${fnMetas.filter(f => f.readsFS === 'yes').map(f => `- \`${f.name}\``).join('\n')}

### Writes Firestore

${fnMetas.filter(f => f.writesFS === 'yes').map(f => `- \`${f.name}\``).join('\n')}

---

## 9. Render UI Functions (phụ thuộc DOM)

${fnMetas.filter(f => ['UI/Modal', 'Attendance', 'Reports', 'Students/Profiles'].includes(f.domain)).map(f => `- \`${f.name}\` (${f.domain})`).join('\n')}

---

## 10. Notes & Warnings

- Danh sách này được tạo bằng regex scan — có thể thiếu function expression / arrow function ẩn trong IIFE.
- Một số function được expose qua \`window\` trong các module bên ngoài (không phải app.js).
- Trước khi tách bất kỳ function nào, cần chạy \`node tools/check-appjs-decomposition-readiness.mjs\`.
`;

// Write output
const outPath = resolve(ROOT, 'APPJS_DEPENDENCY_MAP.md');
writeFileSync(outPath, md, 'utf8');
console.log(`\n✅ APPJS_DEPENDENCY_MAP.md đã được tạo (${Math.round(md.length / 1024)}KB)`);
console.log(`\n   Tổng kết:`);
console.log(`   - ${fnDeclarations.length} function declarations`);
console.log(`   - ${windowExports.size} window.* exports`);
console.log(`   - ${allHandlers.length} inline handlers trong index.html`);
console.log(`   - ${handlerCalls.size} function được HTML gọi trực tiếp`);
console.log(`   - ${safeNow.length} safe to extract now`);
console.log(`   - ${unsafeNow.length} unsafe to extract`);
console.log(`   - ${allExtFiles.length} external modules scanned`);
