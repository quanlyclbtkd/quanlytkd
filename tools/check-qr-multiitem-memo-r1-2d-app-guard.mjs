import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runtimeHash} from './v11r2/cutover.mjs';
import {verifySourceIdentity} from './v11r2/source-identity.mjs';
const root=process.cwd();
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const expectedApp='25ce6f05d1bcc3cdd13f7c679c08ad3ec04ec5eae995145e208465b4710915b8';
const extract=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);if(i<0||j<=i)throw Error('R1_2D_GUARD_BOUNDARY_MISSING');return app.slice(i,j);};
export function verifyQrMultiitemMemoR1_2DAppWaiver(targetRoot=root){
 try{
  const source=fs.readFileSync(path.join(targetRoot,'app.js'),'utf8');
  const pin=verifySourceIdentity(targetRoot,runtimeHash(targetRoot));
  if(pin.id!=='V11R6_A9R18_QR_MULTIITEM_MEMO_RECONCILIATION_UI_R1_2D') return {ok:false,reason:'R1_2D_SOURCE_IDENTITY_REQUIRED'};
  if(sha(source)!==expectedApp) return {ok:false,reason:'R1_2D_APP_SHA_MISMATCH'};
  const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);if(i<0||j<=i)throw Error('R1_2D_GUARD_BOUNDARY_MISSING');return source.slice(i,j);};
  if(sha(slice('    function _receiptTuitionMemo(', '    function _receiptQrMismatch('))!=='6065a1041150f195bb0337d65a0941ce6fa83dd719ad2512a794f0e944206a25') return {ok:false,reason:'R1_2D_TUITION_HELPER_DRIFT'};
  if(sha(slice('    async function _verifyReceiptQrPixels(', '    function _receiptFailureMessage('))!=='78160969cf25440769c8c907d289aee212ce6f1cac7d1aae29c2e01e03409080') return {ok:false,reason:'R1_2D_PIXEL_VALIDATOR_DRIFT'};
  if(!source.includes("breakdown.push({ kind: 'tuition'")||!source.includes("const _tuitionComponent = Array.isArray(breakdown)")) return {ok:false,reason:'R1_2D_MEMO_COVERAGE_HUNK_MISSING'};
  return {ok:true,appSHA256:expectedApp,pin:pin.id,tuitionHelperUnchanged:true,pixelValidatorUnchanged:true};
 }catch(e){return {ok:false,reason:e?.message||String(e)};}
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){const r=verifyQrMultiitemMemoR1_2DAppWaiver();console.log(JSON.stringify(r,null,2));if(!r.ok)process.exit(1);}
