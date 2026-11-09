// R2.2 source-only preflight. No Firebase initialization or business invocation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';

export const inputSHA256='047190212d0b0c0647b461d46018d9e9ef76fa83d2848f064c4fa887a738641c';
export const required={
  'app.js':'922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619',
  'js/modules/finance.js':'3db110afa06b6b69614973ad96c24eef2cc4a6c293e05ae84d0c3b2617bb4c16',
  'js/services/finance.service.js':'a4e671e9ced4c4ab94c668530d334634f8beab7426d55afe38c6aeb0dc2fc6fc',
  'js/core/tuitionCommandBoundary.js':'d0721d2d772797760b7c139b226c9b982d40c8bdd659b047d369d4da16752277',
  'js/core/debtProfileReadBoundary.js':'92d22f373d6598afac786418f1a26e2f8514c2a4a589b24a38e8c2856356fa08',
  'js/listeners/profiles.listeners.js':'a63cac438c0dbe94fee97e8f828baab8ee7abce0a5420eda593b043a14d8bac5',
  'js/ui/render/computation/studentsRenderer.js':'43c26234d2eca584b02b5c2e51a3d651a526e4d4bada81316d8ca773c22b58db',
  'firestore.rules':'1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3',
  'firestore.indexes.json':'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
};
export const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=(root,file)=>fs.readFileSync(path.join(root,file));
export function manifest(root) {
  const p=verifyRuntimeProfile(root);
  const pinned=JSON.parse(read(root,p.identity.manifest));
  for(const [file,hash]of Object.entries(required))assert.equal(sha(read(root,file)),hash,'BASELINE_IDENTITY_MISMATCH '+file);
  const files={};
  for(const file of Object.keys(pinned.canonicalRuntimeFiles)){
    files[file]=sha(read(root,file));
    const mirror='public/'+file;
    assert.equal(sha(read(root,mirror)),files[file],'ROOT_PUBLIC_MISMATCH '+file);
    files[mirror]=files[file];
  }
  for(const file of ['firestore.rules','firestore.indexes.json','firebase.json','package.json','package-lock.json'])files[file]=sha(read(root,file));
  return {kind:'R2_2_CURRENT_LINEAGE_MEASUREMENT_MANIFEST',inputSHA256,runtimeSHA256:pinned.runtimeSHA256,sourcePin:p.identity.id,mirroredPairs:Object.keys(pinned.canonicalRuntimeFiles).length,files};
}
export function counts(root) {
  // Same explicitly scoped call-site convention as the accepted Inventory audit.
  const patterns={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
  const result={getDoc:0,getDocs:0,onSnapshot:0},sites=[];
  function visit(file){const p=path.join(root,file);if(fs.statSync(p).isDirectory()){for(const n of fs.readdirSync(p))visit(file+'/'+n);return;}if(!file.endsWith('.js')||/(?:^|\/)(?:migrations|diagnostics)\//.test(file))return;
    for(const [i,line]of read(root,file).toString().split('\n').entries()){
      if(/^(?:\/\/|\*|\/\*)/.test(line.trim()))continue;
      for(const [kind,re]of Object.entries(patterns)){re.lastIndex=0;if(re.test(line)){result[kind]++;sites.push({file,line:i+1,kind});}}
    }
  }
  visit('app.js');visit('js');return {counts:result,sites};
}
export function prove(root,baseline) {
  const before=manifest(baseline),after=manifest(root),a=counts(baseline),b=counts(root);
  assert.deepEqual(after,before,'PRODUCTION_FREEZE_VIOLATION');
  assert.deepEqual(b,a,'PRODUCTION_FIRESTORE_CALL_SITE_CHANGE');
  assert.deepEqual(b.counts,{getDoc:24,getDocs:43,onSnapshot:16});
  return {status:'PASS',before,after,rootPublic:{pairs:after.mirroredPairs,mismatches:0},staticCallSites:{before:a.counts,after:b.counts,definition:'Existing scoped source-call-site audit; excludes tools, public mirror, migrations and diagnostics.'},billing:'FIRESTORE_BILLING_NOT_MEASURED'};
}
