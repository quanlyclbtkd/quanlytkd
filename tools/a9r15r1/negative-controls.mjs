// Mutants live only in disposable test copies. No release pin is rewritten.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';
const root=process.cwd(),identity=verifyRuntimeProfile(root).identity,out=path.resolve(process.env.A9R15R1_NEGATIVE_OUTPUT||'evidence/A9R15R1/negative-controls');fs.mkdirSync(out,{recursive:true});
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^127\.0\.0\.1:\d+$/);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'a9r15r1-mutants-')),results=[];
const mutations=[
 {id:'NC1',name:'Remove Coach shift branch filtering',file:'js/modules/attendance.js',test:'tools/check-attendance-explicit-shift-authority.mjs',change:text=>text.replace("if (role === 'coach') return !!branch && _sameBranch(shiftBranch, branch);","if (role === 'coach') return !!branch && (_sameBranch(shiftBranch, branch) || true);"),expectedFailure:/Coach eligible shifts have explicit assigned branch authority/},
 {id:'NC2',name:'Coach CS1 runtime query uses CS2',file:'js/services/attendance.service.js',test:'tools/a9r15/history.emulator.mjs',change:text=>text.replace("where('branch','==',branch),orderBy(documentId(),'asc')","where('branch','==',branch === 'CS1' ? 'CS2' : branch),orderBy(documentId(),'asc')"),expectedFailure:/FAIL CS1-only Coach: exact runtime first page/},
 {id:'NC3',name:'Remove current authority from history page query',file:'js/services/attendance.service.js',test:'tools/a9r15/history.emulator.mjs',change:text=>text.replace("where('historyAuthority','==',HISTORY_AUTHORITY),where('branch'","where('branch'"),expectedFailure:/FAIL CS1-only Coach: exact runtime first page/},
 {id:'NC4',name:'Remove history page stale-session defenses',file:'js/services/attendance.service.js',test:'tools/a9r15/history.emulator.mjs',change:text=>{
   const a=text.indexOf('        if (options.page === true) {'),b=text.indexOf('        const baseConstraints = [',a);assert(a>0&&b>a);
   let block=text.slice(a,b);block=block.replace('const ensureCurrent = _bulkWriteContextGuard(db,clubId);','const ensureCurrent = () => {};');
   block=block.split('\n').map(line=>line.includes('if (scope !== JSON.stringify(')?'            // MUTANT: stale context validation intentionally removed.':line).join('\n');
   return text.slice(0,a)+block+text.slice(b);
  },expectedFailure:/FAIL A late response is rejected after/},
 {id:'NC5',name:'Grant Coach Finance read in mutant Rules',file:'firestore.rules',test:'tools/a9r15/history.emulator.mjs',change:text=>text.replace('match /clubs/{clubId} {','match /clubs/{clubId} {\n      match /transactions/{mutantDoc} { allow read: if isCoach(clubId); }'),expectedFailure:/FAIL Coach Finance read remains DENY/}
];
try{
 for(const mutant of mutations){
  const folder=path.join(scratch,mutant.id);fs.cpSync(root,folder,{recursive:true,filter:source=>!['node_modules','.git','evidence'].includes(path.basename(source))});fs.symlinkSync(path.resolve(root,'node_modules'),path.join(folder,'node_modules'),'dir');
  const original=read(mutant.file),modified=mutant.change(original);assert.notEqual(modified,original,'Mutation must actually change the target');fs.writeFileSync(path.join(folder,mutant.file),modified);
  const command=spawnSync(process.execPath,[mutant.test],{cwd:folder,env:process.env,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
  const output=(command.stdout||'')+(command.stderr||'');fs.writeFileSync(path.join(out,mutant.id+'.log'),output);
  const detected=command.status!==0&&command.status!==null&&mutant.expectedFailure.test(output);
  const details={id:mutant.id,name:mutant.name,classification:detected?'PASS':'FAIL_TEST_HARNESS',mutantTestExitCode:command.status,behavioralFailureMatched:mutant.expectedFailure.test(output),mutatedFile:mutant.file,originalSHA256:sha(original),mutantSHA256:sha(modified),originalRuntimeUntouched:true};results.push(details);console.log(detected?'CAUGHT':'MISSED',mutant.id,mutant.name);
 }
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
assert.equal(verifyRuntimeProfile(root).identity.runtimeSHA256,identity.runtimeSHA256);
fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify({classification:results.every(r=>r.classification==='PASS')?'PASS':'FAIL_TEST_HARNESS',runtimeSHA256:identity.runtimeSHA256,scope:'Five independent behavioral mutations in disposable copies, not production/runtime changes',results},null,2));if(results.some(r=>r.classification!=='PASS'))process.exitCode=1;
