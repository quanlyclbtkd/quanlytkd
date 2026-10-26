// Uses the existing canonical cache builder and immutable source-pin mechanism.
// Local candidate preparation only. Never deploys or contacts Firebase.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {rewriteCacheGraph,buildImportGraph} from '../v11r2/import-graph.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
const root=process.cwd(),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const tag='qr-v11r6-a9r16a-r3-shift-history-mobile-20261025';
const read=f=>fs.readFileSync(path.join(root,f));
const parent=JSON.parse(read('tools/v11r2/manifests/V11R6_A9R16A_R2_SEQUENTIAL.json'));
const files=Object.keys(parent.canonicalRuntimeFiles).sort(),canonicalJS=files.filter(f=>f.endsWith('.js'));
const owners=['js/core/trainingRegistration.js','js/modules/students.js','js/modules/attendance.js'];
const initial=Object.fromEntries(owners.map(f=>[f,read(f).toString()]));
const result=rewriteCacheGraph(root,initial,tag,canonicalJS);
for(const [file,text] of Object.entries(result.overrides))fs.writeFileSync(path.join(root,file),text);
for(const file of files){fs.mkdirSync(path.dirname(path.join(root,'public',file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(root,'public',file));}
const graph=buildImportGraph(root,{},canonicalJS),urls={};
for(const edge of graph.edges.filter(e=>e.to)){
 const u=new URL(edge.url,new URL(edge.kind==='script-loader'?'index.html':edge.from,'https://qa/'));
 const url=u.pathname+u.search+u.hash;
 if(urls[edge.to])assert.equal(urls[edge.to],url,'Canonical module identity '+edge.to);
 urls[edge.to]=url;
}
const manifest={kind:'A9R16A_R3_SOURCE_IDENTITY_NOT_RELEASE_APPROVAL',parentOuterZIP_SHA256:'b96b7e5fc9a77b119a8e696babddd5bbd87f0dda59bbaf8c1a0baf86f4699804',parentRuntimeSHA256:parent.runtimeSHA256,buildTag:tag,runtimeSHA256:runtimeHash(root),rulesSHA256:sha(read('firestore.rules')),indexesSHA256:sha(read('firestore.indexes.json')),canonicalRuntimeFiles:Object.fromEntries(files.map(f=>[f,sha(read(f))])),canonicalModuleURLs:urls};
assert.equal(manifest.rulesSHA256,parent.rulesSHA256);assert.equal(manifest.indexesSHA256,parent.indexesSHA256);
const manifestFile='tools/v11r2/manifests/V11R6_A9R16A_R3_SHIFT_HISTORY.json';
const manifestText=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(manifestFile,manifestText);
const pin={id:'V11R6_A9R16A_R3_SHIFT_HISTORY',canonicalFileCount:files.length,coachAssignmentContract:'server-verified-multi-branch-v1',inputZIP_SHA256:manifest.parentOuterZIP_SHA256,manifest:manifestFile,manifestSHA256:sha(manifestText),runtimeSHA256:manifest.runtimeSHA256,rulesSHA256:manifest.rulesSHA256,indexesSHA256:manifest.indexesSHA256,buildTag:tag};
const identityFile='tools/v11r2/source-identity.mjs';let identity=read(identityFile).toString();
const marker='// R3 candidate lineage; source identity only, never release approval.';
const entry=marker+'\nconst A9R16A_R3_SHIFT_HISTORY = Object.freeze('+JSON.stringify(pin,null,2)+');\n\n';
if(identity.includes(marker))identity=identity.replace(/\/\/ R3 candidate lineage; source identity only, never release approval\.[\s\S]*?\n\n(?=export function verifySourceIdentity)/,entry);
else identity=identity.replace('export function verifySourceIdentity',entry+'export function verifySourceIdentity').replace('const pinned=[','const pinned=[A9R16A_R3_SHIFT_HISTORY,');
fs.writeFileSync(identityFile,identity);
console.log(JSON.stringify({status:'PASS',runtimeSHA256:manifest.runtimeSHA256,canonicalFiles:files.length,moduleCount:Object.keys(urls).length,metadataChanged:Object.keys(result.overrides)},null,2));
