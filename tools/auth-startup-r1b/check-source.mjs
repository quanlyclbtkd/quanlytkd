import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(process.argv[2]||process.cwd());
const output=path.join(root,'evidence/AUTH_STARTUP_R1B/SOURCE_FREEZE.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const expectedManifestSHA256='889b03f494ff213747a1f2a0b5eb8b2cf09d90051936c0fc62639ee135deac33';
const raw=fs.readFileSync(path.join(root,'evidence/AUTH_STARTUP_R1B/INPUT_SOURCE_SHA256.json'));
if(sha(raw)!==expectedManifestSHA256)throw Error('INPUT_FREEZE_MANIFEST_MISMATCH');
const original=JSON.parse(raw);
if(Object.keys(original).length!==1997)throw Error('INPUT_SOURCE_FILE_COUNT_MISMATCH');
const changed=Object.entries(original).filter(([f,h])=>!fs.existsSync(path.join(root,f))||sha(fs.readFileSync(path.join(root,f)))!==h).map(([f])=>f);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const added=walk(root).map(p=>path.relative(root,p).split(path.sep).join('/')).filter(f=>!Object.hasOwn(original,f));
const illegalAdditions=added.filter(f=>!f.startsWith('tools/auth-startup-r1b/')&&!f.startsWith('evidence/AUTH_STARTUP_R1B/'));
const pin=JSON.parse(fs.readFileSync(path.join(root,'tools/auth-startup-r1a/SOURCE_MANIFEST.json'),'utf8'));
const mirrorMismatches=Object.entries(pin.canonicalRuntimeFiles).filter(([f,h])=>sha(fs.readFileSync(path.join(root,f)))!==h||sha(fs.readFileSync(path.join(root,'public',f)))!==h).map(([f])=>f);
const patterns={getDoc:/(?<![A-Za-z0-9_$])(?:getDoc|_getDoc|fbGetDoc)\s*\(/g,getDocs:/(?<![A-Za-z0-9_$])(?:getDocs|_getDocs|fbGetDocs|_pG4k)\s*\(/g,onSnapshot:/(?<![A-Za-z0-9_$])(?:onSnapshot|fbOnSnapshot)\s*\(/g};
const counts={getDoc:0,getDocs:0,onSnapshot:0};
const runtimeWalk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['migrations','diagnostics'].includes(e.name)?[]:runtimeWalk(path.join(dir,e.name))):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);
for(const file of [path.join(root,'app.js'),...runtimeWalk(path.join(root,'js'))])for(const line of fs.readFileSync(file,'utf8').split('\n')){
  const text=line.trim();if(text.startsWith('//')||text.startsWith('*')||text.startsWith('/*'))continue;
  for(const [key,re] of Object.entries(patterns)){re.lastIndex=0;if(re.test(line))counts[key]++;}
}
const budgetOk=counts.getDoc===24&&counts.getDocs===43&&counts.onSnapshot===16;
const result={kind:'OFFLINE_R1B_SOURCE_FREEZE_ONLY',status:!changed.length&&!illegalAdditions.length&&!mirrorMismatches.length&&budgetOk?'PASS':'FAIL',inputZIP_SHA256:'b51972344247cdbf087c8160e6dfc42e582f14badcbe1f3e75d434c937f0796f',originalFiles:1997,unchangedOriginalFiles:1997-changed.length,changedOriginalFiles:changed,addedFiles:added,illegalAdditions,rootPublic:{root:129,public:129,mismatches:mirrorMismatches},firestoreBudget:counts,realBrowserAcceptance:false};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,unchangedOriginalFiles:result.unchangedOriginalFiles,changedOriginalFiles:changed,illegalAdditions,mirrorMismatchCount:mirrorMismatches.length,firestoreBudget:counts},null,2));
if(result.status!=='PASS')process.exitCode=1;
