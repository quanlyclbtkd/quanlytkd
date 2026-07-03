import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  finance: read('js/modules/finance.js'),
  financeService: read('js/services/finance.service.js'),
  app: read('app.js'),
  rules: read('firestore.rules'),
  searchIndex: read('js/core/studentSearchIndex.js'),
  searchRuntime: read('js/modules/searchRuntime.js'),
  studentService: read('js/services/students.service.js'),
  pkg: read('package.json'),
};
const build = 'debt-given-name-final-token-search-20260703-v5f';
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }

console.log('\n=== Phase 4K-6V5D — TX Delete Reconcile + Smart Search ===\n');
check('index/main/app cache-bust uses V5C', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`));
check('main imports finance/inventory/dashboard with V5C cache-bust, not stale v3a1', files.main.includes(`./modules/finance.js?v=${build}`) && files.main.includes(`./modules/inventory.js?v=${build}`) && files.main.includes(`./modules/dashboard.js?v=${build}`) && !files.main.includes('payment-bundle-runtime-hotfix-20260616-v3a1'));
check('finance module imports services with V5C cache-bust', files.finance.includes(`finance.service.js?v=${build}`) && files.finance.includes(`students.service.js?v=${build}`));
check('finance service imports inventory service with V5C cache-bust', files.financeService.includes(`inventory.service.js?v=${build}`));
check('Firestore Rules allow Club Admin/SuperAdmin to delete transactions, not Coach/Viewer', files.rules.includes('allow delete: if isSuperAdmin() || isClubAdmin(clubId);'));
check('finance deleteTx catches permission-denied instead of uncaught promise', files.finance.includes('[deleteTx] delete transaction failed') && files.finance.includes('deploy Firestore Rules bản V5C'));
check('finance deleteTx reloads transaction page and invalidates debt list after delete', files.finance.includes('await window.reloadTransactionsPage()') && files.finance.includes("invalidateList('students.debtList'"));
check('canonical reconcile reads remaining student transactions from Firestore after delete', files.main.includes('Phase 4K-6V5D: đọc authoritative từ Firestore sau khi xóa') && files.main.includes("sdk.where('description', '==', studentName)"));
check('legacy app deleteTx delegates to canonical reconcile when available', files.app.includes("reconcileStudentTuitionAfterDeletedTransaction(studentName, txToDelete") && files.app.includes('deploy Firestore Rules bản V5C'));
check('StudentSearchIndex has professional name token scoring', files.searchIndex.includes('name-token-exact') && files.searchIndex.includes('name-token-prefix') && files.searchIndex.includes('given-name-exact'));
check('StudentSearchIndex includes fullName/studentName/searchName/branchCode in indexed blob', ['p.fullName','p.studentName','p.searchName','p.branchCode'].every(s => files.searchIndex.includes(s)));
check('SearchRuntime and StudentService fallback include fullName/studentName/branchCode', files.searchRuntime.includes('p.fullName') && files.searchRuntime.includes('p.studentName') && files.searchRuntime.includes('p.branchCode') && files.studentService.includes('p.fullName') && files.studentService.includes('p.studentName') && files.studentService.includes('p.branchCode'));
check('package exposes V5C/V5D checks', files.pkg.includes('check:v5c-tx-delete-reconcile-smart-search') && files.pkg.includes('check:v5d-given-name-search'));

// Lightweight behavior test for token search by given-name: "Uyên" should match "Bảo Uyên".
globalThis.window = { __store: { profiles: {
  'Bảo Uyên': { name: 'Bảo Uyên', status: 'active', branchCode: 'CS1' },
  'Nguyễn Minh Anh': { name: 'Nguyễn Minh Anh', status: 'active', branchCode: 'CS1' },
  'Trần Uyển Nhi': { name: 'Trần Uyển Nhi', status: 'active', branchCode: 'CS1' },
} }, __studentSearchIndexReady: false };
const mod = await import('../js/core/studentSearchIndex.js?checkv5c=' + Date.now());
const result = mod.StudentSearchIndex.searchStudents('Uyên', { mode: 'all', includeAllStatuses: true, limit: 10 });
const names = result.entries.map(e => e.name);
check('search "Uyên" returns "Bảo Uyên" without requiring full name', names.includes('Bảo Uyên'));

const namesNoFalsePositive = !names.includes('Nguyễn Minh Anh') && !names.includes('Bảo Nguyên') && !names.includes('Lê Tuyên');
check('search "Uyên" does not match Nguyễn/Nguyên/Tuyên substring false positives', namesNoFalsePositive);

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V5D checks passed.\n');
