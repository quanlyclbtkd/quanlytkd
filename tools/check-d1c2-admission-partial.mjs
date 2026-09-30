import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('js/modules/students.js', 'utf8');
const start = src.indexOf('window.addNewStudent = async () => {');
const end = src.indexOf('// XEM / SỬA HỒ SƠ', start);
const helpers = src.slice(src.indexOf('function _admissionAmount('), src.indexOf('// ════════════════════════════════════════════════════════════════\n// MODULE-LEVEL STATE'));
assert.ok(start > 0 && end > start && helpers.includes('_admissionDateValid'));

globalThis.window = { __store: { db: {}, clubId: 'club-A', colRef: { path: 'clubs/club-A/transactions' }, invRef: { path: 'clubs/club-A/inventory' }, profiles: {} } };
const { StudentService } = await import('../js/services/students.service.js');
const { InventoryService } = await import('../js/services/inventory.service.js');
const { FinanceService } = await import('../js/services/finance.service.js');
await import('../js/core/tuitionDebtCanonical.js');
let idCounter = 0, commits = 0, reject = false, defer = null;
const primary = new Map(), toasts = [], secondary = [];
window._fb_init = {
  doc: (...args) => ({ path: args.length === 1 ? `${args[0].path}/${++idCounter}` : args.slice(1).join('/'), id: args.length === 1 ? String(idCounter) : String(args.at(-1)) }),
  increment: n => ({ increment: n }),
  writeBatch() {
    const ops=[];
    return { set(ref, payload) { ops.push({ ref, payload }); }, async commit() {
      commits++;
      if (defer) await defer.promise;
      if (reject) throw new Error('batch rejected');
      for (const op of ops) primary.set(op.ref.path, op.payload);
    } };
  },
};

const fields = {
  add_name:'A', add_date:'2026-09-21', add_fee_actual:'100000', add_fee_display:'100.000',
  add_fee_default_actual:'100000', add_fee_default_display:'100.000', add_uniform_size:'',
  add_uniform_actual:'0', add_uniform_display:'0', add_uniform_gift:false,
  add_package:'1', add_memberId:'M1', add_belt:'Trắng', add_dob:'', add_gender:'Nam',
  add_cccd:'', add_phone:'', add_notes:'', add_nickname:'', add_shift:'',
  add_discount:false, add_discount_pct:'10', add_branch:'CS1',
};
let branchCount = 1;
const elements = Object.fromEntries(Object.entries(fields).map(([id,value]) => [id, {
  value: typeof value === 'boolean' ? '' : value,
  checked: value === true, style: {}, focus() {}, options: id === 'add_uniform_size' ? [{ value:'S' }] : [],
}]));
const sandbox = {
  window, document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] },
  _profiles: () => window.__store.profiles, _config: () => ({ branchCount }),
  _db: () => window.__store.db,
  StudentService, InventoryService, FinanceService,
  _recordStudentSecondaryFailure: (...args) => secondary.push(args),
  getLocalToday: () => '2026-09-21', alert: () => {}, setTimeout: () => {}, console, Date,
};
window.userRole='admin';
window.showToast = s => toasts.push(String(s));
window.closeAddModal = () => {};
window.buildAdmissionTuitionPackage = (date, count) => {
  const months = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7)) - 1 + i, 1));
    return d.toISOString().slice(0,7);
  });
  return { packageCount:count, startMonth:months[0], months, lastMonth:months.at(-1), label:months.join(', '), monthsStr:months.join(',') };
};
window.buildPaymentBundleTransaction = ({ studentName, profileId, branch, date, refMonth, components }) => ({
  studentName, profileId, branch, date, txMonth:refMonth, components: components.map(c => ({ ...c })),
  amount:components.reduce((n,c) => n+c.amount,0),
});
let receiptMode='ok', receiptCalls=0;
window.exportReceipt = async () => { receiptCalls++; return receiptMode === 'reject' ? Promise.reject(new Error('PDF failed')) : { ok: receiptMode === 'ok' }; };
window.mergeInventoryIntoRuntimeStore = () => {};
window.mergeTransactionIntoRuntimeStore = () => {};
vm.createContext(sandbox);
vm.runInContext(helpers + '\nlet _addStudentInProgress = false;\n' + src.slice(start,end), sandbox, { filename:'students.js:admission' });
function clear() { primary.clear(); commits=0; reject=false; defer=null; secondary.length=0; toasts.length=0; receiptCalls=0; window.__store.profiles={}; }
function set(id, value) { elements[id].value=String(value); }
function entries(part) { return [...primary.entries()].filter(([key]) => key.includes('/' + part + '/')); }

for (const count of [1,3,6,12]) {
  clear(); set('add_package',count);
  await window.addNewStudent();
  assert.equal(commits,1,JSON.stringify(toasts)); assert.equal(entries('profiles').length,1,JSON.stringify([...primary.keys()])); assert.equal(entries('transactions').length,1,JSON.stringify([...primary.keys()]));
  assert.equal(entries('profiles')[0][1].paidMonths.length,count);
  assert.equal(entries('transactions')[0][1].components[0].packageMonths.length,count);
  console.log(`PASS admission fee positive ${count} month(s): one commit, matched profile and tx`);
}

clear(); set('add_package',1); set('add_uniform_size','S'); set('add_uniform_actual','50000');
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('inventory').length,1);
assert.equal(entries('transactions')[0][1].components[1].relatedInvId, entries('inventory')[0][0].split('/').at(-1));
assert.equal(entries('inventory')[0][1].paidTxId, entries('transactions')[0][0].split('/').at(-1));
console.log('PASS paid uniform and bundle use two-way IDs in one commit');

clear(); set('add_uniform_actual',0); elements.add_uniform_gift.checked=true;
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('transactions').length,2);
assert.ok(entries('transactions').some(([,t]) => t.type === 'Tặng Võ phục' && t.relatedInvId));
console.log('PASS gifted uniform item/stats/gift tx/tuition tx are atomic');

clear(); elements.add_uniform_gift.checked=false; set('add_uniform_size',''); reject=true;
await window.addNewStudent();
assert.equal(commits,1); assert.equal(primary.size,0);
console.log('PASS batch rejection leaves zero primary documents');

clear(); set('add_fee_actual',0); await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('profiles').length,1); assert.equal(entries('transactions').length,0);
const zeroFeeProfile = entries('profiles')[0][1];
assert.equal(String(zeroFeeProfile.paidUntil || ''),'');
assert.deepEqual(Array.from(zeroFeeProfile.paidMonths || []),[]);
assert.notEqual(zeroFeeProfile.feeExempt,true);
assert.equal('lastAdmissionTuitionMonths' in zeroFeeProfile,false);
const zeroDebt = window.TuitionDebtCanonical.computeProfileDebt(zeroFeeProfile,'2026-09',{ name:'A', transactions:[] });
assert.ok(zeroDebt.chargeableMonths.includes('2026-09'));
assert.equal(zeroDebt.shouldAppearInDebtBeforeRender,true);
assert.equal(window.TuitionDebtCanonical.getTuitionMonthSettlement(zeroFeeProfile,'2026-09',{ name:'A', transactions:[] }).paid,false);
assert.equal(receiptCalls,0);
console.log('PASS fee=0: profile committed unpaid, no finance tx/receipt, canonical debt includes admission month');
set('add_fee_actual',100000);

clear(); receiptMode='reject'; await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('transactions').length,1);
assert.ok(toasts.some(s => s.includes('Đã ghi sổ')) && !toasts.some(s => s.includes('Không thể hoàn tất')));
assert.ok(secondary.some(s => s[0] === 'admission-receipt'));
receiptMode='ok'; console.log('PASS receipt error after commit preserves one transaction and success state');

clear(); set('add_date','2026-02-31'); await window.addNewStudent(); assert.equal(commits,0);
set('add_date','2026-09-21'); set('add_fee_actual','Infinity'); await window.addNewStudent(); assert.equal(commits,0);
set('add_fee_actual','100000'); set('add_package','2'); await window.addNewStudent(); assert.equal(commits,0);
set('add_package','1'); set('add_uniform_actual','-1'); await window.addNewStudent(); assert.equal(commits,0);
set('add_uniform_actual','0'); elements.add_discount.checked=true; set('add_discount_pct','100'); await window.addNewStudent(); assert.equal(commits,0);
elements.add_discount.checked=false; set('add_discount_pct','10'); branchCount=2; set('add_branch','CS3'); await window.addNewStudent(); assert.equal(commits,0);
branchCount=1; set('add_branch','CS1'); window.userRole='coach'; await window.addNewStudent(); assert.equal(commits,0);
window.userRole='admin';
console.log('PASS invalid date/amount/package/discount/branch and Coach have zero primary writes');

clear();
window.mergeTransactionIntoRuntimeStore = () => { throw new Error('UI projection failed'); };
await window.addNewStudent();
assert.equal(commits,1); assert.equal(entries('transactions').length,1);
assert.ok(secondary.some(s => s[0] === 'admission-runtime-projection'));
assert.ok(!toasts.some(s => s.includes('Không thể hoàn tất')));
window.mergeTransactionIntoRuntimeStore = () => {};
console.log('PASS post-commit UI failure cannot turn a saved admission into a payment retry');

clear(); set('add_package',1);
let release;
defer={ promise:new Promise(r => { release=r; }) };
const first=window.addNewStudent(), second=window.addNewStudent();
release(); await Promise.all([first,second]);
assert.equal(commits,1); assert.equal(entries('transactions').length,1);
console.log('PASS same-runtime double click makes one commit');
