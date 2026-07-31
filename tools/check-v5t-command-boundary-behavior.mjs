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
install('deleteTx', async id => { await sleep(20); if (id === 'boom') throw new Error('delete failed'); return `deleted:${id}`; });
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
check('V5U-2 leaves seven compatibility wrappers', snap.wrappedCount === 8, `wrapped=${snap.wrappedCount}`);
check('V5U-2 keeps quickPay plus four stable/offline globals observe-only', snap.observeOnlyCount === 5, `observe=${snap.observeOnlyCount}`);
check('attendance handler identity is not replaced', window.toggleAttendance.__domainCommandId === undefined);
check('quickPay identity is not replaced after V5U-2 cutover', window.quickPay.__domainCommandId === undefined);

const q1 = await window.quickPay('Nguyen A', '2026-07', 'CS1');
check('observe-only quickPay keeps original handler result', calls.quickPay === 1 && q1 === 'paid:Nguyen A|2026-07|CS1');

let errorPropagated = false;
try { await window.deleteTx('boom'); } catch (e) { errorPropagated = e?.message === 'delete failed'; }
check('legacy error propagates unchanged through compat wrapper', errorPropagated);
check('underlying delete handler called exactly once', calls.deleteTx === 1);
const sameDelete1 = window.deleteTx('same-id');
const sameDelete2 = window.deleteTx('same-id');
const sameDeleteResults = await Promise.all([sameDelete1, sameDelete2]);
check('duplicate identical delete is still protected by compatibility boundary', calls.deleteTx === 2 && sameDeleteResults[0] === sameDeleteResults[1], `calls=${calls.deleteTx}`);

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
