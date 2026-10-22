// Explicitly approved, bounded, read-only staging diagnostics. Never loaded by the SPA.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {canonical,sha,requireProof as need,signedPayload,timestampKey,order,safeProject} from './proof.mjs';
import {firebaseProjectInSource} from './staging-source.mjs';
export async function collectServerSnapshot(request,envelope,options={}){
 const {publicKey,trustedKeySHA256,now=Date.now(),fetcher=globalThis.fetch,idToken,metadataToken}=options;
 const grant=signedPayload(envelope,{publicKey,trustedKeySHA256,purpose:'attendance-staging-read-audit',now});
 safeProject(request.projectId);need(request.databaseId==='(default)'&&grant.projectId===request.projectId&&grant.databaseId===request.databaseId&&grant.environment===request.environment,'AUDIT_SCOPE_MISMATCH');
 need(sha(request)===grant.requestSHA256,'AUDIT_REQUEST_NOT_APPROVED');
 need(Array.isArray(request.clubIds)&&request.clubIds.length>0&&request.clubIds.length<=20&&request.clubIds.every(c=>typeof c==='string'&&c&&!c.includes('/'))&&new Set(request.clubIds).size===request.clubIds.length&&canonical([...request.clubIds].sort())===canonical(grant.clubIds),'CLUB_SCOPE_MISMATCH');
 const demo=request.environment==='demo';need(demo?request.projectId.startsWith('demo-'):request.environment==='staging'&&!request.projectId.startsWith('demo-'),'TARGET_ENVIRONMENT_INVALID');
 need(Number.isSafeInteger(request.pageSize)&&request.pageSize>0&&request.pageSize<=400,'PAGE_SIZE_INVALID');
 for(const key of ['maxReturnedDocuments','maxRequests'])need(Number.isSafeInteger(request[key])&&request[key]>0&&request[key]<=grant[key],'READ_CAP_NOT_APPROVED');
 const fixed=request.consistency==='fixed-read-time';need(fixed||(demo&&request.consistency==='emulator-latest'),'FIXED_READ_TIME_REQUIRED');
 if(fixed){const key=timestampKey(request.readTime);need(key.endsWith('000Z')&&Date.parse(request.readTime)<=now&&now-Date.parse(request.readTime)<3600000,'READ_TIME_OUTSIDE_WINDOW');}
 const base=demo?request.emulatorOrigin:'https://firestore.googleapis.com';
 if(demo){const u=new URL(base);need(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.pathname==='/'&&!u.username&&!u.password&&!u.search,'LOCAL_DEMO_REQUIRED');}
 else need(idToken&&metadataToken&&request.collectMetadata===true&&request.globalAttendanceInventory===true,'STAGING_TOKENS_METADATA_AND_GLOBAL_INVENTORY_REQUIRED');
 const db='projects/'+request.projectId+'/databases/(default)',trace=[],collections=[];let documentsRead=0;
 async function rpc(method,url,body,token,kind){
  if(demo)need(new URL(url).hostname==='127.0.0.1','DEMO_NETWORK_MUST_STAY_LOCAL');
  need(trace.length<request.maxRequests,'REQUEST_CAP_EXHAUSTED');
  const headers={'Cache-Control':'no-cache'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
  const row={kind,method,url,body:body||null};trace.push(row);
  const response=await fetcher(url,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
  row.httpStatus=response.status;need(response.status===200,'HTTP_'+response.status);const bytes=Buffer.from(await response.arrayBuffer());need(bytes.length<=32*1024*1024,'RESPONSE_TOO_LARGE');
  row.responseSHA256=sha(bytes);return kind==='runtime'?bytes:JSON.parse(bytes.toString('utf8'));
 }
 let observed={kind:'NOT_COLLECTED_DEMO_ONLY'};
 if(request.collectMetadata){
  const rulesOrigin=demo?base:'https://firebaserules.googleapis.com',firestoreOrigin=demo?base:'https://firestore.googleapis.com';
  const rulesBase=rulesOrigin+'/v1/projects/'+request.projectId,release=await rpc('GET',rulesBase+'/releases/cloud.firestore',null,metadataToken,'rules-release');
  need(typeof release.rulesetName==='string'&&release.rulesetName.startsWith('projects/'+request.projectId+'/rulesets/'),'RULES_PROJECT_MISMATCH');
  const ruleset=await rpc('GET',rulesOrigin+'/v1/'+release.rulesetName,null,metadataToken,'rules-source');
  need(ruleset.source?.files?.length===1&&typeof ruleset.source.files[0].content==='string','RULES_SOURCE_AMBIGUOUS');const rules=ruleset.source.files[0].content;
  need(sha(rules)===request.maintenanceRulesSHA256&&/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;/.test(rules),'MAINTENANCE_RULES_NOT_OBSERVED');
  const indexes=[],seen=new Set();let token='';do{
   need(!seen.has(token),'INDEX_CURSOR_REPEATED');seen.add(token);const url=firestoreOrigin+'/v1/'+db+'/collectionGroups/attendance/indexes?pageSize=1000'+(token?'&pageToken='+encodeURIComponent(token):'');
   const page=await rpc('GET',url,null,metadataToken,'indexes');indexes.push(...(page.indexes||[]));token=page.nextPageToken||'';
  }while(token);
  need(request.runtimeManifest&&Object.keys(request.runtimeManifest).length>0,'RUNTIME_MANIFEST_REQUIRED');
  const origin=new URL(request.stagingBaseURL);need((demo?origin.protocol==='http:'&&origin.hostname==='127.0.0.1':origin.protocol==='https:')&&!origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname.endsWith('/'),'STAGING_BASE_URL_INVALID');
  need(grant.stagingBaseURL===origin.href,'STAGING_ORIGIN_NOT_APPROVED');const runtime=[],bootstrapProjects={},nonServedControls={};
  for(const [file,expected]of Object.entries(request.runtimeManifest).sort(([a],[b])=>a.localeCompare(b))){
   need(!file.startsWith('/')&&!file.split('/').includes('..')&&/^[a-zA-Z0-9_./-]+$/.test(file),'RUNTIME_PATH_INVALID');const url=new URL(file,origin);need(url.origin===origin.origin&&url.pathname.startsWith(origin.pathname),'RUNTIME_ORIGIN_ESCAPE');url.searchParams.set('v',request.buildTag);
   if(file==='.nojekyll'){need(expected===sha(''),'DEPLOYMENT_CONTROL_NOT_EMPTY');nonServedControls[file]={sha256:expected,kind:'EMPTY_BUILD_CONTROL_NOT_HTTP_VERIFIED'};runtime.push([file,expected]);continue;}
   const bytes=await rpc('GET',url.href,null,null,'runtime');need(sha(bytes)===expected,'SERVED_RUNTIME_MISMATCH');if(['app.js','js/firebase/config.js'].includes(file)){bootstrapProjects[file]=firebaseProjectInSource(bytes.toString('utf8'));need(bootstrapProjects[file]===request.projectId,'SERVED_FIREBASE_PROJECT_MISMATCH');}runtime.push([file,sha(bytes)]);
  }
  runtime.sort(([a],[b])=>a<b?-1:a>b?1:0);need(sha(runtime)===request.sourceRuntimeSHA256,'RUNTIME_MANIFEST_MISMATCH');
  observed={kind:'RULES_INDEX_RUNTIME_HTTP_OBSERVATIONS',releaseBefore:release.rulesetName,rulesSource:rules,rulesSHA256:sha(rules),indexes,runtime,bootstrapProjects,nonServedControls,servedRuntimeFileCount:runtime.length-Object.keys(nonServedControls).length,sourceRuntimeSHA256:sha(runtime),stagingBaseURL:origin.href};
 }
 let globalInventory=null;
 if(request.globalAttendanceInventory){
  const documents=[],pages=[],prefix=db+'/documents/';let cursor='';
  for(;;){
   const remaining=request.maxReturnedDocuments-documentsRead;need(remaining>0,'DOCUMENT_CAP_REACHED_BEFORE_TERMINAL_EMPTY_PAGE');
   const query={from:[{collectionId:'attendance',allDescendants:true}],select:{fields:[{fieldPath:'historyAuthority'}]},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:Math.min(request.pageSize,remaining)};if(cursor)query.startAt={values:[{referenceValue:cursor}],before:false};
   const body={structuredQuery:query,...(fixed?{readTime:request.readTime}:{})},data=await rpc('POST',base+'/v1/'+db+'/documents:runQuery',body,idToken,'attendance-inventory');
   need(Array.isArray(data)&&data.length>0,'QUERY_STREAM_INCOMPLETE');if(fixed)need(data.every(x=>x.readTime&&timestampKey(x.readTime)===timestampKey(request.readTime)),'SERVER_DID_NOT_CONFIRM_FIXED_READ_TIME');
   const returned=data.filter(x=>x.document).map(x=>x.document);need(returned.length<=query.limit,'SERVER_PAGE_LIMIT_EXCEEDED');
   for(const doc of returned){const parts=doc.name?.startsWith(prefix)?doc.name.slice(prefix.length).split('/'):[];need(parts.length===4&&parts[0]==='clubs'&&parts[2]==='attendance'&&request.clubIds.includes(parts[1]),'GLOBAL_ATTENDANCE_HAS_UNSCOPED_CLUB_OR_PATH');need(!cursor||order(doc.name,cursor)>0,'DOCUMENT_SCOPE_OR_CURSOR_INVALID');cursor=doc.name;documents.push(doc);documentsRead++;}
   pages.push({requestTraceIndex:trace.length-1,documentNames:returned.map(d=>d.name),empty:returned.length===0});if(!returned.length)break;
  }
  globalInventory={documents,pages,complete:true,lastPageEmpty:true,finalCursor:null};
 }
 for(const clubId of request.clubIds)for(const collection of ['profiles','attendance']){
  const prefix=db+'/documents/clubs/'+clubId+'/'+collection+'/',documents=[],pages=[];let cursor='';
  for(;;){
   const remaining=request.maxReturnedDocuments-documentsRead;need(remaining>0,'DOCUMENT_CAP_REACHED_BEFORE_TERMINAL_EMPTY_PAGE');
   const query={from:[{collectionId:collection}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:Math.min(request.pageSize,remaining)};
   if(cursor)query.startAt={values:[{referenceValue:cursor}],before:false};
   const body={structuredQuery:query,...(fixed?{readTime:request.readTime}:{})};
   const data=await rpc('POST',base+'/v1/'+db+'/documents/clubs/'+encodeURIComponent(clubId)+':runQuery',body,idToken,'documents');
   need(Array.isArray(data)&&data.length>0,'QUERY_STREAM_INCOMPLETE');
   if(fixed)need(data.every(r=>r.readTime&&timestampKey(r.readTime)===timestampKey(request.readTime)),'SERVER_DID_NOT_CONFIRM_FIXED_READ_TIME');
   const returned=data.filter(x=>x.document).map(x=>x.document);need(returned.length<=query.limit,'SERVER_PAGE_LIMIT_EXCEEDED');
   for(const doc of returned){need(typeof doc.name==='string'&&doc.name.startsWith(prefix)&&!doc.name.slice(prefix.length).includes('/')&&(!cursor||order(doc.name,cursor)>0),'DOCUMENT_SCOPE_OR_CURSOR_INVALID');cursor=doc.name;documents.push(doc);documentsRead++;}
   pages.push({requestTraceIndex:trace.length-1,documentNames:returned.map(d=>d.name),empty:returned.length===0});
   if(!returned.length)break;
  }
  collections.push({clubId,collection,documents,pages,complete:true,finalCursor:null,lastPageEmpty:true});
 }
 if(request.collectMetadata){const last=await rpc('GET',(demo?base:'https://firebaserules.googleapis.com')+'/v1/projects/'+request.projectId+'/releases/cloud.firestore',null,metadataToken,'rules-release');need(last.rulesetName===observed.releaseBefore,'RULES_CHANGED_DURING_SCAN');observed.releaseAfter=last.rulesetName;}
 const content={schema:1,kind:'READ_ONLY_SERVER_SNAPSHOT',environment:request.environment,projectId:request.projectId,databaseId:request.databaseId,clubIds:[...request.clubIds],consistency:request.consistency,readTime:fixed?request.readTime:null,request,requestSHA256:sha(request),collections,globalInventory,observed,trace,returnedDocuments:documentsRead,complete:true};
 return {content,backupSHA256:sha(content),billing:'NOT_A_FIRESTORE_BILL',applicationWrites:0,productionWrites:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const [input,output,key,pin]=process.argv.slice(2),data=JSON.parse(fs.readFileSync(input)),backup=await collectServerSnapshot(data.request,data.grant,{publicKey:fs.readFileSync(key,'utf8'),trustedKeySHA256:pin,idToken:process.env.V11R3_AUDIT_DATA_TOKEN||process.env.V11R3_FIREBASE_ID_TOKEN,metadataToken:process.env.V11R3_METADATA_ACCESS_TOKEN});fs.writeFileSync(output,JSON.stringify(backup,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'SNAPSHOT_SAVED_NOT_CUTOVER_APPROVAL',backupSHA256:backup.backupSHA256,documents:backup.content.returnedDocuments,requests:backup.content.trace.length,billing:backup.billing,productionWrites:0}));}
 catch(e){console.error(e.code||'SNAPSHOT_BLOCKED',e.code?'read audit did not complete; no data writes':e.message);process.exitCode=1}
}
