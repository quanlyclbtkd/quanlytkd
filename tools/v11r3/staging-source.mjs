// Produce an isolated TEST ONLY checkout using the two existing Firebase configuration owners.
// Does not create a Firebase project, deploy, log in, or change the input checkout.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {sha,requireProof as need,safeProject} from './proof.mjs';
import {verifySourceIdentity} from '../v11r2/source-identity.mjs';
import {runtimeHash} from '../v11r2/cutover.mjs';
import {rewriteCacheGraph,buildTag} from '../v11r2/import-graph.mjs';
const configBlock=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g;
export function firebaseProjectInSource(text){const blocks=text.match(configBlock)||[];need(blocks.length===1,'FIREBASE_CONFIG_OWNER_AMBIGUOUS');return blocks[0].match(/['"]?projectId['"]?\s*:\s*['"]([^'"]+)/)?.[1];}
export function rebindFirebaseConfig(text,config){firebaseProjectInSource(text);return text.replace(configBlock,'const firebaseConfig = '+JSON.stringify(config,null,4)+';');}
export function demoFirebaseConfig(projectId){need(projectId.startsWith('demo-'),'DEMO_PROJECT_REQUIRED');return {apiKey:'DEMO-NOT-A-REAL-API-KEY',authDomain:projectId+'.firebaseapp.com',projectId,storageBucket:projectId+'.firebasestorage.app',messagingSenderId:'111111111111',appId:'1:111111111111:web:0000000000000000000000'};}
export function stagingRuntimeOverrides(root,config,originals={}){
 safeProject(config.projectId);
 const required=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];need(required.every(k=>typeof config[k]==='string'&&config[k].trim()),'STAGING_WEB_CONFIG_INCOMPLETE');
 need(config.authDomain===config.projectId+'.firebaseapp.com'&&[config.projectId+'.firebasestorage.app',config.projectId+'.appspot.com'].includes(config.storageBucket),'STAGING_WEB_CONFIG_PROJECT_MISMATCH');
 need(Object.keys(config).every(k=>[...required,'measurementId'].includes(k)),'UNKNOWN_FIREBASE_CONFIG_FIELD');
 const text=file=>Object.hasOwn(originals,file)?originals[file]:fs.readFileSync(path.join(root,file),'utf8');
 const tag=buildTag(text('js/main.js')).tag+'-staging-'+sha(config).slice(0,12),initial={...originals};
 for(const file of ['app.js','js/firebase/config.js'])initial[file]=rebindFirebaseConfig(text(file),config);
 const rewritten=rewriteCacheGraph(root,initial,tag);
 return {tag,overrides:rewritten.overrides};
}
export function prepareStagingSource(root,config,target){
 root=path.resolve(root);target=path.resolve(target);
 need(target!==root&&!target.startsWith(root+path.sep)&&!fs.existsSync(target),'ISOLATED_NEW_OUTPUT_REQUIRED');
 const identity=verifySourceIdentity(root,runtimeHash(root));
 need(!identity.derivedFrom,'NESTED_STAGING_SOURCE_FORBIDDEN');
 const derived=stagingRuntimeOverrides(root,config),originals=Object.fromEntries(Object.keys(derived.overrides).map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
 fs.cpSync(root,target,{recursive:true,filter:f=>{const rel=path.relative(root,f);return !rel.split(path.sep).some(x=>['node_modules','public','__pycache__'].includes(x))&&!rel.startsWith('handoff'+path.sep+'V11R3')&&!f.endsWith('debug.log')}});
 for(const [file,text]of Object.entries(derived.overrides))fs.writeFileSync(path.join(target,file),text);
 // Original bytes are accepted only when they match the hard-pinned base manifest.
 // They let the existing verifier reproduce every permitted transformation offline.
 const report={kind:'ISOLATED_STAGING_SOURCE_NOT_DEPLOYED',projectId:config.projectId,environment:config.projectId.startsWith('demo-')?'demo':'staging',buildTag:derived.tag,baseRuntimeSHA256:identity.runtimeSHA256,config,originals,publicBuildRequired:true,configurationOwners:['app.js','js/firebase/config.js'],defaultSourceUnchanged:true,noNewInitializer:true,productionWrites:0};
 fs.writeFileSync(path.join(target,'STAGING_SOURCE_ONLY.json'),JSON.stringify(report,null,2));return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const [configFile,target]=process.argv.slice(2);console.log(JSON.stringify(prepareStagingSource(process.cwd(),JSON.parse(fs.readFileSync(configFile)),target)));}catch(e){console.error(e.code||'STAGING_SOURCE_BLOCKED',e.message);process.exitCode=1}}
