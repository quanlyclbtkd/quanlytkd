import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const appPath = path.join(root, 'app.js');
const studentsPath = path.join(root, 'js/modules/students.js');
const app = fs.readFileSync(appPath, 'utf8');
const students = fs.readFileSync(studentsPath, 'utf8');

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log('✅', label);
  } else {
    failed += 1;
    console.error('❌', label, detail);
  }
}

function extractAssignment(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing marker: ' + marker);
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) throw new Error('Missing opening brace');
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const semi = source.indexOf(';', i);
        return source.slice(start, semi + 1);
      }
    }
  }
  throw new Error('Unclosed function assignment');
}

const assignment = extractAssignment(app, 'window.buildPaymentBundleTransaction = function(payload)');
const context = {
  window: {
    getBundleTypeLabel: ({ components }) => components.map(c => c.label).join(' + '),
    getBundleSummaryLine: ({ studentName, components }) => studentName + ' — ' + components.map(c => c.label).join(' + '),
  },
  _canonicalTxPayload: (data) => ({ ...data, accountingMonths: data.packageMonths?.length ? [...data.packageMonths] : [data.txMonth].filter(Boolean) }),
  console,
  Date,
  Number,
  Array,
  Object,
  String,
  Error,
};
vm.createContext(context);
vm.runInContext(assignment, context, { filename: 'app.js#buildPaymentBundleTransaction' });
const build = context.window.buildPaymentBundleTransaction;

check('Builder is executable', typeof build === 'function');

const multi = build({
  studentName: 'Nguyễn Văn A',
  branch: 'CS1',
  date: '2026-06-16',
  refMonth: '2026-06',
  receiptType: 'Học phí + Võ phục',
  components: [
    { kind: 'tuition', type: 'Học phí', label: 'Học phí T6/2026', amount: 300000, month: '2026-06', packageMonths: ['2026-06'] },
    { kind: 'inventory', type: 'Thu Võ phục', label: 'Võ phục Size 1m4', amount: 450000, category: 'Võ phục', size: 'Size 1m4', qty: 1, relatedInvId: 'inv-1' },
  ],
});

check('Multi-item total is correct', multi.amount === 750000, String(multi.amount));
check('Components contain no undefined entries', Array.isArray(multi.components) && multi.components.length === 2 && multi.components.every(Boolean));
check('Every component has numeric amount', multi.components.every(c => typeof c.amount === 'number' && Number.isFinite(c.amount)));
check('Tuition component is preserved', multi.tuitionAmount === 300000);
check('Inventory component is preserved', multi.components.some(c => c.kind === 'inventory' && c.relatedInvId === 'inv-1'));
check('Canonical month is preserved', Array.isArray(multi.accountingMonths) && multi.accountingMonths.includes('2026-06'));

const admission = build({
  studentName: 'Võ sinh mới',
  branch: 'Mặc định',
  date: '2026-06-16',
  refMonth: '2026-08',
  receiptType: 'Thu nhập học',
  components: [
    { kind: 'tuition', label: 'Học phí gói 3 tháng', amount: 900000, month: '2026-08', packageMonths: ['2026-06', '2026-07', '2026-08'] },
    { kind: 'inventory', label: 'Võ phục Size 1m3', amount: 400000, size: 'Size 1m3', qty: 1 },
  ],
});
check('Admission bundle remains accounting type Học phí', admission.type === 'Học phí', admission.type);
check('Admission total is correct', admission.amount === 1300000, String(admission.amount));
check('Admission package months are preserved', admission.packageMonths.length === 3);

const filtered = build({
  studentName: 'B',
  refMonth: '2026-06',
  components: [null, undefined, { kind: 'other', amount: 0 }, { kind: 'other', label: 'Thu khác', amount: 120000 }],
});
check('Invalid/zero components are filtered safely', filtered.components.length === 1 && filtered.amount === 120000);

let invalidRejected = false;
try { build({ components: {} }); } catch (err) { invalidRejected = /Không có khoản thu hợp lệ/.test(String(err?.message)); }
check('Non-array components fail with controlled error', invalidRejected);

check('Source map callback returns component object', /\.map\(function\(c\)\s*\{\s*return\s*\{/.test(app));
check('Legacy addNewStudent still calls bundle builder', app.includes('admission-bundle-created') && app.includes('buildPaymentBundleTransaction'));
check('Modular addNewStudent still calls bundle builder', students.includes('buildPaymentBundleTransaction'));
check('Modular addNewStudent catches runtime errors', students.includes("recordRuntimeError('students.addNewStudent'"));
check('Modular addNewStudent always releases submit lock', /finally\s*\{\s*_addStudentInProgress\s*=\s*false/.test(students));
const preflightPos = students.indexOf('const _preflightBundle = window.buildPaymentBundleTransaction');
const profileWritePos = students.indexOf('await StudentService.createProfile');
check('Admission bundle preflight runs before profile write', preflightPos >= 0 && profileWritePos >= 0 && preflightPos < profileWritePos);
check('Admission preflight rejects malformed component arrays', students.includes('Dữ liệu khoản thu nhập học không hợp lệ.'));
check('V3A canonical boundary remains active', app.includes('_canonicalTxPayload(transaction, \'payment-bundle-builder\')'));

console.log(`\nPayment bundle runtime hotfix: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
