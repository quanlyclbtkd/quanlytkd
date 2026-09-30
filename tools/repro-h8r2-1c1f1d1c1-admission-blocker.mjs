import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Run the production admission handler with only UI and primary I/O mocked.
const src = fs.readFileSync('js/modules/students.js', 'utf8');
const start = src.indexOf('window.addNewStudent = async () => {');
const end = src.indexOf('// XEM / SỬA HỒ SƠ', start);
assert.ok(start > 0 && end > start);
const inputs = {
  add_name: 'A', add_date: '2026-09-21', add_fee_actual: '0', add_fee_display: '0',
  add_uniform_size: '', add_uniform_actual: '0', add_uniform_display: '0',
  add_uniform_gift: false, add_package: '1', add_memberId: 'A1',
  add_belt: 'Trắng', add_dob: '', add_gender: 'Nam', add_cccd: '',
  add_phone: '', add_fee_default_actual: '100000', add_notes: '',
  add_nickname: '', add_shift: ''
};
const elements = Object.fromEntries(Object.entries(inputs).map(([id, value]) => [id,
  { value: typeof value === 'boolean' ? '' : value, checked: value === true, style: {}, focus() {} }]));
const persisted = { profiles: [], transactions: [], receipts: 0 };
let failTransaction = false;
const sandbox = {
  document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] },
  getLocalToday: () => '2026-09-21',
  _profiles: () => ({}), _config: () => ({ branchCount: 1 }),
  StudentService: {
    async createProfile(id, data) { persisted.profiles.push({ id, data }); },
    async addGenericTransaction(data) {
      if (failTransaction) throw Error('transaction write rejected');
      persisted.transactions.push(data); return { id: 'tx-1', ...data };
    }
  },
  alert() {}, console: { error() {}, warn() {}, log() {} },
  setTimeout() {}, Date
};
sandbox.window = {
  userRole: 'admin', showToast() {}, closeAddModal() {},
  buildAdmissionTuitionPackage() {
    return { packageCount: 1, startMonth: '2026-09', months: ['2026-09'],
      lastMonth: '2026-09', label: '2026-09', monthsStr: '2026-09' };
  },
  buildPaymentBundleTransaction({ components }) { return { components, amount: components.reduce((sum, c) => sum + c.amount, 0) }; },
  async exportReceipt() { persisted.receipts++; }
};
vm.runInNewContext('let _addStudentInProgress = false;\n' + src.slice(start, end), sandbox, { filename: 'students.js:admission' });
await sandbox.window.addNewStudent();
assert.equal(persisted.profiles.length, 1);
assert.equal(persisted.transactions.length, 0);
assert.deepEqual(Array.from(persisted.profiles[0].data.paidMonths), ['2026-09']);
assert.equal(persisted.profiles[0].data.paidUntil, '2026-09');
console.log('REPRO F07: zero fee writes a paid month and paidUntil without payment evidence');

persisted.profiles.length = 0;
elements.add_fee_actual.value = '100000';
failTransaction = true;
await sandbox.window.addNewStudent();
assert.equal(persisted.profiles.length, 1);
assert.equal(persisted.transactions.length, 0);
assert.equal(persisted.receipts, 0);
console.log('REPRO F10: transaction rejection leaves the already committed profile and paid state');
