// Source lineage only. Runtime owners and approved changed files remain separate.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {runtimeHash} from '../v11r2/cutover.mjs';import {buildImportGraph} from '../v11r2/import-graph.mjs';
const root=process.cwd(),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(root,f));
const parent=JSON.parse(read('tools/v11r2/manifests/V11R6_A9R17_MOBILE_LAYOUT_QR.json')),files=Object.keys(parent.canonicalRuntimeFiles).sort();
const phase=process.argv[2]||'D1';assert(['D1','D1_D2'].includes(phase));const id='V11R6_A9R18_'+phase+'_CLOSURE';
// Mirror from root through the existing canonical file inventory.
for(const f of files){fs.mkdirSync(path.dirname(path.join(root,'public',f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(root,'public',f));}
const graph=buildImportGraph(root,{},files.filter(f=>f.endsWith('.js'))),urls={};for(const e of graph.edges.filter(e=>e.to)){const u=new URL(e.url,new URL(e.kind==='script-loader'?'index.html':e.from,'https://qa/')),url=u.pathname+u.search+u.hash;if(urls[e.to])assert.equal(urls[e.to],url,'Duplicate physical module URL '+e.to);urls[e.to]=url;}
const manifest={kind:'A9R18_CLOSURE_SOURCE_IDENTITY_NOT_EXTRACTION_OR_RELEASE_APPROVAL',parentOuterZIP_SHA256:'0cc7854bb62dd1f8c51c1622ad3f0a82b2d5bc4911f37853341d6b1c7d1c1062',parentRuntimeSHA256:parent.runtimeSHA256,buildTag:parent.buildTag,stylesheetBuildTag:'qr-v11r6-a9r18-d1-mobile-debt-20261026',runtimeSHA256:runtimeHash(root),rulesSHA256:sha(read('firestore.rules')),indexesSHA256:sha(read('firestore.indexes.json')),canonicalRuntimeFiles:Object.fromEntries(files.map(f=>[f,sha(read(f))])),canonicalModuleURLs:urls};
assert.equal(manifest.rulesSHA256,parent.rulesSHA256);assert.equal(manifest.indexesSHA256,parent.indexesSHA256);
const manifestFile='tools/v11r2/manifests/'+id+'.json',text=JSON.stringify(manifest,null,2)+'\n';fs.writeFileSync(path.join(root,manifestFile),text);
const pin={id,canonicalFileCount:files.length,coachAssignmentContract:'server-verified-multi-branch-v1',inputZIP_SHA256:manifest.parentOuterZIP_SHA256,manifest:manifestFile,manifestSHA256:sha(text),runtimeSHA256:manifest.runtimeSHA256,rulesSHA256:manifest.rulesSHA256,indexesSHA256:manifest.indexesSHA256,buildTag:manifest.buildTag};
const identityFile=path.join(root,'tools/v11r2/source-identity.mjs');let identity=read('tools/v11r2/source-identity.mjs').toString();
const marker='// A9R18 '+phase+' closure lineage; identity only, never authority or deployment approval.';
const re=new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\nconst '+id+' = Object.freeze\\([\\s\\S]*?\\);\\n\\n');identity=identity.replace(re,'').replace('const pinned=['+id+',','const pinned=[');
assert(identity.includes('export function verifySourceIdentity'));identity=identity.replace('export function verifySourceIdentity',marker+'\nconst '+id+' = Object.freeze('+JSON.stringify(pin,null,2)+');\n\nexport function verifySourceIdentity').replace('const pinned=[','const pinned=['+id+',');fs.writeFileSync(identityFile,identity);
console.log(JSON.stringify({status:'PASS',...pin}));
