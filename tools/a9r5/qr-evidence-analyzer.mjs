/** A9R5 QR forensic classifier. Input MUST be a pre-sanitized [Receipt] diagnostic.
 * No provider requests, PII, Firebase readers, financial writes or QR acceptance.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const permittedFields=['bankBin','accountNo','amount','memo'];
export function classify(input){
  assert(input && typeof input==='object','Expected sanitized diagnostic object');
  const root=input.qrPixelAudit ?? {};
  const fields=root.fieldsMatch ?? {};
  const match={};
  for(const key of permittedFields){
    assert(typeof fields[key]==='boolean','Missing boolean fieldsMatch.'+key);
    match[key]=fields[key];
  }
  const expectedLen=root.expectedMemoLength??input.expectedMemoLength,actualLen=root.qrMemoLength??input.qrMemoLength;
  assert(Number.isInteger(expectedLen)&&Number.isInteger(actualLen)&&expectedLen>=0&&actualLen>=0&&expectedLen<=99&&actualLen<=99,'Missing safe memo lengths');
  const modifiers=root.memoTransform || {};
  const mismatch=permittedFields.filter(key=>!match[key]);
  const status=Number(input.httpStatus);
  const report={kind:input.kind||'UNKNOWN',stage:input.stage||'UNKNOWN',reason:input.reason||'UNKNOWN',pixelFailure:root.failure||'UNKNOWN',
    httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,fieldsMatch:match,
    expectedMemoLength:expectedLen,qrMemoLength:actualLen,memoLengthDelta:actualLen-expectedLen,
    classification:'UNCLASSIFIED',providerVerified:false,financialWrites:0};
  if(mismatch.some(x=>x!=='memo')) report.classification='CRITICAL_IDENTITY_OR_AMOUNT_MISMATCH';
  else if(!mismatch.length) report.classification='FIELDS_EQUAL';
  else if(modifiers.sameIgnoringSpaces===true) report.classification='MEMO_WHITESPACE_CHANGE_CANDIDATE';
  else if(modifiers.sameIgnoringCase===true) report.classification='MEMO_CASE_CHANGE_CANDIDATE';
  else if(modifiers.sameIgnoringPunctuation===true) report.classification='MEMO_PUNCTUATION_CHANGE_CANDIDATE';
  else if(modifiers.sameTrimmed===true) report.classification='MEMO_TRIM_CHANGE_CANDIDATE';
  else if(modifiers.looksLikeTailTruncation===true) report.classification='MEMO_TAIL_TRUNCATION_CANDIDATE';
  else if(modifiers.looksLikeHeadTruncation===true) report.classification='MEMO_HEAD_TRUNCATION_CANDIDATE';
  else report.classification='MEMO_CHANGE_UNDETERMINED';
  // Always fail closed for actual mismatch; diagnostics NEVER authorize a QR.
  report.qrAccepted=false;
  return report;
}
if(process.argv[1]&&process.argv[1].endsWith('qr-evidence-analyzer.mjs')&&process.argv[2]){
  const inputs=process.argv.slice(2);
  for(const input of inputs){const evidence=JSON.parse(fs.readFileSync(input,'utf8'));
    console.log(JSON.stringify({file:input.split(/[\\/]/).pop(),...classify(evidence)},null,2));}
}
