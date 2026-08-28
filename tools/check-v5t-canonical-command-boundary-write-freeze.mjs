#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const read = p => fs.readFileSync(p, 'utf8');
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}

const builds = ['canonical-domain-command-boundary-write-freeze-20260722-v5t', 'student-status-command-cutover-tx-delete-fix-20260722-v5u1', 'tuition-command-cutover-20260730-v5u2', 'attendance-excel-documentid-sdk-fix-20260801-v5u2e', 'canonical-security-truth-20260811-v5u5', 'dashboard-mutation-aware-cache-freshness-20260812-v5u6c1'];
const searchBuild = 'student-given-name-priority-20260811-v5u3';
const patches = ['4K-6V5T-canonical-domain-command-boundary-write-freeze-20260722', '4K-6V5U-1-student-status-command-cutover-tx-delete-fix-20260722', '4K-6V5U-2-tuition-command-cutover-20260730', '4K-6V5U-2E-attendance-excel-documentid-sdk-fix-20260801', '4K-6V5U5-canonical-security-truth-20260811', '4K-6V5U6C1-dashboard-mutation-aware-cache-freshness-20260812'];
const modulePath = 'js/core/canonicalDomainCommandBoundary.js';
const publicModulePath = 'public/js/core/canonicalDomainCommandBoundary.js';
const command = read(modulePath);
const commandPublic = read(publicModulePath);
const main = read('js/main.js');
const mainPublic = read('public/js/main.js');
const app = read('app.js');
const appPublic = read('public/app.js');
const index = read('index.html');
const indexPublic = read('public/index.html');
const baseline = JSON.parse(read('tools/baselines/v5t-legacy-write-baseline.json'));
const pkg = JSON.parse(read('package.json'));
const publicPkgExists = fs.existsSync('public/package.json');

check('V5T command module exists and public mirror is exact', command === commandPublic);
check('V5T-or-later app/index/main markers active', patches.some(p => app.includes(p)) && builds.some(b => index.includes(`app.js?v=${b}`)) && (index.includes(`./js/main.js?v=${searchBuild}`) || builds.some(b => index.includes(`./js/main.js?v=${b}`))) && patches.some(p => main.includes(p)));
check('V5T-or-later public app/index/main markers active', patches.some(p => appPublic.includes(p)) && builds.some(b => indexPublic.includes(`app.js?v=${b}`)) && (indexPublic.includes(`./js/main.js?v=${searchBuild}`) || builds.some(b => indexPublic.includes(`./js/main.js?v=${b}`))) && patches.some(p => mainPublic.includes(p)));
check('main imports command boundary with compatible cache bust', builds.some(b => main.includes(`./core/canonicalDomainCommandBoundary.js?v=${b}`)));
check('command boundary initializes only after student/finance/inventory/attendance modules',
  main.indexOf('initStudents();') < main.indexOf('initCanonicalDomainCommandBoundary();') &&
  main.indexOf('initFinance();') < main.indexOf('initCanonicalDomainCommandBoundary();') &&
  main.indexOf('initInventory();') < main.indexOf('initCanonicalDomainCommandBoundary();') &&
  main.indexOf('initAttendance();') < main.indexOf('initCanonicalDomainCommandBoundary();'));
check('command boundary contains no Firestore write implementation', !/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(command));
check('command boundary does not mutate render/store domains', !/\b(invalidateList|invalidateStudents|refreshListsComputation|renderApp|scheduleRender|studentProfileStore\.(?:merge|remove|set)|__store\.profiles\s*=)/.test(command));
check('command boundary preserves raw legacy result through executeCompat', command.includes('if (result.ok) return result.value;') && command.includes('if (result.error) throw result.error;'));
check('command boundary has identical-action single-flight protection', command.includes('state.inFlight.get(key)') && command.includes('state.duplicatePrevented++') && command.includes('state.inFlight.set(key, task)'));

const expectedCommands = [
  'student.updateProfile','student.deleteProfile','student.skipMonth','student.removeSkip',
  'student.markQuitFromDebt','student.skipDebtMonth','finance.quickPay',
  'finance.deleteTransaction','inventory.markPaid','attendance.toggle',
  'attendance.bulkCheckIn','attendance.syncOffline','admission.processMultiItem'
];
check('reviewed cross-domain command manifest is complete', expectedCommands.every(id => command.includes(`id: '${id}'`)));
check('attendance/offline and multi-item remain observe-only',
  command.includes("id: 'attendance.toggle', globalName: 'toggleAttendance', domain: 'attendance', action: 'toggle', mode: 'observe-only'") &&
  command.includes("id: 'admission.processMultiItem', globalName: 'processMultiItem', domain: 'admission', action: 'processMultiItem', mode: 'observe-only'"));
check('student/finance/inventory command ownership stays explicit',
  command.includes("owner: 'js/modules/students.js → StudentService'") &&
  command.includes('TuitionCommandBoundary') &&
  command.includes("owner: 'js/modules/inventory.js guarded handler'"));
check('runtime diagnostics exposed', ['window.DomainCommands','window.getDomainCommandMetrics','window.printDomainCommandStatus'].every(s => command.includes(s)));

function collectWrites(src) {
  const ops = ['addDoc','setDoc','updateDoc','deleteDoc'];
  const counts = Object.fromEntries(ops.map(op => [op, (src.match(new RegExp(`\\b${op}\\s*\\(`, 'g')) || []).length]));
  const signatures = [];
  for (const line of src.split(/\r?\n/)) {
    const stripped = line.trim();
    if (stripped.startsWith('//')) continue;
    for (const op of ops) {
      if (new RegExp(`\\b${op}\\s*\\(`).test(line)) {
        signatures.push({ op, signature: stripped.replace(/\s+/g, ' ') });
        break;
      }
    }
  }
  return { counts, total: Object.values(counts).reduce((a,b)=>a+b,0), signatures };
}
function multiset(rows) {
  const m = new Map();
  for (const row of rows) {
    const k = `${row.op}|${row.signature}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
const actual = collectWrites(app);
const allowed = multiset(baseline.signatures || []);
// V5U6G diagnostic-only bridge: PATCH D changes catch/error visibility around
// five EXISTING legacy writes, but does not change their Firestore call expression.
// Map only those exact call expressions back to the frozen V5T line signature;
// totals/per-operation counts and every other direct-write signature remain frozen.
const _v5u6gDiagnosticCallFragments = [
  "updateDoc(doc(db, 'clubs', currentClubId, 'inventory', _invDocId), { paymentBundleId: _bundleDoc.id, paidTxId: _bundleDoc.id })",
  'addDoc(collection(db, "clubs", currentClubId, "fee_audit"), { studentId: n1, amount: f1',
  'addDoc(collection(db, "clubs", currentClubId, "fee_audit"), { studentId: n2, amount: f2',
  "updateDoc(doc(db, 'clubs', currentClubId, 'inventory', id), { paidTxId: _bundleDoc.id })",
  "deleteDoc(doc(db, 'clubs', currentClubId, 'adminNotifications', docId))",
];
function _normalizeV5u6gDiagnosticWrite(row) {
  if (!main.includes("4K-6V5U6G-production-stability-residual-defect-closure-20260814")) return row;
  const fragment = _v5u6gDiagnosticCallFragments.find(f => row.signature.includes(f));
  if (!fragment) return row;
  const candidates = (baseline.signatures || []).filter(b => b.op === row.op && String(b.signature || '').includes(fragment));
  const unique = [...new Set(candidates.map(b => b.signature))];
  return unique.length === 1 ? { ...row, signature: unique[0] } : row;
}
// V5U4 introduced one narrow security-principal bootstrap write in app.js.
// It is outside business-domain command ownership and remains explicitly sanctioned in V5U5.
if (app.includes('const _ensureSuperAdminPrincipal = async') && app.includes("doc(db, 'super_admins', uid)")) {
  const k = 'setDoc|await setDoc(principalRef, {';
  allowed.set(k, Math.max(1, allowed.get(k) || 0));
}
const current = multiset(actual.signatures.map(_normalizeV5u6gDiagnosticWrite));
const newSignatures = [];
for (const [key, count] of current.entries()) {
  if (count > (allowed.get(key) || 0)) newSignatures.push({ key, count, allowed: allowed.get(key) || 0 });
}
check('legacy app.js direct-write total did not increase', actual.total <= baseline.total, `${actual.total} > ${baseline.total}`);
check('legacy app.js per-operation write counts did not increase', Object.entries(actual.counts).every(([op,count]) => count <= Number(baseline.counts[op] || 0)), JSON.stringify(actual.counts));
check('legacy app.js has no new direct-write call signature', newSignatures.length === 0, JSON.stringify(newSignatures.slice(0,5)));
const _writeMirrorExact = JSON.stringify(collectWrites(app)) === JSON.stringify(collectWrites(appPublic));
const _v5u5Prebuild = app.includes('4K-6V5U5-canonical-security-truth-20260811') && !appPublic.includes('4K-6V5U5-canonical-security-truth-20260811');
// H2 intentionally removes legacy Parent Portal writes before canonical build:public.
// Accept only the bounded pre-build state where the source index carries H2 and public does not yet;
// after build:public, _writeMirrorExact must become true again.
const _v5u6h2Prebuild = index.includes('parent-portal-hard-disable-release-verification-20260818-v5u6h2') &&
  !indexPublic.includes('parent-portal-hard-disable-release-verification-20260818-v5u6h2') &&
  actual.total <= collectWrites(appPublic).total;
check('app.js/public write surface exact after build or explicit bounded pre-build source state', _writeMirrorExact || _v5u5Prebuild || _v5u6h2Prebuild);
check('baseline is explicitly V5T/V5S freeze inventory', baseline.phase === '4K-6V5T' && baseline.total === 71);

check('package exposes V5T static and behavior checks',
  pkg.scripts?.['check:v5t-command-boundary-write-freeze'] === 'node tools/check-v5t-canonical-command-boundary-write-freeze.mjs' &&
  pkg.scripts?.['check:v5t-command-boundary-behavior'] === 'node tools/check-v5t-command-boundary-behavior.mjs');
check('build:public keeps public as runtime-only output', !publicPkgExists);
check('default check pipeline includes both V5T gates',
  String(pkg.scripts?.check || '').includes('check:v5t-command-boundary-write-freeze') &&
  String(pkg.scripts?.check || '').includes('check:v5t-command-boundary-behavior'));

if (failures) {
  console.error(`\nV5T canonical command boundary/write-freeze check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5T canonical command boundary/write-freeze check PASS.');
