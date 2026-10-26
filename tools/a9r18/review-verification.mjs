// Independent source verification. No application, SDK or business action runs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {parse} from '../v11r2/vendor/acorn.mjs';import {runtimeHash} from '../v11r2/cutover.mjs';import {verifySourceIdentity} from '../v11r2/source-identity.mjs';
const root=process.cwd(),read=f=>fs.readFileSync(path.join(root,f)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const identity=verifySourceIdentity(root,runtimeHash(root));
const manifest=JSON.parse(read(identity.manifest));const files=Object.keys(manifest.canonicalRuntimeFiles);
assert.equal(files.length,129);assert.equal(identity.runtimeSHA256,'5070162c1d4310bc6c75b515d6adda1d33c939057f7e8c6353292562ac505d10');
const pins={'app.js':'110108bf2439863e3df2278ac2294affca69dd344c3477227d2de8e3fd1b85a4','js/main.js':'670c4fe634a249a0ce7507ab711bb70dd397d735973039c8442095885a3da513','firestore.rules':'1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3','firestore.indexes.json':'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2'};
for(const[f,h]of Object.entries(pins))assert.equal(sha(read(f)),h,f);
const normalize=x=>!x||typeof x!=='object'?x:Array.isArray(x)?x.map(normalize):Object.fromEntries(Object.entries(x).filter(([k])=>!['start','end','loc','range','raw'].includes(k)).map(([k,v])=>[k,normalize(v)]));
const parsed=new Map(),syntax=[],sdkSites=[];let functionCount=0;
for(const f of files){assert.equal(sha(read(f)),manifest.canonicalRuntimeFiles[f]);assert.equal(sha(read('public/'+f)),manifest.canonicalRuntimeFiles[f]);if(!f.endsWith('.js'))continue;
 const source=read(f).toString();let ast,sourceType=f==='app.js'?'script':'module';try{ast=parse(source,{ecmaVersion:'latest',sourceType,locations:true});}catch(e){if(sourceType!=='module')throw e;sourceType='script';ast=parse(source,{ecmaVersion:'latest',sourceType,locations:true});}
 const functions=[];const visit=n=>{if(!n?.type)return;if(/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)){functionCount++;functions.push({normalizedASTSHA256:sha(JSON.stringify(normalize(n))),bodySHA256:sha(JSON.stringify(normalize(n.body)))});}if(n.type==='CallExpression'){const c=n.callee,name=c.type==='Identifier'?c.name:c.type==='MemberExpression'&&!c.computed?c.property.name:'';if(['getDoc','getDocs','onSnapshot','addDoc','setDoc','updateDoc','deleteDoc','writeBatch','runTransaction'].includes(name))sdkSites.push({file:f,line:n.loc.start.line,operation:name});}for(const[k,v]of Object.entries(n))if(!['start','end','loc'].includes(k)){if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}};visit(ast);parsed.set(f,{source,functions});syntax.push({file:f,sourceType,status:'PASS'});
}
// Optional whole protected-body proof from the immutable handoff audit.
const fpPath=process.env.A9R18_PROTECTED_MANIFEST||path.resolve(root,'../audit/A0R2/audit/A9R18_A0R2_PROTECTED_FINGERPRINTS.json');let protectedProof=null;
if(fs.existsSync(fpPath)){
 const fp=JSON.parse(fs.readFileSync(fpPath));let count=0;
 for(const f of fp.fileHashes){assert.equal(sha(read(f.file)),f.sha256,f.file);const data=parsed.get(f.file);assert(data,'Protected file not inventoried: '+f.file);const bag=new Map();for(const x of data.functions){const k=x.normalizedASTSHA256+'|'+x.bodySHA256;bag.set(k,(bag.get(k)||0)+1);}for(const x of fp.symbols.filter(s=>s.sourceFile===f.file)){const k=x.normalizedASTSHA256+'|'+x.bodySHA256;assert((bag.get(k)||0)>0,'Protected body mismatch '+x.symbolIdentity);bag.set(k,bag.get(k)-1);count++;}}
 assert.equal(count,3398);assert.equal(fp.fileHashes.length,84);protectedProof={status:'PASS',symbols:count,files:fp.fileHashes.length};
}
const html=read('index.html').toString(),scripts=[];for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=/.test(m[1])||/type=["'](?:application\/json|importmap)/i.test(m[1]))continue;parse(m[2],{ecmaVersion:'latest',sourceType:/type=["']module/.test(m[1])?'module':'script'});scripts.push({index:scripts.length,status:'PASS'});}
JSON.parse(read('firestore.indexes.json'));
const result={status:'PASS',runtimeSHA256:identity.runtimeSHA256,canonicalRuntimeFiles:129,rootPublic:129,runtimeJSFilesParsed:syntax.length,functionCount,protectedProof,inlineBootstrapScripts:scripts.length,staticSDKCallSiteCount:sdkSites.length,staticSDKCallSites:sdkSites,syntax,scope:'Syntactic and identity verification of every canonical runtime asset; not a claim that every business path or generated markup is valid. Legacy ppOpenTransferSheet generated-handler finding remains separate.'};
if(process.env.A9R18_REVIEW_OUT){const p=path.resolve(process.env.A9R18_REVIEW_OUT);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({...result,syntax:undefined,staticSDKCallSites:undefined},null,2));
