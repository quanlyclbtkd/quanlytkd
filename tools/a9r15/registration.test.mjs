import fs from 'node:fs';import assert from 'node:assert/strict';
import {inspectTrainingRegistration as inspect,assertTrainingRegistration as validate,auditTrainingRegistrations,validateTrainingMutation} from '../../js/core/trainingRegistration.js';
import {StudentService} from '../../js/services/students.service.js';
const shifts=[{id:'S01',name:'Same label',branch:'CS1'},{id:'S02',name:'Same label',branch:'CS2'},{id:'U01',branch:''}];
const results=[],profiles={P001:{branch:'CS1',trainingShiftId:'S01',trainingDays:[1,3,5]},P002:{branch:'CS1',trainingShiftId:'S02',trainingDays:[2,4,6]},P003:{branch:'CS2',trainingShiftId:'OLD99'},P004:{branch:'CS1',trainingShiftId:'U01'},P005:{branch:'CS1',trainingDays:'2/4/6'},P006:{branch:'CS2',trainingShiftId:null,trainingDays:[]}};
const p=(extra={})=>({...profiles.P001,...extra});
function check(title,fn){try{fn();results.push({title,classification:'PASS'});console.log('PASS',title);}catch(e){results.push({title,classification:'FAIL_RUNTIME',message:e.stack});console.error('FAIL',title,e);}}
check('CS1 + CS1 stable shift ID passes',()=>assert.equal(validate(p(),shifts).result,'TRAINING_REGISTRATION_OK'));
check('CS1 + CS2 blocks with exact error code and useful branch message',()=>assert.throws(()=>validate(p({trainingShiftId:'S02'}),shifts),e=>e.code==='TRAINING_SHIFT_BRANCH_MISMATCH'&&e.message.includes('Cơ sở 1')&&e.message.includes('Cơ sở 2')));
check('CS2 + CS2 passes',()=>assert.equal(validate(p({branch:'CS2',trainingShiftId:'S02'}),shifts).result,'TRAINING_REGISTRATION_OK'));
check('Canonical branch compatibility is identical for CS1 through CS10',()=>{for(let n=1;n<=10;n++)validate(p({branch:'CS'+n,trainingShiftId:'ID'+n}),[{id:'ID'+n,branch:'CS'+n}]);});
check('Missing/deleted shift is SHIFT_NOT_FOUND',()=>assert.equal(inspect(p(),[]).result,'SHIFT_NOT_FOUND'));
check('Changed shift branch is a mismatch without rewriting profile',()=>{const data=p();assert.equal(inspect(data,[{id:'S01',branch:'CS2'}]).result,'SHIFT_BRANCH_MISMATCH');assert.equal(data.trainingShiftId,'S01');assert.equal(data.branch,'CS1');});
check('Forged ID never matches a label',()=>assert.throws(()=>validate(p({trainingShiftId:'Same label'}),shifts),e=>e.code==='SHIFT_NOT_FOUND'));
check('Missing, blank or null branch is unresolved, never global/CS1',()=>{for(const branch of [undefined,'',null])assert.equal(inspect(p({trainingShiftId:'U01'}),[{id:'U01',branch}]).result,'SHIFT_AUTHORITY_UNRESOLVED');});
check('No-shift optional contract remains for empty/null/missing values',()=>{for(const trainingShiftId of ['',null,undefined])assert.equal(validate(p({trainingShiftId}),shifts).result,'NO_SHIFT_ASSIGNED');});
check('Non-string shift ID cannot coerce into another registration',()=>assert.throws(()=>validate(p({trainingShiftId:1}),shifts),e=>e.code==='SHIFT_NOT_FOUND'));
check('Weekday 2/4/6, 3/5/7, one/multiple days, Sunday and blank keep JS 0..6 numbering',()=>{for(const trainingDays of [[1,3,5],[2,4,6],[3],[0,1,6],[],null,undefined])validate(p({trainingDays}),shifts);});
check('Legacy string days, string array items and out-of-range days block',()=>{for(const trainingDays of ['2/4/6',['1'],[-1],[7],{}])assert.throws(()=>validate(p({trainingDays}),shifts),e=>e.code==='TRAINING_DAYS_INVALID');});
check('Shift has no explicit days schema: no invented compatibility policy',()=>validate(p({trainingDays:[0]}),[{id:'S01',branch:'CS1'}]));
check('Reordering shifts never changes the mapping',()=>assert.deepEqual(inspect(p(),shifts),inspect(p(),shifts.slice().reverse())));
check('Duplicate shift IDs are unresolved, no first match fallback',()=>assert.equal(inspect(p(),[...shifts,{id:'S01',branch:'CS2'}]).result,'SHIFT_NOT_FOUND'));
let calls=0;
globalThis.window={__store:{clubId:'DEMO',db:{},profiles},__verifiedAuthContextState:{generation:1},_getClubShifts:()=>shifts,AttendanceModule:{getShiftAuthority:()=>({clubId:'DEMO',authGeneration:1,status:'ready'})},_fb_init:{doc:()=>({}),setDoc:()=>{calls++;},updateDoc:()=>{calls++;}}};
check('Canonical admission service blocks mismatch before preparing a write',()=>assert.throws(()=>StudentService.prepareProfileMutation('P001',p({trainingShiftId:'S02'})),e=>e.code==='TRAINING_SHIFT_BRANCH_MISMATCH'));
check('Direct patch guard validates merged canonical RAM profile',()=>assert.throws(()=>validateTrainingMutation('P001',{branch:'CS2'}),e=>e.code==='TRAINING_SHIFT_BRANCH_MISMATCH'));
check('A partial branch edit cannot assume absent registration when canonical profile is not loaded',()=>assert.throws(()=>validateTrainingMutation('NOT_LOADED',{branch:'CS2'}),e=>e.code==='TRAINING_REGISTRATION_PROFILE_UNAVAILABLE'));
check('Unrelated tuition/contact-only service patches are not newly blocked by audit',()=>validateTrainingMutation('P003',{phone:'synthetic'}));
check('Stale shift authority cannot be used for a registration mutation',()=>{window.__verifiedAuthContextState.generation=2;assert.throws(()=>validateTrainingMutation('P001',p()),e=>e.code==='SHIFT_AUTHORITY_UNRESOLVED');window.__verifiedAuthContextState.generation=1;});
for(const [title,operation] of [['updateProfile',()=>StudentService.updateProfile('P001',{trainingShiftId:'S02'})],['patchProfile',()=>StudentService.patchProfile('P001',{branch:'CS2'})],['createProfile',()=>StudentService.createProfile('NEW',p({trainingShiftId:'S02'}))]]){
 try{await assert.rejects(operation(),e=>e.code==='TRAINING_SHIFT_BRANCH_MISMATCH');results.push({title:'Existing '+title+' rejects invalid registration before SDK write',classification:'PASS'});}catch(e){results.push({title,classification:'FAIL_RUNTIME',message:e.stack});}
}
check('All invalid direct writer paths emitted zero writes',()=>assert.equal(calls,0));
const beforeAudit=JSON.stringify(profiles);
const audit=auditTrainingRegistrations(profiles,shifts);
check('Read-only pseudonymous audit classifies all six outcomes',()=>{assert.equal(new Set(audit.map(r=>r.result)).size,6);assert(!JSON.stringify(audit).includes('Same label'));assert.equal(JSON.stringify(profiles),beforeAudit);});
const report={kind:'A9R15_TRAINING_REGISTRATION_AUDIT',classification:results.some(r=>r.classification!=='PASS')?'FAIL_RUNTIME':'PASS',scope:'synthetic fixtures + runtime RAM audit tool; no production profile export supplied',productionAudit:{classification:'ENV_BLOCKED',reason:'No authorized production export/current profile dataset supplied; no production reads or writes performed',complete:false},contract:{profiles:'clubs/{clubId}/profiles/{immutableProfileId}',shifts:'clubs/{clubId}/settings/shifts.list',identity:'shift.id',weekdayNumbering:'0=Sunday,1..6=Monday..Saturday',optionalShift:true,blankDays:'unrestricted days, inherited',sharedShiftSchema:false},rows:audit,results};
fs.mkdirSync('evidence/A9R15',{recursive:true});fs.writeFileSync('evidence/A9R15/A9R15_TRAINING_REGISTRATION_AUDIT.json',JSON.stringify(report,null,2));console.log('RESULT',report.classification,results.length);if(report.classification!=='PASS')process.exitCode=1;
