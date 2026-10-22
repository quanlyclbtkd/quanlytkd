// Run every independent package gate once. Release HOLD and blocked != PASS.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),pkg=JSON.parse(fs.readFileSync('package.json'));
const wrappers=new Set(['check:all','check:all:critical','check:rules:emulator','check:release']);
const holds=new Set(['check:d1c3b7-release-security','check:d1c3b6-release-blockers','check:v10-release-risk-boundary']);
const out='handoff/A3/evidence/all-gates';fs.mkdirSync(out,{recursive:true});
const retry=process.argv.includes('--retry');
const previous=retry?JSON.parse(fs.readFileSync(path.join(out,'SUMMARY.json'))):null;
const results=previous?.results||[],hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const script of Object.keys(pkg.scripts).filter(name=>name.startsWith('check:')&&!wrappers.has(name)&&(!retry||results.find(r=>r.script===name)?.status!=='PASS'))) {
 const begin=Date.now(),env={...process.env,NODE_OPTIONS:'--require '+path.join(root,'tools/v11r1/localhost-only.cjs')};
 delete env.FIRESTORE_EMULATOR_HOST;
 if(script==='check:v10-coach-join'&&process.env.A3_COACH_EMULATOR_HOST)env.FIRESTORE_EMULATOR_HOST=process.env.A3_COACH_EMULATOR_HOST;
 const r=spawnSync('npm',['run',script],{encoding:'utf8',timeout:150000,maxBuffer:16000000,env});
 const output=(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.stack:'');
 let status=r.status===0?'PASS':'FAIL';
 if(status!=='PASS'&&holds.has(script)&&/RELEASE (?:HOLD|BLOCKED)|RELEASE BLOCKER|Rules Emulator NOT VERIFIED/.test(output))status='EXPECTED_RELEASE_HOLD';
 else if(status!=='PASS'&&/TEST_DEPENDENCY_MISSING|TEST_BROWSER_MISSING|ERR_MODULE_NOT_FOUND|ERR_BLOCKED_BY_ADMINISTRATOR|Cannot find module|ModuleNotFoundError: No module named|Run coach join against an already-started/.test(output))status='ENV_BLOCKED';
 const log=script.replace('check:','')+'.log';fs.writeFileSync(path.join(out,log),output);
 const index=results.findIndex(row=>row.script===script),row={script,command:['npm','run',script],actualExit:r.status,error:r.error?.code||null,status,elapsedMs:Date.now()-begin,log,rulesSHA256:hash('firestore.rules')};
 if(index<0)results.push(row);else results[index]=row;
 fs.writeFileSync(path.join(out,'SUMMARY.json'),JSON.stringify({totalPackageGates:Object.keys(pkg.scripts).filter(s=>s.startsWith('check:')).length,results,wrappersRunSeparately:[...wrappers],counts:Object.fromEntries(['PASS','FAIL','ENV_BLOCKED','EXPECTED_RELEASE_HOLD'].map(s=>[s,results.filter(r=>r.status===s).length])),productionWrites:0},null,2));
 console.log(status+' '+script);
}
console.log('TOTAL '+results.length+' '+JSON.stringify(Object.fromEntries(['PASS','FAIL','ENV_BLOCKED','EXPECTED_RELEASE_HOLD'].map(s=>[s,results.filter(r=>r.status===s).length]))));
if(results.some(r=>['FAIL','ENV_BLOCKED'].includes(r.status)))process.exitCode=1;
