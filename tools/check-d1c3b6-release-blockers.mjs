#!/usr/bin/env node
// Legacy B6 release gate delegates to the current executable security decision,
// NEVER to editable Markdown PASS/APPROVED markers.
import {spawnSync} from 'node:child_process';
const runs=[
 ['E01/E02 actual handler roster',process.execPath,['tools/check-d1c3b6-coach-roster-authority.mjs']],
 ['E01 real Rules / cost approval',process.execPath,['tools/check-d1c3b7-security-release.mjs']]
];
let failed=0;
for(const [name,cmd,args] of runs){
 const r=spawnSync(cmd,args,{encoding:'utf8',timeout:220000});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
 console.log(`[B6 RELEASE ${name}] exit=${r.status??'NOT COMPLETED'}`);
 if(r.status!==0)failed++;
}
if(failed){console.error(`B6 RELEASE BLOCKED: ${failed} executable gate(s) failed`);process.exitCode=1}
else console.log('B6 RELEASE security and roster gates PASS');
