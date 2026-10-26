import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {classifyShiftScope,shiftAuthority,resolveTrainingShift,isShiftEligibleForBranch,inspectTrainingRegistration,auditTrainingRegistrations} from '../../js/core/trainingRegistration.js';
const rows=[],shifts=[{id:'G1',branch:'',name:'Ca Chiều',timeStart:'17:15',timeEnd:'18:45'},{id:'S1',branch:'CS1'},{id:'S2',branch:'CS2'}];
function check(id,title,fn){fn();rows.push({id,title,status:'PASS'});console.log('PASS',id,title);}
check('S09','Stored legacy-global registration valid across CS1..CS10',()=>{for(let n=1;n<=10;n++)assert.equal(inspectTrainingRegistration({branch:'CS'+n,trainingShiftId:'G1',trainingDays:[1,3,5]},shifts).result,'TRAINING_REGISTRATION_OK');});
check('S10','Explicit cross-branch registration stays mismatched',()=>assert.equal(inspectTrainingRegistration({branch:'CS1',trainingShiftId:'S2'},shifts).result,'SHIFT_BRANCH_MISMATCH'));
check('S11','Invalid non-empty branch is never global',()=>{for(const branch of ['ABC','CS99','unknown',0,false]){assert.equal(classifyShiftScope({id:'BAD',branch}).resolved,false);assert.equal(inspectTrainingRegistration({branch:'CS1',trainingShiftId:'BAD'},[{id:'BAD',branch}]).result,'SHIFT_AUTHORITY_UNRESOLVED');}});
check('S12','Strict new-write branch authority remains false for blank/missing/null',()=>{for(const branch of ['',undefined,null,' '])assert.equal(shiftAuthority({branch}).resolved,false);});
check('S13','Strict new-write branch authority accepts CS1..CS10',()=>{for(let n=1;n<=10;n++)assert.equal(shiftAuthority({branch:'CS'+n}).resolved,true);});
check('S09-missing','Historical missing/null/whitespace branch is read-compatible',()=>{for(const branch of [undefined,null,' '])assert.equal(classifyShiftScope({id:'G1',branch}).scope,'LEGACY_GLOBAL');});
check('S07-unknown','Missing Coach/profile branch cannot use global as an ACL fallback',()=>{for(const branch of ['',null,'ABC','CS99'])assert.equal(isShiftEligibleForBranch(shifts[0],branch),false);});
check('ID01','Duplicate IDs never resolve by array order',()=>{const dup=[...shifts,{id:'G1',branch:'CS2'}];assert.equal(resolveTrainingShift('G1',dup),null);assert.equal(inspectTrainingRegistration({branch:'CS1',trainingShiftId:'G1'},dup).result,'SHIFT_NOT_FOUND');});
check('ID02','No label/index/number coercion into shift identity',()=>{for(const id of ['Ca Chiều','0',0])assert.equal(resolveTrainingShift(id,shifts),null);});
check('ID03','Reordering does not remap a registration',()=>assert.deepEqual(inspectTrainingRegistration({branch:'CS1',trainingShiftId:'G1'},shifts),inspectTrainingRegistration({branch:'CS1',trainingShiftId:'G1'},[...shifts].reverse())));
check('DAYS','All existing day/optional-shift policies remain',()=>{assert.equal(inspectTrainingRegistration({branch:'CS1',trainingShiftId:'G1',trainingDays:'2/4/6'},shifts).result,'TRAINING_DAYS_INVALID');assert.equal(inspectTrainingRegistration({branch:'CS1',trainingShiftId:null,trainingDays:[]},shifts).result,'NO_SHIFT_ASSIGNED');});
check('S15','Read-only scope/audit never rewrites stored shifts',()=>{const before=JSON.stringify(shifts);auditTrainingRegistrations({P_A:{branch:'CS1',trainingShiftId:'G1'},P_B:{branch:'CS2',trainingShiftId:'G1'}},shifts);assert.equal(JSON.stringify(shifts),before);});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
check('S18','Rules and indexes exactly match the required hashes',()=>{assert.equal(sha('firestore.rules'),'1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3');assert.equal(sha('firestore.indexes.json'),'72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2');});
const root=process.cwd(),parent=process.env.R3_PARENT_ROOT||path.resolve('../baseline'),files=Object.keys(JSON.parse(fs.readFileSync('tools/v11r2/manifests/V11R6_A9R16A_R2_SEQUENTIAL.json')).canonicalRuntimeFiles).filter(f=>f.endsWith('.js'));
const count=base=>Object.fromEntries(['getDoc','getDocs','onSnapshot'].map(name=>[name,files.reduce((n,f)=>n+(fs.readFileSync(path.join(base,f),'utf8').match(new RegExp('\\b'+name+'\\s*\\(','g'))||[]).length,0)]));
check('S16','No added runtime reader call sites',()=>{const a=count(parent),b=count(root);assert.equal(a.getDoc,b.getDoc);assert.equal(a.getDocs,b.getDocs);});
check('S17','No added runtime listener call sites',()=>assert.equal(count(root).onSnapshot,count(parent).onSnapshot));
const report={status:'PASS',rows,staticBefore:count(parent),staticAfter:count(root),scopeAudit:shifts.map(s=>({shiftId:s.id,...classifyShiftScope(s)}))};
if(process.env.R3_EVIDENCE_ROOT){fs.mkdirSync(process.env.R3_EVIDENCE_ROOT,{recursive:true});fs.writeFileSync(path.join(process.env.R3_EVIDENCE_ROOT,'SHIFT_PURE_MATRIX.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
