import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { passed++; console.log('✅', label); }
  else { failed++; console.error('❌', label); }
}

console.log('\n=== Phase 4K-6V3F1 — Financial Collection Recovery + Revenue Routing + Inline Edit ===\n');

const finance = read('js/modules/finance.js');
const quickModal = read('js/modules/quickPaymentModal.js');
const tuition = read('js/core/tuitionMonthLedger.js');
const inventoryService = read('js/services/inventory.service.js');
const inventoryModule = read('js/modules/inventory.js');
const students = read('js/modules/students.js');
const financeService = read('js/services/finance.service.js');
const financeRenderer = read('js/ui/render/computation/financeRenderer.js');
const inventoryRenderer = read('js/ui/render/computation/inventoryRenderer.js');
const editor = read('js/modules/financeTransactionEditor.js');
const main = read('js/main.js');
const pendingService = read('js/services/inventoryPending.service.js');
const rules = read('firestore.rules');
const legacyApp = read('app.js');

check(finance.includes('const _quickPayInFlight = new Set()'), 'Quick tuition payment has an in-flight duplicate-click lock');
check(finance.includes("status: 'success'") && finance.includes("status: 'error'"), 'Quick payment exposes explicit success/error state');
check(finance.includes("students.debtList") && finance.includes("quick-pay-committed"), 'Successful tuition collection invalidates Debt immediately');
check(finance.includes('TUITION_ALREADY_PAID'), 'Quick payment explains already-paid months instead of creating another charge');
check(finance.includes('Thu tiền thành công nhưng xuất biên lai lỗi'), 'Receipt failure cannot disguise a successful payment write');
check(quickModal.includes("modal.dataset.saving = busy ? 'true' : 'false'"), 'Quick-pay modal disables actions while Firestore is saving');
check(quickModal.includes('Không nhận được xác nhận ghi dữ liệu từ Firestore') && quickModal.includes("state.status === 'success' || state.status === 'already-paid'"), 'Quick-pay modal verifies commit acknowledgement and remains fail-closed on real failures');
check(tuition.includes("duplicateError.code = 'TUITION_ALREADY_PAID'"), 'Canonical tuition writer rejects duplicate paid months inside the transaction');
check(tuition.includes("tuition:payment-committed"), 'Canonical tuition writer dispatches a committed event after success');

check(inventoryService.includes('async markPaid(invId, options = {})') && inventoryService.includes('runTransaction'), 'Inventory debt collection is atomic');
check(inventoryService.includes('inventory-debt-${invId}'), 'Inventory debt collection uses a deterministic payment transaction ID');
check(inventoryService.includes("inventoryDebtStatus:  'paid'") || inventoryService.includes("inventoryDebtStatus:  'paid'"), 'Inventory debt status is updated in the same operation');
check(inventoryModule.includes('__inventoryPaymentLocks'), 'Inventory debt button blocks duplicate clicks');
check(inventoryModule.includes('Không thể thu khoản nợ Kho:'), 'Inventory collection shows the real error instead of a generic alert');

check(students.includes('_mergeNewStudentIntoRuntime'), 'New student is merged into runtime state immediately');
check(students.includes('_showStudentAddedSuccessNotice'), 'New student receives a persistent success notice');
check(students.includes("window.dispatchEvent(new CustomEvent('student:created'"), 'New student emits a success event after all required writes');
check(students.includes('Xem danh sách'), 'Success notice lets the coach open the Active list');
check(students.includes('_highlightStudentRow'), 'Newly-added student row is highlighted for confirmation');

check(main.includes('initRevenueRouting()'), 'Canonical revenue routing initializes at startup');
check(financeRenderer.includes('window.routeRevenueTransaction(t, _selectedMonth)'), 'Finance summary uses canonical revenue routing');
check(financeRenderer.includes('t.affectsRevenue !== false'), 'Inventory reconciliation-only rows are excluded from revenue');
check(financeService.includes('updateRevenueTransactionAtomic'), 'Revenue amount editing uses a Firestore transaction');
check(financeService.includes('pendingIssueAmount: increment(pendingAmountDelta)'), 'Editing a pending inventory amount keeps pending stats consistent');
check(editor.includes('ert_component_amount'), 'Bundle editor exposes separate component amounts');
check(financeRenderer.includes("openEditRevenueTransaction('"), 'Tuition/finance amount is clickable for editing');
check(inventoryRenderer.includes("openEditInv('"), 'Inventory amount is clickable for editing');
check(main.includes('initFinanceTransactionEditor()'), 'Inline transaction editor is initialized by main');
check(main.includes("./modules/finance.js?v=quick-pay-commit-acknowledgement-20260618-v3f2") && main.includes("./modules/quickPaymentModal.js?v=quick-pay-commit-acknowledgement-20260618-v3f2"), 'Quick-pay runtime modules use the V3F2 cache-bust');

check(rules.includes('function isCoachForBranch(clubId, branchValue)'), 'Firestore Rules scope HLV writes to the assigned branch');
check(rules.includes('coachCanCreateBranchDocument(clubId)') && rules.includes('coachCanUpdateTuitionLedger(clubId)'), 'Firestore Rules allow HLV admission writes without broad edit/delete rights');
check(rules.includes("settingId == 'inventory_stats'"), 'HLV admission inventory write-through can update only inventory_stats settings');
check(rules.includes("request.resource.data.get('role', '') == 'coach'"), 'Club Admin can provision users/{uid} for a coach so Rules can recognize the account');
check(pendingService.includes("branch: clean(data.branch"), 'Pending/posted inventory records preserve the sale branch for scoped permissions');
check(students.includes("window.userRole === 'coach' && window.coachBranch"), 'Add Student forces the coach-assigned branch');
check(students.includes('memberId, branch, amount:'), 'Admission inventory payload includes branch');
check(legacyApp.includes("memberId: memberId || '', branch: branch, amount:"), 'Legacy admission fallback also includes branch');

// Dynamic canonical routing checks.
globalThis.window = {};
const routeModule = await import(pathToFileURL(path.join(root, 'js/core/revenueRouting.js')).href + `?check=${Date.now()}`);
const bundle = {
  type: 'Học phí', date: '2026-06-18', txMonth: '2026-06', amount: 1500000,
  components: [
    { kind: 'tuition', amount: 600000, packageMonths: ['2026-06', '2026-07', '2026-08'] },
    { kind: 'inventory', amount: 650000, type: 'Thu Võ phục' },
    { kind: 'exam', amount: 250000, type: 'Lệ phí thi' },
  ],
};
const june = routeModule.routeRevenueTransaction(bundle, '2026-06');
check(june.buckets.tuition === 200000, 'Dynamic: multi-month tuition is allocated to the selected month');
check(june.buckets.inventory === 650000, 'Dynamic: inventory revenue is routed to Kho đồ');
check(june.buckets.exam === 250000, 'Dynamic: exam revenue is routed to Thi đai');
check(june.buckets.total === 1100000, 'Dynamic: selected-month total equals routed components');
const july = routeModule.routeRevenueTransaction(bundle, '2026-07');
check(july.buckets.tuition === 200000 && july.buckets.inventory === 0 && july.buckets.exam === 0, 'Dynamic: non-tuition one-time components are not repeated in later months');
const reconciliation = routeModule.routeRevenueTransaction({ type: 'Thu Võ phục', amount: 650000, affectsRevenue: false, reconciliationOnly: true }, '2026-06');
check(reconciliation.buckets.total === 0, 'Dynamic: stock reconciliation never creates revenue twice');
const meta = routeModule.buildCanonicalRevenueMetadata(bundle);
check(meta.revenueCategories.includes('tuition') && meta.revenueCategories.includes('inventory') && meta.revenueCategories.includes('exam'), 'Dynamic: canonical metadata preserves all bundle revenue categories');

console.log(`\nKết quả: ${passed} PASS / ${failed} FAIL`);
if (failed) process.exit(1);
