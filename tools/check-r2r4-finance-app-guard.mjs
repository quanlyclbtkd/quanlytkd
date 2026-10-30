// Exact, auditable correctness waiver; the generic app size limit stays 700,000.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from './v11r2/vendor/acorn.mjs';
import { runtimeHash } from './v11r2/cutover.mjs';
import { verifySourceIdentity } from './v11r2/source-identity.mjs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const owners = ['listenToData', 'loadSARevenue'];
export function describeFinanceApp(source) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const bodies = {}, globals = [];
  function clean(n) {
    if (!n || typeof n !== 'object') return n;
    if (Array.isArray(n)) return n.filter(x => !(x?.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id?.name === '_financeAttachFlight')).map(clean);
    if (n.type === 'AssignmentExpression' && n.left?.type === 'MemberExpression' && n.left.object?.name === 'window') {
      const name = n.left.property?.name;
      if (name) globals.push(name);
      if (owners.includes(name)) {
        assert(!bodies[name], 'Duplicate approved owner');
        bodies[name] = sha(source.slice(n.right.start, n.right.end));
        return { type: 'ApprovedExistingOwner', name };
      }
    }
    return Object.fromEntries(Object.entries(n).filter(([k]) => !['start','end','raw','loc'].includes(k)).map(([k,v]) => [k,clean(v)]));
  }
  const outside = clean(tree);
  assert.deepEqual(Object.keys(bodies).sort(), owners);
  return { bytes: Buffer.byteLength(source), SHA256: sha(source), outsideApprovedOwnersAST_SHA256: sha(JSON.stringify(outside)), ownerBodySHA256: bodies, windowAssignments: globals.sort() };
}
export function verifyFinanceAppWaiver(root = process.cwd()) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root,'tools/v11r2/manifests/R2R4_FINANCE_APP_CORE_GUARD.json'),'utf8'));
    assert.equal(m.baseline.SHA256, 'be4b270485f46e62068e4888db8d43304be37a95fbf1e502621144fc938eafa3');
    assert.equal(m.baseline.bytes, 699982);
    assert.equal(m.baseline.outsideApprovedOwnersAST_SHA256, m.approved.outsideApprovedOwnersAST_SHA256);
    assert.deepEqual(m.baseline.windowAssignments, m.approved.windowAssignments);
    const actual = describeFinanceApp(fs.readFileSync(path.join(root,'app.js'),'utf8'));
    assert.deepEqual(actual, m.approved, 'Exact approved source/owners required');
    assert(actual.bytes - m.baseline.bytes > 0 && actual.bytes - m.baseline.bytes <= 4096);
    const pin = verifySourceIdentity(root,runtimeHash(root));
    assert.match(pin.id,/^V11R6_A9R18_USABILITY_PERF_R2R4_/);
    return { ok: true, byteDelta: actual.bytes - m.baseline.bytes, unchangedOutsideOwners: true };
  } catch (e) { return { ok: false, reason: e.message }; }
}
