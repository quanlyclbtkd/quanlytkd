#!/usr/bin/env node
import {attendanceCacheChain} from './v11r2/cache-contract.mjs';
import {verifySourceIdentity,ACCEPTED_SOURCE} from './v11r2/source-identity.mjs';
import {runtimeHash} from './v11r2/cutover.mjs';
import {buildImportGraph,affectedModules,assertCacheGraph} from './v11r2/import-graph.mjs';
/**
 * Phase 4K-6V5U6G — Production Stability Sweep + Residual Runtime Defect Closure
 *
 * Hard gate for the residual defects fixed in this phase. This test never calls
 * Firebase. Attendance runtime tests replace AttendanceService with deterministic
 * fakes and exercise the real module/localStorage journal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const attendance = read('js/modules/attendance.js');
const attendanceService = read('js/services/attendance.service.js');
const financeService = read('js/services/finance.service.js');
const financeModule = read('js/modules/finance.js');
const profiles = read('js/listeners/profiles.listeners.js');
const students = read('js/modules/students.js');
const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const passes = [];
const failures = [];
const check = (ok, message, detail = '') => {
    (ok ? passes : failures).push({ message, detail });
    console.log(ok ? '✅' : '❌', message, ok || !detail ? '' : `— ${detail}`);
};
const count = (src, re) => (src.match(re) || []).length;
const block = (src, startNeedle, endNeedle) => {
    const start = src.indexOf(startNeedle);
    if (start < 0) return '';
    const end = src.indexOf(endNeedle, start + startNeedle.length);
    return src.slice(start, end < 0 ? src.length : end);
};

console.log('\n🔎 Phase 4K-6V5U6G — Production Residual Defect Closure\n');

// V11: storage/ACK behavior moved from mutable V2 snapshots to CAS intents.
const journal=read('js/data/attendanceJournal.js');
check(journal.includes("db.transaction(['intents','meta'],'readwrite')") && !journal.includes('removeItem('), 'Journal enqueue/claim/ACK use native transactions; legacy input is never removed');
check(attendance.includes('let _offlineAttendanceSyncPromise = null;') && attendance.includes('AttendanceJournal.claim(') && attendance.includes('AttendanceJournal.acknowledge('), 'Online/offline share one sync owner and exact intent ACK');
check(attendanceService.includes('function _commitAttendanceIntents(') && attendanceService.includes('attendance/intent-conflict') && attendanceService.includes('attendancePreviousVersion'), 'One CAS writer detects replay and preserves server version');

// ── D1C3B Dashboard true-zero hydration comes from the Admin full snapshot ──
const adminAuthorityBlock = block(profiles, '// D1C3B Admin authority:', "window.scheduleAutomaticDebtProfileCoverage('full-profiles-authoritative-snapshot')");
const coachBranchOwnerBlock = block(profiles, 'export function mountActiveProfilesListener(context)', 'export function cleanupActiveProfilesListener');
check(!/_pG4k\s*\(|fbGetDocs\s*\(/.test(adminAuthorityBlock), 'Admin true-zero hydration uses the full snapshot itself with zero probe/read');
check(adminAuthorityBlock.includes('_state.activeSnapshotCount === 1') && adminAuthorityBlock.includes('coverageComplete: true'), 'Initial Admin full snapshot closes Dashboard members hydration as complete even at zero profiles');
check(adminAuthorityBlock.includes('activeCount,') && adminAuthorityBlock.includes('activeAvailable: true') && adminAuthorityBlock.includes('_state.fullAuthorityComplete = true'), 'Full authoritative evidence publishes active count availability and completeness');
check(!coachBranchOwnerBlock.includes('profiles.activeZeroProbe') && coachBranchOwnerBlock.includes("fbQuery(profRef, fbWhere('branch', '==', coachBranch))") && profiles.includes("_coachRosterReadiness() === 'verified'"), 'Coach branch-complete server roster has no obsolete zero-probe and fallback stays within existing scoped owner');

// ── Profile fallback ownership ──────────────────────────────────────────────
const mountProfiles = block(profiles, 'export function mountActiveProfilesListener(context)', 'export function cleanupActiveProfilesListener');
const takeoverRemove = mountProfiles.indexOf("window.removeListener(emergencyFallbackKey, 'profiles-active-module-takeover')");
const activeRegister = mountProfiles.indexOf('window.safeRegisterSnapshot(');
check(mountProfiles.includes("const emergencyFallbackKey = 'global:profiles:' + clubId"), 'Active profile owner recognizes the Admin emergency full fallback key');
check(takeoverRemove >= 0 && activeRegister > takeoverRemove, 'Fallback is unsubscribed before active-module listener creation');
check(mountProfiles.includes('window.hasListener(emergencyFallbackKey)') && mountProfiles.includes('fallback-cleanup-verification-failed') && mountProfiles.includes('return false;'), 'Fallback takeover verifies cleanup and fails closed if verification fails');
const appFallback = block(app, '// [Phase 3.7B] Mount active-only realtime listener', '// Phase 4K-6V2 — Inventory History Pagination');
check(appFallback.includes("RoleReadBoundary?.isCoachAttendanceOnly?.() === true") && appFallback.indexOf("RoleReadBoundary?.isCoachAttendanceOnly?.() === true") < appFallback.indexOf('const _u_profiles = onSnapshot'), 'Coach can never enter the full-club profile fallback');
check(appFallback.includes("registerListener('global:profiles:' + clubId"), 'Admin emergency fallback remains registered in the existing listener registry for explicit takeover');

// ── Silent secondary/projection write closure ──────────────────────────────
check(attendanceService.includes('attendance/derived-read-only') && !attendance.includes('AttendanceService.updateMemberStats('), 'Coach does not write members projection');
check(attendance.includes('_attendanceDerivedStats.set(name,') && attendance.includes('AttendanceService.loadMemberHistory('), 'Specialized attendance stats derive from canonical history');
check(app.includes("'inventory-payment-link-reconcile-required'")
    && students.includes('paymentBundleId: feePlan.ref.id')
    && students.includes('paidTxId: feePlan.ref.id')
    && students.includes('batch.set(inventoryPlan.itemRef, inventoryPlan.payload)')
    && students.includes('batch.set(feePlan.ref, feePlan.payload)')
    && students.includes('await batch.commit();')
    && !students.includes('await StudentService.updateInventoryDoc(_invId'),
    'Module admission links inventory and payment in one batch; legacy linkage failure stays observable');
check(financeService.includes("classification: 'fee-audit-write-failed'") && financeService.includes('canonicalPaymentPreserved: true') && financeService.includes("recordRuntimeError?.('secondary-consistency:'") && financeModule.includes('FinanceService.addFeeAuditSilent'), 'Fee audit failure is observable and never invalidates successful payment');
check(app.includes("'attendance-note-notification-projection-failed'") && app.includes('canonicalSessionNotePreserved: true'), 'Session-note notification projection failure is observable while note remains canonical');
const multiItem = block(app, 'window.processMultiItem = async (action) =>', '// ─── Setup currency inputs');
check(multiItem.includes("_batch.update(doc(db, 'clubs', currentClubId, 'inventory', id)") && multiItem.includes('paidTxId: _bundleDocRef.id') && multiItem.includes('_batch.set(_bundleDocRef') && !multiItem.includes('setInterval('), 'Inventory debt/payment links commit in the same canonical multi-item batch, with no retry loop');

// ── No new runtime authority/read/polling budget ────────────────────────────
function walkJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['migrations', 'diagnostics'].includes(e.name)) continue;
            walkJs(full, out);
        } else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
}
const runtimeFiles = [path.join(root, 'app.js'), ...walkJs(path.join(root, 'js'))];
const callPatterns = {
    getDoc: /(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,
    getDocs: /(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,
    onSnapshot: /(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g,
};
const readCounts = { getDoc: 0, getDocs: 0, onSnapshot: 0 };
let runtimeText = '';
for (const file of runtimeFiles) {
    const src = fs.readFileSync(file, 'utf8');
    runtimeText += '\n' + src;
    for (const line of src.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        for (const [name, re] of Object.entries(callPatterns)) {
            re.lastIndex = 0;
            if (re.test(line)) readCounts[name]++;
        }
    }
}
check(readCounts.getDoc <= 31, `getDoc call-site budget unchanged (${readCounts.getDoc} <= 31)`);
check(readCounts.getDocs <= 56, `getDocs call-site budget unchanged (${readCounts.getDocs} <= 56)`);
check(readCounts.onSnapshot <= 16, `onSnapshot call-site budget unchanged (${readCounts.onSnapshot} <= 16)`);
const appWindowAssignments = count(app, /window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=/g);
check(appWindowAssignments <= 534, `legacy app window assignment budget does not increase (${appWindowAssignments} <= 534)`);
const eventCalls = count(runtimeText, /\baddEventListener\s*\(/g);
const intervalCalls = count(runtimeText, /\bsetInterval\s*\(/g);
const timeoutCalls = count(runtimeText, /\bsetTimeout\s*\(/g);
// H6 reconciliation: H5 intentionally added one bounded listener-registry readiness
// barrier (2 once:true event listeners + 1 bounded timeout). Freeze that exact
// approved delta structurally while keeping the historical runtime outside the
// readiness block at or below its pre-H5 budget.
const readinessBlock = block(app, 'const _waitForListenerRegistryReady = () => {', 'const _commitClubAccessBootstrapState =');
const readinessEventCalls = count(readinessBlock, /\baddEventListener\s*\(/g);
const readinessIntervalCalls = count(readinessBlock, /\bsetInterval\s*\(/g);
const readinessTimeoutCalls = count(readinessBlock, /\bsetTimeout\s*\(/g);
const outsideReadinessText = runtimeText.replace(readinessBlock, '');
const outsideEventCalls = count(outsideReadinessText, /\baddEventListener\s*\(/g);
const outsideIntervalCalls = count(outsideReadinessText, /\bsetInterval\s*\(/g);
const outsideTimeoutCalls = count(outsideReadinessText, /\bsetTimeout\s*\(/g);
check(
    readinessEventCalls === 2 &&
    readinessBlock.includes("window.addEventListener('app:listener-registry-ready', onReady, { once: true })") &&
    readinessBlock.includes("window.addEventListener('app:listener-registry-failed', onFailed, { once: true })"),
    `H5 readiness barrier owns exactly two once:true registry event listeners (${readinessEventCalls})`
);
check(
    readinessTimeoutCalls === 1 &&
    /const _LISTENER_REGISTRY_READY_TIMEOUT_MS = 10000;/.test(app) &&
    /setTimeout\([^;]*_LISTENER_REGISTRY_READY_TIMEOUT_MS\)/s.test(readinessBlock),
    `H5 readiness barrier owns exactly one bounded 10s timeout (${readinessTimeoutCalls})`
);
check(
    readinessIntervalCalls === 0 &&
    !/\b(?:getDoc|getDocs|onSnapshot)\s*\(/.test(readinessBlock) &&
    count(readinessBlock, /_waitForListenerRegistryReady\s*\(/g) === 0,
    'H5 readiness barrier has no polling, Firestore wait, or recursive retry'
);
check(
    outsideEventCalls <= 115 && outsideIntervalCalls <= 1 && outsideTimeoutCalls <= 86 &&
    eventCalls <= 117 && intervalCalls <= 1 && timeoutCalls <= 87,
    `event/timer freeze allows only approved H5 readiness delta (total ${eventCalls}/${intervalCalls}/${timeoutCalls}; outside ${outsideEventCalls}/${outsideIntervalCalls}/${outsideTimeoutCalls})`
);
check(!runtimeText.includes('GlobalAsyncManager') && !runtimeText.includes('FetchCoordinatorV2'), 'No generic global request manager was introduced');
check(!/queueWrite\s*\(/.test(runtimeText.replace(read('js/utils/offline-queue.js'), '')), 'Generic offline queue has no Attendance/business caller overlap');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V5U6G1-attendance-offline-canonical-sync-closure-20260815'"), 'Exact V5U6G1 build version is active while V5U6G boundaries remain frozen');
check(index.includes('app.js?v=production-stability-residual-defect-closure-20260814-v5u6g') && index.includes('./js/main.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1'), 'Only changed root runtime main.js receives the V5U6G1 cache-bust; unchanged app.js stays on V5U6G');
const r1CacheSlug = 'profile-display-name-safe-edit-20260916-v5u6h8r1';
const v5u6gFrozenCacheScope =
    main.includes("./listeners/profiles.listeners.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes("./modules/students.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes("./modules/attendance.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1") &&
    attendance.includes("../services/attendance.service.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1");
const h8r1DisplayNameCacheScope =
    main.includes("./listeners/profiles.listeners.js?v=production-stability-residual-defect-closure-20260814-v5u6g") &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r1CacheSlug}`) &&
    attendance.includes("../services/attendance.service.js?v=attendance-offline-canonical-sync-closure-20260815-v5u6g1");
const r2CacheSlug = 'long-term-production-stability-20260917-v5u6h8r2';
const h8r2StabilityCacheScope =
    main.includes(`./listeners/profiles.listeners.js?v=${r2CacheSlug}`) &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r2CacheSlug}`) &&
    attendance.includes(`../services/attendance.service.js?v=${r2CacheSlug}`);
const r21CacheSlug = 'residual-financial-cache-correctness-20260917-v5u6h8r2_1';
const h8r21ResidualCacheScope =
    main.includes(`./listeners/profiles.listeners.js?v=${r21CacheSlug}`) &&
    main.includes(`./modules/students.js?v=${r1CacheSlug}`) &&
    main.includes(`./modules/attendance.js?v=${r21CacheSlug}`) &&
    attendance.includes(`../services/attendance.service.js?v=${r21CacheSlug}`);
const v9AttendanceCacheScope =
    /s\.src\s*=\s*'\.\/js\/main\.js\?v=qr-v9-attendance-rules-20261020'/.test(index) &&
    /import \{ initAttendance \}\s+from '\.\/modules\/attendance\.js\?v=qr-v9-attendance-rules-20261020'/.test(main) &&
    /import \{ AttendanceService \} from '\.\.\/services\/attendance\.service\.js\?v=qr-v9-attendance-rules-20261020'/.test(attendance);
const v10CoachContextCacheScope =
    /s\.src\s*=\s*'\.\/js\/main\.js\?v=coach-roster-context-v10-20261020'/.test(index) &&
    /from '\.\/listeners\/profiles\.listeners\.js\?v=coach-roster-context-v10-20261020'/.test(main) &&
    /import \{ initAttendance \}\s+from '\.\/modules\/attendance\.js\?v=coach-roster-context-v10-20261020'/.test(main) &&
    /import \{ AttendanceService \} from '\.\.\/services\/attendance\.service\.js\?v=qr-v9-attendance-rules-20261020'/.test(attendance);
const a9Scope = (()=>{try{
 const p=verifySourceIdentity(root,runtimeHash(root));
 return p.id==='V11R6_A9_AUTH_ACL_RECOVERY_TEST_ONLY'
   && index.includes('src="app.js?v=qr-v11r6-a9-auth-acl-20261023"')
   && index.includes('src="./js/core/coachBranchRuntimeRepair.js?v=qr-v11r6-a9-auth-acl-20261023"')
   && buildImportGraph(root).edges.some(e=>e.to==='app.js' && e.url.includes('qr-v11r6-a9-auth-acl-20261023'))
   && buildImportGraph(root).edges.some(e=>e.to==='js/core/coachBranchRuntimeRepair.js' && e.url.includes('qr-v11r6-a9-auth-acl-20261023'));
}catch{return false}})();
const a9r1Scope = (()=>{try{
 const p=verifySourceIdentity(root,runtimeHash(root));
 const graph=buildImportGraph(root);
 return p.id==='V11R6_A9R1_COACH_REPAIR_UI_TEST_ONLY'
   && index.includes('src="app.js?v=qr-v11r6-a9-auth-acl-20261023"')
   && index.includes('src="./js/core/coachBranchRuntimeRepair.js?v=qr-v11r6-a9r1-coach-repair-ui-20261023"')
   && graph.edges.some(e=>e.to==='app.js'&&e.url.includes('qr-v11r6-a9-auth-acl-20261023'))
   && graph.edges.some(e=>e.to==='js/core/coachBranchRuntimeRepair.js'&&e.url.includes('qr-v11r6-a9r1-coach-repair-ui-20261023'));
}catch{return false}})();
const a9r4Scope = (()=>{try{
 const p=verifySourceIdentity(root,runtimeHash(root));
 const graph=buildImportGraph(root);
 return p.id==='V11R6_A9R4_COACH_ONBOARDING_QR_DIAGNOSTICS_TEST_ONLY'
   && index.includes('src="app.js?v=qr-v11r6-a9-auth-acl-20261023"')
   && index.includes('src="./js/core/coachBranchRuntimeRepair.js?v=qr-v11r6-a9r4-coach-orphan-20261023"')
   && graph.edges.some(e=>e.to==='app.js'&&e.url.includes('qr-v11r6-a9-auth-acl-20261023'))
   && graph.edges.some(e=>e.to==='js/core/coachBranchRuntimeRepair.js'&&e.url.includes('qr-v11r6-a9r4-coach-orphan-20261023'));
}catch{return false}})();
const a9r3Scope = (()=>{try{
 const p=verifySourceIdentity(root,runtimeHash(root));
 const graph=buildImportGraph(root);
 return p.id==='V11R6_A9R3_MIRROR_VERSION_CAS_TEST_ONLY'
   && index.includes('src="app.js?v=qr-v11r6-a9-auth-acl-20261023"')
   && index.includes('src="./js/core/coachBranchRuntimeRepair.js?v=qr-v11r6-a9r3-mirror-cas-20261023"')
   && graph.edges.some(e=>e.to==='app.js'&&e.url.includes('qr-v11r6-a9-auth-acl-20261023'))
   && graph.edges.some(e=>e.to==='js/core/coachBranchRuntimeRepair.js'&&e.url.includes('qr-v11r6-a9r3-mirror-cas-20261023'));
}catch{return false}})();
const a6Scope = (()=>{try{const p=verifySourceIdentity(root,runtimeHash(root));return p.id==='V11R6_A6_COACH_QR_MAINTENANCE'&&assertCacheGraph(buildImportGraph(root),affectedModules(buildImportGraph(root)),p.buildTag)}catch{return false}})();
const v11CacheScope = index.includes("s.src  = './js/main.js?v=qr-v11-intent-20261020'") && main.includes("from './modules/attendance.js?v=qr-v11-intent-20261020'") && attendance.includes("attendance.service.js?v=qr-v11-intent-20261020");
const v11r4CacheScope =
    /s\.src\s*=\s*'\.\/js\/main\.js\?v=qr-v11r4-tuition-20261021'/.test(index) &&
    index.includes('src="app.js?v=qr-v11r4-tuition-20261021"') &&
    main.includes("from './modules/finance.js?v=qr-v11r4-tuition-20261021'") &&
    main.includes("from './ui/render/renderFinance.js?v=qr-v11r4-tuition-20261021'") &&
    main.includes("from './core/tuitionCommandBoundary.js?v=qr-v11r4-tuition-20261021'") &&
    financeModule.includes("../services/finance.service.js?v=qr-v11r4-tuition-20261021") &&
    main.includes("from './modules/attendance.js?v=qr-v11r2-cutover-20261021'");
const v11r5CacheScope = index.includes("s.src  = './js/main.js?v=qr-v11r5-ack-20261021'") && index.includes('src="app.js?v=qr-v11r5-ack-20261021"') &&
    main.includes("from './modules/finance.js?v=qr-v11r5-ack-20261021'") && main.includes("from './core/tuitionCommandBoundary.js?v=qr-v11r5-ack-20261021'") &&
    financeModule.includes("../services/finance.service.js?v=qr-v11r5-ack-20261021") && financeModule.includes("./finance/finance.pagination.js?v=qr-v11r5-ack-20261021") &&
    main.includes("from './modules/attendance.js?v=qr-v11r2-cutover-20261021'");
const v11r6CacheScope = index.includes("s.src  = './js/main.js?v=qr-v11r6-review-20261021'") && index.includes('src="app.js?v=qr-v11r6-review-20261021"') &&
    main.includes("from './modules/finance.js?v=qr-v11r6-review-20261021'") && main.includes("from './ui/render/renderFinance.js?v=qr-v11r6-review-20261021'") &&
    financeModule.includes("./finance/finance.pagination.js?v=qr-v11r6-review-20261021") && financeModule.includes("../ui/render/renderFinance.js?v=qr-v11r6-review-20261021") &&
    main.includes("from './core/tuitionCommandBoundary.js?v=qr-v11r5-ack-20261021'") && financeModule.includes("../services/finance.service.js?v=qr-v11r5-ack-20261021") &&
    main.includes("from './modules/attendance.js?v=qr-v11r2-cutover-20261021'");
const a5MaintenanceCacheScope=(()=>{try{
 const identity=verifySourceIdentity(root,runtimeHash(root));
 if(identity.id!=='V11R6_A5_ATTENDANCE_MAINTENANCE'||identity.buildTag!==ACCEPTED_SOURCE.buildTag)return false;
 const graph=buildImportGraph(root);return assertCacheGraph(graph,affectedModules(graph),identity.buildTag);
}catch{return false}})();
check(a9r4Scope || a9r3Scope || a9r1Scope || a9Scope || a6Scope || a5MaintenanceCacheScope || attendanceCacheChain() || v11CacheScope || v11r4CacheScope || v11r5CacheScope || v11r6CacheScope || v5u6gFrozenCacheScope || h8r1DisplayNameCacheScope || h8r2StabilityCacheScope || h8r21ResidualCacheScope || v9AttendanceCacheScope || v10CoachContextCacheScope, 'Changed modules are cache-busted only within the active phase scope');
check(pkg.scripts?.['check:production-residual-defect-closure'] === 'node tools/check-production-residual-defect-closure.mjs', 'package exposes the V5U6G master gate');

// Execute the new production service contract; native journal/Emulator suites
// are separate mandatory checks. Unrelated finance/read-owner checks above stay.
const {casContract}=await import('./v11/cas-contract.mjs');
try {const result=await casContract();check(result.results.length===13 &&
    result.results.includes('same verified principal may adopt initially missing UI mirrors'),
    'CAS identity/ACK/replay/context/status matrix plus verified mirror adoption');}
catch(error){check(false,'CAS matrix',error.stack);}

console.log(`\nTotal: ${passes.length + failures.length} | PASS: ${passes.length} | FAIL: ${failures.length}`);
if (failures.length) {
    console.error('\nV5U6G residual closure gate FAILED:');
    failures.forEach(({ message, detail }) => console.error(' -', message, detail || ''));
    process.exit(1);
}
console.log('Phase 4K-6V5U6G residual defect closure gate passed.\n');
