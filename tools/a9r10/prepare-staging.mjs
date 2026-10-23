// A9R10: create an isolated staging checkout. Never modifies the base checkout and never deploys.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {prepareStagingSource} from '../v11r3/staging-source.mjs';import {safeStagingProject,safeBaseURL,need,sha} from './common.mjs';
export function prepare(root,input,target){
 const projectId=safeStagingProject(input?.projectId);safeBaseURL(input?.stagingBaseURL);
 need(Array.isArray(input.clubIds)&&input.clubIds.length>0&&input.clubIds.length<=20&&new Set(input.clubIds).size===input.clubIds.length&&input.clubIds.every(x=>typeof x==='string'&&x&&!x.includes('/')),'CLUB_SCOPE_INVALID');
 need(input.webConfig?.projectId===projectId,'WEB_CONFIG_PROJECT_MISMATCH');
 const result=prepareStagingSource(root,input.webConfig,target);
 const manifest={phase:'A9R10',kind:'ISOLATED_STAGING_SOURCE_PREPARED_NOT_DEPLOYED',projectId,clubIds:[...input.clubIds].sort(),stagingBaseURL:input.stagingBaseURL,stagingSource:path.resolve(target),sourceReportSHA256:sha(result),createdAt:new Date().toISOString(),productionProjectForbidden:true,noDeploy:true,noFirestoreWrite:true};
 fs.writeFileSync(path.join(target,'A9R10_STAGING_PREPARED.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){try{const [inputFile,target]=process.argv.slice(2);if(!inputFile||!target)throw Error('USAGE: node tools/a9r10/prepare-staging.mjs input.json target-directory');const m=prepare(process.cwd(),JSON.parse(fs.readFileSync(inputFile)),target);console.log(JSON.stringify(m));}catch(e){console.error(e.code||e.message);process.exitCode=1}}
