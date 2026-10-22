import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { listenerSource } from './listener-source.mjs';
import { createActualListenerFixture } from './listener-fixture.mjs';
const results = [];
const app = fs.readFileSync('app.js', 'utf8');
const reuse = app.match(/if \((window\.__store && window\.__store\._activeTxListenerMonth === monthStr[^\n]+)\) \{/)?.[1];
if (!reuse) throw Error('Missing actual same-context reuse predicate');
for (const [name, change] of [
  ['UID', store => { store.auth.currentUser.uid = 'admin-B'; }],
  ['role', () => { window.userRole = 'coach'; }],
  ['session', () => { window.__verifiedAuthContextState.generation++; }],
  ['club', store => { store.clubId = 'club-B'; }],
  ['listener epoch', store => { store._activeTxProjectionEpoch = {}; }],
]) {
  const store = { clubId: 'demo-a', auth: { currentUser: { uid: 'admin-A' } }, userRole: 'admin', transactions: [] };
  globalThis.window = { __store: store, userRole: 'admin', __verifiedAuthContextState: { generation: 1 }, invalidateFinance() {}, invalidateStudents() {} };
  const fixture = createActualListenerFixture(listenerSource(), store);
  const base = { id: 'accepted', txMonth: '2026-10', date: '2026-10-21' };
  fixture.push('byDate', [base]);
  window.hasListener = key => key === 'finance:tx:demo-a:2026-10';
  const reusable = () => Function('window', 'monthStr', '_desiredTxReadMode', '_txKey', '_txPrincipal', 'return ' + reuse)(window, '2026-10', 'legacy', 'finance:tx:demo-a:2026-10', fixture.state._txPrincipal);
  if (['UID', 'role', 'session'].includes(name)) assert.equal(reusable(), true);
  change(store);
  fixture.push('byDate', [{ ...base, id: 'stale-other-session' }]);
  try { assert.deepEqual(store.transactions.map(t => t.id), ['accepted']); if (['UID', 'role', 'session'].includes(name)) assert.equal(reusable(), false); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', actual: e.message }); }
  fixture.stop();
}
const status = results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL';
const out = process.env.R5_SCOPE_EVIDENCE || 'handoff/V11R5/evidence/listener-scope.json';
fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ command: ['node', 'tools/v11r5/listener-scope.test.mjs'], sourceSHA: createHash('sha256').update(fs.readFileSync('app.js')).digest('hex'), status, expectedExit: 0, actualExit: status === 'PASS' ? 0 : 1, tests: results }, null, 2));
results.forEach(r => console.log(r.status + ' ' + r.name));
if (status !== 'PASS') process.exitCode = 1;
