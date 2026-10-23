// Scope-aware identity check for reviewed A9R1 lineage. Do not conflate the
// inherited A8 build tag with the three A9 imports + the A9R1 repair UI import.
import {buildImportGraph,affectedModules,cacheToken} from '../v11r2/import-graph.mjs';
import {verifySourceIdentity} from '../v11r2/source-identity.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
import assert from 'node:assert/strict';
export function assertReviewedA9R1CacheScope(root) {
  const p=verifySourceIdentity(root,runtimeHash(root));
  assert(['V11R6_A9R1_COACH_REPAIR_UI_TEST_ONLY','V11R6_A9R3_MIRROR_VERSION_CAS_TEST_ONLY','V11R6_A9R4_COACH_ONBOARDING_QR_DIAGNOSTICS_TEST_ONLY'].includes(p.id),'Not an approved A9R1/A9R3 source identity');
  const graph=buildImportGraph(root), scoped=new Set(affectedModules(graph));
  const relevant=graph.edges.filter(e=>scoped.has(e.to));
  const overrides=new Map([
    ['index.html>app.js','qr-v11r6-a9-auth-acl-20261023'],
    ['index.html>js/main.js','qr-v11r6-a9-auth-acl-20261023'],
    ['index.html>js/core/roleReadBoundary.js','qr-v11r6-a9-auth-acl-20261023'],
    ['index.html>js/core/coachBranchRuntimeRepair.js',p.id==='V11R6_A9R4_COACH_ONBOARDING_QR_DIAGNOSTICS_TEST_ONLY'?'qr-v11r6-a9r4-coach-orphan-20261023':p.id==='V11R6_A9R3_MIRROR_VERSION_CAS_TEST_ONLY'?'qr-v11r6-a9r3-mirror-cas-20261023':'qr-v11r6-a9r1-coach-repair-ui-20261023']
  ]);
  assert(relevant.length>=20,'Authority import graph unexpectedly empty');
  for(const edge of relevant){
    const key=edge.from+'>'+edge.to;
    assert.equal(cacheToken(edge.url),overrides.get(key)||p.buildTag,'Unreviewed authority cache key: '+key);
  }
  for(const key of overrides.keys())assert.equal(relevant.filter(e=>e.from+'>'+e.to===key).length,1,'Missing or duplicate reviewed entry: '+key);
  return true;
}
