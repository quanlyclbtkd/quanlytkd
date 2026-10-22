// Offline verification of raw, bounded server exports and owner-signed documentary provenance.
// A signature binds a human decision; this tool cannot authenticate the truth of a paper register.
import {sha,canonical,requireProof as need,signedPayload,timestampKey,order,safeProject} from './proof.mjs';
const value=(d,k)=>d.fields?.[k]?.stringValue??d.fields?.[k]?.integerValue??d.fields?.[k]?.doubleValue;
const branch=b=>b==='Mặc định'?'CS1':b;
function indexesReady(definitions,observed,projectId){
 const normalize=i=>({group:i.collectionGroup||i.name?.match(/\/collectionGroups\/([^/]+)\/indexes\//)?.[1],scope:i.queryScope,fields:(i.fields||[]).filter(f=>f.fieldPath!=='__name__')});
 const required=definitions.indexes?.filter(i=>i.collectionGroup==='attendance');return required?.length>0&&required.every(w=>observed.some(g=>g.name?.startsWith('projects/'+projectId+'/databases/(default)/collectionGroups/attendance/indexes/')&&g.state==='READY'&&canonical(normalize(w))===canonical(normalize(g))));
}
export function auditHistoryEvidence(plan,evidence,{publicKey,trustedKeySHA256,now=Date.now()}){
 need(evidence?.backup?.content&&typeof evidence.indexFileContent==='string','HISTORY_EVIDENCE_REQUIRED');
 const {backup,grant,provenance}=evidence,c=backup.content,r=c.request;
 need(sha(c)===backup.backupSHA256&&c.kind==='READ_ONLY_SERVER_SNAPSHOT'&&c.complete===true,'BACKUP_HASH_OR_COMPLETENESS');
 const permission=signedPayload(grant,{publicKey,trustedKeySHA256,purpose:'attendance-staging-read-audit',now});
 need(r.projectId===plan.projectId&&r.databaseId==='(default)'&&r.environment===c.environment&&r.maxReturnedDocuments<=permission.maxReturnedDocuments&&r.maxRequests<=permission.maxRequests,'REQUEST_SCOPE_OR_CAP_MISMATCH');
 need(permission.requestSHA256===sha(r)&&c.requestSHA256===sha(r)&&permission.projectId===plan.projectId&&permission.databaseId==='(default)'&&canonical(permission.clubIds)===canonical(plan.clubIds),'BACKUP_GRANT_SCOPE');
 need(c.projectId===plan.projectId&&c.databaseId==='(default)'&&canonical([...c.clubIds].sort())===canonical(plan.clubIds)&&c.environment===permission.environment,'BACKUP_SCOPE');
 need(c.consistency==='fixed-read-time'&&c.readTime===r.readTime&&timestampKey(c.readTime)>=timestampKey(plan.createdAt)&&Date.parse(c.readTime)<=now&&now-Date.parse(c.readTime)<3600000,'SNAPSHOT_READ_TIME_NOT_VERIFIED');
 need(c.trace?.length>0&&c.trace.length<=permission.maxRequests&&c.returnedDocuments<=permission.maxReturnedDocuments,'BACKUP_READ_CAP');
 const ob=c.observed;need(ob?.kind==='RULES_INDEX_RUNTIME_HTTP_OBSERVATIONS'&&ob.releaseBefore===ob.releaseAfter&&ob.releaseBefore?.startsWith('projects/'+plan.projectId+'/rulesets/')&&sha(ob.rulesSource)===plan.maintenanceRulesSHA256&&ob.rulesSHA256===plan.maintenanceRulesSHA256&&/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/.test(ob.rulesSource),'LIVE_MAINTENANCE_NOT_VERIFIED');
 need(['app.js','js/firebase/config.js'].every(f=>ob.bootstrapProjects?.[f]===plan.projectId)&&permission.stagingBaseURL===r.stagingBaseURL&&r.stagingBaseURL===ob.stagingBaseURL,'SERVED_FIREBASE_PROJECT_OR_ORIGIN_NOT_VERIFIED');
 need(Object.entries(ob.nonServedControls||{}).every(([f,v])=>f==='.nojekyll'&&v.sha256===sha('')&&v.kind==='EMPTY_BUILD_CONTROL_NOT_HTTP_VERIFIED')&&ob.servedRuntimeFileCount===ob.runtime.length-Object.keys(ob.nonServedControls||{}).length&&c.trace.filter(t=>t.kind==='runtime'&&t.httpStatus===200).length===ob.servedRuntimeFileCount,'SERVED_RUNTIME_FILE_COVERAGE_INCOMPLETE');
 need(r.maintenanceRulesSHA256===plan.maintenanceRulesSHA256&&r.sourceRuntimeSHA256===plan.sourceRuntimeSHA256&&sha(ob.runtime)===plan.sourceRuntimeSHA256&&ob.sourceRuntimeSHA256===plan.sourceRuntimeSHA256&&Object.entries(r.runtimeManifest).every(([f,h])=>ob.runtime.some(x=>x[0]===f&&x[1]===h)),'SERVED_SOURCE_NOT_VERIFIED');
 need(sha(evidence.indexFileContent)===plan.indexesSHA256&&indexesReady(JSON.parse(evidence.indexFileContent),ob.indexes,plan.projectId),'LIVE_INDEX_NOT_READY');
 const expected=new Set(plan.clubIds.flatMap(clubId=>['profiles','attendance'].map(collection=>clubId+'/'+collection)));const all=[],cohorts=plan.clubIds.map(clubId=>({clubId,count:0,complete:true}));let returned=0;const used=new Set();
 for(const group of c.collections||[]){
  const groupKey=group.clubId+'/'+group.collection;need(expected.delete(groupKey),'BACKUP_COLLECTION_SCOPE_OR_DUPLICATE');
  need(group.complete===true&&group.lastPageEmpty===true&&group.finalCursor===null&&group.pages?.length>0&&group.pages.at(-1).empty===true,'PAGINATION_INCOMPLETE');
  const prefix='projects/'+plan.projectId+'/databases/(default)/documents/clubs/'+group.clubId+'/'+group.collection+'/';let cursor='',offset=0;
  for(const [pageIndex,page]of group.pages.entries()){
   const t=c.trace[page.requestTraceIndex],q=t?.body?.structuredQuery;
   need(t?.kind==='documents'&&t.method==='POST'&&t.httpStatus===200&&!used.has(page.requestTraceIndex)&&t.url.endsWith('/v1/projects/'+plan.projectId+'/databases/(default)/documents/clubs/'+encodeURIComponent(group.clubId)+':runQuery'),'QUERY_TRACE_MISSING');used.add(page.requestTraceIndex);
   need(t.body.readTime===r.readTime&&canonical(q.from)==canonical([{collectionId:group.collection}])&&canonical(q.orderBy)===canonical([{field:{fieldPath:'__name__'},direction:'ASCENDING'}])&&Number.isSafeInteger(q.limit)&&q.limit>0&&q.limit<=r.pageSize&&!q.where&&!q.select&&!q.offset&&!q.endAt,'FILTERED_OR_UNPINNED_QUERY');
   need(cursor?canonical(q.startAt)===canonical({values:[{referenceValue:cursor}],before:false}):!q.startAt,'QUERY_CURSOR_MISMATCH');
   need(page.documentNames.length<=q.limit&&page.empty===(page.documentNames.length===0)&&(!page.empty||pageIndex===group.pages.length-1),'PAGE_SHAPE_INVALID');
   for(const name of page.documentNames){const doc=group.documents[offset++];need(doc?.name===name&&name.startsWith(prefix)&&!name.slice(prefix.length).includes('/')&&(!cursor||order(name,cursor)>0)&&doc.updateTime&&timestampKey(doc.updateTime)<=timestampKey(r.readTime),'DOCUMENT_ORDER_SCOPE_OR_TIME');cursor=name;returned++;if(group.collection==='attendance')all.push({clubId:group.clubId,doc});}
  }
  need(offset===group.documents.length,'BACKUP_DOCUMENTS_NOT_FULLY_PAGED');
 }
 need(expected.size===0&&c.trace.filter(x=>x.kind==='documents').length===used.size,'BACKUP_COLLECTIONS_OR_COUNT_INCOMPLETE');
 const inv=c.globalInventory;need(r.globalAttendanceInventory===true&&inv?.complete===true&&inv.lastPageEmpty===true&&inv.finalCursor===null&&inv.pages?.at(-1)?.empty===true,'PROJECT_WIDE_INVENTORY_REQUIRED');let inventoryOffset=0,inventoryCursor='';const inventoryUsed=new Set();
 for(const [i,page]of inv.pages.entries()){
  const t=c.trace[page.requestTraceIndex],q=t?.body?.structuredQuery;
  need(t?.kind==='attendance-inventory'&&t.method==='POST'&&t.httpStatus===200&&!inventoryUsed.has(page.requestTraceIndex)&&t.url.endsWith('/v1/projects/'+plan.projectId+'/databases/(default)/documents:runQuery')&&t.body.readTime===r.readTime,'GLOBAL_INVENTORY_TRACE_INVALID');inventoryUsed.add(page.requestTraceIndex);
  need(canonical(q.from)===canonical([{collectionId:'attendance',allDescendants:true}])&&canonical(q.select)===canonical({fields:[{fieldPath:'historyAuthority'}]})&&canonical(q.orderBy)===canonical([{field:{fieldPath:'__name__'},direction:'ASCENDING'}])&&!q.where&&!q.offset&&!q.endAt&&Number.isSafeInteger(q.limit)&&q.limit>0&&q.limit<=r.pageSize,'GLOBAL_INVENTORY_FILTERED');
  need(inventoryCursor?canonical(q.startAt)===canonical({values:[{referenceValue:inventoryCursor}],before:false}):!q.startAt,'GLOBAL_INVENTORY_CURSOR_INVALID');need(page.documentNames.length<=q.limit&&page.empty===(page.documentNames.length===0)&&(!page.empty||i===inv.pages.length-1),'GLOBAL_INVENTORY_PAGE_INVALID');
  for(const name of page.documentNames){const d=inv.documents[inventoryOffset++];need(d?.name===name&&(!inventoryCursor||order(name,inventoryCursor)>0),'GLOBAL_INVENTORY_DOCUMENT_INVALID');inventoryCursor=name;}
 }
 const inventoryByName=new Map(inv.documents.map(d=>[d.name,d]));need(inventoryOffset===inv.documents.length&&inv.documents.length===all.length&&inventoryByName.size===inv.documents.length&&all.every(x=>inventoryByName.has(x.doc.name)&&value(inventoryByName.get(x.doc.name),'historyAuthority')===value(x.doc,'historyAuthority'))&&returned+inv.documents.length===c.returnedDocuments&&c.trace.filter(x=>x.kind==='attendance-inventory').length===inventoryUsed.size,'GLOBAL_INVENTORY_NOT_EQUAL_TO_BACKED_UP_ATTENDANCE');
 const signed=signedPayload(provenance,{publicKey,trustedKeySHA256,purpose:'attendance-history-provenance',now});
 need(signed.backupSHA256===backup.backupSHA256&&signed.projectId===plan.projectId&&signed.environment===c.environment&&signed.historyPolicy==='branch-at-attendance'&&canonical(signed.clubIds)===canonical(plan.clubIds),'PROVENANCE_SCOPE_MISMATCH');
 const sourceFiles=new Map();for(const file of evidence.evidenceFiles||[]){need(typeof file.base64==='string'&&/^[0-9a-f]{64}$/.test(file.sha256||'')&&!sourceFiles.has(file.sha256),'EVIDENCE_FILE_INVALID_OR_DUPLICATE');const bytes=Buffer.from(file.base64,'base64');need(bytes.length>0&&sha(bytes)===file.sha256&&['application/pdf','image/png','image/jpeg','text/csv','text/plain','application/json'].includes(file.mimeType),'EVIDENCE_FILE_BYTES_OR_TYPE_INVALID');sourceFiles.set(file.sha256,{sha256:file.sha256,mimeType:file.mimeType,bytes:bytes.length});}
 const attestations=signed.rows;need(Array.isArray(attestations)&&new Set(attestations.map(x=>x.documentName)).size===attestations.length,'PROVENANCE_DUPLICATE');
 const attestationByName=new Map(attestations.map(a=>[a.documentName,a])),attendanceNames=new Set(all.map(x=>x.doc.name)),profilesByClub=new Map(c.collections.filter(g=>g.collection==='profiles').map(g=>[g.clubId,new Map(g.documents.map(d=>[d.name.split('/').at(-1),d]))]));
 const issues=[];let verified=0,profileBranchDifferences=0;
 for(const {clubId,doc}of all){
  if(value(doc,'historyAuthority')===plan.authority)cohorts.find(x=>x.clubId===clubId).count++;
  const p=value(doc,'profileId'),date=value(doc,'date'),shift=value(doc,'shiftId')||'',status=Number(value(doc,'status')),b=value(doc,'branch'),id=doc.name.split('/').at(-1),att=attestationByName.get(doc.name);
  const parsed=new Date(date+'T00:00:00Z');const identity=p&&value(doc,'name')===p&&date&&/^\d{4}-\d\d-\d\d$/.test(date)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&id===p+'_'+date+(shift?'_'+shift:'')&&value(doc,'month')===date.slice(0,7)&&[0,1,2,3].includes(status)&&b;
  const proof=att&&att.documentSHA256===sha(doc)&&att.decision==='verified'&&att.profileId===p&&att.date===date&&(att.shiftId||'')===shift&&att.status===status&&branch(att.branchAtAttendance)===branch(b)&&['attendance-register','signed-session-register'].includes(att.evidenceType)&&att.sourceEvidenceVerifiedByOwner===true&&sourceFiles.has(att.evidenceSHA256)&&typeof att.evidenceRef==='string'&&att.evidenceRef.trim().length>0;
  if(!identity||!proof)issues.push({documentSHA256:sha(doc),clubId,reason:!identity?'identity-needs-manual-review':'documentary-provenance-not-verified'});else verified++;
  const profile=profilesByClub.get(clubId)?.get(p);if(profile&&branch(value(profile,'branch'))!==branch(b))profileBranchDifferences++;
 }
 need(attestations.length===all.length&&attestations.every(a=>attendanceNames.has(a.documentName)),'PROVENANCE_NOT_EXHAUSTIVE');
 if(cohorts.some(x=>x.count!==0))issues.push({reason:'candidate-marker-cohort-not-zero'});
 const report={schema:1,environment:c.environment,projectId:plan.projectId,backupSHA256:backup.backupSHA256,provenanceSHA256:sha(provenance),documentaryEvidenceFiles:[...sourceFiles.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256)),maintenanceRulesSHA256:plan.maintenanceRulesSHA256,sourceRuntimeSHA256:plan.sourceRuntimeSHA256,readTime:c.readTime,totalAttendance:all.length,verifiedAttendance:verified,profileBranchDifferences,cohorts,issues,status:issues.length?'HOLD_HISTORY_EVIDENCE':c.environment==='demo'?'DEMO_AUDIT_CONTRACT_ONLY':'STAGING_AUDIT_EVIDENCE_COMPLETE_NOT_RELEASE',truthBoundary:'Owner signs documentary provenance; tool checks actual supplied evidence bytes, integrity and completeness, not the factual truth of a register.',productionWrites:0};
 return {...report,auditSHA256:sha(report)};
}
export function requireStagingHistory(plan,scan,historyEvidence,approval,options){
 safeProject(plan.projectId);
 const report=auditHistoryEvidence(plan,historyEvidence,options);need(report.environment==='staging'&&report.status==='STAGING_AUDIT_EVIDENCE_COMPLETE_NOT_RELEASE','HISTORY_AUDIT_NOT_STAGING_COMPLETE');
 need(scan.backupSHA256===report.backupSHA256&&scan.historyAuditSHA256===report.auditSHA256&&canonical(scan.cohorts)===canonical(report.cohorts)&&timestampKey(report.readTime)<=timestampKey(scan.finishedAt)&&approval.historyAuditSHA256===report.auditSHA256&&approval.serverBackupSHA256===report.backupSHA256,'HISTORY_AUDIT_NOT_BOUND_TO_CUTOVER');return report;
}
