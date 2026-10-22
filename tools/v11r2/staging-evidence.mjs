// Validate owner-provided exports; never contact a cloud project.
import fs from 'node:fs';import {digest,canonical} from './cutover.mjs';
const normalize=i=>({collectionGroup:i.collectionGroup||i.collectionId||i.name?.match(/\/collectionGroups\/([^/]+)\/indexes\//)?.[1],queryScope:i.queryScope,fields:(i.fields||[]).filter(f=>f.fieldPath!=='__name__').map(f=>({fieldPath:f.fieldPath,...(f.order?{order:f.order}:{arrayConfig:f.arrayConfig})}))});
export function checkIndexes(definitions,observed,projectId){
 const required=definitions.indexes.filter(x=>x.collectionGroup==='attendance'),rows=Array.isArray(observed)?observed:observed.indexes||[];
 const matches=(g,w)=>g.name?.startsWith('projects/'+projectId+'/databases/(default)/collectionGroups/attendance/indexes/')&&g.state==='READY'&&canonical(normalize(g))===canonical(normalize(w));
 return {status:required.length>0&&required.every(w=>rows.some(g=>matches(g,w)))?'PASS_EXPORTED_STATE':'BLOCKED_INDEX_NOT_READY_OR_IDENTITY',projectId,databaseId:'(default)',kind:'owner-provided export; not an independent live request',required:required.map(w=>({definitionSHA256:digest(w),ready:rows.some(g=>matches(g,w))}))};
}
export function workloadModel(workloads){
 const rows=workloads.map(w=>{for(const key of ['initialRosterAdditionalDocuments','attendanceResultDocuments','intentAttempts','casReplayAttempts','manualReviewReads','reconnectDeliveredDocuments'])if(!Number.isSafeInteger(w[key])||w[key]<0)throw Error('WORKLOAD_INVALID '+key);
  return {...w,declaredApplicationDocumentReads:w.initialRosterAdditionalDocuments+w.attendanceResultDocuments+w.intentAttempts+w.casReplayAttempts+w.manualReviewReads,notIncluded:['Rules-dependent billing','index/minimum-query charges','reconnect billing (delivered snapshot size is not billed reads)']};});
 return {kind:'WORKLOAD_MODEL_NOT_BILLING',clubs:rows.length,rows,twentyClubInputsComplete:rows.length===20&&rows.every(w=>w.evidenceKind==='staging-observed'&&w.evidenceRef),actualWorkloadIndependentlyVerified:false,rulesReadsVerified:false,indexBillingVerified:false,reconnectBillingVerified:false,status:'HOLD_UNVERIFIED_BILLING_AND_OWNER_APPROVAL'};
}
if(process.argv[1]?.endsWith('staging-evidence.mjs')){const [kind,input,output]=process.argv.slice(2),data=JSON.parse(fs.readFileSync(input)),result=kind==='indexes'?checkIndexes(data.definitions,data.observed,data.projectId):workloadModel(data.workloads);fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(result.status)}
