#!/usr/bin/env node
/**
 * Phase 4K-6T — Legacy Diagnostics, Pilot & Audit Tooling Isolation
 * Static + lightweight runtime checks. No network and no Firebase writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const failures = [];
const passes = [];
const check = (condition, message) => condition ? passes.push(message) : failures.push(message);

const phase = '4K-6T-legacy-diagnostics-pilot-audit-tooling-isolation';
const build = `${phase}-20260616`;
const runtimePath = 'js/diagnostics/runtimeReadinessDiagnostics.js';
const onboardingPath = 'js/diagnostics/onboardingDiagnostics.js';
const superAdminPath = 'js/diagnostics/superAdminAuditDiagnostics.js';
const facadePath = 'js/diagnostics/legacyDiagnostics.js';
const registryPath = 'js/core/globalOwnershipRegistry.js';

const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const registrySource = read(registryPath);
const facade = read(facadePath);
const runtime = read(runtimePath);
const onboarding = read(onboardingPath);
const superAdmin = read(superAdminPath);
const diagnosticSources = [runtime, onboarding, superAdmin, facade].join('\n');

const runtimeNames = [
  'debugMobileSuperAdminGate',
  'printDataHydrationStatus',
  'printTabDataStatus',
  'printFirestorePathStatus',
  'printPilotTabReadiness',
  'printPilotLaunchStatus',
  'printTenClubPilotReadiness',
  'generatePilotLaunchSnapshot',
  'printOneClubPilotGate',
];
const lazyNames = [
  'runOnboardingGate',
  'printOnboardingGate',
  'generateOnboardingReportText',
  'runSuperAdminAudit',
  'printSuperAdminAudit',
  'generateSuperAdminAuditReportText',
];
const extractedNames = [...runtimeNames, ...lazyNames];

console.log('\n🔎 Phase 4K-6T — Diagnostics / Pilot / Audit Tooling Isolation\n');

for (const file of [runtimePath, onboardingPath, superAdminPath, facadePath]) {
  check(exists(file), `${file} exists`);
}

check(facade.includes("import('./onboardingDiagnostics.js')"), 'onboarding diagnostics are lazy-loaded');
check(facade.includes("import('./superAdminAuditDiagnostics.js')"), 'SuperAdmin audit diagnostics are lazy-loaded');
check(!main.includes("from './diagnostics/onboardingDiagnostics.js'"), 'main.js does not eagerly import onboarding diagnostics');
check(!main.includes("from './diagnostics/superAdminAuditDiagnostics.js'"), 'main.js does not eagerly import SuperAdmin audit diagnostics');
check(main.includes("from './diagnostics/legacyDiagnostics.js'"), 'main.js retains compatibility facade entrypoint');
check(main.indexOf('initGlobalOwnershipRegistry();') < main.indexOf('initLegacyDiagnostics();'), 'ownership registry initializes before diagnostics ownership');

const forbiddenWriteCalls = [
  'setDoc', 'updateDoc', 'addDoc', 'deleteDoc', 'writeBatch', 'runTransaction',
  'onSnapshot', 'increment', 'arrayUnion', 'arrayRemove',
];
for (const api of forbiddenWriteCalls) {
  const pattern = new RegExp(`\\b${api}\\s*\\(`);
  check(!pattern.test(diagnosticSources), `diagnostics contain no ${api}() call`);
}
check(runtime.includes('limit(1)'), 'runtime Firestore path diagnostics use limit(1)');
check(superAdmin.includes('limit(1)'), 'SuperAdmin audit probes use limit(1)');
check(!/\.get\(\)\s*;/.test(runtime), 'runtime diagnostics do not issue unbounded compat get()');
check(superAdmin.includes('.limit(1).get()'), 'compat SuperAdmin probe remains bounded to one document');

for (const name of extractedNames) {
  const directAssignment = new RegExp(`window\\.${name}\\s*=(?!=)`);
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  check(!directAssignment.test(app), `app.js no longer assigns window.${name}`);
  check(!declaration.test(app), `app.js no longer defines ${name}()`);
  check(registrySource.includes(`${name}:`), `ownership manifest includes ${name}`);
}
check(!/function\s+probeClubDataReadOnly\s*\(/.test(app), 'app.js no longer contains probeClubDataReadOnly implementation');

const protectedKernel = [
  'bumpRuntimeDataVersion',
  'activateLegacyRootFallback',
  'runRuntimeDataRecovery',
  'renderApp',
  'scheduleRender',
  'initSaaSDatabase',
  'listenToData',
];
for (const name of protectedKernel) {
  check(app.includes(name), `protected runtime kernel remains in app.js: ${name}`);
  check(!diagnosticSources.includes(`function ${name}(`), `diagnostics do not take ownership of ${name}`);
}

const appBytes = Buffer.byteLength(app);
const appLines = app.split('\n').length;
check(appBytes <= 760000, `app.js reduced to ${appBytes.toLocaleString()} bytes (target <= 760,000)`);
check(appLines <= 12200, `app.js reduced to ${appLines.toLocaleString()} lines (target <= 12,200)`);
check(!app.startsWith('/**\n * Firestore Security Rules'), 'obsolete embedded Firestore rules comment was removed from app.js');
check(exists('firestore.rules'), 'firestore.rules remains the rules source of truth');

check(registrySource.includes("phase: '4K-6V-attendance-canonical-ownership'"), 'registry reports current phase while retaining 4K-6T diagnostics ownership');
check(main.includes(`APP_BUILD_VERSION = '${build}'`), 'main.js retains Phase 4K-6T compatibility marker');
check(main.includes("window.APP_BUILD_VERSION = '4K-6V-attendance-canonical-ownership-pagination-20260616'"), 'active build version advances to Phase 4K-6V');
check(index.includes('app.js?v=attendance-canonical-ownership-20260616'), 'app.js cache-bust advances beyond Phase 4K-6T');
check(index.includes('main.js?v=attendance-canonical-ownership-20260616'), 'main.js cache-bust advances beyond Phase 4K-6T');
check(main.includes('initLegacyDiagnostics();'), 'main initializes extracted diagnostics facade');

check(!!pkg.scripts?.['check:diagnostics-tooling-isolation'], 'package exposes Phase 4K-6T checker');
check(pkg.scripts?.check?.includes('check:diagnostics-tooling-isolation'), 'default check includes Phase 4K-6T');
check(pkg.scripts?.['check:all']?.includes('check:diagnostics-tooling-isolation'), 'check:all includes Phase 4K-6T');
check(pkg.scripts?.['check:all:critical']?.includes('check:diagnostics-tooling-isolation'), 'critical suite includes Phase 4K-6T');

// Lightweight runtime ownership + lazy-loading simulation.
const elements = new Map([
  ['mmsAdminBtn', { style: { display: 'none' }, value: '' }],
  ['filterMonth', { style: {}, value: '2026-06' }],
]);
globalThis.window = globalThis;
globalThis.document = { getElementById: (id) => elements.get(id) || null };
globalThis.getComputedStyle = (el) => ({ display: el?.style?.display || '' });
globalThis.__store = {
  clubId: 'club-test',
  currentClubId: 'club-test',
  userRole: 'admin',
  profiles: {
    p1: { id: 'p1', status: 'active', name: 'Võ sinh thử nghiệm' },
    p2: { id: 'p2', status: 'quit', name: 'Võ sinh đã nghỉ' },
  },
  transactions: [{ id: 't1', txMonth: '2026-06', amount: 250000 }],
  inventory: [{ id: 'i1', name: 'Võ phục' }],
  clubs: {},
};
globalThis.__firestoreDataSourceMetrics = { activeDataSource: 'primary' };
globalThis.__dataHydrationMetrics = {
  profilesDocCount: 2,
  transactionsDocCount: 1,
  inventoryDocCount: 1,
  settingsLoaded: true,
  clubLoaded: true,
  lastReason: 'phase-4k-6t-check',
};
globalThis.__appContextReadyState = { ready: true };
globalThis.currentClubId = 'club-test';
globalThis.currentTab = 'tuition';
globalThis.userRole = 'admin';
globalThis.isSuperAdminRole = () => false;
globalThis.isSuperAdmin = () => true;
globalThis.classifyProfileStatus = (profile) => profile?.status === 'quit' ? 'quit' : 'active';
globalThis.resolveActiveDataSource = async () => ({ source: 'primary' });
globalThis.getRuntimeHealthStatus = () => ({ criticalMissing: [] });
globalThis.getAppContext = () => ({ currentClubId: 'club-test', db: null });

try {
  const registryModule = await import(pathToFileURL(path.join(root, registryPath)).href);
  const diagnosticsModule = await import(pathToFileURL(path.join(root, facadePath)).href);
  registryModule.initGlobalOwnershipRegistry();
  diagnosticsModule.initLegacyDiagnostics();

  const before = globalThis.debugDiagnosticsToolingIsolation();
  check(before.ok, 'diagnostics facade installs every extracted global');
  check(before.runtimeGlobalCount === 9, 'nine runtime diagnostics are eager');
  check(before.lazyGlobalCount === 6, 'six diagnostics are lazy wrappers');
  check(before.onboardingLoaded === false, 'onboarding implementation is not loaded during startup');
  check(before.superAdminAuditLoaded === false, 'SuperAdmin audit implementation is not loaded during startup');

  const registeredDiagnostics = globalThis.GlobalOwnershipRegistry.getSnapshot().registered
    .filter((item) => extractedNames.includes(item.name));
  check(registeredDiagnostics.length === 15, 'all 15 extracted diagnostics have canonical owners');
  check(registeredDiagnostics.every((item) => item.installed), 'all diagnostic canonical globals remain installed');
  check(globalThis.GlobalOwnershipRegistry.assertRegisteredOwnership().ok, 'registered diagnostic ownership references are healthy');

  const hydration = globalThis.printDataHydrationStatus();
  check(hydration.storeProfilesCount === 2 && hydration.storeTransactionsCount === 1, 'hydration diagnostics read the shared store correctly');
  const tab = globalThis.printTabDataStatus();
  check(tab.transactionsInSelectedMonth === 1 && tab.tuitionTabCanRender, 'tab diagnostics preserve month/readiness contract');

  const onboardingResult = await globalThis.runOnboardingGate({ clubId: 'club-test' });
  check(onboardingResult && Array.isArray(onboardingResult.blockers), 'lazy onboarding gate returns its structured contract');
  const afterOnboarding = globalThis.debugDiagnosticsToolingIsolation();
  check(afterOnboarding.onboardingLoaded === true, 'onboarding module loads only after first use');
  check(afterOnboarding.superAdminAuditLoaded === false, 'SuperAdmin audit remains unloaded after onboarding use');

  const auditResult = await globalThis.runSuperAdminAudit({ clubIds: ['club-test'], includeLegacyCheck: false });
  check(auditResult && auditResult.totalClubs === 1 && Array.isArray(auditResult.clubs), 'lazy SuperAdmin audit returns its structured contract');
  const afterAudit = globalThis.debugDiagnosticsToolingIsolation();
  check(afterAudit.superAdminAuditLoaded === true, 'SuperAdmin audit module loads only after first use');
  check(globalThis.GlobalOwnershipRegistry.getSnapshot().collisions.length === 0, 'diagnostic ownership creates no collision');
} catch (error) {
  failures.push(`runtime simulation failed: ${error?.stack || error}`);
}

for (const message of passes) console.log('✅', message);
if (failures.length) {
  console.error(`\n❌ Phase 4K-6T check failed (${failures.length})`);
  failures.forEach((message) => console.error('FAIL:', message));
  process.exit(1);
}
console.log(`\n✅ Phase 4K-6T check passed (${passes.length} assertions)\n`);
