import fs from 'node:fs';
import path from 'node:path';
import { runtimeHash } from '../v11r2/cutover.mjs';
import { QR_GENERIC_NON_TUITION_REPORT_MEMO_R1_SOURCE, QR_REPORT_RELEASE_CLOSURE_R1_1_SOURCE, verifySourceIdentity } from '../v11r2/source-identity.mjs';
import { expectedRuntime, manifestPath, pinId, sha, sourceZip } from '../current-lineage-governance-r1/build-manifest.mjs';

export const coachAssignmentContract = 'server-verified-multi-branch-v1';

const currentPin = Object.freeze({
  id: pinId,
  inputZIP_SHA256: sourceZip,
  manifest: manifestPath,
  manifestSHA256: 'aa5507c1fc015398cedc227f664f2b9872e3e7676eb40da760287ca499105952',
  runtimeSHA256: expectedRuntime,
  rulesSHA256: '1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3',
  indexesSHA256: '72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
  buildTag: 'qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029',
  canonicalFileCount: 129,
});

function requireCondition(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

export function resolveCheckerAuthority(root) {
  const identity = verifySourceIdentity(root, runtimeHash(root));
  // Historical checkers keep their original baselines for exact registered pins.
  // Staging-derived identities are outside these source-lineage test contracts.
  requireCondition(!identity.derivedFrom, 'CHECKER_SOURCE_LINEAGE_NOT_ACCEPTED');
  const selectedPin = [currentPin, QR_GENERIC_NON_TUITION_REPORT_MEMO_R1_SOURCE, QR_REPORT_RELEASE_CLOSURE_R1_1_SOURCE]
    .find(pin => pin.id === identity.id);
  if (!selectedPin) return { identity, currentManifest: null };

  for (const [field, expected] of Object.entries(selectedPin)) {
    requireCondition(identity[field] === expected, 'CURRENT_LINEAGE_PIN_MISMATCH');
  }
  requireCondition(identity.coachAssignmentContract === coachAssignmentContract, 'CURRENT_LINEAGE_COACH_CONTRACT_INVALID');

  // The canonical verifier authenticated all runtime files, rules, indexes
  // and the build tag. Bind the checker baseline to that same artifact.
  const bytes = fs.readFileSync(path.join(root, selectedPin.manifest));
  requireCondition(sha(bytes) === selectedPin.manifestSHA256, 'SOURCE_MANIFEST_NOT_ACCEPTED');
  return { identity, currentManifest: JSON.parse(bytes) };
}
