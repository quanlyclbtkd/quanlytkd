import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeHash } from '../v11r2/cutover.mjs';
import { verifySourceIdentity } from '../v11r2/source-identity.mjs';
import { verifyRuntimeProfile } from '../v11r2/runtime-profile.mjs';
import { buildManifest, expectedRuntime, manifestPath, pinId, sha } from './build-manifest.mjs';

const root = path.resolve(process.argv[2] ?? process.cwd());
const parity = directory => {
  const result = spawnSync(process.execPath, [path.join(directory, 'tools/check-root-public-parity.mjs')], {
    cwd: directory, encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { exitCode: result.status, ...JSON.parse(result.stdout) };
};
const manifestBytes = fs.readFileSync(path.join(root, manifestPath));
const manifest = JSON.parse(manifestBytes);
assert.deepEqual(manifest, buildManifest(root), 'Independently derived current manifest');
const now = runtimeHash(root);
assert.equal(now, expectedRuntime);
const identity = verifySourceIdentity(root, now);
assert.equal(identity.id, pinId);
assert.equal(identity.manifestSHA256, sha(manifestBytes));
assert.equal(identity.runtimeSHA256, now);
assert.equal(identity.rulesSHA256, manifest.rulesSHA256);
assert.equal(identity.indexesSHA256, manifest.indexesSHA256);
assert.equal(identity.buildTag, manifest.buildTag);
assert.equal(identity.canonicalFileCount, 129);
const profile = verifyRuntimeProfile(root);
assert.equal(profile.identity.id, pinId);
const parityBefore = parity(root);
assert.deepEqual([parityBefore.exitCode, parityBefore.rootFileCount, parityBefore.publicFileCount], [0, 129, 129]);
assert.deepEqual(parityBefore.hashMismatches, []);

function oneByte(directory, name) {
  const file = path.join(directory, name);
  const original = fs.readFileSync(file);
  const edited = Buffer.from(original);
  const offset = edited.lastIndexOf(0x0a);
  assert.ok(offset >= 0, 'Expected an LF to replace in ' + name);
  edited[offset] = 0x20;
  fs.writeFileSync(file, edited);
  assert.equal(edited.length, original.length);
  assert.equal(edited.reduce((n, b, index) => n + Number(b !== original[index]), 0), 1);
  return { file: name, offset, originalSHA256: sha(original), mutatedSHA256: sha(edited) };
}

function assertRejection(callback, expected) {
  let actual;
  try { callback(); }
  catch (error) { actual = error.code ?? error.message; }
  assert.equal(actual, expected, 'Rejection reason');
  return actual;
}

const testCases = [
  { id: 'N1', file: 'style.css', expected: 'SOURCE_RUNTIME_NOT_ACCEPTED' },
  { id: 'N2', file: manifestPath, expected: 'SOURCE_MANIFEST_NOT_ACCEPTED' },
  { id: 'N3', file: 'firestore.rules', expected: 'SOURCE_RULES_NOT_ACCEPTED' },
  { id: 'N4', file: 'firestore.indexes.json', expected: 'SOURCE_INDEXES_NOT_ACCEPTED' },
  { id: 'N5', file: 'style.css', expected: 'SOURCE_MANIFEST_FILE_MISMATCH', classification: 'SYNTHETIC_DIRECT_CONTRACT_CONTROL' },
  { id: 'N6', file: 'public/style.css', expected: 'ROOT_PUBLIC_RUNTIME_PARITY_REJECTED' },
];
const cases = [];
for (const test of testCases) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'a9r18-governance-control-'));
  const isolated = path.join(temporary, 'source');
  try {
    fs.cpSync(root, isolated, { recursive: true, errorOnExist: true, force: false });
    const mutation = oneByte(isolated, test.file);
    const recalculated = runtimeHash(isolated);
    if (test.id === 'N2' || test.id === 'N4') JSON.parse(fs.readFileSync(path.join(isolated, test.file), 'utf8'));
    const usesPinnedArg = test.id === 'N5';
    const differsFromExpected = ['N1', 'N5'].includes(test.id);
    assert.equal(recalculated !== now, differsFromExpected);
    if (test.id === 'N6') {
      assert.equal(verifySourceIdentity(isolated, recalculated).id, pinId);
      const mirrors = parity(isolated);
      assert.deepEqual([mirrors.exitCode, mirrors.status, mirrors.hashMismatches], [1, 'FAIL', ['style.css']]);
      assert.throws(() => verifyRuntimeProfile(isolated), /Root\/public runtime parity/);
      cases.push({
        ...test, mutation, recalculatedRuntimeSHA256: recalculated, sourceIdentity: 'PASS',
        rootPublicParity: mirrors, actual: test.expected, status: 'PASS',
      });
    } else {
      const argument = usesPinnedArg ? now : recalculated;
      const actual = assertRejection(() => verifySourceIdentity(isolated, argument), test.expected);
      cases.push({ ...test, mutation, recalculatedRuntimeSHA256: recalculated, runtimeArgument: argument, actual, status: 'PASS' });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
assert.equal(runtimeHash(root), now, 'Audited candidate still has canonical runtime');
assert.equal(sha(fs.readFileSync(path.join(root, manifestPath))), identity.manifestSHA256);
assert.deepEqual(parity(root), parityBefore);
console.log(JSON.stringify({
  positive: {
    status: 'PASS_CURRENT_LINEAGE', identity, runtimeSHA256: now, manifestSHA256: identity.manifestSHA256,
    canonicalRuntimeFiles: 129, canonicalRuntimeFileHashesRecomputed: true,
    runtimeProfile: { scope: profile.scope, attendanceAuthority: profile.authority, coachAccess: profile.coachAccess },
    rootPublicParity: parityBefore,
  },
  negative: { status: 'PASS', total: cases.length, pass: cases.length, fail: 0, cases },
}, null, 2));
