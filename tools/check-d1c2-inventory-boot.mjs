import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('app.js', 'utf8');
const moduleSource = fs.readFileSync('js/modules/inventory.js', 'utf8');
const from = app.indexOf('    window.markInvPaid = async (invId) => {');
const to = app.indexOf('    window.openEditExpense = async', from);
assert.ok(from > 0 && to > from);
const code = app.slice(from, to);
const calls = [];
const window = { showToast: (...args) => calls.push(['toast', ...args]), userRole: 'admin' };
const context = vm.createContext({ window, document: { getElementById: () => { throw new Error('should not touch form'); } },
    updateDoc: () => { throw new Error('legacy write'); }, confirm: () => true });
vm.runInContext(code, context);
for (const stage of ['before-init', 'during-init']) {
    await window.markInvPaid('item-A');
    await window.saveEditInv();
    assert.equal(calls.length, stage === 'before-init' ? 2 : 4);
}
assert.ok(calls.every(c => c[0] === 'toast' && /đang tải/.test(c[1])));
assert.ok(moduleSource.includes('window.markInvPaid = async (invId) =>') && moduleSource.includes('window.saveEditInv = async () =>'));
console.log('PASS bootstrap: early/mid clicks create 0 writes; canonical module installs both final handlers');

const admissionStart = app.indexOf('    let _addStudentInProgress = false;\n    window.addNewStudent = async () => {');
const admissionEnd = app.indexOf("    document.getElementById('inventoryForm').onsubmit", admissionStart);
assert.ok(admissionStart > 0 && admissionEnd > admissionStart);
vm.runInContext(app.slice(admissionStart, admissionEnd), context);
await window.addNewStudent();
assert.equal(calls.length, 5);
assert.match(calls[4][1], /Nhập học đang tải/);
assert.ok(fs.readFileSync('js/modules/students.js', 'utf8').includes('window.addNewStudent = async () =>'));
console.log('PASS admission bootstrap: early click creates 0 writes; student module installs final coordinator');
