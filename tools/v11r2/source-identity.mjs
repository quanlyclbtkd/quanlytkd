// Explicit reviewed source allowlist. This is not an owner approval or a deploy gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildTag} from './import-graph.mjs';
import {stagingRuntimeOverrides} from '../v11r3/staging-source.mjs';
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
const A5_ACCEPTED_SOURCE = Object.freeze({
 id:'V11R6_A5_ATTENDANCE_MAINTENANCE',
 inputZIP_SHA256:'f20d07649104f1d4d371e7fd5c4b761697163264f9ac49587f58f8a4e342436d',
 manifest:'tools/v11r2/manifests/V11R6_A5_MAINTENANCE.json',
 manifestSHA256:"655e102a617526d239e53d00bc0e8c260f5b61adcbe6cfe6f09a97e78dff7666",
 runtimeSHA256:'6ee1c5d85d965f7b545642c460adc5d45c4ff88d6ffb443a1feae0ee465fcfb2',
 rulesSHA256:'0d54b2e6369944f97fb716354733879be3a3ac49579ae52012e77157926f6ab0',
 indexesSHA256:'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2',
 buildTag:'qr-v11r6-attendance-a5-20261022'
});
export const ACCEPTED_SOURCE = Object.freeze({
 "id": "V11R6_A6_COACH_QR_MAINTENANCE",
 "inputZIP_SHA256": "a2bf57e0b715470764cca1031dec5f27733dcfc8276e8cb1b44e9a06a8213fa0",
 "manifest": "tools/v11r2/manifests/V11R6_A6_MAINTENANCE.json",
 "manifestSHA256": "4df93e5f4a6e9802ef139c33748a17e64550e72493b23c429e071050c4140f2f",
 "runtimeSHA256": "9a3496ea84ae5a9a486cb053b9193fe6ab1abcae55c6b96d23452304ebb1f0d2",
 "rulesSHA256": "05a0b9b27529d94e5d0b74da0b8ad95324a3ae3b3d206ab95e5eb882ba47abb5",
 "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
 "buildTag": "qr-v11r6-a6-coach-qr-20261022"
});
// A8 V2 is a separate pinned, test-only descendant of exact A7 source.
// Existing A6/A5/legacy pins remain immutable; verification still authenticates all 128 runtime files.
const A8_ACCEPTED_SOURCE = Object.freeze({
  "id": "V11R6_A8_V2_TEST_ONLY_MAINTENANCE",
  "inputZIP_SHA256": "604dd9cf428ac957cb7c65c87c61738be385267587e505b72b0878c9d3ca8517",
  "manifest": "tools/v11r2/manifests/V11R6_A8_V2_MAINTENANCE.json",
  "manifestSHA256": "fa771b5a54569539cfc4c68a0161fbf30a8ff17100b8d6eddac10b67f8a37ae9",
  "runtimeSHA256": "e560304479fcebb996cf4c7ad841fa99523658c74f6bbdd9eaf85b46c2697f83",
  "rulesSHA256": "4800a5e196342fee35be81d3cc08a03e5c7f4b062481fe7fe0be9b0e4c92c362",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a8-v2-coach-acl-qr-20261023"
});
export function verifySourceIdentity(root, actualRuntimeSHA256) {
 const pinned=[A8_ACCEPTED_SOURCE,ACCEPTED_SOURCE,A5_ACCEPTED_SOURCE,LEGACY_ACCEPTED_SOURCE];
 const exact=pinned.find(p=>p.runtimeSHA256===actualRuntimeSHA256);
 if(!exact&&fs.existsSync(path.join(root,'STAGING_SOURCE_ONLY.json')))return verifyDerivedStaging(root,actualRuntimeSHA256,pinned);
 const p = exact||ACCEPTED_SOURCE, manifestPath = path.join(root,p.manifest);
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

function verifyDerivedStaging(root,actualRuntimeSHA256,pinned){
 const descriptor=JSON.parse(fs.readFileSync(path.join(root,'STAGING_SOURCE_ONLY.json'),'utf8'));
 const base=pinned.find(p=>p.runtimeSHA256===descriptor.baseRuntimeSHA256);need(base,'STAGING_BASE_NOT_ACCEPTED');
 const manifestPath=path.join(root,base.manifest);need(fs.existsSync(manifestPath)&&sha(fs.readFileSync(manifestPath))===base.manifestSHA256,'SOURCE_MANIFEST_NOT_ACCEPTED');
 const files=JSON.parse(fs.readFileSync(manifestPath,'utf8')).canonicalRuntimeFiles,originals=descriptor.originals;
 need(files&&Object.keys(files).length===128&&originals&&typeof originals==='object'&&!Array.isArray(originals),'STAGING_ORIGINALS_INVALID');
 need(Object.entries(originals).every(([file,text])=>Object.hasOwn(files,file)&&typeof text==='string'&&sha(text)===files[file]),'STAGING_ORIGINALS_NOT_PINNED');
 // Validate the entire reconstructed base, including modules not changed by configuration/cache.
 need(Object.entries(files).every(([file,hash])=>sha(Object.hasOwn(originals,file)?originals[file]:fs.readFileSync(path.join(root,file)))===hash),'STAGING_BASE_FILE_MISMATCH');
 const expected=stagingRuntimeOverrides(root,descriptor.config,originals);
 need(descriptor.kind==='ISOLATED_STAGING_SOURCE_NOT_DEPLOYED'&&descriptor.projectId===descriptor.config.projectId&&descriptor.buildTag===expected.tag,'STAGING_DESCRIPTOR_MISMATCH');
 const entries=Object.keys(files).sort().map(file=>{const bytes=Object.hasOwn(expected.overrides,file)?expected.overrides[file]:fs.readFileSync(path.join(root,file));need(sha(fs.readFileSync(path.join(root,file)))===sha(bytes),'STAGING_RUNTIME_TAMPERED');return[file,sha(bytes)]});
 need(sha(JSON.stringify(entries))===actualRuntimeSHA256,'STAGING_RUNTIME_NOT_DERIVED');
 need(sha(fs.readFileSync(path.join(root,'firestore.rules')))===base.rulesSHA256,'SOURCE_RULES_NOT_ACCEPTED');
 need(sha(fs.readFileSync(path.join(root,'firestore.indexes.json')))===base.indexesSHA256,'SOURCE_INDEXES_NOT_ACCEPTED');
 return {...base,id:base.id+'_STAGING_DERIVED',runtimeSHA256:actualRuntimeSHA256,buildTag:expected.tag,canonicalFileCount:128,derivedFrom:base.runtimeSHA256,projectId:descriptor.projectId};
}
