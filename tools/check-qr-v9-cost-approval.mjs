#!/usr/bin/env node
import assert from 'node:assert/strict';
import {measurementSha256,validCostApproval} from './qr-v9/cost-approval.mjs';
// Entirely synthetic validator input. Never saved as real-candidate consent.
const m={rulesSha256:'test-rules',sourceSha256:'test-source',maxIncrementalInitialDocs:1500};
const a={decision:'approved',issuedBy:'system_owner',approvedAt:'2026-10-20T10:00:00Z',rulesSha256:m.rulesSha256,sourceSha256:m.sourceSha256,measurementSha256:measurementSha256(m),maxIncrementalInitialDocs:1500,profilesMeasured1000:true,profilesMeasured1500:true,attendanceCanonicalProfileLookupApproved:true,scope:'Coach CS1 and Coach CS2'};
assert.equal(validCostApproval(a,m),true);
const mutations=[{decision:'pending'},{issuedBy:'assistant'},{approvedAt:''},{rulesSha256:'stale'},{sourceSha256:'stale'},{measurementSha256:'stale'},{maxIncrementalInitialDocs:0},{maxIncrementalInitialDocs:1499},{maxIncrementalInitialDocs:Infinity},{profilesMeasured1000:false},{profilesMeasured1500:false},{attendanceCanonicalProfileLookupApproved:false},{scope:'all'}];
for(const change of mutations)assert.equal(validCostApproval({...a,...change},m),false,JSON.stringify(change));
assert.equal(validCostApproval(a,null),false);assert.equal(validCostApproval(null,m),false);
console.log('V9 COST APPROVAL VALIDATOR: 16 PASS / 0 FAIL (synthetic unit inputs only)');
