// Canonical cache graph and independent source lineage; no deployment or data access.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {rewriteCacheGraph,buildImportGraph} from '../v11r2/import-graph.mjs';import {runtimeHash} from '../v11r2/cutover.mjs';
const root=process.cwd(),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const parent=JSON.parse(read('tools/v11r2/manifests/V11R6_A9R16A_R3R1_REVIEW.json'));
const tag='qr-v11r6-a9r17-mobile-layout-qr-20261026',id='V11R6_A9R17_MOBILE_LAYOUT_QR';
const files=Object.keys(parent.canonicalRuntimeFiles).sort(),js=files.filter(f=>f.endsWith('.js'));
let html=read('index.html').toString();const style=/(href=["']\.\/css\/ui-mobile-shell\.css\?v=)[^"'&]+/g;
assert.equal([...html.matchAll(style)].length,1);html=html.replace(style,'$1'+tag);fs.writeFileSync(path.join(root,'index.html'),html);
const owners=['app.js','js/modules/receiptHelpers.js','js/ui/render/computation/studentsRenderer.js'];
const result=rewriteCacheGraph(root,Object.fromEntries(owners.map(f=>[f,read(f).toString()])),tag,js);
for(const [f,text]of Object.entries(result.overrides))fs.writeFileSync(path.join(root,f),text);
for(const f of files){fs.mkdirSync(path.dirname(path.join(root,'public',f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(root,'public',f));}
const graph=buildImportGraph(root,{},js),urls={};for(const e of graph.edges.filter(e=>e.to)){
 const u=new URL(e.url,new URL(e.kind==='script-loader'?'index.html':e.from,'https://qa/')),url=u.pathname+u.search+u.hash;
 if(urls[e.to])assert.equal(urls[e.to],url,'Canonical URL '+e.to);urls[e.to]=url;
}
const manifest={kind:'A9R17_SOURCE_IDENTITY_NOT_RELEASE_APPROVAL',parentOuterZIP_SHA256:'7ac9a1249ad5f6d193e03043f5d27f81b4b9b95bfb57aee3ea0d235bc11416d3',parentRuntimeSHA256:parent.runtimeSHA256,buildTag:tag,runtimeSHA256:runtimeHash(root),rulesSHA256:sha(read('firestore.rules')),indexesSHA256:sha(read('firestore.indexes.json')),canonicalRuntimeFiles:Object.fromEntries(files.map(f=>[f,sha(read(f))])),canonicalModuleURLs:urls};
assert.equal(manifest.rulesSHA256,parent.rulesSHA256);assert.equal(manifest.indexesSHA256,parent.indexesSHA256);
const manifestFile='tools/v11r2/manifests/'+id+'.json',text=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(root,manifestFile),text);
const pin={id,canonicalFileCount:files.length,coachAssignmentContract:'server-verified-multi-branch-v1',inputZIP_SHA256:manifest.parentOuterZIP_SHA256,manifest:manifestFile,manifestSHA256:sha(text),runtimeSHA256:manifest.runtimeSHA256,rulesSHA256:manifest.rulesSHA256,indexesSHA256:manifest.indexesSHA256,buildTag:tag};
const identityFile=path.join(root,'tools/v11r2/source-identity.mjs');let identity=fs.readFileSync(identityFile,'utf8');
identity=identity.replace(/\/\/ A9R17 mobile layout and receipt render lineage; no release approval\.\nconst A9R17_MOBILE_LAYOUT_QR = Object.freeze\([\s\S]*?\);\n\n/,'').replace('const pinned=[A9R17_MOBILE_LAYOUT_QR,','const pinned=[');
const entry='// A9R17 mobile layout and receipt render lineage; no release approval.\nconst A9R17_MOBILE_LAYOUT_QR = Object.freeze('+JSON.stringify(pin,null,2)+');\n\n';
assert(identity.includes('export function verifySourceIdentity'));identity=identity.replace('export function verifySourceIdentity',entry+'export function verifySourceIdentity').replace('const pinned=[','const pinned=[A9R17_MOBILE_LAYOUT_QR,');fs.writeFileSync(identityFile,identity);
fs.mkdirSync(path.join(root,'evidence/A9R17'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/A9R17/BUILD_IDENTITY.json'),JSON.stringify({...pin,scope:result.graph.scope},null,2)+'\n');
console.log(JSON.stringify({classification:'PASS',...pin,metadataChanged:Object.keys(result.overrides)}));
