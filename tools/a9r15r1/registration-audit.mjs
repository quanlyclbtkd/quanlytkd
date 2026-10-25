// Offline, read-only dataset audit using the canonical runtime contract.
// No Firebase SDK, auth, collection reader, listener or database write.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
globalThis.window ||= {};
await import('../../js/core/branchIdentity.js');
const {auditTrainingRegistrations}=await import('../../js/core/trainingRegistration.js');
const categories=['TRAINING_REGISTRATION_OK','NO_SHIFT_ASSIGNED','SHIFT_NOT_FOUND','SHIFT_BRANCH_MISMATCH','SHIFT_AUTHORITY_UNRESOLVED','TRAINING_DAYS_INVALID'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export function auditExport(data,{clubId,kind='user-export',inputSHA256=null}={}) {
    assert(clubId&&data.clubId===clubId,'EXPORT_CLUB_SCOPE_MISMATCH');
    assert(data.profiles&&typeof data.profiles==='object'&&!Array.isArray(data.profiles),'EXPORT_PROFILES_MAP_REQUIRED');
    assert(Array.isArray(data.shifts),'EXPORT_CANONICAL_SHIFTS_REQUIRED');
    const before=JSON.stringify(data),rows=auditTrainingRegistrations(data.profiles,data.shifts);
    const counts=Object.fromEntries(categories.map(category=>[category,rows.filter(row=>row.result===category).length]));
    assert.equal(JSON.stringify(data),before,'AUDIT_MUST_NOT_MUTATE_INPUT');
    return {classification:'PASS',kind,scope:'supplied dataset only',clubId,inputSHA256,totalProfiles:rows.length,...counts,reviewList:rows.filter(row=>row.issues.length),rows,
        completeness:{declaredComplete:data.complete===true,liveServerVerified:false,allExistingProfilesClean:kind==='fixture'?false:null},
        noDatabaseWrites:true,noNormalization:true,noAutomaticRepair:true};
}
function main(){
    const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1],input=args.includes('--input')?value('--input'):null;
    const output=path.resolve(args.includes('--output')?value('--output'):'evidence/A9R15R1/A9R15R1_TRAINING_REGISTRATION_AUDIT.json');
    const fixture={clubId:'SYNTHETIC',complete:true,shifts:[{id:'S1',branch:'CS1'},{id:'S2',branch:'CS2'},{id:'U',branch:''}],profiles:{
        A:{branch:'CS1',trainingShiftId:'S1',trainingDays:[1,3,5]},B:{branch:'CS1',trainingShiftId:'S2',trainingDays:[2,4,6]},C:{branch:'CS2',trainingShiftId:'DELETED',trainingDays:[]},D:{branch:'CS1',trainingShiftId:'U'},E:{branch:'CS1',trainingDays:'2/4/6'},F:{branch:'CS2',trainingShiftId:null,trainingDays:[]}
    }};
    const fixtureAudit=auditExport(fixture,{clubId:'SYNTHETIC',kind:'fixture'});assert.equal(new Set(fixtureAudit.rows.map(row=>row.result)).size,6);
    let realDataAudit={classification:'ENV_BLOCKED',reason:'REAL_DATA_NOT_VERIFIED',scope:null,inputSHA256:null,totalProfiles:null,...Object.fromEntries(categories.map(category=>[category,null])),reviewList:[],allExistingProfilesClean:null,noDatabaseWrites:true,requiredInput:'Owner-authorized current profile + canonical shifts export with club scope and completeness evidence'};
    if(input){
        assert(args.includes('--club-id'),'EXPLICIT_CLUB_SCOPE_REQUIRED');const bytes=fs.readFileSync(input),data=JSON.parse(bytes);
        realDataAudit=auditExport(data,{clubId:value('--club-id'),kind:'user-export',inputSHA256:hash(bytes)});
        // Reading an export is evidence about that export, not live Firestore completeness.
        realDataAudit.liveClassification='LIVE_NOT_VERIFIED';assert.equal(hash(fs.readFileSync(input)),hash(bytes));
    }
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({fixtureAudit,realDataAudit,newWriteProtection:'Tested separately in runtime/service/browser matrices; not inferred from data cleanliness'},null,2));console.log('FIXTURE_AUDIT',fixtureAudit.totalProfiles,'REAL_DATA',realDataAudit.classification);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
