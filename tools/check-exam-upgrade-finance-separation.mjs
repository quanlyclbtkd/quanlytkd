#!/usr/bin/env node
/**
 * Phase 4K-6S1 — Exam upgrade / finance separation regression gate.
 *
 * Guarantees:
 *  - processBatchUpgrade updates profiles only.
 *  - No exam-fee transaction is created by the upgrade action.
 *  - Confirmation text does not announce or calculate a fee.
 *  - Double-clicks are blocked while the batch is in flight.
 *  - The existing standalone exam-fee collection path remains available.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appJs = readFileSync('app.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');

let failures = 0;
let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    failures++;
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function extractUpgradeAssignment(source) {
  const startMarker = 'window.processBatchUpgrade = async () => {';
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const endMarker = '\n\n    window.downloadExcelTemplate';
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end < 0 ? start + 12000 : end).trim();
}

console.log('\n=== check-exam-upgrade-finance-separation ===\n');

const block = extractUpgradeAssignment(appJs);
check('processBatchUpgrade exists', Boolean(block));

if (block) {
  const forbiddenTokens = [
    'getClubExamFee',
    'exam_fee_all_actual',
    'allTransactions',
    'studentsToCharge',
    'chargeAmount',
    'newTxRef',
    "type: 'Lệ phí thi'",
    'type: "Lệ phí thi"',
    'transactions",',
    "transactions',",
  ];
  for (const token of forbiddenTokens) {
    check(`upgrade source excludes ${token}`, !block.includes(token));
  }

  check(
    'upgrade confirmation contains no fee/revenue wording',
    !/Hệ thống sẽ thu phí|thu phí|lệ phí|Tổng\s*:.*₫|doanh thu/i.test(
      (block.match(/const confirmMsg\s*=([\s\S]*?);\n\s*if\(!confirm/) || [,''])[1]
    )
  );
  check('upgrade writes to profiles collection', block.includes('"profiles", name'));
  check('upgrade uses merge writes', block.includes('{ merge: true }'));
  check('upgrade has in-flight guard', block.includes('window.__examUpgradeInFlight'));
  check('upgrade restores in-flight state in finally', /finally\s*\{[\s\S]*window\.__examUpgradeInFlight\s*=\s*false/.test(block));
}

check('upgrade button has stable id', indexHtml.includes('id="btnBatchUpgrade"'));
check('upgrade button calls only processBatchUpgrade', /id="btnBatchUpgrade"[^>]*onclick="processBatchUpgrade\(\)"/.test(indexHtml));
check('standalone Thu phí action remains available', indexHtml.includes('💰 Thu phí') || appJs.includes('💰 Thu phí'));

const quickStart = appJs.indexOf('window.quickCollectExam');
const quickEnd = appJs.indexOf('window.processCombo', quickStart);
const quickBlock = quickStart >= 0 ? appJs.slice(quickStart, quickEnd > quickStart ? quickEnd : quickStart + 5000) : '';
check('quickCollectExam still exists as separate payment action', Boolean(quickBlock));
check('quickCollectExam still writes an exam-fee transaction', quickBlock.includes("type: 'Lệ phí thi'") && quickBlock.includes('addDoc'));

// Dynamic behavior test with a deferred commit to exercise double-click protection.
if (block) {
  const confirmations = [];
  const toasts = [];
  const alerts = [];
  const batchOps = [];
  let writeBatchCalls = 0;
  let renderCalls = 0;
  let resolveCommit;
  const commitPromise = new Promise(resolve => { resolveCommit = resolve; });

  const button = {
    disabled: false,
    textContent: '⚡ Xác nhận thăng đai',
    dataset: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
  };
  const checkAll = { checked: true };
  const beltEl = { value: 'White' };
  const monthEl = { value: '2026-06' };
  const checkboxes = [{ value: 'Alice' }, { value: 'Bob' }];

  const allProfiles = {
    Alice: { belt: 'White', branch: 'CS1', tuitionFee: 300000 },
    Bob: { belt: 'White', branch: 'CS1', tuitionFee: 300000 },
  };
  const storeProfiles = {
    Alice: { ...allProfiles.Alice },
    Bob: { ...allProfiles.Bob },
  };
  const originalTransactions = [
    { id: 'tx-existing', type: 'Lệ phí thi', studentName: 'Alice', amount: 250000 },
  ];

  const context = {
    window: {
      userRole: 'admin',
      BELT_NEXT: { White: 'Yellow' },
      __store: { profiles: storeProfiles, transactions: structuredClone(originalTransactions) },
      showToast(message) { toasts.push(message); },
      __examUpgradeInFlight: false,
    },
    allProfiles,
    document: {
      querySelectorAll(selector) {
        return selector === '.exam-check:checked' ? checkboxes : [];
      },
      getElementById(id) {
        if (id === 'exam_filter_belt') return beltEl;
        if (id === 'filterMonth') return monthEl;
        if (id === 'btnBatchUpgrade') return button;
        if (id === 'checkAllExam') return checkAll;
        return null;
      },
    },
    confirm(message) { confirmations.push(message); return true; },
    alert(message) { alerts.push(message); },
    writeBatch() {
      writeBatchCalls++;
      return {
        set(ref, data, options) { batchOps.push({ ref, data, options }); },
        commit() { return commitPromise; },
      };
    },
    doc(...parts) { return { parts }; },
    db: { name: 'mock-db' },
    currentClubId: 'club-1',
    getLocalToday() { return '2026-06-16'; },
    renderExamList() { renderCalls++; },
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);

  try {
    vm.runInContext(`${block}\n`, context, { timeout: 2000 });
    const firstCall = context.window.processBatchUpgrade();
    await Promise.resolve();

    check('first click creates exactly one batch', writeBatchCalls === 1, `got ${writeBatchCalls}`);
    check('button is disabled during commit', button.disabled === true);
    check('in-flight flag is set during commit', context.window.__examUpgradeInFlight === true);

    await context.window.processBatchUpgrade();
    check('second click does not create a second batch', writeBatchCalls === 1, `got ${writeBatchCalls}`);
    check('second click reports in-progress state', toasts.some(t => /đang xác nhận thăng đai/i.test(t)));

    check('two selected students create two profile writes', batchOps.length === 2, `got ${batchOps.length}`);
    check(
      'every batch write targets clubs/{club}/profiles/{student}',
      batchOps.every(op => JSON.stringify(op.ref.parts) === JSON.stringify([context.db, 'clubs', 'club-1', 'profiles', op.ref.parts.at(-1)]))
        && batchOps.every(op => op.ref.parts[3] === 'profiles')
    );
    check(
      'profile payload contains only belt progression fields',
      batchOps.every(op => {
        const keys = Object.keys(op.data).sort();
        return JSON.stringify(keys) === JSON.stringify(['belt', 'upgradedAt', 'upgradedFrom']);
      })
    );
    check('all profile writes use merge:true', batchOps.every(op => op.options?.merge === true));
    check('confirmation contains no fee language', confirmations.length === 1 && !/thu phí|lệ phí|doanh thu|₫/i.test(confirmations[0]));
    check('existing transaction cache is unchanged before commit', JSON.stringify(context.window.__store.transactions) === JSON.stringify(originalTransactions));

    resolveCommit();
    await firstCall;

    check('transaction cache remains unchanged after commit', JSON.stringify(context.window.__store.transactions) === JSON.stringify(originalTransactions));
    check('local profile cache is updated only after successful commit', allProfiles.Alice.belt === 'Yellow' && allProfiles.Bob.belt === 'Yellow');
    check('store profile cache is synchronized', storeProfiles.Alice.belt === 'Yellow' && storeProfiles.Bob.belt === 'Yellow');
    check('render runs once after commit', renderCalls === 1, `got ${renderCalls}`);
    check('select-all checkbox is cleared', checkAll.checked === false);
    check('button is restored after commit', button.disabled === false && button.textContent === '⚡ Xác nhận thăng đai');
    check('in-flight flag is cleared after commit', context.window.__examUpgradeInFlight === false);
    check('success toast reports only belt upgrade', toasts.some(t => /Đã thăng đai thành công/.test(t)) && !toasts.some(t => /thu phí|lệ phí|doanh thu|₫/i.test(t)));
    check('no blocking alert occurred in valid scenario', alerts.length === 0);
  } catch (error) {
    failures++;
    console.error('  FAIL: dynamic processBatchUpgrade scenario threw:', error);
  }
}

console.log('');
if (failures === 0) {
  console.log(`ALL CHECKS PASSED — ${checks} exam upgrade/finance separation checks`);
  process.exit(0);
}
console.error(`${failures} CHECK(S) FAILED out of ${checks}`);
process.exit(1);
