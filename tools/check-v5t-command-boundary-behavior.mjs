#!/usr/bin/env node
let failures = 0;
function check(name, condition, details = '') {
  if (condition) console.log(`✅ ${name}`);
  else { failures++; console.error(`❌ ${name}${details ? ` — ${details}` : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

globalThis.window = globalThis;
const calls = Object.create(null);
function install(name, fn) {
  calls[name] = 0;
  window[name] = async (...args) => { calls[name]++; return fn ? fn(...args) : `${name}:${args.join('|')}`; };
}
install('updateProfile');
install('deleteProfile');
install('skipMonth');
install('removeSkip');
install('markStudentQuitFromDebt');
install('skipDebtMonthFromDebt');
install('quickPay', async (...args) => { await sleep(30); return `paid:${args.join('|')}`; });
install('deleteTx', async id => { if (id === 'boom') throw new Error('delete failed'); return `deleted:${id}`; });
install('markInvPaid');
install('toggleAttendance');
install('bulkCheckIn');
install('syncOfflineAttendance');
install('processMultiItem');

const mod = await import(`../js/core/canonicalDomainCommandBoundary.js?behavior=${Date.now()}`);
mod.initCanonicalDomainCommandBoundary();
const boundary = window.CanonicalDomainCommandBoundary;
const snap = boundary.getSnapshot();

check('boundary initializes with reviewed command inventory', snap.initialized && snap.commandCount === 13, JSON.stringify(snap));
check('nine high-risk/profile globals wrapped', snap.wrappedCount === 9, `wrapped=${snap.wrappedCount}`);
check('four stable/offline complex globals remain observe-only', snap.observeOnlyCount === 4, `observe=${snap.observeOnlyCount}`);
check('attendance handler identity is not replaced', window.toggleAttendance.__domainCommandId === undefined);
check('quickPay is compatibility wrapper', window.quickPay.__domainCommandId === 'finance.quickPay');

const p1 = window.quickPay('Nguyen A', '2026-07', 'CS1');
const p2 = window.quickPay('Nguyen A', '2026-07', 'CS1');
const [r1, r2] = await Promise.all([p1, p2]);
check('duplicate identical quickPay delegates only once', calls.quickPay === 1, `calls=${calls.quickPay}`);
check('duplicate callers receive original result', r1 === 'paid:Nguyen A|2026-07|CS1' && r2 === r1);

await window.quickPay('Nguyen A', '2026-08', 'CS1');
check('different command key remains independent', calls.quickPay === 2, `calls=${calls.quickPay}`);

let errorPropagated = false;
try { await window.deleteTx('boom'); } catch (e) { errorPropagated = e?.message === 'delete failed'; }
check('legacy error propagates unchanged through compat wrapper', errorPropagated);
check('underlying delete handler called exactly once', calls.deleteTx === 1);

const normalized = await boundary.execute('student.skipMonth', ['Nguyen B','2026-07']);
check('normalized command API returns canonical result envelope', normalized.ok && normalized.commandId === 'student.skipMonth' && normalized.delegatedTo.includes('StudentService'));
check('compat wrapper keeps raw legacy return contract', (await window.skipMonth('Nguyen C','2026-07')) === 'skipMonth:Nguyen C|2026-07');

const integrity = boundary.assertIntegrity();
check('command wrapper integrity holds', integrity.ok, JSON.stringify(integrity.failures));
const finalSnap = boundary.getSnapshot();
check('duplicate prevention metric recorded', finalSnap.duplicatePrevented >= 1);
check('no ownership collisions', finalSnap.collisionCount === 0);

if (failures) {
  console.error(`\nV5T command boundary behavior check FAILED: ${failures}`);
  process.exit(1);
}
console.log('\nV5T command boundary behavior check PASS.');
