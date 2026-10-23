// A9R9 offline-only evidence cross-check. No Firebase SDK, no writes, no replay.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {sha,canonical,signedPayload,safeProject} from '../v11r3/proof.mjs';
import {auditHistoryEvidence} from '../v11r3/history-audit.mjs';
import {reviewDeviceBackup} from '../a9r8/journal-readonly-audit.mjs';

const VALID_EMPTY = new Set(['DB_ABSENT','STORE_ABSENT','EMPTY']);
const active = new Set(['pending','inflight','conflict','needs-review']);
const simple = (v) => typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(v);
const p = (obj,k) => obj?.fields?.[k]?.stringValue ?? obj?.fields?.[k]?.integerValue ?? null;
const issue = (issues,code,deviceId='')=>issues.push({code,...(deviceId?{deviceId}:{})});

// Pure, fail-closed check. It never equates a local ACK with a server commit.
export function checkJournalEvidence(backup, queueInventory, serverDocuments, deviceId='') {
 const issues=[];
 if (!backup?.content || sha(backup.content)!==backup.backupSHA256) return [{code:'DEVICE_BACKUP_HASH_MISMATCH',deviceId}];
 const c=backup.content;
 if (c.kind!=='SCOPED_DEVICE_LEGACY_BACKUP'||c.rawDeleted!==false||c.versionSchemaChanged!==false) issue(issues,'UNTRUSTED_DEVICE_BACKUP',deviceId);
 if (!queueInventory || sha(queueInventory.content)!==queueInventory.sha256 || queueInventory.content?.kind!=='A9R9_READONLY_LEGACY_QUEUE_INVENTORY' ||
     queueInventory.content?.projectId!==c.projectId || queueInventory.content?.clubId!==c.clubId || queueInventory.content?.origin!==c.origin ||
     !VALID_EMPTY.has(queueInventory.content?.state) || queueInventory.content?.rowCount!==0 ||
     queueInventory.content?.mutations!==0 || queueInventory.content?.complete!==true) issue(issues,'LEGACY_QUEUE_UNVERIFIED_OR_NONEMPTY',deviceId);
 if (!Array.isArray(c.localStorage)||!Array.isArray(c.journalRows)||!Array.isArray(c.meta)) return [...issues,{code:'MISSING_LOCAL_BACKUP_ROWS',deviceId}];
 if (c.localStorage.length) issue(issues,'V1_V2_LEGACY_REQUIRES_MANUAL_RECONCILIATION',deviceId);
 if (c.unscopedLegacyCount||c.excludedForeignV3Count) issue(issues,'UNSCOPED_OR_FOREIGN_DEVICE_ROWS',deviceId);
 const rows=c.journalRows, byTarget=new Map(), seen=new Set();
 for(const row of rows){
  if (!row||!simple(row.id)||seen.has(row.id)||!row.record||row.record.clubId!==c.clubId||!simple(row.record.docId)) {issue(issues,'INVALID_OR_DUPLICATE_JOURNAL_ID',deviceId);continue;}
  seen.add(row.id);
  if (row.legacySource!=null || row.principal?.uid!==c.actor?.uid || row.principal?.role!==c.actor?.role || row.principal?.clubId!==c.clubId) issue(issues,'JOURNAL_PRINCIPAL_UNVERIFIED',deviceId);
  if (active.has(row.state)) issue(issues,'UNRESOLVED_V3_INTENT',deviceId);
  else if (!['acked','superseded','kept-server'].includes(row.state)) issue(issues,'UNKNOWN_JOURNAL_STATE',deviceId);
  else if (row.state==='superseded'||row.state==='kept-server') issue(issues,'MANUAL_RESOLUTION_PROVENANCE_MISSING',deviceId);
  if (row.dependsOn && !rows.some(other=>other.id===row.dependsOn)) issue(issues,'MISSING_JOURNAL_PARENT',deviceId);
  const key='clubs/'+c.clubId+'/attendance/'+row.record.docId;
  if(!byTarget.has(key))byTarget.set(key,[]);byTarget.get(key).push(row);
 }
 for(const [key,list] of byTarget){
  const acks=list.filter(r=>r.state==='acked').sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  if(!acks.length)continue;
  const server=serverDocuments.get(key);
  if(!server){issue(issues,'ACK_SERVER_DOCUMENT_NOT_FOUND',deviceId);continue;}
  const serverVersion=p(server,'attendanceVersion');
  if(serverVersion!==acks.at(-1).id){issue(issues,'ACK_LAST_SERVER_VERSION_MISMATCH',deviceId);continue;}
  for(let i=0;i<acks.length-1;i++){
    const older=acks[i];const newer=acks[i+1];
    if (![newer.originalBaseVersion,newer.baseVersion,newer.dependsOn].includes(older.id)) issue(issues,'ACK_CHAIN_NOT_PROVEN',deviceId);
  }
 }
 // Proof of current server version is impossible for ACKs already purged locally;
 // their absence cannot be used as historical proof.
 return issues;
}

export function evaluateEvidencePackage(pack,{publicKey,trustedKeySHA256,now=Date.now()}={}) {
 const issues=[],statusBase={phase:'A9R9',kind:'S01_DEVICE_CLOSURE_REVIEW',releaseApproved:false,productionWrites:0,readOnly:true,rawDataInReport:false};
 const plan=pack?.plan;
 if(!plan?.projectId) return {...statusBase,status:'RELEASE_HOLD',issues:[{code:'MISSING_APPROVED_STAGING_PLAN'}]};
 try {safeProject(plan.projectId);}catch {return {...statusBase,status:'RELEASE_HOLD',issues:[{code:'PRODUCTION_OR_INVALID_PROJECT_FORBIDDEN'}]};}
 if(!pack.historyEvidence){issue(issues,'S01_SERVER_SNAPSHOT_NOT_PROVIDED');}
 let hist=null;
 if(pack.historyEvidence){
  try {hist=auditHistoryEvidence(plan,pack.historyEvidence,{publicKey,trustedKeySHA256,now});
       if(hist.status!=='STAGING_AUDIT_EVIDENCE_COMPLETE_NOT_RELEASE'||hist.issues.length)issue(issues,'S01_NOT_FULLY_VERIFIED');
  }catch(err){issue(issues,'S01_HISTORY_EVIDENCE_REJECTED');}
 }
 let roster=null;
 if(pack.roster){
  try {roster=signedPayload(pack.roster,{publicKey,trustedKeySHA256,purpose:'attendance-device-fleet',now});
    if(roster.environment!=='staging'||roster.projectId!==plan.projectId||canonical(roster.clubIds)!==canonical(plan.clubIds)||
      !Array.isArray(roster.devices)||!roster.devices.length ||new Set(roster.devices.map(x=>x.deviceId)).size!==roster.devices.length)
      throw Error('FLEET_SCOPE_INVALID');
  }catch{issue(issues,'DEVICE_FLEET_SIGNED_SCOPE_REJECTED');roster=null;}
 } else issue(issues,'SIGNED_DEVICE_FLEET_MISSING');
 const devices=Array.isArray(pack.devices)?pack.devices:[];
 if(!devices.length)issue(issues,'NO_REAL_DEVICE_EVIDENCE');
 const byId=new Map();for(const d of devices){if(!simple(d.deviceId)||byId.has(d.deviceId))issue(issues,'DEVICE_DUPLICATE_OR_INVALID');else byId.set(d.deviceId,d);}
 if(roster){
  for(const item of roster.devices){
   const d=byId.get(item.deviceId);
   if(!d){issue(issues,'MISSING_REQUIRED_DEVICE',item.deviceId);continue;}
   if(!d.backup||!d.queueInventory ||d.backup.backupSHA256!==item.backupSHA256 ||d.queueInventory.sha256!==item.queueInventorySHA256){issue(issues,'DEVICE_EVIDENCE_HASH_NOT_IN_SIGNED_ROSTER',item.deviceId);continue;}
   if(d.backup.content?.environment!=='staging'||d.backup.content?.projectId!==plan.projectId||
      d.backup.content?.origin!==item.origin||d.backup.content?.clubId!==item.clubId){issue(issues,'DEVICE_SCOPE_NOT_STAGING',item.deviceId);continue;}
   try{reviewDeviceBackup(d.backup,{projectId:plan.projectId,clubId:item.clubId});}catch{issue(issues,'DEVICE_BACKUP_REJECTED',item.deviceId);continue;}
   // Only use documents from a complete, independently verified S01 snapshot.
   const serverDocs=new Map();if(hist && !hist.issues.length && hist.status==='STAGING_AUDIT_EVIDENCE_COMPLETE_NOT_RELEASE'){
    for(const g of pack.historyEvidence.backup.content.collections || [])if(g.collection==='attendance')for(const doc of g.documents || []){
     const name=doc.name.split('/documents/')[1];if(name)serverDocs.set(name,doc);
    }
   } else issue(issues,'ACK_SERVER_SNAPSHOT_NOT_TRUSTED',item.deviceId);
   issues.push(...checkJournalEvidence(d.backup,d.queueInventory,serverDocs,item.deviceId));
  }
  for(const deviceId of byId.keys())if(!roster.devices.some(x=>x.deviceId===deviceId))issue(issues,'DEVICE_NOT_IN_APPROVED_FLEET',deviceId);
 }
 const unique=[...new Map(issues.map(x=>[JSON.stringify(x),x])).values()];
 return {...statusBase,projectId:plan.projectId,requiredDeviceCount:roster?.devices.length??null,submittedDeviceCount:devices.length,
    s01Status:hist?.status??'NOT_VERIFIED',status:unique.length?'RELEASE_HOLD':'STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE',issues:unique};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 try{
  const [inFile,outFile,pubKeyFile,pin]=process.argv.slice(2);
  if(!inFile||!outFile||!pubKeyFile||!pin)throw Error('USAGE: node tools/a9r9/evidence-closure.mjs input.json output.json owner-public.pem trusted-key-sha256');
  const report=evaluateEvidencePackage(JSON.parse(fs.readFileSync(inFile)),{publicKey:fs.readFileSync(pubKeyFile,'utf8'),trustedKeySHA256:pin});
  fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(report.status,JSON.stringify(report.issues));
  if(report.status!=='STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE')process.exitCode=2;
 } catch(e){console.error(e.code||e.message);process.exitCode=1;}
}
