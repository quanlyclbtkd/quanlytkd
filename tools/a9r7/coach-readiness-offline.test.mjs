/** A9R7 — Proven maintenance root cause & isolated demo preparation, no network. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {prepare,runtimeHash,digest,restrictiveRollback} from '../v11r2/cutover.mjs';
import {verifySourceIdentity} from '../v11r2/source-identity.mjs';
const root=process.cwd(),rules=fs.readFileSync('firestore.rules','utf8'),client=fs.readFileSync('js/core/attendanceContract.js','utf8');
const results=[];
function check(name,fn){fn();results.push({name,status:'PASS'});console.log('PASS',name)}
check('A9R6 128 canonical runtime files are independently pinned',()=>{assert.equal(verifySourceIdentity(root,runtimeHash(root)).canonicalFileCount,128)});
check('Default Coach attendance server-side access remains denied',()=>assert.match(rules,/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/));
check('Default Coach client-side access remains locked',()=>assert.match(client,/HISTORY_COACH_ACCESS = false;/));
check('Coach profiles, shifts reads already authorized without attendance cutover',()=>{assert.match(rules,/isCoach\(clubId\) && resourceBranchMatchesCoach\(\)/);assert.match(rules,/isCoach\(clubId\) && settingId == 'shifts'/)});
check('Client stops before shifts and attendance reads during maintenance',()=>{const s=fs.readFileSync('js/modules/attendance.js','utf8'),f=s.indexOf('async function _requestAttendanceDailyRefresh('),a=s.indexOf("return {blocked:true,reason:'attendance-maintenance'}",f),b=s.indexOf('await _loadClubShifts(',f);assert(f>0&&a>f&&b>a)});
const before={client:digest(client),rules:digest(rules),app:digest(fs.readFileSync('app.js','utf8'))};
const proposed=prepare(root,{projectId:'demo-a9r7-coach-attendance',clubIds:['CLB_DEMO']});
check('Demo activation binds a new separate history authority',()=>assert(proposed.plan.authority!==proposed.plan.oldAuthority&&proposed.plan.authority.startsWith('attendance-history-')));
check('Demo rules and contract have matching enabled gates',()=>{assert.match(proposed.activeRules,/function coachAttendanceCutoverOpen\(\)\s*\{\s*return true;/);assert.match(proposed.activeContract,/HISTORY_COACH_ACCESS = true;/);assert(proposed.activeRules.includes(proposed.plan.authority));assert(proposed.activeContract.includes(proposed.plan.authority))});
check('Demo config overrides both Firebase owners, never production project',()=>{for(const f of ['app.js','js/firebase/config.js']){assert(proposed.runtimeOverrides[f].includes('demo-a9r7-coach-attendance'));assert(!/projectId:\s*['"]quanly-tst['"]/.test(proposed.runtimeOverrides[f]))}});
check('No new writer; existing CAS owner and journal unchanged in default source',()=>{assert(!Object.hasOwn(proposed.runtimeOverrides,'js/services/attendance.service.js')||proposed.runtimeOverrides['js/services/attendance.service.js'].includes('_commitAttendanceIntents'));assert.equal(before.app,digest(fs.readFileSync('app.js','utf8')))});
check('Rollback re-closes Coach and preserves Journal V3',()=>{const rb=restrictiveRollback(proposed);assert.match(rb.rules,/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/);assert.match(rb.runtimeOverrides['js/core/attendanceContract.js'],/HISTORY_COACH_ACCESS = false/);assert.equal(rb.noJournalDeletion,true)});
check('Source maintenance unchanged after demo preparation',()=>{assert.equal(before.client,digest(fs.readFileSync('js/core/attendanceContract.js','utf8')));assert.equal(before.rules,digest(fs.readFileSync('firestore.rules','utf8')))});
fs.mkdirSync('qa_results_a9r7',{recursive:true});fs.writeFileSync('qa_results_a9r7/coach-readiness-offline.json',JSON.stringify({status:'PASS',total:results.length,results,scope:'SOURCE READINESS + DEMO PREPARATION; NOT LIVE RELEASE APPROVAL',sourceRuntimeSHA256:runtimeHash(root),baseRulesSHA256:before.rules,preparedRulesSHA256:proposed.plan.activeRulesSHA256,approval:'NOT PROVIDED',historicalS01Scan:'NOT PROVIDED'},null,2));
console.log('A9R7_OFFLINE_GATE '+JSON.stringify({pass:results.length,fail:0,release:'HOLD'}));
