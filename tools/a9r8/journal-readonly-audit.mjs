// A9R8: Read-only assessment of operator-supplied backups. No Firebase SDK,
// IndexedDB writes, recovery, replay, or cutover approval.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))]))):v);
const deny=code=>{throw Object.assign(new Error('A9R8_BACKUP_INVALID: '+code),{code});};
const requireThat=(v,code)=>{if(!v)deny(code);};
const activeStates=new Set(['pending','inflight','conflict','needs-review']);
const knownStates=new Set([...activeStates,'acked','superseded','kept-server']);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);

export function reviewDeviceBackup(envelope,{projectId,clubId}={}){
  requireThat(envelope&&typeof envelope==='object'&&envelope.content&&/^[a-f0-9]{64}$/.test(envelope.backupSHA256||''),'BACKUP_ENVELOPE');
  const data=envelope.content;
  requireThat(sha(canonical(data))===envelope.backupSHA256,'BACKUP_HASH_MISMATCH');
  requireThat(data.kind==='SCOPED_DEVICE_LEGACY_BACKUP'&&data.rawDeleted===false&&data.versionSchemaChanged===false&&data.ownershipInferred===false,'NOT_IMMUTABLE_SCOPED_BACKUP');
  requireThat(data.consistency==='one readonly IDB snapshot; stable localStorage double-read; not atomic across stores','BACKUP_CONSISTENCY_UNVERIFIED');
  requireThat(typeof data.projectId==='string'&&data.projectId&&typeof data.clubId==='string'&&data.clubId&&(!projectId||data.projectId===projectId)&&(!clubId||data.clubId===clubId),'BACKUP_SCOPE_MISMATCH');
  requireThat(Array.isArray(data.localStorage)&&Array.isArray(data.journalRows)&&Array.isArray(data.meta),'BACKUP_ROWS_NOT_ARRAY');
  requireThat(Number.isSafeInteger(data.unscopedLegacyCount)&&data.unscopedLegacyCount>=0&&Number.isSafeInteger(data.excludedForeignV3Count)&&data.excludedForeignV3Count>=0,'BACKUP_COVERAGE_INVALID');
  if(envelope.rawDigests!==undefined){
    requireThat(Array.isArray(envelope.rawDigests)&&envelope.rawDigests.length===data.localStorage.length,'RAW_DIGEST_COUNT_MISMATCH');
    for(const r of data.localStorage)requireThat(envelope.rawDigests.some(d=>d.key===r.key&&d.sha256===sha(r.raw)),'RAW_DIGEST_MISMATCH');
  }
  const issues=[],counts={legacyV1V2:0,legacyMalformed:0,v3Pending:0,v3Inflight:0,v3NeedsReview:0,v3Conflict:0,v3Acked:0,v3Resolved:0,v3Unknown:0,v3LegacyUnowned:0,missingParent:0,overlappingActiveTarget:0};
  const add=(code,n=1)=>issues.push({code,count:n});
  const sources=new Set();
  for(const row of data.localStorage){
    requireThat(typeof row.key==='string'&&row.key.startsWith('offline_att_')&&typeof row.raw==='string','BAD_LEGACY_ROW');
    const sig=sha(row.key+'\n'+row.raw);requireThat(!sources.has(sig),'DUPLICATE_RAW_ENTRY');sources.add(sig);counts.legacyV1V2++;
    try{JSON.parse(row.raw);}catch{counts.legacyMalformed++;}
  }
  if(counts.legacyV1V2)add('LEGACY_V1_V2_QUARANTINE_REQUIRED',counts.legacyV1V2);
  if(counts.legacyMalformed)add('LEGACY_RAW_MALFORMED',counts.legacyMalformed);
  if(data.unscopedLegacyCount)add('UNSCOPED_LEGACY_NOT_IN_BACKUP',data.unscopedLegacyCount);
  if(data.excludedForeignV3Count)add('FOREIGN_PRINCIPAL_DEVICE_ROWS_NEED_SEPARATE_AUDIT',data.excludedForeignV3Count);
  const byId=new Map(),activeByTarget=new Map();
  for(const row of data.journalRows){
    requireThat(row&&typeof row.id==='string'&&row.id&&typeof row.state==='string','INVALID_JOURNAL_ROW');
    requireThat(!byId.has(row.id),'DUPLICATE_INTENT_ID');byId.set(row.id,row);
    if(!knownStates.has(row.state)){counts.v3Unknown++;continue;}
    if(row.legacySource!=null||!row.principal){counts.v3LegacyUnowned++;continue;}
    const p=row.principal;
    if(p.clubId!==data.clubId||p.uid!==data.actor?.uid||p.role!==data.actor?.role||row.record?.clubId!==data.clubId)add('JOURNAL_CONTEXT_OR_SCOPE_MISMATCH');
    switch(row.state){
      case 'pending':counts.v3Pending++;break;
      case 'inflight':counts.v3Inflight++;break;
      case 'conflict':counts.v3Conflict++;break;
      case 'needs-review':counts.v3NeedsReview++;break;
      case 'acked':counts.v3Acked++;break;
      default:counts.v3Resolved++;
    }
    if(activeStates.has(row.state)){
      const key=row.target||JSON.stringify([row.record.clubId,row.record.docId]);
      activeByTarget.set(key,(activeByTarget.get(key)||0)+1);
    }
  }
  for(const row of byId.values())if(row.dependsOn&&!byId.has(row.dependsOn)){counts.missingParent++;}
  counts.overlappingActiveTarget=[...activeByTarget.values()].filter(n=>n>1).length;
  if(counts.v3Unknown)add('UNKNOWN_V3_STATE',counts.v3Unknown);
  if(counts.v3LegacyUnowned)add('V3_UNOWNED_LEGACY_QUARANTINE_REQUIRED',counts.v3LegacyUnowned);
  if(counts.v3Pending||counts.v3Inflight||counts.v3NeedsReview||counts.v3Conflict)add('V3_UNSETTLED_OR_REVIEW_REQUIRED',counts.v3Pending+counts.v3Inflight+counts.v3NeedsReview+counts.v3Conflict);
  if(counts.missingParent)add('MISSING_JOURNAL_DEPENDENCY',counts.missingParent);
  if(counts.overlappingActiveTarget)add('MULTIPLE_ACTIVE_INTENTS_SAME_TARGET',counts.overlappingActiveTarget);
  if(counts.v3Acked)add('ACK_REQUIRES_SERVER_VERSION_RECONCILIATION',counts.v3Acked);
  if(data.consistency.includes('not atomic'))add('LOCALSTORAGE_IDB_SNAPSHOT_NOT_CROSS_STORE_ATOMIC');
  // Missing global device coverage and a signed server history audit prohibit release
  // even when this particular backup contains zero entries.
  // Existing approved device capture inventories localStorage and the V3 DB,
  // not historical taekwondo_cache/offline_queue contents. Never assume absent.
  add('LEGACY_INDEXEDDB_OFFLINE_QUEUE_NOT_IN_DEVICE_BACKUP');
  add('ALL_DEVICES_AND_OWNER_APPROVAL_NOT_VERIFIED');
  add('S01_SERVER_HISTORY_PROVENANCE_NOT_VERIFIED');
  return {phase:'A9R8',kind:'READ_ONLY_DEVICE_JOURNAL_REVIEW',backupSHA256:envelope.backupSHA256,
    projectId:data.projectId,clubId:data.clubId,counts,issues,status:'RELEASE_HOLD_EVIDENCE_INCOMPLETE',
    noRawDataInReport:true,noReplay:true,noReassignment:true,noFirestoreWrites:true,noIDBMutation:true,releaseApproved:false};
}

export function reviewA9R7Demo(report){
  requireThat(report?.kind==='DEMO_ACTIVE_ONLY_NOT_RELEASE'&&report.projectId?.startsWith('demo-')&&Array.isArray(report.results),'DEMO_REPORT_INVALID');
  const s01=report.results.find(r=>String(r.title).startsWith('S01 proof:'));
  requireThat(s01?.result==='PASS','S01_ADVERSARIAL_TEST_MISSING');
  return {kind:'A9R7_S01_ADVERSARIAL_RESULT',demoCasesReported:report.total,demoCasesPass:report.pass,
    s01TestExecuted:true,preCutoverForgedMarkerReadRisk:'CONFIRMED_BY_DEMO_TEST',
    realServerSnapshotProvided:false,status:'S01_RELEASE_BLOCKED',releaseApproved:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [kind,input,output,projectId,clubId]=process.argv.slice(2);
    requireThat(['device','a9r7-demo'].includes(kind)&&input&&output,'USAGE');
    const obj=JSON.parse(fs.readFileSync(input,'utf8'));
    const result=kind==='device'?reviewDeviceBackup(obj,{projectId,clubId}):reviewA9R7Demo(obj);
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(result.status,JSON.stringify(result.counts||{}));
  }catch(e){console.error(e.code||e.message);process.exitCode=1;}
}
