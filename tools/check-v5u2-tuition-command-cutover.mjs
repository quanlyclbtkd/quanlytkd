#!/usr/bin/env node
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}

const build = 'tuition-command-cutover-20260730-v5u2';
const patch = '4K-6V5U-2-tuition-command-cutover-20260730';
const compatibleBuild = 'attendance-excel-documentid-sdk-fix-20260801-v5u2e';
const v5u5Build = 'canonical-security-truth-20260811-v5u5';
const compatiblePatch = '4K-6V5U-2E-attendance-excel-documentid-sdk-fix-20260801';
const v5u5Patch = '4K-6V5U5-canonical-security-truth-20260811';
const searchBuild = 'student-given-name-priority-20260811-v5u3';
const boundary = read('js/core/tuitionCommandBoundary.js');
const boundaryPublic = read('public/js/core/tuitionCommandBoundary.js');
const finance = read('js/modules/finance.js');
const financePublic = read('public/js/modules/finance.js');
const app = read('app.js');
const appPublic = read('public/app.js');
const main = read('js/main.js');
const mainPublic = read('public/js/main.js');
const index = read('index.html');
const indexPublic = read('public/index.html');
const canonical = read('js/core/canonicalDomainCommandBoundary.js');
const baseline = JSON.parse(read('tools/baselines/v5u2-legacy-write-baseline.json'));
const pkg = JSON.parse(read('package.json'));

check('V5U-2 source/public boundary mirrors are exact', boundary === boundaryPublic);
check('V5U-2 finance source/public mirrors are exact', finance === financePublic);
check('V5U-2 app/index/main markers active', (app.includes(patch) || app.includes(compatiblePatch) || app.includes(v5u5Patch)) && (main.includes(patch) || main.includes(compatiblePatch) || main.includes(v5u5Patch)) && (index.includes(`app.js?v=${build}`) || index.includes(`app.js?v=${compatibleBuild}`) || index.includes(`app.js?v=${v5u5Build}`)) && (index.includes(`./js/main.js?v=${searchBuild}`) || index.includes(`./js/main.js?v=${build}`) || index.includes(`./js/main.js?v=${compatibleBuild}`) || index.includes(`./js/main.js?v=${v5u5Build}`)));
check('V5U-2 public app/index/main markers active', (appPublic.includes(patch) || appPublic.includes(compatiblePatch) || appPublic.includes(v5u5Patch)) && (mainPublic.includes(patch) || mainPublic.includes(compatiblePatch) || mainPublic.includes(v5u5Patch)) && (indexPublic.includes(`app.js?v=${build}`) || indexPublic.includes(`app.js?v=${compatibleBuild}`) || indexPublic.includes(`app.js?v=${v5u5Build}`)) && (indexPublic.includes(`./js/main.js?v=${searchBuild}`) || indexPublic.includes(`./js/main.js?v=${build}`) || indexPublic.includes(`./js/main.js?v=${compatibleBuild}`) || indexPublic.includes(`./js/main.js?v=${v5u5Build}`)));
check('main imports and initializes tuition boundary before finance UI adapter', main.includes(`./core/tuitionCommandBoundary.js?v=${build}`) && main.indexOf('initTuitionCommandBoundary();') < main.indexOf('initFinance();'));
check('tuition boundary owns quickPay and tuition delete only', boundary.includes('async collectTuition') && boundary.includes('async deleteTuitionTransaction') && !boundary.includes('processCombo') && !boundary.includes('processMultiItem') && !boundary.includes('markInvPaid'));
check('tuition boundary delegates through existing FinanceService', boundary.includes("../services/finance.service.js?v=" + build) && boundary.includes('_service().addTransaction') && boundary.includes('_service().updateStudentPayment') && boundary.includes('_service().deleteTransaction'));
check('tuition boundary has no Firestore direct writer/import', !/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(boundary));
check('tuition boundary preserves existing transaction schema fields', ['type: \'Học phí\'','description: name','txMonth: lastMonth','packageMonths: paidMonths','timestamp: Date.now()'].every(x => boundary.includes(x)));
check('tuition boundary centralizes local commit and invalidation', boundary.includes('_commitProfilePayment') && boundary.includes('_removeLocalTransaction') && boundary.includes('_invalidateTuition') && ['tx.txList','students.debtList','students.activeList','dashboard.summary'].every(x => boundary.includes(x)));
check('tuition boundary has identical-action single-flight', boundary.includes('inFlight.get(key)') && boundary.includes('duplicatePrevented++') && boundary.includes('inFlight.set(key, promise)'));
check('tuition boundary reports partial transaction/profile write safely', boundary.includes('profileError.partialWrite = true') && boundary.includes('v5u2-tuition-partial-write'));
check('tuition delete reuses existing reconcile helper without duplicate invalidation', boundary.includes('reconcileStudentTuitionAfterDeletedTransaction') && boundary.includes('skipInvalidate: true') && main.includes('options.skipInvalidate !== true'));
check('tuition delete reports post-delete reconcile failure as partial state', boundary.includes('transactionDeleted = true') && boundary.includes('v5u2-delete-tuition-partial-reconcile') && finance.includes('không bấm Xóa lại'));

const quickPayBlock = finance.slice(finance.indexOf('window.quickPay = async'), finance.indexOf('// 6. openQuickPayModal'));
check('finance quickPay is UI-only adapter into tuition boundary', quickPayBlock.includes('TuitionCommandBoundary.collectTuition') && !/\bFinanceService\.(?:addTransaction|updateStudentPayment)\s*\(/.test(quickPayBlock));
check('finance delete routes tuition-only transaction into tuition boundary', finance.includes('TuitionCommandBoundary.deleteTuitionTransaction') && finance.includes('const isTuitionOnly'));
check('non-tuition/inventory delete remains existing FinanceService path', finance.includes('V5U-2 does not migrate inventory/combo/other-finance delete ownership') && finance.includes('await FinanceService.deleteRelatedInventory(relatedInvId)'));
check('family pay and multi-item remain outside V5U-2', app.includes("'family-pay-student-1'") && app.includes("'family-pay-student-2'") && app.includes("'payment-bundle'") && app.includes("'multi-item-tuition-fallback'"));
check('legacy app tuition/delete writers are no-write stubs', app.includes('legacy Finance writers removed from app.js') && app.includes('v5u2DeleteTxNotReady') && app.includes('v5u2QuickPayNotReady'));
check('legacy app no longer contains quickPay/delete direct-write signatures', !app.includes("'quick-pay-tuition'") && !app.includes('const _qpAuditRef = collection') && !app.includes("reason: 'paidUntil-recalc'"));

function countWrites(src) {
  const ops = ['addDoc','setDoc','updateDoc','deleteDoc'];
  const counts = Object.fromEntries(ops.map(op => [op, (src.match(new RegExp(`\\b${op}\\s*\\(`, 'g')) || []).length]));
  return { counts, total: Object.values(counts).reduce((a,b)=>a+b,0) };
}
const actual = countWrites(app);
check('V5U-2 baseline remains a total-write ceiling after later security hardening', baseline.phase === '4K-6V5U-2' && baseline.total === 59 && actual.total <= 59, JSON.stringify({baseline:baseline.total,actual}));
const _hasCanonicalPrincipalBootstrap = app.includes('const _ensureSuperAdminPrincipal = async') && app.includes("await setDoc(principalRef, {");
const _perOpCompatible = actual.counts.addDoc <= baseline.counts.addDoc && actual.counts.deleteDoc <= baseline.counts.deleteDoc && actual.counts.updateDoc <= baseline.counts.updateDoc && actual.counts.setDoc <= baseline.counts.setDoc + (_hasCanonicalPrincipalBootstrap ? 1 : 0);
check('V5U-2 business-write baseline not regressed; one V5U4 principal setDoc is isolated', _perOpCompatible, JSON.stringify(actual.counts));
const _appWriteMirrorExact = JSON.stringify(countWrites(app)) === JSON.stringify(countWrites(appPublic));
const _v5u5Prebuild = app.includes(v5u5Patch) && !appPublic.includes(v5u5Patch);
check('app/public direct-write surfaces exact after build or explicit V5U5 pre-build source state', _appWriteMirrorExact || _v5u5Prebuild);
check('V5T no longer wraps quickPay over the new tuition owner', canonical.includes("id: 'finance.quickPay'") && canonical.includes("mode: 'observe-only'") && canonical.includes('TuitionCommandBoundary'));
check('package exposes and runs V5U-2 checks', pkg.scripts?.['check:v5u2-tuition-command-cutover'] === 'node tools/check-v5u2-tuition-command-cutover.mjs' && pkg.scripts?.['check:v5u2-tuition-command-behavior'] === 'node tools/check-v5u2-tuition-command-behavior.mjs' && String(pkg.scripts?.check || '').includes('check:v5u2-tuition-command-cutover'));

if (failures) {
  console.error(`\nV5U-2 tuition command cutover check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5U-2 tuition command cutover check PASS.');
