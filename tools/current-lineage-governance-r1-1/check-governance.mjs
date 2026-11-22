import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { identityPath, pinId, sha } from '../current-lineage-governance-r1/build-manifest.mjs';
import { coachAssignmentContract, resolveCheckerAuthority } from './checker-authority.mjs';

const root = path.resolve(process.argv[2] ?? process.cwd());
const { identity, currentManifest } = resolveCheckerAuthority(root);
assert.equal(identity.id, pinId);
assert.ok(currentManifest);
assert.equal(identity.coachAssignmentContract, coachAssignmentContract);

const inherited = spawnSync(process.execPath, ['tools/current-lineage-governance-r1/check-lineage.mjs', root], {
  cwd: root, encoding: 'utf8', maxBuffer: 1024 ** 2,
});
if (inherited.error) throw inherited.error;
assert.equal(inherited.status, 0, inherited.stderr);
const original = JSON.parse(inherited.stdout);
assert.equal(original.positive.identity.id, identity.id);
assert.equal(original.positive.identity.coachAssignmentContract, coachAssignmentContract);
assert.deepEqual(original.negative.cases.map(test => test.id), ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
assert.deepEqual([original.negative.total, original.negative.pass, original.negative.fail], [6, 6, 0]);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'a9r18-governance-r1-1-'));
let omittedMetadata;
try {
  const disposable = path.join(temporary, 'source');
  fs.cpSync(root, disposable, { recursive: true, errorOnExist: true, force: false });
  const file = path.join(disposable, identityPath);
  const before = fs.readFileSync(file, 'utf8');
  const declarationStart = before.indexOf('const ' + pinId + ' = Object.freeze({');
  assert.ok(declarationStart >= 0);
  const declarationEnd = before.indexOf('\n});', declarationStart);
  assert.ok(declarationEnd > declarationStart);
  const declaration = before.slice(declarationStart, declarationEnd);
  const metadata = " coachAssignmentContract:'" + coachAssignmentContract + "',\n";
  assert.equal(declaration.split(metadata).length, 2);
  const amended = before.slice(0, declarationStart) + declaration.replace(metadata, '') + before.slice(declarationEnd);
  fs.writeFileSync(file, amended);
  // A fresh process loads the verifier from the disposable copy itself.
  const probe = spawnSync(process.execPath, ['--input-type=module', '--eval', [
    "import assert from 'node:assert/strict';",
    "import { runtimeHash } from './tools/v11r2/cutover.mjs';",
    "import { verifySourceIdentity } from './tools/v11r2/source-identity.mjs';",
    "import { resolveCheckerAuthority } from './tools/current-lineage-governance-r1-1/checker-authority.mjs';",
    'const runtime = runtimeHash(process.cwd());',
    'const identity = verifySourceIdentity(process.cwd(), runtime);',
    "console.log(JSON.stringify({ runtime, id: identity.id, metadata: identity.coachAssignmentContract ?? null }));",
    'resolveCheckerAuthority(process.cwd());',
    "throw Error('NEGATIVE_CONTROL_WRONGLY_ACCEPTED');",
  ].join('\n')], { cwd: disposable, encoding: 'utf8' });
  if (probe.error) throw probe.error;
  const observed = JSON.parse(probe.stdout);
  assert.deepEqual(observed, { runtime: identity.runtimeSHA256, id: identity.id, metadata: null });
  assert.equal(probe.status, 1, probe.stderr);
  assert.match(probe.stderr, /Error: CURRENT_LINEAGE_COACH_CONTRACT_INVALID(?:\r?\n)/);
  assert.doesNotMatch(probe.stderr, /NEGATIVE_CONTROL_WRONGLY_ACCEPTED/);
  omittedMetadata = {
    id: 'N7_CURRENT_COACH_ASSIGNMENT_CONTRACT_METADATA', status: 'PASS',
    file: identityPath, originalSHA256: sha(before), mutatedSHA256: sha(amended),
    canonicalIdentity: 'PASS', currentLineageAuthority: 'REJECT',
    actual: 'CURRENT_LINEAGE_COACH_CONTRACT_INVALID', expected: 'CURRENT_LINEAGE_COACH_CONTRACT_INVALID',
    exitCode: probe.status, runtimeSHA256: observed.runtime, metadata: observed.metadata,
  };
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
assert.deepEqual(resolveCheckerAuthority(root).identity, identity);
const cases = [...original.negative.cases, omittedMetadata];
console.log(JSON.stringify({
  positive: original.positive,
  negative: { status: 'PASS', total: cases.length, pass: cases.length, fail: 0, cases },
}, null, 2));
