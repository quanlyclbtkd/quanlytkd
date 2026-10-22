// Produce an isolated TEST ONLY checkout using the two existing Firebase configuration owners.
// Does not create a Firebase project, deploy, log in, or change the input checkout.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {sha,requireProof as need,safeProject} from './proof.mjs';
const configBlock=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g;
export function firebaseProjectInSource(text){const blocks=text.match(configBlock)||[];need(blocks.length===1,'FIREBASE_CONFIG_OWNER_AMBIGUOUS');return blocks[0].match(/['"]?projectId['"]?\s*:\s*['"]([^'"]+)/)?.[1];}
export function rebindFirebaseConfig(text,config){firebaseProjectInSource(text);return text.replace(configBlock,'const firebaseConfig = '+JSON.stringify(config,null,4)+';');}
export function demoFirebaseConfig(projectId){need(projectId.startsWith('demo-'),'DEMO_PROJECT_REQUIRED');return {apiKey:'DEMO-NOT-A-REAL-API-KEY',authDomain:projectId+'.firebaseapp.com',projectId,storageBucket:projectId+'.firebasestorage.app',messagingSenderId:'111111111111',appId:'1:111111111111:web:0000000000000000000000'};}
export function prepareStagingSource(root,config,target){
 root=path.resolve(root);target=path.resolve(target);safeProject(config.projectId);
 need(target!==root&&!target.startsWith(root+path.sep)&&!fs.existsSync(target),'ISOLATED_NEW_OUTPUT_REQUIRED');
 const required=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];need(required.every(k=>typeof config[k]==='string'&&config[k].trim()),'STAGING_WEB_CONFIG_INCOMPLETE');
 need(config.authDomain===config.projectId+'.firebaseapp.com'&&[config.projectId+'.firebasestorage.app',config.projectId+'.appspot.com'].includes(config.storageBucket),'STAGING_WEB_CONFIG_PROJECT_MISMATCH');
 need(Object.keys(config).every(k=>[...required,'measurementId'].includes(k)),'UNKNOWN_FIREBASE_CONFIG_FIELD');
 const tag='qr-v11r2-cutover-20261021-'+sha(config).slice(0,12),beforeTag=fs.readFileSync(path.join(root,'js/main.js'),'utf8').match(/window\.APP_BUILD_VERSION\s*=\s*'([^']+)'/)?.[1];need(beforeTag,'BUILD_TAG_NOT_FOUND');
 fs.cpSync(root,target,{recursive:true,filter:f=>{const rel=path.relative(root,f);return !rel.split(path.sep).some(x=>['node_modules','public','__pycache__'].includes(x))&&!rel.startsWith('handoff'+path.sep+'V11R3')&&!f.endsWith('debug.log')}});
 for(const file of ['app.js','js/firebase/config.js'])fs.writeFileSync(path.join(target,file),rebindFirebaseConfig(fs.readFileSync(path.join(root,file),'utf8'),config));
 for(const file of ['index.html','js/main.js','js/modules/attendance.js','js/services/attendance.service.js','js/modules/reports/reportExportFacade.js','js/modules/reports/attendanceExcelReport.js']){
  let text=fs.readFileSync(path.join(target,file),'utf8').replaceAll(beforeTag,tag);
  if(file==='index.html'){let matches=0;text=text.replace(/(<script\s+defer\s+src=")app\.js\?v=[^"]+("[^>]*>)/g,(_,a,b)=>{matches++;return a+'app.js?v='+tag+b});need(matches===1,'LEGACY_APP_SCRIPT_NOT_UNIQUE');}
  if(file==='js/main.js'){let matches=0;text=text.replace(/from '\.\/firebase\/config\.js(?:\?v=[^']*)?'/g,()=>{matches++;return "from './firebase/config.js?v="+tag+"'"});need(matches===1,'MODULAR_CONFIG_IMPORT_NOT_UNIQUE');}
  fs.writeFileSync(path.join(target,file),text);
 }
 const report={kind:'ISOLATED_STAGING_SOURCE_NOT_DEPLOYED',projectId:config.projectId,environment:config.projectId.startsWith('demo-')?'demo':'staging',buildTag:tag,publicBuildRequired:true,configurationOwners:['app.js','js/firebase/config.js'],defaultSourceUnchanged:true,noNewInitializer:true,productionWrites:0};
 fs.writeFileSync(path.join(target,'STAGING_SOURCE_ONLY.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const [configFile,target]=process.argv.slice(2);console.log(JSON.stringify(prepareStagingSource(process.cwd(),JSON.parse(fs.readFileSync(configFile)),target)));}catch(e){console.error(e.code||'STAGING_SOURCE_BLOCKED',e.message);process.exitCode=1}}
