import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function loadBundle(root=process.cwd()) {
  const dir=path.join(root,'evidence/AUTH_STARTUP_R1B');
  const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  const decision=fs.readFileSync(path.join(dir,'16_FINAL_DECISION.md'),'utf8');
  const recommendation=fs.readFileSync(path.join(dir,'15_R1C_RECOMMENDATION.md'),'utf8').match(/```text\s*([^`]+?)\s*```/)?.[1]?.trim();
  return {classification:decision.match(/```text\s*([^`]+?)\s*```/)?.[1]?.trim(),recommendation,auth:read('02_REAL_AUTH_ACCEPTANCE.json'),multiTab:read('03_MULTI_TAB_AUTH.json'),dom:read('04_DOM_TENANT_ISOLATION.json'),listeners:read('05_LISTENER_TENANT_ISOLATION.json'),profiles:read('06_PROFILE_STARTUP_OWNER.json'),mainFailure:read('07_MAIN_FAILURE_TEST.json'),slowMain:read('08_SLOW_MAIN_TEST.json'),startup:read('09_STARTUP_TRACES.json'),resources:read('10_RESOURCE_TIMING.json'),longTasks:read('11_LONG_TASKS.json'),freeze:read('SOURCE_FREEZE.json')};
}

// Report consistency guard only. It does not execute Auth or certify a browser.
export function validateBundle(b) {
  const errors=[];
  const require=(condition,code)=>{if(!condition)errors.push(code)};
  require(b.freeze.status==='PASS'&&b.freeze.changedOriginalFiles.length===0,'SOURCE_FREEZE_REQUIRED');
  if(b.classification==='STARTUP_MEASUREMENT_BLOCKED') {
    require(b.recommendation==='MORE_MEASUREMENT_REQUIRED','BLOCKED_RUN_CANNOT_RECOMMEND_OPTIMIZATION');
    require(b.auth.nativeBrowserAuthRuns===0&&b.auth.cases.every(c=>c.status==='NOT_RUN'),'UNEXECUTED_AUTH_CASE_CANNOT_PASS');
    require(b.startup.realStartupTraceCount===0,'BLOCKED_TRACE_COUNT_MUST_MATCH_EVIDENCE');
    require(b.startup.scenarios.every(s=>s.validRuns===0&&s.runs.length===0&&Object.values(s.marks).every(v=>v===null)&&s.criticalPathMedianMs===null&&s.postShellMedianMs===null),'MISSING_TIMING_CANNOT_BECOME_NUMBER');
    require(b.profiles.PROFILE_STARTUP_OWNER===null,'PROFILE_OWNER_REQUIRES_NATIVE_OBSERVATION');
    require(b.resources.entries.length===0&&b.longTasks.scenarios.every(s=>Object.values(s.windows).every(w=>w.count===null&&w.totalDurationMs===null&&w.maxDurationMs===null)),'UNOBSERVED_RESOURCE_LONG_TASK_DATA');
  } else if(b.classification==='AUTH_STARTUP_R1B_MEASUREMENT_ACCEPTED') {
    require(b.auth.nativeBrowserAuthRuns>=14&&b.auth.cases.length>=14&&b.auth.cases.every(c=>c.status==='PASS'&&c.actualFirebaseRuntime!==null),'REAL_AUTH_ACCEPTANCE_REQUIRED');
    require(b.multiTab.nativeRuns>0&&b.multiTab.realSameOriginTabs>=2&&b.multiTab.onlyBMounted===true,'REAL_MULTI_TAB_ACCEPTANCE_REQUIRED');
    require(b.dom.frameCount>0&&b.dom.staleFramesAfterBAuthoritative===0&&b.dom.passed===true,'NATIVE_FRAME_ISOLATION_REQUIRED');
    require(b.listeners.oldClubTotalActiveListeners===0&&Object.values(b.listeners.afterBCurrent).every(o=>o.oldClubActiveCount===0&&o.unsubscribeObserved===true),'ACTUAL_LISTENER_DETACH_REQUIRED');
    require(b.profiles.PROFILE_STARTUP_OWNER==='CANONICAL_ACTIVE'&&b.profiles.actualCanonicalPathMounted===true,'CANONICAL_ADMIN_PROFILE_OWNER_REQUIRED');
    require(b.profiles.coachCanonicalUnavailable.failedClosed===true&&b.profiles.coachCanonicalUnavailable.adminFullProfilesFallbackUsed===false,'COACH_FAIL_CLOSED_REQUIRED');
    require(b.mainFailure.mainJsRequestFailureInjected===true&&b.mainFailure.firstSafeUserInteractionReady===false&&b.mainFailure.businessActionsEnabledAsSuccessful===false&&b.mainFailure.clearBootstrapFailureState===true,'MAIN_FAILURE_ACCEPTANCE_REQUIRED');
    require(b.slowMain.runs.slice(0,2).every(r=>r.status==='PASS'&&b.slowMain.allowedObservedClassifications.includes(r.actualClassification)),'SLOW_MAIN_NATIVE_EVIDENCE_REQUIRED');
    require(b.startup.firebaseBridgeOrder.bridgeExistedBeforeAppEvaluation===true,'BRIDGE_ORDER_ACCEPTANCE_REQUIRED');
    require(b.startup.scenarios.length>=6&&b.startup.scenarios.every(s=>s.validRuns>0&&s.runs.length>=s.validRuns),'COMPLETE_STARTUP_MATRIX_REQUIRED');
    const principal=b.startup.scenarios.find(s=>s.principalScenario);
    require(principal?.validRuns>=5,'FIVE_PRINCIPAL_MOBILE_TRACES_REQUIRED');
    require(Object.values(b.auth.observerOffOnEquivalence).filter(v=>typeof v==='boolean').length>=4&&b.auth.observerOffOnEquivalence.authTenantBehaviorEquivalent===true&&b.auth.observerOffOnEquivalence.promiseIdentityEquivalent===true&&b.auth.observerOffOnEquivalence.firebaseIOEquivalent===true&&b.auth.observerOffOnEquivalence.executionOrderEquivalent===true,'OBSERVER_OFF_ON_EQUIVALENCE_REQUIRED');
  } else require(false,'UNKNOWN_REPORT_CLASSIFICATION_FOR_THIS_BUNDLE');
  return {kind:'REPORT_CONSISTENCY_ONLY_NOT_BROWSER_ACCEPTANCE',valid:errors.length===0,classification:b.classification,realBrowserAcceptanceCertifiedByThisTool:false,errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=validateBundle(loadBundle());
  fs.writeFileSync('evidence/AUTH_STARTUP_R1B/EVIDENCE_CONTRACT_CHECK.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;
}
