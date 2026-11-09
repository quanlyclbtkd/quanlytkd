import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sha} from './freeze.mjs';
const root=process.cwd(),dir=path.join(root,'evidence/FINANCE_LATENCY_R2_2/logs');fs.mkdirSync(dir,{recursive:true});
const current=[
 'check-finance-write-writer-matrix-r1-1.mjs',
 'check-finance-write-evidence-r1-1.mjs',
 'check-finance-tuition-month-authority-r1-2.mjs',
 'check-finance-tuition-intent-context-r1-2a.mjs',
 'check-tuition-settlement-write-state-r1-1a.mjs',
 'check-tuition-settlement-r1-1a-app-guard.mjs',
 'check-debt-authoritative-tuition-coverage.mjs',
 'check-tuition-debt-source-of-truth-v4c.mjs',
 'check-debt-actions-sync.mjs',
 'check-family-combo-autofill-r1.mjs',
 'check-family-combo-qr-r1.mjs',
 'check-admission-postcommit-context-r1-2c.mjs',
 'check-admission-draft-snapshot-r1-3a.mjs',
 'check-h8r2-1c1f1d1c1-admission-atomic.mjs',
 'check-h8r2-1c1f1d1-multiitem-inventory-closure.mjs',
 'check-h8r2-1c1f1d1c1-inventory-atomic.mjs',
 'check-inventory-stock-authority-r1.mjs',
 'check-qr-report-render-payment-intent.mjs',
 'check-qr-v4-payment-account-authority.mjs',
 'check-qr-multiitem-memo-r1-2d1.mjs',
 'check-qr-multiitem-memo-r1-2d.mjs',
 'check-qr-multiitem-memo-r1-2d-app-guard.mjs',
 'a9r6/qr-provider-memo-regression.test.mjs',
 'check-auth-context-single-writer.mjs',
 'check-production-security-trust-boundary.mjs',
 'check-security-coach-branch-boundary.mjs',
];
const historical=['check-finance-write-latency-r1.mjs','check-finance-write-latency-r2.mjs','check-finance-write-latency-r2-1.mjs'];
const jobs=[...current.map(file=>({file,group:'CURRENT_BEHAVIOR'})),...historical.map(file=>({file,group:'HISTORICAL_CHECKER'}))];
const results=[];
async function run(job){
 const target='tools/'+job.file,logName=job.file.replaceAll('/','_')+'.log',out=fs.openSync(path.join(dir,logName),'w');
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,['--experimental-vm-modules',target],{cwd:root,stdio:['ignore',out,out]});child.once('error',()=>resolve(127));child.once('close',c=>resolve(c??128));});fs.closeSync(out);
 const log=fs.readFileSync(path.join(dir,logName),'utf8');
 const result={...job,exitCode:code,result:code===0?'PASS':'REQUIRES_CLASSIFICATION',log:'logs/'+logName,logSHA256:sha(log),tail:log.trim().split('\n').slice(-3)};
 results.push(result);console.log(JSON.stringify({file:job.file,exitCode:code,group:job.group}));
}
let next=0;await Promise.allSettled(Array.from({length:4},async()=>{while(next<jobs.length){const job=jobs[next++];await run(job);}}));
results.sort((a,b)=>jobs.findIndex(x=>x.file===a.file)-jobs.findIndex(x=>x.file===b.file));
fs.writeFileSync(path.join(root,'evidence/FINANCE_LATENCY_R2_2/REGRESSION_EXECUTION.json'),JSON.stringify({environment:{node:process.version,platform:process.platform,networkUsed:false},results},null,2)+'\n');
console.log(JSON.stringify({executed:results.length,pass:results.filter(x=>x.exitCode===0).length,requiresClassification:results.filter(x=>x.exitCode!==0).map(x=>x.file)}));
