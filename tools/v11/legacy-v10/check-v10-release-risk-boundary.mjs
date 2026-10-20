// Fails release on reproduced server-policy/journal invariants, even when
// historical suites are green. Executes only on a local demo Emulator.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const out=fs.mkdtempSync(path.join(os.tmpdir(),'v10-risk-'));
const cli=path.resolve('node_modules/firebase-tools/lib/bin/firebase.js');
const r=spawnSync(process.execPath,[cli,'emulators:exec','--only','firestore','--project','demo-v10-risk-diagnostic','node tools/v10/diagnose-release-risks.mjs'],{env:{...process.env,V10_OUTPUT:out},encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
const resultFile=path.join(out,'V10_KNOWN_RELEASE_RISKS.json');
if(r.status!==0||!fs.existsSync(resultFile)){console.error('V10 RELEASE BLOCKED: risk diagnostic did not complete');process.exitCode=1;}
else{
 const result=JSON.parse(fs.readFileSync(resultFile,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const exact=result.rulesSha256===sha('firestore.rules')&&result.attendanceSha256===sha('js/modules/attendance.js')&&result.serviceSha256===sha('js/services/attendance.service.js');
 const open=result.results.filter(x=>x.status!=='CLOSED');
 if(!exact||open.length){console.error('V10 RELEASE BLOCKED:',exact?'confirmed current-candidate risks':'candidate proof mismatch',open.map(x=>x.id).join(', '));process.exitCode=1;}
 else console.log('V10 RELEASE RISK BOUNDARY PASS');
 if(process.env.V10_RELEASE_RISK_OUTPUT)fs.writeFileSync(process.env.V10_RELEASE_RISK_OUTPUT,JSON.stringify(result,null,2));
}
