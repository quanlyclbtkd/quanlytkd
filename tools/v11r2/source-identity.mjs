// Explicit reviewed source allowlist. This is not an owner approval or a deploy gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildTag} from './import-graph.mjs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const need = (ok, code) => { if (!ok) throw Object.assign(Error(code),{code}); };
const LEGACY_ACCEPTED_SOURCE = Object.freeze({
 id:'V11R6_RETEST_MAINTENANCE',
 inputZIP_SHA256:'6135ccdad5455ccf5a723e576445cd509e37237322a501e390fc88ae0a74c07e',
 manifest:'handoff/V11R6_RETEST/SOURCE_AND_EVIDENCE.json',
 manifestSHA256:'3f5d53c130b200818d1c6407f229ae6d2760559ff38410bfb691c60c654e698a',
 runtimeSHA256:'2d0fbaf313af623a7ceb9e48ab60cbddf045c757c30d0cf137d4d186c461bfd8',
 rulesSHA256:'0d54b2e6369944f97fb716354733879be3a3ac49579ae52012e77157926f6ab0',
 indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
 buildTag:'qr-v11r6-review-20261021'
});
export const ACCEPTED_SOURCE = Object.freeze({
 id:'V11R6_A5_ATTENDANCE_MAINTENANCE',
 inputZIP_SHA256:'f20d07649104f1d4d371e7fd5c4b761697163264f9ac49587f58f8a4e342436d',
 manifest:'tools/v11r2/manifests/V11R6_A5_MAINTENANCE.json',
 manifestSHA256:"655e102a617526d239e53d00bc0e8c260f5b61adcbe6cfe6f09a97e78dff7666",
 runtimeSHA256:'6ee1c5d85d965f7b545642c460adc5d45c4ff88d6ffb443a1feae0ee465fcfb2',
 rulesSHA256:'0d54b2e6369944f97fb716354733879be3a3ac49579ae52012e77157926f6ab0',
 indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
 buildTag:'qr-v11r6-attendance-a5-20261022'
});
export function verifySourceIdentity(root, actualRuntimeSHA256) {
 const p = [ACCEPTED_SOURCE,LEGACY_ACCEPTED_SOURCE].find(p=>p.runtimeSHA256===actualRuntimeSHA256)||ACCEPTED_SOURCE, manifestPath = path.join(root,p.manifest);
 need(fs.existsSync(manifestPath) && sha(fs.readFileSync(manifestPath)) === p.manifestSHA256,'SOURCE_MANIFEST_NOT_ACCEPTED');
 const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 need(actualRuntimeSHA256 === p.runtimeSHA256 && manifest.runtimeSHA256 === p.runtimeSHA256,'SOURCE_RUNTIME_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.rules'))) === p.rulesSHA256,'SOURCE_RULES_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.indexes.json'))) === p.indexesSHA256,'SOURCE_INDEXES_NOT_ACCEPTED');
 const files = Object.entries(manifest.canonicalRuntimeFiles || {});
 need(files.length === 128 && files.every(([file,hash]) => !path.isAbsolute(file) && !file.split('/').includes('..') &&
  fs.existsSync(path.join(root,file)) && sha(fs.readFileSync(path.join(root,file))) === hash),'SOURCE_MANIFEST_FILE_MISMATCH');
 // The pinned manifest authenticates js/main.js before its build identity is read.
 const actualBuild = buildTag(fs.readFileSync(path.join(root,'js/main.js'),'utf8')).tag;
 need(actualBuild === p.buildTag,'SOURCE_BUILD_TAG_INVALID');
 return {...p,canonicalFileCount:files.length};
}
