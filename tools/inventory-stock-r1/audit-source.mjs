// Reproducible source/parity audit against the exact, unmodified parent.
// Usage: node tools/inventory-stock-r1/audit-source.mjs /path/to/parent [output.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parse} from '../v11r2/vendor/acorn.mjs';
import {buildImportGraph, cacheToken} from '../v11r2/import-graph.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';

const root = process.cwd(), parent = path.resolve(process.argv[2] || '../baseline');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const read = (dir,file) => fs.readFileSync(path.join(dir,file),'utf8');
const manifest = JSON.parse(read(parent,'tools/v11r2/manifests/V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1.json'));
assert.equal(runtimeHash(parent),manifest.runtimeSHA256,'exact parent');
const graphs = new Map([parent,root].map(dir => [dir,buildImportGraph(dir)]));
function withoutImportVersions(dir,file) {
  let source=read(dir,file);
  for (const edge of graphs.get(dir).edges.filter(edge => edge.from===file).sort((a,b)=>b.start-a.start)) {
    const url=edge.url.replace(/([?&])v=[^&#]*(?:&|$)/,(_,s)=>s==='?'?'?':'').replace(/[?&]$/,'');
    source=source.slice(0,edge.start)+(edge.quoted?JSON.stringify(url):url)+source.slice(edge.end);
  }
  return source;
}
const cacheOnlyFiles=['index.html','js/main.js','js/core/tuitionCommandBoundary.js','js/modules/finance.js','js/services/finance.service.js'];
const cacheOnly = cacheOnlyFiles.map(file => {
  const before=sha(withoutImportVersions(parent,file)),after=sha(withoutImportVersions(root,file));
  assert.equal(after,before,'cache literals only: '+file);
  return {file,normalizedSHA256:after,equal:true};
});
function functionHashes(dir) {
  const source=read(dir,'app.js'),names=new Set(['_receiptFamilyTuitionMemo','_receiptPaymentMemo','_receiptTuitionMemo','_receiptDecodeEMV','_verifyReceiptQrPixels','generateVietQR']);
  const found={};
  const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&names.has(node.id?.name))found[node.id.name]=sha(source.slice(node.start,node.end));for(const v of Object.values(node))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);};
  walk(parse(source,{sourceType:'module',ecmaVersion:'latest'}));assert.equal(Object.keys(found).length,names.size);return found;
}
const qrBefore=functionHashes(parent),qrAfter=functionHashes(root);assert.deepEqual(qrAfter,qrBefore,'QR builders/verifiers byte-identical');
const exactFiles=Object.keys(manifest.canonicalRuntimeFiles).filter(file=>!cacheOnlyFiles.includes(file)&&!['app.js','js/services/inventory.service.js','js/modules/inventory.js','js/modules/students.js'].includes(file));
for(const file of exactFiles)assert.equal(sha(read(root,file)),manifest.canonicalRuntimeFiles[file],'protected source: '+file);
for(const file of ['firestore.rules','firestore.indexes.json'])assert.equal(sha(read(root,file)),sha(read(parent,file)),'protected permissions/schema: '+file);
function collect(dir,roots=['app.js','index.html','style.css','.nojekyll','js','css','assets']) {
  const files=[];const walk=file=>{const p=path.join(dir,file);if(!fs.existsSync(p))return;if(fs.statSync(p).isDirectory())for(const n of fs.readdirSync(p))walk(path.join(file,n));else files.push(file.split(path.sep).join('/'));};roots.forEach(walk);return files.sort();
}
const files=collect(root),publicFiles=collect(path.join(root,'public'));
const mismatches=files.filter(file=>!fs.existsSync(path.join(root,'public',file))||sha(fs.readFileSync(path.join(root,file)))!==sha(fs.readFileSync(path.join(root,'public',file))));
const extras=publicFiles.filter(file=>!files.includes(file));assert.equal(mismatches.length,0);assert.equal(extras.length,0);
const patterns={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
function staticCounts(dir) {
  const counts={getDoc:0,getDocs:0,onSnapshot:0},sites=[];
  for(const file of collect(dir,['app.js','js']).filter(file=>file.endsWith('.js')&&!/(?:^|\/)(?:migrations|diagnostics)\//.test(file)))
    for(const [i,line] of read(dir,file).split('\n').entries()) {
      const text=line.trim();if(text.startsWith('//')||text.startsWith('*')||text.startsWith('/*'))continue;
      for(const [kind,pattern] of Object.entries(patterns)){pattern.lastIndex=0;if(pattern.test(line)){counts[kind]++;sites.push({kind,file,line:i+1});}}
    }
  return {counts,sites};
}
const beforeCounts=staticCounts(parent),afterCounts=staticCounts(root);
assert.deepEqual(beforeCounts.counts,{getDoc:26,getDocs:43,onSnapshot:16});assert.deepEqual(afterCounts.counts,{getDoc:24,getDocs:43,onSnapshot:16});
const profile=verifyRuntimeProfile(root),newToken='a9r18-inventory-stock-authority-r1-20261108';
const newEdges=graphs.get(root).edges.filter(edge=>cacheToken(edge.url)===newToken).map(({from,to,kind,url})=>({from,to,kind,url}));
const result={status:'PASS',parentRuntimeSHA256:runtimeHash(parent),runtimeSHA256:runtimeHash(root),sourcePin:profile.identity.id,canonicalFiles:Object.keys(manifest.canonicalRuntimeFiles).length,cacheOnly,unchangedRuntimeFiles:exactFiles,unchangedQrFunctions:qrAfter,staticCounts:{baseline:beforeCounts.counts,candidate:afterCounts.counts},readSites:{baseline:beforeCounts.sites,candidate:afterCounts.sites},rootPublic:{rootFiles:files.length,publicFiles:publicFiles.length,mismatches,extras},rulesSHA256:sha(read(root,'firestore.rules')),indexesSHA256:sha(read(root,'firestore.indexes.json')),newCacheEdges:newEdges};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,readSites:undefined,unchangedRuntimeFiles:undefined,newCacheEdges:newEdges.length},null,2));
