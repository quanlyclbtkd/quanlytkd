// Isolated demo-only regression checkout. Never changes the working default profile.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {demoDecision} from './decision-fixture.mjs';import {activateIntoNewClaim} from './cutover.mjs';
import {isolatedOutputPaths,claimNewOutput,assertOwnedOutput,cleanupOwnedOutput} from './isolated-output.mjs';
export function makeDemoActive(sourceRoot,directory) {
 const paths=isolatedOutputPaths(sourceRoot,directory,{requireNew:true}),root=paths.source,target=paths.output;
 // Resolve containment before preparing/copying anything, then exclusively claim
 // a new directory. A failed claim never permits deletion of another output.
 const f=demoDecision(root);let claim;
 try {
  claim=claimNewOutput(paths);assertOwnedOutput(claim);
  const proof=activateIntoNewClaim(f.bundle,f.evidence,claim,root);
  const generated=new Set(['app.js','index.html','style.css','.nojekyll','js','css','firestore.rules','firestore.indexes.json','CUTOVER_PROOF.json','DEMO_ACTIVE_ONLY.json']);
  fs.cpSync(root,target,{recursive:true,force:false,errorOnExist:true,filter:file=>{assertOwnedOutput(claim);const rel=path.relative(root,file),parts=rel.split(path.sep);return !generated.has(parts[0])&&!parts.includes('node_modules')&&!parts.includes('public')&&!parts.includes('.git')&&!parts.includes('__pycache__')&&!rel.startsWith('handoff'+path.sep+'V11R2')&&!rel.endsWith('firebase-debug.log')}});
  assertOwnedOutput(claim);
  assertOwnedOutput(claim);
  fs.symlinkSync(fs.realpathSync(path.join(root,'node_modules')),path.join(target,'node_modules'),process.platform==='win32'?'junction':'dir');fs.mkdirSync(path.join(target,'handoff/V11R2/evidence'),{recursive:true});
  fs.writeFileSync(path.join(target,'DEMO_ACTIVE_ONLY.json'),JSON.stringify({proof,ownerDecision:'DEMO FIXTURE, NOT REAL OWNER APPROVAL',source:f.bundle.plan,scan:f.evidence.scan,indexes:f.evidence.indexes},null,2));
  return {target,status:proof.status,activeRulesSHA:f.bundle.plan.activeRulesSHA256,activeRuntimeSHA:f.bundle.plan.activeRuntimeSHA256};
 }catch(error){cleanupOwnedOutput(claim);throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 try{console.log(JSON.stringify(makeDemoActive(process.cwd(),process.argv[2]||'../demo-active-source')))}
 catch(error){console.error(error.code||'DEMO_PREPARATION_BLOCKED',error.message);process.exitCode=1}
}
