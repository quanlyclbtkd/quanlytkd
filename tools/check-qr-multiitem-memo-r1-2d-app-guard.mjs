import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runtimeHash} from './v11r2/cutover.mjs';
import {verifySourceIdentity} from './v11r2/source-identity.mjs';
const root=process.cwd();
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const acceptedApp=Object.freeze({
  V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1:'922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619',
  V11R6_A9R18_QR_MULTIITEM_MEMO_RECONCILIATION_UI_R1_2D:'25ce6f05d1bcc3cdd13f7c679c08ad3ec04ec5eae995145e208465b4710915b8',
  V11R6_A9R18_QR_MULTIITEM_MONTH_AUTHORITY_R1_2D1:'21f410dbc3dbb41bf3a346f33d80f70eb2b3dc8877d6f6d99b2cee4ca2e26f30',
  V11R6_A9R18_SYNC_STARTUP_STABILITY_R1_3:'21f410dbc3dbb41bf3a346f33d80f70eb2b3dc8877d6f6d99b2cee4ca2e26f30',
  V11R6_A9R18_ADMISSION_DRAFT_SNAPSHOT_R1_3A:'21f410dbc3dbb41bf3a346f33d80f70eb2b3dc8877d6f6d99b2cee4ca2e26f30',
  V11R6_A9R18_STUDENT_PROFILE_DOM_TRUST_BOUNDARY_R1_4A:'21f410dbc3dbb41bf3a346f33d80f70eb2b3dc8877d6f6d99b2cee4ca2e26f30',
  V11R6_A9R18_REACHABLE_DOM_TRUST_BOUNDARY_R1_4B:'a1a9990664a261fd0aaf343e9fb14c75c854530c6052d8b80882335b608c0ab4',
  V11R6_A9R18_FINANCE_WRITE_LATENCY_R1:'a1a9990664a261fd0aaf343e9fb14c75c854530c6052d8b80882335b608c0ab4',
  V11R6_A9R18_FAMILY_COMBO_CORRECTNESS_QR_R1:'34eabb10a15e7b5261c489df8c3d6a20fa4f592e2268852bd330f8c185c196bf',
  V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1:'0a5aae9518fe265283db47aea2b89fd25f98c50baf85eaaa45c5caadf1e2cc10'
});
const extract=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);if(i<0||j<=i)throw Error('R1_2D_GUARD_BOUNDARY_MISSING');return app.slice(i,j);};
// Exact Phase C test-only candidate; historical release pins remain unchanged.
const longNameCandidate=Object.freeze({
  "id": "A9R18_QR_LONG_NAME_MULTIMONTH_R1_EXACT_TEST_CANDIDATE",
  "runtimeSHA256": "8388c9bf5c9cb1d47d29526d7191bae5bb9ab3a07fad4b51de8f6be95db8ac59",
  "appSHA256": "2d47c2f4906ed17cb044740feedc79e33c0a0c8739611f05274111a8194bd4fd",
  "tuitionHelperSHA256": "f8d048d0a199f52a44b38b97227ec9b15d6592b20d0d38d8434b311907d6e09d",
  "pixelVerifierSHA256": "78160969cf25440769c8c907d289aee212ce6f1cac7d1aae29c2e01e03409080",
  "protectedFiles": {
    "firestore.rules": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
    "firestore.indexes.json": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2"
  }
});
export function verifyQrMultiitemMemoR1_2DAppWaiver(targetRoot=root){
 try{
  const source=fs.readFileSync(path.join(targetRoot,'app.js'),'utf8');
  const exactRuntime=runtimeHash(targetRoot);
  if (exactRuntime===longNameCandidate.runtimeSHA256) {
    if (runtimeHash(path.join(targetRoot,'public'))!==exactRuntime) return {ok:false,reason:'LONG_NAME_PUBLIC_RUNTIME_MISMATCH'};
    if (sha(source)!==longNameCandidate.appSHA256) return {ok:false,reason:'LONG_NAME_APP_SHA_MISMATCH'};
    for (const [file,expected] of Object.entries(longNameCandidate.protectedFiles)) if(sha(fs.readFileSync(path.join(targetRoot,file)))!==expected)return {ok:false,reason:'LONG_NAME_PROTECTED_FILE_DRIFT'};
    const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);if(i<0||j<=i)throw Error('LONG_NAME_GUARD_BOUNDARY_MISSING');return source.slice(i,j);};
    if(sha(slice('    function _receiptTuitionMemo(', '    function _receiptQrMismatch('))!==longNameCandidate.tuitionHelperSHA256)return {ok:false,reason:'LONG_NAME_TUITION_HELPER_DRIFT'};
    if(sha(slice('    async function _verifyReceiptQrPixels(', '    function _receiptFailureMessage('))!==longNameCandidate.pixelVerifierSHA256)return {ok:false,reason:'LONG_NAME_PIXEL_VERIFIER_DRIFT'};
    return {ok:true,appSHA256:longNameCandidate.appSHA256,pin:longNameCandidate.id,testOnly:true,exactRuntimeAndPublic:true,tuitionHelperUnchanged:false,pixelValidatorUnchanged:true};
  }
  const pin=verifySourceIdentity(targetRoot,exactRuntime);
  const expectedApp=acceptedApp[pin.id];
  if(!expectedApp) return {ok:false,reason:'R1_2D_SOURCE_IDENTITY_REQUIRED'};
  if(sha(source)!==expectedApp) return {ok:false,reason:'R1_2D_APP_SHA_MISMATCH'};
  const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);if(i<0||j<=i)throw Error('R1_2D_GUARD_BOUNDARY_MISSING');return source.slice(i,j);};
  if(sha(slice('    function _receiptTuitionMemo(', '    function _receiptQrMismatch('))!=='6065a1041150f195bb0337d65a0941ce6fa83dd719ad2512a794f0e944206a25') return {ok:false,reason:'R1_2D_TUITION_HELPER_DRIFT'};
  if(sha(slice('    async function _verifyReceiptQrPixels(', '    function _receiptFailureMessage('))!=='78160969cf25440769c8c907d289aee212ce6f1cac7d1aae29c2e01e03409080') return {ok:false,reason:'R1_2D_PIXEL_VALIDATOR_DRIFT'};
  if(!source.includes("breakdown.push({ kind: 'tuition'")||!source.includes("const _tuitionComponent = Array.isArray(breakdown)")) return {ok:false,reason:'R1_2D_MEMO_COVERAGE_HUNK_MISSING'};
  if(['V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1','V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1','V11R6_A9R18_FAMILY_COMBO_CORRECTNESS_QR_R1','V11R6_A9R18_QR_MULTIITEM_MONTH_AUTHORITY_R1_2D1','V11R6_A9R18_SYNC_STARTUP_STABILITY_R1_3','V11R6_A9R18_ADMISSION_DRAFT_SNAPSHOT_R1_3A','V11R6_A9R18_STUDENT_PROFILE_DOM_TRUST_BOUNDARY_R1_4A','V11R6_A9R18_REACHABLE_DOM_TRUST_BOUNDARY_R1_4B','V11R6_A9R18_FINANCE_WRITE_LATENCY_R1'].includes(pin.id)){
    const start=source.indexOf('const _tuitionMemoMonths =');const section=source.slice(start,start+700);
    if(!(section.indexOf('_tuitionComponent')>=0&&section.indexOf('_tuitionComponent')<section.indexOf("type === 'Học phí' && txMonth")&&section.includes('const _memoPaymentContent = _tuitionComponent'))) return {ok:false,reason:'R1_2D1_MONTH_AUTHORITY_HUNK_MISSING'};
  }
  return {ok:true,appSHA256:expectedApp,pin:pin.id,tuitionHelperUnchanged:true,pixelValidatorUnchanged:true};
 }catch(e){return {ok:false,reason:e?.message||String(e)};}
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){const r=verifyQrMultiitemMemoR1_2DAppWaiver();console.log(JSON.stringify(r,null,2));if(!r.ok)process.exit(1);}
