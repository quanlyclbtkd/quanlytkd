// Run Emulator and acceptance in the same process/network namespace.
// Existing firebase.json is used unchanged. Never launch a non-demo project.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const root=process.cwd(),dir=path.resolve(process.env.INVENTORY_R11_OUTPUT||'evidence/INVENTORY_R1_1');
fs.mkdirSync(dir,{recursive:true});
const require=process.env.INVENTORY_R11_DEPENDENCY_ROOT?createRequire(path.resolve(process.env.INVENTORY_R11_DEPENDENCY_ROOT,'package.json')):createRequire(import.meta.url);
let cli;
try{cli=path.join(path.dirname(require.resolve('firebase-tools/package.json')),'lib/bin/firebase.js');}
catch(error){fs.writeFileSync(path.join(dir,'LAUNCHER.json'),JSON.stringify({classification:'BLOCKED_TEST_DEPENDENCY',missing:'Declared firebase-tools CLI',message:error.message},null,2));throw error;}
const args=[cli,'emulators:exec','--only','firestore','--project','demo-a9r18-inventory-r11','--config','firebase.json','--non-interactive','node tools/check-inventory-stock-emulator-r1-1.mjs'];
const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'},stdio:'inherit'});
for(const name of ['firebase-debug.log','firestore-debug.log'])if(fs.existsSync(path.join(root,name)))fs.renameSync(path.join(root,name),path.join(dir,name));
fs.writeFileSync(path.join(dir,'LAUNCHER.json'),JSON.stringify({command:[process.execPath,...args],project:'demo-a9r18-inventory-r11',config:'firebase.json unchanged',sameProcessNamespace:true,exitCode:r.status,error:r.error?.message||null},null,2)+'\n');
process.exitCode=r.status??1;
