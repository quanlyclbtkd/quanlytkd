// Byte-level owner check after undoing only the approved candidate substitutions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runtimeHash,fileDigest,digest} from '../v11r2/cutover.mjs';
import {verifySourceIdentity,ACCEPTED_SOURCE} from '../v11r2/source-identity.mjs';
import {buildImportGraph,affectedModules,assertCacheGraph,buildTag} from '../v11r2/import-graph.mjs';
const root=process.cwd(),candidate=path.resolve(process.argv[2]),read=(dir,f)=>fs.readFileSync(path.join(dir,f),'utf8');
verifySourceIdentity(root,runtimeHash(root));
const before=buildImportGraph(root),after=buildImportGraph(candidate),scope=affectedModules(before),tag=buildTag(read(candidate,'js/main.js')).tag;
assertCacheGraph(after,scope,tag);
const manifest=JSON.parse(read(root,ACCEPTED_SOURCE.manifest)),files=Object.keys(manifest.canonicalRuntimeFiles).sort(),changes=[];
const oldAuthority=read(root,'js/core/attendanceContract.js').match(/export const HISTORY_AUTHORITY = '([^']+)'/)[1];
const newAuthority=read(candidate,'js/core/attendanceContract.js').match(/export const HISTORY_AUTHORITY = '([^']+)'/)[1];
for(const file of files) {
 const source=read(root,file),output=read(candidate,file);
 assert.equal(fileDigest(path.join(candidate,file)),fileDigest(path.join(candidate,'public',file)),file+' mirror');
 assert.equal(fileDigest(path.join(root,file)),fileDigest(path.join(root,'public',file)),file+' baseline mirror');
 if(source===output)continue;
 assert(scope.includes(file),'OUTSIDE_SCOPE: '+file);
 const originalEdges=before.edges.filter(e=>e.from===file),newEdges=after.edges.filter(e=>e.from===file);
 assert.equal(originalEdges.length,newEdges.length,file+' edge count');
 const reversals=[];
 for(let i=0;i<originalEdges.length;i++){
  const a=originalEdges[i],b=newEdges[i];assert.deepEqual([a.to,a.kind],[b.to,b.kind],file+' topology');
  if(a.url!==b.url)reversals.push({start:b.start,end:b.end,value:source.slice(a.start,a.end)});
 }
 if(file==='js/main.js'){
  const a=buildTag(source),b=buildTag(output);reversals.push({start:b.start,end:b.end,value:source.slice(a.start,a.end)});
 }
 let normalized=output;
 for(const r of reversals.sort((a,b)=>b.start-a.start))normalized=normalized.slice(0,r.start)+r.value+normalized.slice(r.end);
 if(['app.js','js/firebase/config.js'].includes(file)){
  const pattern=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g,original=[...source.matchAll(pattern)],modified=[...normalized.matchAll(pattern)];
  assert.equal(original.length,1);assert.equal(modified.length,1);normalized=normalized.replace(pattern,original[0][0]);
 }
 if(file==='js/core/attendanceContract.js')normalized=normalized.replaceAll(newAuthority,oldAuthority).replace('export const HISTORY_COACH_ACCESS = true;','export const HISTORY_COACH_ACCESS = false;');
 assert.equal(normalized,source,file+' changed beyond import/build identity, DEMO config or authority switch');
 changes.push({file,sourceSHA256:digest(source),candidateSHA256:digest(output),ownerImplementationUnchanged:true});
}
const rules=read(candidate,'firestore.rules').replaceAll(newAuthority,oldAuthority).replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )true(;\s*\})/,'$1false$2');
assert.equal(rules,read(root,'firestore.rules'));
assert.equal(fileDigest(path.join(candidate,'firestore.indexes.json')),fileDigest(path.join(root,'firestore.indexes.json')));
assert.equal(changes.length,10);
const proof={status:'PASS',baselineRuntimeSHA256:runtimeHash(root),candidateRuntimeSHA256:runtimeHash(candidate),canonicalFiles:files.length,changedCandidateFiles:changes,allowedChanges:['parsed cache URLs','main build identity','existing two Firebase DEMO configuration objects','history authority and Coach flag in DEMO candidate only','matching attendance Rules gate and authority'],allOtherRuntimeBytesUnchanged:true,rulesOutsideAuthorityAndGateUnchanged:true,indexesUnchanged:true,rootPublicParity:true};
fs.writeFileSync('handoff/A1A2/evidence/scope.json',JSON.stringify(proof,null,2));console.log('SCOPE PASS: 128 files; 10 candidate substitutions; owner implementations unchanged');
