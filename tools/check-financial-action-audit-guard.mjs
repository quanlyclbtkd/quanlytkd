#!/usr/bin/env node
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}
function pass(msg) { console.log('✅', msg); }
function fail(msg) { console.error('❌', msg); process.exitCode = 1; }
function must(cond, msg) { cond ? pass(msg) : fail(msg); }

const app = read('app.js');
const main = read('js/main.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));
const modPath = 'js/core/financialActionAuditGuard.js';
const mod = fs.existsSync(modPath) ? read(modPath) : '';

console.log('🔎 Phase 4K-6N — Financial Action Audit Trail + Write Intent Guard check');

must(fs.existsSync(modPath), 'Có js/core/financialActionAuditGuard.js');
must(mod.includes('guardFinancialWriteIntent'), 'Module có guardFinancialWriteIntent');
must(mod.includes('recordFinancialActionAudit'), 'Module có recordFinancialActionAudit');
must(mod.includes('withFinancialWriteIntent'), 'Module có withFinancialWriteIntent');
must(mod.includes('financial_audit'), 'Audit trail ghi best-effort vào collection financial_audit');
must(mod.includes('debugFinancialActionAuditGuard'), 'Có debugFinancialActionAuditGuard');
must(mod.includes('debugFinancialActionAuditTrail'), 'Có debugFinancialActionAuditTrail');
must(mod.includes("'tuition.quickPay'") && mod.includes("'multiitem.pay'") && mod.includes("'transaction.delete'") && mod.includes("'inventory.markPaid'") && mod.includes("'exam.cancelPayment'"), 'Danh sách action tài chính trọng yếu có trong allow-list');

must(main.includes("import { initFinancialActionAuditGuard }"), 'main.js import initFinancialActionAuditGuard');
must(main.includes('initFinancialActionAuditGuard()'), 'main.js khởi tạo FinancialActionAuditGuard');
must(main.includes("APP_BUILD_VERSION = '4K-6N-financial-action-audit-trail-write-intent-20260608'"), 'APP_BUILD_VERSION đã cập nhật 4K-6N');
must(main.includes('debugFinancialActionAuditGuard') && main.includes('debugFinancialActionAuditTrail'), 'debugRuntimeSmokeTest include FinancialActionAudit debug');
must(index.includes('financial-action-audit-trail-write-intent-20260608'), 'index.html cache bust 4K-6N');

must(app.includes("guardFinancialWriteIntent('tuition.quickPay'"), 'quickPay có Write Intent Guard');
must(app.includes("recordFinancialActionAudit('tuition.quickPay', 'before'") && app.includes("recordFinancialActionAudit('tuition.quickPay', 'after'") && app.includes("recordFinancialActionAudit('tuition.quickPay', 'error'"), 'quickPay có audit before/after/error');
must(app.includes("guardFinancialWriteIntent('multiitem.pay'"), 'processMultiItem pay có Write Intent Guard');
must(app.includes("recordFinancialActionAudit('multiitem.pay', 'before'") && app.includes("recordFinancialActionAudit('multiitem.pay', 'after'") && app.includes("recordFinancialActionAudit('multiitem.pay', 'error'"), 'processMultiItem pay có audit before/after/error');
must(app.includes("guardFinancialWriteIntent('transaction.delete'"), 'deleteTx có Write Intent Guard');
must(app.includes("recordFinancialActionAudit('transaction.delete', 'before'") && app.includes("recordFinancialActionAudit('transaction.delete', 'after'") && app.includes("recordFinancialActionAudit('transaction.delete', 'error'"), 'deleteTx có audit before/after/error');
must(app.includes("guardFinancialWriteIntent('inventory.markPaid'"), 'markInvPaid có Write Intent Guard');
must(app.includes("recordFinancialActionAudit('inventory.markPaid', 'before'") && app.includes("recordFinancialActionAudit('inventory.markPaid', 'after'") && app.includes("recordFinancialActionAudit('inventory.markPaid', 'error'"), 'markInvPaid có audit before/after/error');
must(app.includes("guardFinancialWriteIntent('exam.cancelPayment'"), 'cancelExamPayment có Write Intent Guard');
must(app.includes("recordFinancialActionAudit('exam.cancelPayment', 'before'") && app.includes("recordFinancialActionAudit('exam.cancelPayment', 'after'") && app.includes("recordFinancialActionAudit('exam.cancelPayment', 'error'"), 'cancelExamPayment có audit before/after/error');

must(app.includes('window.processMultiItem = async (action) =>'), 'processMultiItem vẫn tồn tại');
must(app.includes("await setDoc(doc(db, 'clubs', currentClubId, 'profiles', name), { paidUntil: lastMonth, paidMonths: arrayUnion(...packageMonths) }, { merge: true });"), 'processMultiItem vẫn giữ paidUntil/paidMonths write logic');
must(app.includes('window.quickPay = async (name, monthsStr, branch, defaultFee, skipPrompt)'), 'quickPay vẫn tồn tại');
must(app.includes('window.deleteTx = async (id, relatedInvId)'), 'deleteTx vẫn tồn tại');
must(app.includes('window.markInvPaid = async (invId)'), 'markInvPaid vẫn tồn tại');
must(app.includes('window.cancelExamPayment = async function(txId, studentName)'), 'cancelExamPayment vẫn tồn tại');

must(pkg.scripts['check:financial-action-audit-guard'] === 'node tools/check-financial-action-audit-guard.mjs', 'package.json có check:financial-action-audit-guard');
must(pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check:financial-action-audit-guard'), 'check:all include financial-action-audit-guard');
must(pkg.scripts['check:all:critical'] && pkg.scripts['check:all:critical'].includes('check:financial-action-audit-guard'), 'check:all:critical include financial-action-audit-guard');

if (process.exitCode) {
  console.error('\n❌ Financial Action Audit Guard check FAILED');
  process.exit(process.exitCode);
}
console.log('\n✅ Financial Action Audit Guard check PASSED');
