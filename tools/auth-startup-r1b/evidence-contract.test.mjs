import fs from 'node:fs';
import {loadBundle,validateBundle} from './evidence-contract.mjs';
const base=loadBundle();
const results=[];
const check=(name,condition)=>results.push({name,status:condition?'PASS':'FAIL'});
check('blocked report keeps native evidence unverified',validateBundle(base).valid);
for(const [name,change] of [
  ['reject accepted classification with zero native traces',b=>b.classification='AUTH_STARTUP_R1B_MEASUREMENT_ACCEPTED'],
  ['reject invented zero-millisecond timing in NOT_RUN trace',b=>b.startup.scenarios[0].marks.navigationStart=0],
  ['reject unobserved canonical profile-owner claim',b=>b.profiles.PROFILE_STARTUP_OWNER='CANONICAL_ACTIVE'],
  ['reject optimization recommendation without measurement',b=>b.recommendation='R1C_MODULE_PRELOAD'],
  ['reject canonical source-change report',b=>b.freeze.changedOriginalFiles=['app.js']],
]) {
  const b=structuredClone(base);change(b);check(name,!validateBundle(b).valid);
}
const report={kind:'TOOLING_REPORT_GOVERNANCE_ONLY',nativeBrowserTestsExecuted:0,total:results.length,passed:results.filter(r=>r.status==='PASS').length,results};
fs.writeFileSync('evidence/AUTH_STARTUP_R1B/EVIDENCE_CONTRACT_NEGATIVE_CONTROLS.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.total!==report.passed)process.exitCode=1;
