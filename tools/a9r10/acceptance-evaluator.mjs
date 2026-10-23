// Manual staging UI acceptance evaluator. Never logs in, clicks, writes Firestore or changes release state.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {safeStagingProject,safeBaseURL,need,simple,sha} from './common.mjs';
export const REQUIRED_CASES=[
 'coach_login','select_cs1','shifts_cs1','roster_cs1_scoped','attendance_create_cs1','sync_ack_cs1','relogin_verify_cs1',
 'select_cs2','shifts_cs2','roster_cs2_scoped','attendance_create_cs2','sync_ack_cs2','relogin_verify_cs2',
 'deny_unassigned_branch','deny_finance','duplicate_intent_no_duplicate','offline_online_recovery','no_critical_console_errors'
];
export function evaluate(input){
 const issues=[];const add=code=>issues.push(code);let projectId;
 try{projectId=safeStagingProject(input?.projectId);safeBaseURL(input?.stagingBaseURL);}catch(e){add(e.code||e.message)}
 if(input?.environment!=='staging')add('ENVIRONMENT_NOT_STAGING');if(input?.evidenceClosureStatus!=='STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE')add('DATA_GATES_NOT_CLOSED');
 if(!simple(input?.coachAlias||''))add('COACH_ALIAS_INVALID');if(!Array.isArray(input?.cases))add('CASES_MISSING');
 const by=new Map((input?.cases||[]).map(x=>[x.id,x]));for(const id of REQUIRED_CASES){const c=by.get(id);if(!c)add('MISSING_CASE:'+id);else if(c.status!=='PASS')add('CASE_NOT_PASS:'+id);else if(!Array.isArray(c.evidenceSHA256)||!c.evidenceSHA256.length||c.evidenceSHA256.some(x=>!/^[0-9a-f]{64}$/.test(x)))add('CASE_EVIDENCE_HASH_MISSING:'+id)}
 if((input?.cases||[]).some(c=>!REQUIRED_CASES.includes(c.id)))add('UNKNOWN_CASE_PRESENT');
 if(input?.productionWrites!==0)add('PRODUCTION_WRITE_NOT_ZERO');if(input?.financeWrites!==0)add('FINANCE_WRITE_NOT_ZERO');if(input?.attendanceWriterCount!==1)add('ATTENDANCE_WRITER_COUNT_NOT_ONE');
 const unique=[...new Set(issues)];const report={phase:'A9R10',kind:'COACH_STAGING_ACCEPTANCE',projectId:projectId||null,status:unique.length?'STAGING_ACCEPTANCE_HOLD':'STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE',releaseApproved:false,productionDeployApproved:false,requiredCaseCount:REQUIRED_CASES.length,issues:unique,reviewedAt:new Date().toISOString(),inputSHA256:sha(input)};return report;
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){try{const [inFile,outFile]=process.argv.slice(2);if(!inFile||!outFile)throw Error('USAGE: node tools/a9r10/acceptance-evaluator.mjs input.json output.json');const report=evaluate(JSON.parse(fs.readFileSync(inFile)));fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(report.status,JSON.stringify(report.issues));if(report.status!=='STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE')process.exitCode=2;}catch(e){console.error(e.code||e.message);process.exitCode=1}}
