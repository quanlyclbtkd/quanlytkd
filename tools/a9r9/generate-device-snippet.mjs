// Generate a self-contained, owner-reviewed console snippet for STAGING only.
// This does not connect to Firebase, and must not be run on production.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const valid=s=>typeof s==='string'&&s.length>0;
export function generate(input){
 if(!valid(input?.projectId)||input.projectId==='quanly-tst'||!valid(input.clubId)||!/^https:\/\//.test(input.expectedOrigin)||input.environment!=='staging')throw Error('STAGING_SCOPE_REQUIRED');
 const source=fs.readFileSync(new URL('./legacy-queue-readonly.mjs',import.meta.url),'utf8');
 return `(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(source)}],{type:'text/javascript'}));try{const mod=await import(url);const result=await mod.inspectLegacyQueue(${JSON.stringify(input)});const file=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=file;a.download='a9r9-legacy-queue-inventory.json';a.click();setTimeout(()=>URL.revokeObjectURL(file),30000);console.info('A9R9 local queue inventory',result.content.state,result.content.rowCount);return 'LOCAL_READONLY_CAPTURED';}finally{URL.revokeObjectURL(url)}})();\n`;
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){try{const [i,o]=process.argv.slice(2);fs.writeFileSync(o,generate(JSON.parse(fs.readFileSync(i))),{flag:'wx',mode:0o600});console.log('Generated STAGING-only read-only snippet, not executed.');}catch(e){console.error(e.message);process.exitCode=1}}
