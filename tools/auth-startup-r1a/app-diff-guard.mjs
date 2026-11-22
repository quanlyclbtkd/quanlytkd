import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {AUTH_STARTUP_R1A_SOURCE} from './source-profile.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const proofSHA256='b2d89d908483abf3800ab6acca675dda67abafdb644d51e73d9941af7348e562';
const baseAppSHA256='922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619';

// Historical budgets/hashes are untouched. This exception authenticates one
// exact auth-only correctness diff and reconstructs the accepted complete app.
export function verifyAuthStartupR1AAppDiff(root=process.cwd()) {
  try {
    const app=fs.readFileSync(path.join(root,'app.js'));
    const raw=fs.readFileSync(path.join(root,'tools/auth-startup-r1a/APP_AUTH_DIFF_PROOF.json'));
    if(sha(raw)!==proofSHA256)throw Error('AUTH_DIFF_PROOF_TAMPERED');
    const proof=JSON.parse(raw);
    if(proof.baseAppSHA256!==baseAppSHA256||sha(app)!==proof.candidateAppSHA256)throw Error('AUTH_DIFF_SOURCE_MISMATCH');
    if(!app.equals(fs.readFileSync(path.join(root,'public/app.js'))))throw Error('AUTH_DIFF_MIRROR_MISMATCH');
    let reconstructed=app;
    for(const edit of [...proof.edits].sort((a,b)=>b.afterByteOffset-a.afterByteOffset)) {
      const expected=Buffer.from(edit.after);
      if(!reconstructed.subarray(edit.afterByteOffset,edit.afterByteOffset+expected.length).equals(expected))throw Error('AUTH_DIFF_HUNK_MISMATCH');
      if(!((edit.beforeLine>=1965&&edit.beforeLine<=2841)||(edit.beforeLine>=3415&&edit.beforeLine<=3944)))throw Error('AUTH_DIFF_SCOPE_VIOLATION');
      reconstructed=Buffer.concat([reconstructed.subarray(0,edit.afterByteOffset),Buffer.from(edit.before),reconstructed.subarray(edit.afterByteOffset+expected.length)]);
    }
    if(sha(reconstructed)!==baseAppSHA256)throw Error('AUTH_DIFF_BASE_RECONSTRUCTION_FAILED');
    const manifestRaw=fs.readFileSync(path.join(root,AUTH_STARTUP_R1A_SOURCE.manifest));
    if(sha(manifestRaw)!==AUTH_STARTUP_R1A_SOURCE.manifestSHA256)throw Error('AUTH_DIFF_MANIFEST_TAMPERED');
    const manifest=JSON.parse(manifestRaw);
    if(Object.keys(manifest.canonicalRuntimeFiles).length!==129)throw Error('AUTH_DIFF_FILE_COUNT');
    for(const [file,hash] of Object.entries(manifest.canonicalRuntimeFiles)) {
      if(sha(fs.readFileSync(path.join(root,file)))!==hash||sha(fs.readFileSync(path.join(root,'public',file)))!==hash)throw Error('AUTH_DIFF_UNRELATED_RUNTIME_DRIFT');
    }
    return {ok:true,scope:'exact-auth-bootstrap-correctness-only',baseAppSHA256,candidateAppSHA256:proof.candidateAppSHA256,hunks:proof.edits.length,unchangedBusinessRuntimeFiles:128};
  } catch(error) {return {ok:false,reason:error.message};}
}
