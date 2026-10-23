/** Offline assertion: original A9R5 suite had dependent fixtures and an unreachable repair function. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const previous=fs.readFileSync('tools/a9r5/coach-auth-firestore-emulator.test.mjs','utf8');
const updated=fs.readFileSync('tools/a9r5/coach-auth-firestore-isolated.test.mjs','utf8');
const runtime=fs.readFileSync('js/core/coachBranchRuntimeRepair.js','utf8');
let pass=0;
function t(label,fn){fn();console.log('PASS',label);pass++}
t('Original repair test called non-exported window function',()=>{
 assert(previous.includes('await win.repairCoachMirror(coachUid)'));
 assert(!runtime.includes('global.repairCoachMirror=')&&!runtime.includes('repairCoachMirror,'+'resolveAuthContext'));
});
t('New repair path binds actual list button instead of private function',()=>{
 assert(updated.includes('await mount.win.loadCoachAccounts()'));
 assert(updated.includes('await mount.repairButton.onclick()'));
 assert(!updated.includes('await win.repairCoachMirror('));
});
t('Original shared UID caused cascade; new scenarios independently seed identity',()=>{
 assert(previous.includes("let coachUid='';"));
 for (const marker of ["fixtureCoach('login')","fixtureCoach('revoke')","fixtureCoach('repair')","fixtureCoach('replay')"])
  assert(updated.includes(marker),`Missing independent fixture ${marker}`);
});
t('New suite verifies actual login context, CAS epoch and never changes Rules',()=>{
 for (const marker of ['resolveAuthContext','epoch+1','assignmentPreviousVersion','assert.rejects','assert.deepEqual','Rules source was modified'])
  assert(updated.includes(marker),`Expected validation: ${marker}`);
 assert(updated.includes('rulesSha256'));
});
t('New suite guards demo Auth and Firestore hosts, provides safe phase diagnostics',()=>{
 assert(updated.includes('Both emulators must use 127.0.0.1'));
 assert(updated.includes('STOP: wrong demo project'));
 assert(updated.includes('FIXTURE_ADMIN_RESTORE_FAILED'));
 assert(updated.includes('FAIL_DETAIL'));
});
console.log(`A9R5R1 HARNESS REGRESSION ${pass}/5 PASS (static checks, not Emulator acceptance)`);
