// Read-only recovery planning. No journal, SDK, replay or mutation.
import crypto from 'node:crypto';
import {attendanceServerVersion} from '../../js/core/attendanceContract.js';
import {canonical,digest} from './cutover.mjs';
export function backup(snapshot){
 const bytes=canonical(snapshot);return {kind:'IMMUTABLE_LEGACY_BACKUP',bytes,sha256:digest(bytes),rawKeys:(snapshot.localStorage||[]).map(x=>({key:x.key,rawSHA256:digest(x.raw)})),createdAt:new Date().toISOString()};
}
export function recoveryPlan(snapshot,{mappings=[],serverRecords=[],decision={decision:'pending'}}={}){
 const saved=backup(snapshot),rows=[],sources=[...(snapshot.localStorage||[]),...(snapshot.journalRows||[]).filter(x=>x.legacySource?.key&&typeof x.legacySource.raw==='string').map(x=>({key:x.legacySource.key,raw:x.legacySource.raw}))],raw=Array.from(new Map(sources.map(x=>[x.key+'\n'+x.raw,x])).values());
 for(const item of raw){let payload;try{payload=JSON.parse(item.raw)}catch{rows.push({sourceDigest:digest(item.raw),state:'QUARANTINE',reason:'malformed-raw'});continue}
  const sourceDigest=crypto.createHash('sha256').update(item.key+'\n'+item.raw).digest('hex');
  const list=payload.version===2?[payload]:Object.values(payload.records||{}).map(r=>({...r,date:r.date||payload.date,clubId:payload.clubId}));
  for(const [index,record]of list.entries()){
   const mapping=mappings.find(x=>x.sourceDigest===sourceDigest&&x.rowIndex===index),name=String(record.name||record.profileId||''),date=String(record.date||''),shift=String(record.shiftId||''),docId=name+'_'+date+(shift?'_'+shift:'');
   const server=serverRecords.find(x=>x.clubId===record.clubId&&x.docId===docId);
   const principal=mapping?.principal;let reason='owner-not-verified';
   const parsed=new Date(date+'T00:00:00Z'),identityValid=name&&!name.includes('/')&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&(!record.docId||record.docId===docId)&&(!record.profileId||record.profileId===name);
   if(!identityValid)reason='identity-mismatch';
   if(identityValid&&principal?.uid&&['coach','admin','super_admin'].includes(principal.role)&&principal.clubId===record.clubId&&mapping.ownerEvidenceRef&&mapping.branchAtAttendanceEvidenceRef){
    if(!server?.serverConfirmed||!server.observedAt)reason='server-version-not-verified';
    else if(principal.role==='coach'&&(record.branch==='Mặc định'?'CS1':record.branch)!==(principal.coachBranch==='Mặc định'?'CS1':principal.coachBranch))reason='branch-mismatch';
    else reason='separate-owner-approval-and-explicit-review-required';
   }
   rows.push({sourceDigest,rowIndex:index,clubId:record.clubId,docId,principal:null,proposedPrincipal:reason==='separate-owner-approval-and-explicit-review-required'?principal:null,legacyStatus:Number(record.status),expectedServerVersion:server?.serverConfirmed?attendanceServerVersion(server.data):'unknown',state:'QUARANTINE',reason});
  }
 }
 for(const row of rows){const sameTarget=rows.filter(x=>x.clubId===row.clubId&&x.docId===row.docId);if(sameTarget.length>1&&new Set(sameTarget.map(x=>x.legacyStatus)).size>1){row.reason='ambiguous-legacy-order-requires-evidence';row.proposedPrincipal=null;}}
 return {existingV3RowsPreserved:(snapshot.journalRows||[]).filter(x=>!x.legacySource).length,kind:'READ_ONLY_RECOVERY_PLAN_NOT_WRITE_AUTHORITY',backupSHA256:saved.sha256,rawDigests:saved.rawKeys,decision:decision.decision==='approved'?'requires-separate-verified-signature-and-per-item-review':'pending',rows,newIntentsCreated:0,rawDeleted:false,autoReassignment:false,writer:'existing AttendanceJournal.enqueue -> existing worker -> existing AttendanceService CAS only after separate approved implementation/acceptance',versionSchemaChanged:false};
}
