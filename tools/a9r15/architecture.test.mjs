import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {verifyRuntimeProfile} from '../v11r2/runtime-profile.mjs';import {parse} from '../v11r2/vendor/acorn.mjs';
const root=process.cwd(),profile=verifyRuntimeProfile(root),read=f=>fs.readFileSync(path.join(root,f),'utf8'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const parent=JSON.parse(read('tools/v11r2/manifests/V11R6_A9R14_QA_MOBILE.json')),current=JSON.parse(read(profile.identity.manifest));
const changedBehavior=new Set(['index.html','css/ui-mobile-shell.css','js/core/trainingRegistration.js','js/modules/students.js','js/services/students.service.js','js/modules/attendance.js','js/services/attendance.service.js']);
const oldTag='qr-v11r6-a9r14-qa-mobile-20261025';
const normalized=text=>text.replaceAll(profile.identity.buildTag,oldTag);
const results=[];
function check(title,fn){try{fn();results.push({title,classification:'PASS'});console.log('PASS',title);}catch(e){results.push({title,classification:'FAIL_RUNTIME',message:e.message});console.error('FAIL',title,e.message);}}
const parity=Object.entries(current.canonicalRuntimeFiles).map(([file,hash])=>({file,sha256:hash,publicSHA256:sha(fs.readFileSync(path.join(root,'public',file))),match:hash===sha(fs.readFileSync(path.join(root,'public',file)))}));
check('All 129 pinned runtime assets match root/public',()=>{assert.equal(parity.length,129);assert(parity.every(r=>r.match));});
check('Rules and indexes are byte-identical to the required A9R14 baseline',()=>{assert.equal(sha(read('firestore.rules')),parent.rulesSHA256);assert.equal(sha(read('firestore.indexes.json')),parent.indexesSHA256);});
check('History authority, Coach gate and Journal V4 contract are byte-identical after token normalization',()=>assert.equal(sha(normalized(read('js/core/attendanceContract.js'))),parent.canonicalRuntimeFiles['js/core/attendanceContract.js']));
check('Journal owner has no executable change',()=>assert.equal(sha(normalized(read('js/data/attendanceJournal.js'))),parent.canonicalRuntimeFiles['js/data/attendanceJournal.js']));
check('Finance, QR, SuperAdmin, assignment, CAS command owners and all unrelated runtime files are unchanged except cache URLs',()=>{
 for(const [file,hash] of Object.entries(parent.canonicalRuntimeFiles))if(!changedBehavior.has(file))assert.equal(sha(normalized(read(file))),hash,file);
});
check('app.js remains within original ceilings and byte-identical',()=>{assert.equal(sha(read('app.js')),parent.canonicalRuntimeFiles['app.js']);assert(Buffer.byteLength(read('app.js'))<=700000);assert(read('app.js').split('\n').length<=11300);});
check('All JavaScript assets parse',()=>{for(const file of Object.keys(current.canonicalRuntimeFiles).filter(f=>f.endsWith('.js')))parse(read(file),{ecmaVersion:'latest',sourceType:file==='app.js'?'script':'module'});});
check('No parallel Attendance service/writer or history listener',()=>{
 const service=read('js/services/attendance.service.js'),attendance=read('js/modules/attendance.js'),registration=read('js/core/trainingRegistration.js');
 assert.equal((service.match(/async function _commitAttendanceIntents\(/g)||[]).length,1);
 assert.equal((service.match(/async loadMemberHistory\(/g)||[]).length,1);
 assert(!/onSnapshot\s*\(|setInterval\s*\(/.test(service+attendance));assert(!/getDoc(?:s)?\s*\(|setDoc\s*\(|updateDoc\s*\(/.test(registration));
 for(const label of ['intent-version-read','legacyCollisionPossible','docId','role','branch'])assert(service.includes(label));
});
const counts=Object.fromEntries(['getDoc','getDocs','onSnapshot'].map(name=>[name,Object.keys(current.canonicalRuntimeFiles).filter(f=>f.endsWith('.js')).reduce((n,f)=>n+(read(f).match(new RegExp('\\b'+name+'\\s*\\(','g'))||[]).length,0)]));
check('Static getDoc/listener counts do not increase; one bounded getDocs call is added inside the existing owner',()=>{assert.deepEqual(counts,{getDoc:24,getDocs:58,onSnapshot:35});});
const report={classification:results.every(r=>r.classification==='PASS')?'PASS':'FAIL_RUNTIME',runtimeSHA256:profile.identity.runtimeSHA256,buildTag:profile.identity.buildTag,canonicalFileCount:129,results,sdkStaticCounts:counts};
fs.mkdirSync('evidence/A9R15',{recursive:true});fs.writeFileSync('evidence/A9R15/ARCHITECTURE.json',JSON.stringify(report,null,2));fs.writeFileSync('evidence/A9R15/A9R15_ROOT_PUBLIC_PARITY.json',JSON.stringify({classification:parity.every(r=>r.match)?'PASS':'FAIL_RUNTIME',fileCount:parity.length,runtimeSHA256:profile.identity.runtimeSHA256,files:parity},null,2));if(report.classification!=='PASS')process.exitCode=1;
