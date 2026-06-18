#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
let pass = 0, fail = 0;
function check(label, ok) { if (ok) { pass++; console.log('✅', label); } else { fail++; console.error('❌', label); } }
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const finance = fs.readFileSync(path.join(root, 'js/modules/finance.js'), 'utf8');
const modalSource = fs.readFileSync(path.join(root, 'js/modules/quickPaymentModal.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('\n=== Phase 4K-6V3F2 — Quick Pay Commit Acknowledgement ===\n');
check('Legacy quickPay returns true after Firestore commit', app.includes("status: 'success'") && app.includes("return true;\n        } catch (error)"));
check('Legacy receipt failure cannot turn a committed payment into a failure', app.includes('Thu tiền thành công nhưng xuất biên lai lỗi') && app.includes('try {\n                    await window.exportReceipt'));
check('Module quickPay treats already-paid as a resolved state', finance.includes("status: 'already-paid'") && finance.includes("return true;\n            }"));
check('Modal accepts explicit, event, and state-based acknowledgement', modalSource.includes('result === true || committedByEvent') && modalSource.includes("state.status === 'success' || state.status === 'already-paid'"));
check('Modal surfaces the actual Firestore failure', modalSource.includes('Không nhận được xác nhận ghi dữ liệu từ Firestore') && modalSource.includes('Tài khoản không có quyền ghi khoản thu'));
check('V3F2 cache bust is present in deploy HTML', index.includes('quick-pay-commit-acknowledgement-20260618-v3f2'));

function element(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], disabled: false,
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {}, focus() {}, select() {}, addEventListener() {},
    querySelectorAll(selector) {
      const tags = selector.split(',').map(v => v.trim().toUpperCase());
      return this.children.filter(child => tags.includes(child.tagName));
    },
    querySelector(selector) {
      if (selector.startsWith('#')) return this.children.find(child => child.id === selector.slice(1)) || null;
      return null;
    },
  };
}

const modal = element('div');
const nameEl = element('div');
const options = element('div');
Object.defineProperty(options, 'innerHTML', { set() { this.children = []; }, get() { return ''; } });
const byId = { quickPayModal: modal, qpm_name: nameEl, qpm_options: options };
globalThis.document = {
  getElementById(id) { return byId[id] || null; },
  createElement(tag) { return element(tag); },
};
const listeners = new Map();
globalThis.window = {
  __store: { profiles: { 'Võ Sinh A': { tuitionFee: 500000 } } },
  userRole: 'admin',
  showToast() {},
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
};
const { initQuickPaymentModal } = await import(pathToFileURL(path.join(root, 'js/modules/quickPaymentModal.js')).href + `?test=${Date.now()}`);
initQuickPaymentModal();
window.quickPay = async (_name, months) => {
  window.__lastQuickPayState = {
    status: 'success', studentName: 'Võ Sinh A', months: months.split(','), amount: 500000, completedAt: Date.now(), source: 'legacy-app'
  };
  return undefined; // regression: legacy implementation used to return undefined after a successful write
};
window.openQuickPayModal('Võ Sinh A', '2026-06', 'CS1');
const firstPayButton = options.children.find(child => child.tagName === 'BUTTON');
await firstPayButton.onclick();
check('Runtime: undefined legacy return no longer causes a false failure after confirmed commit', modal.style.display === 'none');

// Real failure remains fail-closed and displays the actual error.
window.quickPay = async (_name, months) => {
  window.__lastQuickPayState = {
    status: 'error', studentName: 'Võ Sinh A', months: months.split(','), amount: 500000,
    error: 'Missing or insufficient permissions.', errorCode: 'permission-denied', completedAt: Date.now(), source: 'finance-module'
  };
  return false;
};
window.openQuickPayModal('Võ Sinh A', '2026-06', 'CS1');
const secondPayButton = options.children.find(child => child.tagName === 'BUTTON');
await secondPayButton.onclick();
const status = options.children.find(child => child.id === 'qpm_status');
check('Runtime: real permission failure stays open and shows a precise message', modal.style.display === 'flex' && /không có quyền ghi khoản thu/i.test(status.textContent || ''));

console.log(`\nKết quả: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
