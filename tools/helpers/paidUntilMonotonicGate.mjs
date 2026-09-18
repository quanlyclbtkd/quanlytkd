/**
 * H8R2.1C1D test-only semantic evaluator for the existing processMultiItem
 * paidUntil block. It executes the exact production expressions extracted from
 * app.js rather than duplicating the production max(previous,candidate) logic.
 * No Firebase/runtime source is imported.
 */
function normalizeYYYYMM(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, '0')}`;
  return '';
}

export function getProcessMultiItemSegment(appSrc) {
  const start = appSrc.indexOf('window.processMultiItem = async');
  if (start < 0) return '';
  const next = appSrc.indexOf('\n    window.', start + 32);
  return appSrc.slice(start, next > start ? next : start + 24000);
}

export function evaluateExtractedPaidUntilBlock(appSrc, { previousPaidUntil = '', lastMonth = '', hasTuition = true, packageMonths = [] } = {}) {
  const segment = getProcessMultiItemSegment(appSrc);
  const start = segment.indexOf('const _previousPaidUntil');
  const end = segment.indexOf('const _miAuditPayload', start);
  if (start < 0 || end < 0) throw new Error('processMultiItem monotonic paidUntil block not found');
  const exactProductionBlock = segment.slice(start, end);
  const run = new Function(
    'normalizeYYYYMM', 'profile', 'hasTuition', 'packageMonths', 'lastMonth',
    `${exactProductionBlock}\nreturn { previous: _previousPaidUntil, candidate: _candidatePaidUntil, result: _resultPaidUntil };`
  );
  return run(normalizeYYYYMM, { paidUntil: previousPaidUntil }, !!hasTuition, packageMonths, lastMonth);
}

export function inspectPaidUntilSemantics(appSrc, debtSrc = '') {
  const segment = getProcessMultiItemSegment(appSrc);
  const cases = {
    olderToNewer: evaluateExtractedPaidUntilBlock(appSrc, { previousPaidUntil: '2026-06', lastMonth: '2026-09', packageMonths: ['2026-07','2026-08','2026-09'] }),
    equal: evaluateExtractedPaidUntilBlock(appSrc, { previousPaidUntil: '2026-09', lastMonth: '2026-09', packageMonths: ['2026-09'] }),
    futureProtected: evaluateExtractedPaidUntilBlock(appSrc, { previousPaidUntil: '2026-12', lastMonth: '2026-09', packageMonths: ['2026-09'] }),
    backPayment: evaluateExtractedPaidUntilBlock(appSrc, { previousPaidUntil: '2027-01', lastMonth: '2026-03', packageMonths: ['2026-01','2026-02','2026-03'] }),
  };
  return {
    segment,
    cases,
    t1: cases.olderToNewer.result === '2026-09',
    t2: cases.equal.result === '2026-09',
    t3: cases.futureProtected.result === '2026-12',
    t4: cases.backPayment.result === '2027-01',
    profileWriteUsesResult: /_batch\.update\([\s\S]{0,260}paidUntil:\s*_resultPaidUntil[\s\S]{0,160}paidMonths:\s*arrayUnion\(\.\.\.packageMonths\)/.test(segment),
    transactionKeepsPackageMonths: /_components\.push\(\{\s*kind:\s*['"]tuition['"][\s\S]{0,420}packageMonths:\s*packageMonths/.test(segment),
    canonicalBundleCommitted: /_batch\.set\(_bundleDocRef,\s*_canonicalTxPayload\(_bundleTx,\s*['"]payment-bundle-atomic['"]\)\)/.test(segment),
    oldLiteralAbsent: !/paidUntil:\s*lastMonth\b/.test(segment),
    debtConsumesProfilePaidUntil: debtSrc ? /paidUntil\s*=\s*normalizeMonth\(p\.paidUntil\s*\|\|\s*['"]['"]\)/.test(debtSrc) : true,
    debtStartsAfterPaidUntil: debtSrc ? /if\s*\(paidUntil\)\s*startMonth\s*=\s*addMonths\(paidUntil,\s*1\)/.test(debtSrc) : true,
  };
}
