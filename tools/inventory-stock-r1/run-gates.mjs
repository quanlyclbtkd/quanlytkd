// Phase-specific gates. Historical source-freeze failures remain visible in
// 10_REGRESSION_RESULTS.md; this runner does not change or waive those tests.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runtimeHash} from '../v11r2/cutover.mjs';

const root=process.cwd(), output=process.argv[2] && path.resolve(process.argv[2]);
if(output)fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-stock-r1-gates-'));
const {gates}=JSON.parse(fs.readFileSync(path.join(root,'tools/inventory-stock-r1/protected-gates.json'),'utf8'));
const results=[];
try {
  for(const {name,command} of gates) {
    const start=performance.now();
    const r=spawnSync(command[0],command.slice(1),{cwd:root,env:{...process.env,TMPDIR:temporary},encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000});
    const log=(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.stack:'');
    if(output)fs.writeFileSync(path.join(output,name+'.log'),log);
    results.push({name,command,exitCode:r.status??1,durationMs:performance.now()-start,log:output?name+'.log':null,logSHA256:crypto.createHash('sha256').update(log).digest('hex')});
    console.log((r.status===0?'PASS ':'FAIL ')+name);
    if(r.status!==0)console.error(log.slice(-4000));
  }
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
const summary={phase:'A9R18-INVENTORY-STOCK-INTEGRITY-AUTHORITY-R1',runtimeSHA256:runtimeHash(root),passed:results.filter(r=>r.exitCode===0).length,failed:results.filter(r=>r.exitCode!==0).length,results};
if(output)fs.writeFileSync(path.join(output,'RESULTS.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({phase:summary.phase,passed:summary.passed,failed:summary.failed,runtimeSHA256:summary.runtimeSHA256}));
if(summary.failed)process.exitCode=1;
