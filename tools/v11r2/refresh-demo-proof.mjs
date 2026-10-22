// Renew DEMO evidence for the same locally-owned, already-tested runtime.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {demoDecision} from './decision-fixture.mjs';
import {refreshDemoCandidate,runtimeHash} from './cutover.mjs';
import {isolatedOutputPaths} from './isolated-output.mjs';
export function refreshDemoProof(sourceRoot,directory) {
 const {source,output}=isolatedOutputPaths(sourceRoot,directory);
 const old=JSON.parse(fs.readFileSync(path.join(output,'DEMO_ACTIVE_ONLY.json'),'utf8'));
 const before=runtimeHash(output),f=demoDecision(source,{authority:old.source?.authority});
 const proof=refreshDemoCandidate(f.bundle,f.evidence,output,source);
 return {proof,bundle:f.bundle,evidence:f.evidence,runtimeBefore:before,runtimeAfter:runtimeHash(output)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 try{
  const result=refreshDemoProof(process.cwd(),process.argv[2]);
  const evidence={...result.evidence};delete evidence.now;
  fs.mkdirSync('handoff/V11R2/evidence',{recursive:true});
  fs.writeFileSync('handoff/V11R2/evidence/DEMO_CUTOVER_BUNDLE.json',JSON.stringify({bundle:result.bundle,evidence,realOwnerApproval:false,runtimeUnchangedSHA256:result.runtimeBefore},null,2));
  console.log(JSON.stringify({rulesSHA:result.bundle.plan.activeRulesSHA256,runtimeBefore:result.runtimeBefore,runtimeAfter:result.runtimeAfter,status:result.proof.status}));
 }catch(error){console.error(error.code||'DEMO_REFRESH_BLOCKED',error.message);process.exitCode=1}
}
