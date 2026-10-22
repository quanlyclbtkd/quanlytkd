// Offline preparation/validation only. No Firebase SDK, deploy, writer or network.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {requireStagingHistory} from '../v11r3/history-audit.mjs';
import {firebaseProjectInSource,rebindFirebaseConfig,demoFirebaseConfig} from '../v11r3/staging-source.mjs';
import {verifySourceIdentity} from './source-identity.mjs';
import {rewriteCacheGraph,buildImportGraph,affectedModules} from './import-graph.mjs';
import {isolatedOutputPaths,claimNewOutput,assertNewOutputClaim,assertOwnedOutput,cleanupOwnedOutput,ownedFilePath,writeNewOwnedFile} from './isolated-output.mjs';
export const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
export const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
export const fileDigest=file=>digest(fs.readFileSync(file,'utf8'));
const fail=code=>{throw Object.assign(Error('CUTOVER_BLOCKED: '+code),{code})};
const ensure=(ok,code)=>{if(!ok)fail(code)};
const time=value=>Date.parse(value);
function runtimeFiles(root){const files=[];for(const name of ['app.js','index.html','style.css','.nojekyll','js','css']){const first=path.join(root,name);if(!fs.existsSync(first))continue;const walk=file=>{if(fs.statSync(file).isDirectory())for(const n of fs.readdirSync(file))walk(path.join(file,n));else files.push(path.relative(root,file).split(path.sep).join('/'))};walk(first)}return files.sort()}
export function runtimeHash(root,overrides={}){if(typeof overrides==='string')overrides={'js/core/attendanceContract.js':overrides};return digest(runtimeFiles(root).map(file=>[file,Object.hasOwn(overrides,file)?digest(overrides[file]):fileDigest(path.join(root,file))]))}
export function prepare(root,{projectId,clubIds,authority,now=Date.now()}){
 ensure(typeof projectId==='string'&&projectId.length>0,'PROJECT_REQUIRED');ensure(Array.isArray(clubIds)&&clubIds.length>0&&new Set(clubIds).size===clubIds.length&&clubIds.every(x=>typeof x==='string'&&x&&!x.includes('/')),'CLUB_SCOPE_REQUIRED');
 const sourceIdentity=verifySourceIdentity(root,runtimeHash(root));
 if(!projectId.startsWith('demo-'))ensure(projectId!=='quanly-tst'&&['app.js','js/firebase/config.js'].every(file=>firebaseProjectInSource(fs.readFileSync(path.join(root,file),'utf8'))===projectId),'STAGING_FIREBASE_CONFIG_MISMATCH');
 const maintenance=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),contract=fs.readFileSync(path.join(root,'js/core/attendanceContract.js'),'utf8');
 ensure(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;\s*\}/.test(maintenance),'SOURCE_NOT_MAINTENANCE');ensure(contract.includes('export const HISTORY_COACH_ACCESS = false;'),'CLIENT_NOT_MAINTENANCE');
 const oldAuthority=contract.match(/export const HISTORY_AUTHORITY = '([^']+)';/)?.[1];ensure(oldAuthority,'CONTRACT_AUTHORITY_MISSING');
 const next=authority||'attendance-history-'+crypto.randomUUID();ensure(/^attendance-history-[0-9a-f-]{36}$/.test(next)&&next!==oldAuthority,'FRESH_AUTHORITY_REQUIRED');
 const activeRules=maintenance.replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )false(;\s*\})/,'$1true$2').replaceAll(oldAuthority,next);
 const activeContract=contract.replace(oldAuthority,next).replace('export const HISTORY_COACH_ACCESS = false;','export const HISTORY_COACH_ACCESS = true;');
 const activeTag='qr-v11r6-active-20261022-'+next.slice(-12),initialOverrides={'js/core/attendanceContract.js':activeContract};
 // Rebind DEMO candidates too: an old test harness must not inherit production config/cache URLs.
 if(projectId.startsWith('demo-'))for(const file of ['app.js','js/firebase/config.js']){const text=fs.readFileSync(path.join(root,file),'utf8');if(firebaseProjectInSource(text)!==projectId)initialOverrides[file]=rebindFirebaseConfig(text,demoFirebaseConfig(projectId));}
 const {overrides:runtimeOverrides,graph:cacheGraph}=rewriteCacheGraph(root,initialOverrides,activeTag);
 const indexes=JSON.parse(fs.readFileSync(path.join(root,'firestore.indexes.json'),'utf8'));
 const plan={schema:2,kind:'OFFLINE_CUTOVER_PROPOSAL_NOT_APPROVAL',createdAt:new Date(now).toISOString(),projectId,clubIds:[...clubIds].sort(),authority:next,oldAuthority,sourceIdentity,cacheGraphSHA256:digest(cacheGraph),cacheScope:cacheGraph.scope,maintenanceRulesSHA256:digest(maintenance),sourceRuntimeSHA256:runtimeHash(root),activeRuntimeSHA256:runtimeHash(root,runtimeOverrides),activeBuildTag:activeTag,runtimeOverrideHashes:Object.fromEntries(Object.entries(runtimeOverrides).map(([file,text])=>[file,digest(text)])),activeRulesSHA256:digest(activeRules),activeContractSHA256:digest(activeContract),indexesSHA256:fileDigest(path.join(root,'firestore.indexes.json')),requiredAttendanceIndexes:indexes.indexes.filter(i=>i.collectionGroup==='attendance').map(digest).sort(),historyPolicy:'branch-at-attendance',newCASReadsPerIntentPerAttempt:1,maxAttempts:3};
 return {plan,activeRules,activeContract,runtimeOverrides,cacheGraph};
}
function indexProof(plan,indexes){
 ensure(indexes?.projectId===plan.projectId&&indexes.databaseId==='(default)'&&indexes.indexesSHA256===plan.indexesSHA256,'INDEX_IDENTITY_MISMATCH');
 ensure(Array.isArray(indexes.entries),'INDEX_PROOF_MISSING');
 for(const hash of plan.requiredAttendanceIndexes)ensure(indexes.entries.some(i=>i.definitionSHA256===hash&&i.state==='READY'),'INDEX_NOT_READY');
}
export function validate(bundle,{scan,indexes,approval,signature,ownerPublicKey,trustedOwnerKeySHA256,historyEvidence,now=Date.now()}){
 const p=bundle.plan;ensure(p&&digest(bundle.activeRules)===p.activeRulesSHA256&&digest(bundle.activeContract)===p.activeContractSHA256&&digest(bundle.cacheGraph)===p.cacheGraphSHA256&&canonical(Object.fromEntries(Object.entries(bundle.runtimeOverrides||{}).map(([f,t])=>[f,digest(t)])))===canonical(p.runtimeOverrideHashes),'CANDIDATE_TAMPERED');
 ensure(typeof ownerPublicKey==='string'&&typeof trustedOwnerKeySHA256==='string'&&/^[0-9a-f]{64}$/.test(trustedOwnerKeySHA256),'TRUSTED_OWNER_KEY_REQUIRED');
 const key=crypto.createPublicKey(ownerPublicKey);ensure(key.asymmetricKeyType==='ed25519','OWNER_KEY_TYPE');const der=key.export({type:'spki',format:'der'});ensure(crypto.createHash('sha256').update(der).digest('hex')===trustedOwnerKeySHA256,'OWNER_KEY_NOT_PINNED');
 ensure(approval?.decision==='approved'&&approval?.authority==='system_owner','OWNER_DECISION_PENDING');
 const demo=p.projectId.startsWith('demo-');ensure(demo?approval.evidenceScope==='DEMO_ONLY':approval.evidenceScope==='STAGING_VERIFIED','DEMO_EVIDENCE_NOT_REAL_APPROVAL');
 ensure(crypto.verify(null,Buffer.from(canonical(approval)),key,Buffer.from(signature||'','base64')),'OWNER_SIGNATURE_INVALID');
 ensure(approval.planSHA256===digest(p)&&approval.scanSHA256===digest(scan)&&approval.indexProofSHA256===digest(indexes),'APPROVAL_IDENTITY_MISMATCH');
 ensure(approval.projectId===p.projectId&&canonical(approval.clubIds)===canonical(p.clubIds),'APPROVAL_SCOPE_MISMATCH');
 ensure(approval.historyPolicy===p.historyPolicy&&approval.newCASVersionReadsApproved===true&&approval.maxTransactionAttempts===3&&approval.maxCASDocumentGetsPerIntentPerInvocation>=3&&approval.rulesRetryReconnectBudgetApproved===true&&approval.legacyRecoveryPolicy==='quarantine-no-auto-replay','NEW_SCOPE_NOT_APPROVED');
 ensure(approval.backupSHA256===scan?.backupSHA256&&/^[0-9a-f]{64}$/.test(approval.backupSHA256||''),'BACKUP_REQUIRED');
 ensure(Number.isFinite(time(approval.validUntil))&&time(approval.validUntil)>now&&Number.isFinite(time(approval.approvedAt))&&time(approval.approvedAt)<=now,'APPROVAL_EXPIRED');
 ensure(Number.isSafeInteger(approval.monitoring?.maxReadDocumentsPerDay)&&approval.monitoring.maxReadDocumentsPerDay>0&&Number.isSafeInteger(approval.monitoring?.maxConflictCountPerHour)&&approval.monitoring.maxConflictCountPerHour>=0&&approval.monitoring.action==='pause-coach-attendance-and-investigate','MONITORING_REQUIRED');
 ensure(approval.rollback==='maintenance-deny-preserve-raw-and-versions','ROLLBACK_REQUIRED');
 ensure(scan?.projectId===p.projectId&&scan.databaseId==='(default)'&&scan.maintenanceRulesSHA256===p.maintenanceRulesSHA256&&scan.authority===p.authority&&canonical(scan.clubIds)===canonical(p.clubIds),'SCAN_IDENTITY_MISMATCH');
 ensure(scan.oldClientsQuiesced===true&&scan.inflightWritesSettled===true,'OLD_CLIENTS_NOT_QUIESCED');
 ensure(scan.serverConfirmed===true&&scan.complete===true&&scan.pendingWrites===false&&scan.lastPageEmpty===true&&scan.finalCursor===null&&Array.isArray(scan.cohorts),'SCAN_INCOMPLETE');
 ensure(scan.cohorts.length===p.clubIds.length&&new Set(scan.cohorts.map(x=>x.clubId)).size===p.clubIds.length&&p.clubIds.every(club=>scan.cohorts.some(x=>x.clubId===club&&x.count===0&&x.complete===true)),'COHORT_NOT_ZERO');
 ensure(Number.isFinite(time(scan.maintenanceObservedAt))&&Number.isFinite(time(scan.startedAt))&&Number.isFinite(time(scan.finishedAt))&&time(scan.maintenanceObservedAt)<=time(p.createdAt)&&time(scan.startedAt)>=time(p.createdAt)&&time(scan.finishedAt)>=time(scan.startedAt)&&time(scan.finishedAt)<=now,'SCAN_ORDER_INVALID');
 ensure(Number.isSafeInteger(approval.maxScanAgeSeconds)&&approval.maxScanAgeSeconds>0&&approval.maxScanAgeSeconds<=3600&&(now-time(scan.finishedAt))/1000<=approval.maxScanAgeSeconds,'SCAN_STALE');
 indexProof(p,indexes);if(!demo)requireStagingHistory(p,scan,historyEvidence,approval,{publicKey:ownerPublicKey,trustedKeySHA256:trustedOwnerKeySHA256,now});
 return Object.freeze({status:demo?'DEMO_VERIFIED_NOT_RELEASE':'STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED',planSHA256:digest(p),scanSHA256:digest(scan),approvalSHA256:digest(approval)});
}
function writeActive(bundle,evidence,proof,claim,sourceRoot){
 assertNewOutputClaim(claim);
 ensure(fs.readdirSync(claim.output).length===0,'NEW_OUTPUT_NOT_EMPTY');
 ensure(proof?.planSHA256===digest(bundle.plan)&&['DEMO_VERIFIED_NOT_RELEASE','STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED'].includes(proof.status),'VALIDATED_PROOF_REQUIRED');
 // Validate all paths before the first write. Journal only changes its contract URL.
 const reviewedScope=new Set(affectedModules(buildImportGraph(sourceRoot)));
 for(const file of Object.keys(bundle.runtimeOverrides))ensure(reviewedScope.has(file),'OVERRIDE_OUTSIDE_SCOPE');
 // Populate a new candidate; no target file is ever opened with truncation.
 for(const file of runtimeFiles(sourceRoot))writeNewOwnedFile(claim,file,Object.hasOwn(bundle.runtimeOverrides,file)?bundle.runtimeOverrides[file]:fs.readFileSync(path.join(sourceRoot,file)));
 writeNewOwnedFile(claim,'firestore.rules',bundle.activeRules);
 writeNewOwnedFile(claim,'firestore.indexes.json',fs.readFileSync(path.join(sourceRoot,'firestore.indexes.json')));
 ensure(runtimeHash(claim.output)===bundle.plan.activeRuntimeSHA256,'OUTPUT_RUNTIME_MISMATCH');
 writeNewOwnedFile(claim,'CUTOVER_PROOF.json',JSON.stringify(proofRecord(bundle,evidence,proof,claim),null,2));
}
function proofRecord(bundle,evidence,proof,claim){return {...proof,proofSchema:1,plan:bundle.plan,noDeploy:true,outputOwner:{dev:claim.dev,ino:claim.ino},verification:{...evidence,now:evidence.now??Date.now()}}}
export function restrictiveRollback(bundle) {
 ensure(digest(bundle.activeRules)===bundle.plan.activeRulesSHA256&&digest(bundle.activeContract)===bundle.plan.activeContractSHA256,'CANDIDATE_TAMPERED');
 const tag=bundle.plan.activeBuildTag,holdTag=tag+'-hold';
 const runtimeOverrides=Object.fromEntries(Object.entries(bundle.runtimeOverrides).map(([file,text])=>[file,text.replaceAll(tag,holdTag)]));
 runtimeOverrides['js/core/attendanceContract.js']=bundle.activeContract.replace('export const HISTORY_COACH_ACCESS = true;','export const HISTORY_COACH_ACCESS = false;');
 const rules=bundle.activeRules.replace(/(function coachAttendanceCutoverOpen\(\)\s*\{\s*return )true(;\s*\})/,'$1false$2');
 ensure(rules!==bundle.activeRules,'ROLLBACK_MUST_DENY');
 return {kind:'RESTRICTIVE_ROLLBACK_NOT_DEPLOYED',authorityPreserved:bundle.plan.authority,rules,runtimeOverrides,rulesSHA256:digest(rules),noDataWrites:true,noJournalDeletion:true};
}
function verifyCurrentBundle(bundle,evidence,sourceRoot) {
 ensure(runtimeHash(sourceRoot)===bundle.plan.sourceRuntimeSHA256&&fileDigest(path.join(sourceRoot,'firestore.rules'))===bundle.plan.maintenanceRulesSHA256&&fileDigest(path.join(sourceRoot,'firestore.indexes.json'))===bundle.plan.indexesSHA256,'CURRENT_SOURCE_CHANGED');
 const rebuilt=prepare(sourceRoot,{projectId:bundle.plan.projectId,clubIds:bundle.plan.clubIds,authority:bundle.plan.authority,now:Date.parse(bundle.plan.createdAt)});ensure(canonical(rebuilt)===canonical(bundle),'CANDIDATE_NOT_DERIVED_FROM_SOURCE');
 return validate(bundle,evidence);
}
// Only a capability minted by claimNewOutput in this process can enter this API.
// Used by make-demo-active, which owns cleanup of its complete source checkout.
export function activateIntoNewClaim(bundle,evidence,claim,sourceRoot=process.cwd()) {
 assertNewOutputClaim(claim);ensure(claim.source===fs.realpathSync(sourceRoot),'OUTPUT_SOURCE_MISMATCH');
 const proof=verifyCurrentBundle(bundle,evidence,claim.source);
 writeActive(bundle,evidence,proof,claim,claim.source);return proof;
}
export function activate(bundle,evidence,directory,sourceRoot=process.cwd()) {
 const paths=isolatedOutputPaths(sourceRoot,directory,{requireNew:true});
 const proof=verifyCurrentBundle(bundle,evidence,paths.source);let claim;
 try{claim=claimNewOutput(paths);writeActive(bundle,evidence,proof,claim,paths.source);return proof}
 catch(error){cleanupOwnedOutput(claim);throw error}
}
function readOwnedJSON(claim,file){
 const target=ownedFilePath(claim,file),stat=fs.lstatSync(target);
 ensure(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'CANDIDATE_METADATA_NOT_OWNED');
 const text=fs.readFileSync(target,'utf8');assertOwnedOutput(claim);return {data:JSON.parse(text),text};
}
function replaceOwnedJSON(claim,file,value,expected){
 const current=readOwnedJSON(claim,file);ensure(current.text===expected,'CANDIDATE_METADATA_CHANGED');
 const temp='.'+file+'.'+crypto.randomUUID()+'.tmp';let created=false;
 try{
  writeNewOwnedFile(claim,temp,JSON.stringify(value,null,2));created=true;
  ensure(readOwnedJSON(claim,file).text===expected,'CANDIDATE_METADATA_CHANGED');
  assertOwnedOutput(claim);fs.renameSync(ownedFilePath(claim,temp),ownedFilePath(claim,file));assertOwnedOutput(claim);created=false;
 }finally{if(created){try{assertOwnedOutput(claim);fs.unlinkSync(ownedFilePath(claim,temp))}catch{ /* Never traverse a replaced output for cleanup. */ }}}
}
// Refresh proof metadata only. Runtime, Rules, indexes and journals are never rewritten.
export function refreshDemoCandidate(bundle,evidence,directory,sourceRoot=process.cwd()) {
 const paths=isolatedOutputPaths(sourceRoot,directory),stat=fs.lstatSync(paths.output);
 ensure(stat.isDirectory()&&!stat.isSymbolicLink(),'OUTPUT_OWNERSHIP_CHANGED');
 const claim=Object.freeze({...paths,dev:stat.dev,ino:stat.ino});assertOwnedOutput(claim);
 const saved=readOwnedJSON(claim,'CUTOVER_PROOF.json'),old=saved.data,metadata=readOwnedJSON(claim,'DEMO_ACTIVE_ONLY.json');
 ensure(old.proofSchema===1&&old.noDeploy===true&&old.status==='DEMO_VERIFIED_NOT_RELEASE'&&old.plan?.projectId?.startsWith('demo-')&&old.outputOwner?.dev===claim.dev&&old.outputOwner?.ino===claim.ino,'CANDIDATE_PROOF_INVALID');
 const oldBundle=prepare(paths.source,{projectId:old.plan.projectId,clubIds:old.plan.clubIds,authority:old.plan.authority,now:Date.parse(old.plan.createdAt)});
 ensure(canonical(oldBundle.plan)===canonical(old.plan),'CANDIDATE_PROOF_INVALID');
 const oldProof=validate(oldBundle,old.verification);
 ensure(Object.entries(oldProof).every(([key,value])=>old[key]===value)&&canonical(metadata.data.source)===canonical(old.plan)&&canonical(metadata.data.proof)===canonical(oldProof),'CANDIDATE_PROOF_INVALID');
 for(const key of ['projectId','clubIds','authority','activeRuntimeSHA256','activeRulesSHA256','indexesSHA256','activeBuildTag'])ensure(canonical(old.plan[key])===canonical(bundle.plan[key]),'REFRESH_IDENTITY_MISMATCH');
 ensure(runtimeHash(paths.output)===old.plan.activeRuntimeSHA256&&fileDigest(path.join(paths.output,'firestore.rules'))===old.plan.activeRulesSHA256&&fileDigest(path.join(paths.output,'firestore.indexes.json'))===old.plan.indexesSHA256,'CANDIDATE_RUNTIME_CHANGED');
 const proof=verifyCurrentBundle(bundle,evidence,paths.source);ensure(proof.status==='DEMO_VERIFIED_NOT_RELEASE','DEMO_REFRESH_ONLY');assertOwnedOutput(claim);
 replaceOwnedJSON(claim,'CUTOVER_PROOF.json',proofRecord(bundle,evidence,proof,claim),saved.text);
 replaceOwnedJSON(claim,'DEMO_ACTIVE_ONLY.json',{...metadata.data,proof,source:bundle.plan,scan:evidence.scan,indexes:evidence.indexes},metadata.text);
 return proof;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const [action,input,output,keyPath,pinned]=process.argv.slice(2);
  if(action==='prepare'){const options=JSON.parse(fs.readFileSync(input));const bundle=prepare(process.cwd(),options);fs.writeFileSync(output,JSON.stringify(bundle,null,2));console.log('PROPOSAL_ONLY: no access opened, no data modified');}
  else if(action==='validate'){const data=JSON.parse(fs.readFileSync(input)),ownerPublicKey=fs.readFileSync(keyPath,'utf8'),proof=activate(data.bundle,{...data.evidence,ownerPublicKey,trustedOwnerKeySHA256:pinned},output);console.log(proof.status)}else throw Error('Usage: prepare options.json proposal.json | validate decision-bundle.json output-directory owner-public.pem trusted-owner-key-sha256');
 }catch(error){console.error(error.code||'CUTOVER_BLOCKED',error.message);process.exitCode=1}
}
