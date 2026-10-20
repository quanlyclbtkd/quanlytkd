import crypto from 'node:crypto';
export const measurementSha256 = measurement => crypto.createHash('sha256').update(JSON.stringify(measurement)).digest('hex');
// Approval is external input. This module never creates an approved record.
export function validCostApproval(a, measured) {
  return !!a && !!measured &&
    a.decision === 'approved' && a.issuedBy === 'system_owner' &&
    typeof a.approvedAt === 'string' && Number.isFinite(Date.parse(a.approvedAt)) &&
    a.rulesSha256 === measured.rulesSha256 && a.sourceSha256 === measured.sourceSha256 &&
    a.measurementSha256 === measurementSha256(measured) &&
    Number.isSafeInteger(a.maxIncrementalInitialDocs) &&
    a.maxIncrementalInitialDocs >= measured.maxIncrementalInitialDocs &&
    a.profilesMeasured1000 === true && a.profilesMeasured1500 === true &&
    a.attendanceCanonicalProfileLookupApproved === true &&
    typeof a.scope === 'string' && a.scope.includes('Coach CS1') && a.scope.includes('CS2');
}
