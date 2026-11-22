from pathlib import Path
import hashlib, json, re

root=Path.cwd()
out=root/'evidence/AUTH_STARTUP_R1B'
load=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write=lambda name,text:(out/name).write_text(text.strip()+'\n')
dump=lambda name,value:(out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
freeze=load(out/'SOURCE_FREEZE.json')
reg=load(out/'offline-regressions/results.json')
old_gate=load(out/'r1a-offline-regression/phase-gate.json')
old_isolation=load(out/'r1a-offline-regression/isolation.json')
old_controls=load(out/'r1a-offline-regression/controls.json')
preflight=load(out/'environment-preflight.json')
input_manifest=load(out/'INPUT_SOURCE_SHA256.json')
assert freeze['status']=='PASS' and not freeze['changedOriginalFiles']
assert reg['passed']==reg['total']==30
assert old_gate['passed']==old_gate['total']==9
source=(root/'app.js').read_text()
main=(root/'js/main.js').read_text()
html=(root/'index.html').read_text()
line=lambda text,needle:text[:text.index(needle)].count('\n')+1
registry_timeout=int(re.search(r'_LISTENER_REGISTRY_READY_TIMEOUT_MS = (\d+)',source)[1])
legacy_deadline=int(re.search(r'var BOOT_TIMEOUT_MS = (\d+)',html)[1])
blocked='BROWSER_EXECUTION_OR_LOCAL_TEST_TRANSPORT_UNAVAILABLE'
input_sha='b51972344247cdbf087c8160e6dfc42e582f14badcbe1f3e75d434c937f0796f'

write('01_INPUT_IDENTITY.md',f'''
# 01 — Input identity / source freeze

Input: `A9R18_AUTH_TENANT_ISOLATION_STARTUP_R1A_FULL_SOURCE_TEST_CANDIDATE(1).zip`.

Outer SHA-256: `{input_sha}` — VERIFIED. ZIP CRC: PASS. Bản re-upload được xác định theo đúng tên; bytes local khớp outer hash yêu cầu. Chỉ source được đưa vào cây chạy R1B.

| Canonical file | SHA-256 | Result |
|---|---|---|
| app.js | `{sha(root/'app.js')}` | VERIFIED |
| js/main.js | `{sha(root/'js/main.js')}` | VERIFIED |
| js/utils/listeners.js | `{sha(root/'js/utils/listeners.js')}` | VERIFIED |

Snapshot toàn bộ 1.997 file input ở `INPUT_SOURCE_SHA256.json`. Tất cả file input được giữ riêng, đặt chế độ chỉ đọc và kiểm SHA trước/sau. Không chỉnh file canonical rồi phục hồi. Chỉ thêm file trong `tools/auth-startup-r1b/` và `evidence/AUTH_STARTUP_R1B/`.

Runtime vẫn giữ config canonical của `quanly-tst`; do đó không mở app này để thử race. Chưa tạo staging artifact hoặc deploy. Probe localhost chỉ phục vụ một trang HTML trung tính không có SDK, Auth hoặc tenant data.

Chi tiết browser preflight ở `environment-preflight.json`. Cả 1.997 file source/tooling gốc giữ nguyên, gồm mọi hash/test expectation của R1A.
''')

case_plan=[
 ('T01','A normal native login'),('T02','B normal native login'),('T03','A → logout → B'),
 ('T04','direct A → B without null'),('T05','A actual delayed authority success → B'),
 ('T06','A actual delayed authority error → B'),('T07','A stale error cannot signOut current B'),
 ('T08','Coach A CS1 → Coach B CS2'),('T09','Admin → Coach'),('T10','Coach → Admin'),
 ('T11','SuperAdmin stale → Admin'),('T12','Admin stale → SuperAdmin'),
 ('T13','same-origin native multi-tab A → B'),('T14','same-UID A reentry'),
]
cases=[{'id':cid,'scenario':name,'status':'NOT_RUN','reason':blocked,'actualFirebaseRuntime':None,'actualOutcome':None} for cid,name in case_plan]
dump('02_REAL_AUTH_ACCEPTANCE.json',{
 'status':'NOT_RUN','acceptance':'NOT_ACCEPTED','nativeBrowserAuthRuns':0,
 'environmentPreflight':preflight,'productionAuthRaceAttempts':0,'cases':cases,
 'sameUidReentry':{'status':'NOT_RUN','fullTeardownRemountObserved':None,'duplicateTenantListeners':None,'staleTenantListeners':None,'crossTenantState':None,'permanentRuntimeBreakage':None,'duplicateWriter':None,'duplicateBootstrapFlight':None,'triggerMechanismObserved':None,'rule':'Report whether native SDK emits the repeated same UID; do not label a manually invoked callback as a naturally emitted native Auth event.'},
 'observerOffOnEquivalence':{'status':'NOT_RUN','authTenantBehaviorEquivalent':None,'promiseIdentityEquivalent':None,'firebaseIOEquivalent':None,'executionOrderEquivalent':None},
 'r1aOfflineRegression':{'scope':'VM_ONLY_NOT_R1B_BROWSER_ACCEPTANCE','caseCount':old_isolation['totalCases'],'passed':old_isolation['passedCases'],'assertions':old_isolation['totalAssertions'],'controlChecks':old_controls['total'],'controlChecksPassed':old_controls['passed'],'countsTowardR1BAcceptance':False},
 'fixtureMethodRequired':'Real Firebase SDK against Auth+Firestore Emulator or verified isolated staging; actual native authority responses must be delayed without blocking B. No mock Auth/currentUser or direct commit-call substitute.'
})
dump('03_MULTI_TAB_AUTH.json',{'status':'NOT_RUN','realSameOriginTabs':None,'nativePersistenceTransportObserved':None,'AInvalidated':None,'BVerified':None,'onlyBMounted':None,'lateAEffects':None,'nativeRuns':0,'syntheticAuthBusAcceptedAsEvidence':False,'reason':blocked,'required':'Two real same-origin browser tabs, shared native Firebase persistence and observed auth transition; never substitute the R1A VM bus.'})
dump('04_DOM_TENANT_ISOLATION.json',{'status':'NOT_RUN','observation':'frame-level native browser observation required','markers':['CLUB_A_ONLY_MARKER','CLUB_B_ONLY_MARKER'],'frameSamples':[],'frameCount':None,'staleFramesAfterBAuthoritative':None,'visibleAMarkerAfterBAuthoritative':None,'passed':None,'cutoffDefinition':'Record both B auth-event reception and B verified/club-authority acceptance. During verification the protected screen must be neutral; no speculative B tenant data. After B is authoritative any visible A marker is fatal.','reason':blocked})
owners=['club root','settings','profiles','transactions','inventory','notifications']
dump('05_LISTENER_TENANT_ISOLATION.json',{'status':'NOT_RUN','nativeSubscriptionEvidence':None,'generationGuardAloneAccepted':False,'afterBCurrent':{name:{'oldClubActiveCount':None,'unsubscribeObserved':None,'registryOwnerVerified':None} for name in owners},'oldClubTotalActiveListeners':None,'passed':None,'reason':blocked,'sameUid':{'duplicateListeners':None,'bootstrapFlights':None,'fullTeardownRemount':None}})
dump('06_PROFILE_STARTUP_OWNER.json',{'status':'NOT_RUN','PROFILE_STARTUP_OWNER':None,'acceptedOwnerRequired':'CANONICAL_ACTIVE','rejectedNormalOwner':'LEGACY_FULL_FALLBACK','normalAdminRuns':0,'canonicalFunctionAvailableAtActualMount':None,'actualCanonicalPathMounted':None,'legacyFallbackObserved':None,'coachCanonicalUnavailable':{'status':'NOT_RUN','failedClosed':None,'adminFullProfilesFallbackUsed':None},'mandatoryFutureStartupRegressionGate':True,'sourceFactsOnly':{'canonicalExportLineInMain':line(main,'window.mountActiveProfilesListener  = mountActiveProfilesListener'),'registryBridgeLineInMain':line(main,'window.safeRegisterSnapshot      = safeRegisterSnapshot'),'canonicalFilesUnchanged':True,'sourceAssignmentDoesNotProveRuntimeMounted':True},'reason':blocked})
dump('07_MAIN_FAILURE_TEST.json',{'status':'NOT_RUN','nativeAuthResolved':None,'mainJsRequestFailureInjected':False,'firstSafeUserInteractionReady':None,'usableShellClaimed':None,'businessActionsEnabledAsSuccessful':None,'clearBootstrapFailureState':None,'correctTenantIsolation':None,'passed':None,'reason':blocked,'rule':'First-safe readiness cannot be derived from visible mainApp/shellShown alone.'})
dump('08_SLOW_MAIN_TEST.json',{'status':'NOT_RUN','sourceConstants':{'listenerRegistryReadyTimeoutMs':registry_timeout,'legacyDependencyBootstrapDeadlineMs':legacy_deadline},'constantsModified':False,'runs':[{'id':'S01','scenario':'main delayed beyond observed registry-wait start + current registry threshold','status':'NOT_RUN','actualDelayMs':None,'actualClassification':None},{'id':'S02','scenario':'main fetch delayed near 15s legacy bootstrap deadline; observe which clock actually applies','status':'NOT_RUN','actualDelayMs':None,'actualClassification':None},{'id':'S03','scenario':'legacy bootstrap dependency readiness itself reaches existing deadline','status':'NOT_RUN','actualDelayMs':None,'actualClassification':None}],'allowedObservedClassifications':['LISTENER_REGISTRY_TIMEOUT','MAIN_BOOTSTRAP_DEADLINE','RECOVERED'],'importantSourceDistinction':'BOOT_TIMEOUT_MS guards legacy prerequisites before main.js injection, not an independent fetch timeout once a main.js request is issued. Do not conflate the two timers.','reason':blocked})

marks=['navigationStart','domInteractive','firebaseSdkReady','appJsRequestStart','appJsRequestEnd','appJsEvaluated','authObserverRegistered','authEventReceived','usersReadStart','usersReadEnd','coachVerificationStart','coachVerificationEnd','verifiedAuthCommit','mainJsRequestStart','mainJsRequestEnd','mainJsExecuted','listenerRegistryReady','clubListenerRegistered','clubFirstSnapshot','clubAuthorityAccepted','shellShown','defaultTabRuntimeReady','firstSafeUserInteractionReady','startupIdle','loginSubmit']
scenario_plan=[('A1','Admin desktop restored cold','restored','cold',None),('A2','Admin mobile 390 restored cold','restored','cold',390),('A3','Admin mobile 390 restored warm','restored','warm',390),('A4','Admin mobile 390 manual','manual','not_combined_with_restored',390),('C1','Coach mobile 390 restored cold','restored','cold',390),('C2','Coach mobile 390 manual','manual','not_combined_with_restored',390)]
scenarios=[]
for sid,name,mode,cache,width in scenario_plan:
 scenarios.append({'id':sid,'scenario':name,'status':'NOT_RUN','mode':mode,'cacheMode':cache,'viewportWidth':width,'principalScenario':sid=='A2','targetValidRuns':5,'validRuns':0,'criticalPathOrigin':'navigationStart' if mode=='restored' else 'loginSubmit','marks':{m:None for m in marks},'notApplicableMarks':(['loginSubmit'] if mode=='restored' else [])+(['coachVerificationStart','coachVerificationEnd'] if sid.startswith('A') else []),'firstSafeReadiness':{'currentFirebaseUidVerified':None,'usersDocVerified':None,'roleVerified':None,'clubVerified':None,'coachBranchVerifiedIfRequired':None,'clubAuthorityAccepted':None,'defaultTabMainRuntimeReady':None,'canonicalProfileOwnerAvailableWhereRequired':None,'blockingOverlayGone':None,'defaultTabAcceptsInteraction':None},'criticalPathMedianMs':None,'postShellMedianMs':None,'runs':[]})
dump('09_STARTUP_TRACES.json',{'status':'NOT_RUN','realStartupTraceCount':0,'syntheticTimingUsed':False,'scenarios':scenarios,'firebaseBridgeOrder':{'status':'NOT_RUN','coldLoadsExecuted':0,'bridgeExistedBeforeAppEvaluation':None,'classification':None},'loginHistoryContention':{'status':'NOT_RUN','networkWorkBeforeFirstSafeReady':None,'cpuWorkBeforeFirstSafeReady':None,'awaitedByInstrumentation':False,'runtimeChanged':False},'reason':blocked})
dump('10_RESOURCE_TIMING.json',{'status':'NOT_RUN','sourceRequired':'native PerformanceNavigationTiming and PerformanceResourceTiming','requiredGroups':['HTML','Firebase SDK modules','app.js','main.js','listeners.js','major module resources','CSS','fonts'],'fields':['requestStart','responseEnd','transferSize','encodedBodySize','decodedBodySize'],'entries':[],'scenarios':[{'id':s[0],'status':'NOT_RUN','entries':[]} for s in scenario_plan],'repositoryFileSizesSubstituted':False,'taoDetailAvailability':None,'reason':blocked})
windows=['navigationToAuthCommit','authCommitToShell','shellToFirstSafeReady','firstSafeReadyToIdle']
dump('11_LONG_TASKS.json',{'status':'NOT_RUN','sourceRequired':'native browser PerformanceObserver longtask entries','scenarios':[{'id':s[0],'status':'NOT_RUN','windows':{w:{'range':None,'count':None,'totalDurationMs':None,'maxDurationMs':None} for w in windows},'entries':[]} for s in scenario_plan],'unsupportedAndNotRunMustNotBecomeZero':True,'reason':blocked})
write('12_CRITICAL_PATH_ATTRIBUTION.md',f'''
# 12 — Critical-path attribution

**Chưa có số đo; primary candidate = null.** Không chọn `NO_SINGLE_DOMINANT` để thay cho việc chưa chạy. Không chọn main graph hoặc registry chỉ từ quan hệ source.

| Interval bắt buộc | Kết quả hiện tại |
|---|---|
| verifiedAuthCommit → mainJsRequestStart | null / NOT_RUN |
| mainJsRequestStart → mainJsRequestEnd | null / NOT_RUN |
| mainJsRequestEnd → mainJsExecuted | null / NOT_RUN |
| mainJsExecuted → listenerRegistryReady | null / NOT_RUN |
| listenerRegistryReady → clubListenerRegistered | null / NOT_RUN |
| clubListenerRegistered → clubAuthorityAccepted | null / NOT_RUN |

Không cộng các interval có thể chồng lấp. Một interval âm (ví dụ main request đã bắt đầu trước auth commit) mô tả overlap, không phải thời gian tiết kiệm hoặc dữ liệu để ép về 0. Giữ fetch, module graph dependency wait và CPU evaluation riêng.

Source cho thấy registry bridge nằm trong main initialization, được expose trước canonical profile function về vị trí text trong cùng bootstrap. Điều này chưa chứng minh một frame/race lỗi hoặc latency winner. Cần kiểm native event loop, successful main completion và profile owner thật trước khi bàn thay đổi thứ tự.

Registry wait hiện tại {registry_timeout} ms. Legacy bootstrap deadline {legacy_deadline} ms chỉ bảo vệ chờ `_fb_init`, `__appLoaded` và `scheduleRender` **trước main injection**; không được gọi nó là timeout tải main.js sau khi request đã bắt đầu. R1B không thay cả hai giá trị.

First-safe readiness cần đúng UID/users/role/club/Coach branch, accepted club authority, main runtime/default-tab handler, canonical profile owner, overlay đã tắt và một tương tác native thành công. `shellShown` không thay thế được.

Login history vẫn giữ nguyên. Network/CPU contention trước first-safe-ready chưa quan sát được, không đủ căn cứ defer.

Khi có trace hợp lệ mới chọn một trong các candidate được prompt cho phép: FIREBASE_SDK_BOOTSTRAP, APP_JS_DOWNLOAD_EVALUATION, AUTH_RESTORE, USER_AUTHORITY_READ, COACH_AUTHORITY, MAIN_JS_FETCH, MAIN_MODULE_EVALUATION, LISTENER_REGISTRY_WAIT, CLUB_AUTHORITY_NETWORK, DEFAULT_TAB_RUNTIME, POST_SHELL_HYDRATION, NO_SINGLE_DOMINANT.
''')
dump('13_FIRESTORE_BUDGET.json',{'status':'PASS','method':'same existing line-level canonical runtime patterns; app.js plus js/**; public not double-counted','input':{'getDoc':24,'getDocs':43,'onSnapshot':16},'afterR1B':freeze['firestoreBudget'],'productionSourceChangedFiles':[],'newProductionReaderCallSites':0,'newProductionWriterCallSites':0,'newProductionListenerCallSites':0,'newAuthOwner':0,'observerFirebaseIOEquivalence':{'status':'NOT_RUN','reason':'No measurement observer was activated in a native application runtime.'},'runtimeReadCountsMeasured':False})
table='\n'.join(f"| `{r['gate']}` | {r['status']} |" for r in reg['results'])
write('14_PROTECTED_REGRESSIONS.md',f'''
# 14 — Protected regressions và phạm vi bằng chứng

**30/30 protected gate ngoại tuyến PASS**, chạy mới trong R1B trên source input giữ nguyên. Đây không phải native browser/Auth acceptance.

| Gate | Kết quả |
|---|---|
{table}

R1A gate được chạy lại như một hồi quy ngoại tuyến: 9/9 phase checks, {old_isolation['passedCases']}/{old_isolation['totalCases']} VM isolation cases, {old_isolation['totalAssertions']}/{old_isolation['totalAssertions']} assertions, {old_controls['passed']}/{old_controls['total']} controls. Không cộng các kết quả này vào 14 ca real Auth của R1B.

Source freeze: 1.997/1.997 file input nguyên byte; root/public 129/129, 0 mismatch; Firestore 24/43/16. Không sửa test/hash expectation/pin R1A hoặc runtime app/main/listeners/index/business modules.

Chưa chạy các gate nghiệm thu thật: same-origin multi-tab, frame-level DOM, physical unsubscribe cho sáu owner, normal Admin canonical profile startup, Coach fail-closed trong browser, main failure/slow-main, repeated cold-load bridge order, observer OFF/ON equivalence. Tất cả được ghi NOT_RUN, không phải PASS.

Không khởi động lại Inventory Emulator acceptance hoặc Finance benchmark. Chỉ các gate authority/ledger ngoại tuyến trong bảng được chạy. Không deploy, không ghi cloud/production, không thêm Auth owner.
''')
write('15_R1C_RECOMMENDATION.md','''
# 15 — R1C recommendation

```text
MORE_MEASUREMENT_REQUIRED
```

Lý do: real Auth acceptance và startup matrix chưa chạy. Không đủ căn cứ chọn modulepreload, optional-work defer, role-aware module defer, club-authority overlap hoặc auth-kernel extraction.

Cần một browser automation environment chạy Chrome/Chromium và truy cập được Auth+Firestore Emulator, hoặc một isolated staging đã xác minh project/config/hostname/fixture. Browser thay thế hiện có không truy cập được endpoint thử local; không có staging được xác minh trong input.

Sau khi có môi trường: thực hiện 14 ca native Auth gồm same-UID reentry; xác minh frame DOM và actual listener detach; khóa CANONICAL_ACTIVE cho normal Admin; chạy main failure/slow-main và bridge-order cold loads; chỉ sau đó chạy OFF/ON equivalence và matrix A1–C2, mục tiêu 5 valid traces cho mobile restored cold. Giữ Auth persistence khi cold HTTP-cache, không đổi restored thành manual login. Manual latency bắt đầu ở loginSubmit và thống kê riêng.

Delay/failure injection của acceptance phải nằm ở native network/runtime operation trong môi trường thử. Không gọi callback/commit bằng tay rồi gọi đó là real Firebase transition. Trace fault-injected không được trộn vào median normal startup.

Không có R1C implementation trong gói này. Production code tiếp tục đóng băng.
''')
write('16_FINAL_DECISION.md',f'''
# 16 — Final decision

```text
STARTUP_MEASUREMENT_BLOCKED
```

Input đúng SHA `{input_sha}`; 1.997 file source/tooling input nguyên byte. Không có correctness RED mới được quan sát trên browser, và không tuyên bố R1A đã đạt native acceptance.

Blocker đã quan sát:

1. Chromium cục bộ lỗi Unix socket `Operation not permitted` trước app navigation.
2. Playwright headless shell chưa có executable; lần cài từ dependency chính thức thất bại vì download không phải ZIP hợp lệ.
3. Browser Chrome thay thế mở được about:blank nhưng từ chối endpoint local; thao tác bị browser URL policy chặn và báo connection refused. Không thử URL/surface/CDP workaround sau lần từ chối.
4. Không có isolated staging project/URL/fixtures được xác minh trong input. Emulator chưa khởi động và chưa provision fixtures vì đường browser chưa sẵn sàng.

Do đó: **0 real Auth acceptance runs, 0 startup traces**. Multi-tab/DOM frames/listener detach/profile owner/main failure/slow-main/bridge order/OFF–ON equivalence đều NOT_RUN. PROFILE_STARTUP_OWNER, primary bottleneck và mọi timing chưa quan sát đều null.

Đã chạy và đạt: source freeze 1.997/1.997; root/public 129/129; Firestore 24/43/16; 30/30 protected gate ngoại tuyến; R1A offline gate 9/9. Các gate ngoại tuyến không thay thế real browser evidence.

Exactly one R1C recommendation: **MORE_MEASUREMENT_REQUIRED**. Không performance optimization, không module/listener-order change, không authority change, không early registry, không business write/deploy.

Đây là evidence/full-source handoff bị chặn; source runtime giống input R1A. Chỉ có tooling/report R1B được thêm trong hai prefix được phép. Không phải một business candidate mới hoặc một bản startup đã nghiệm thu.
''')

write('R1B_RUN_MATRIX.json',json.dumps({'realAuthCases':[{'id':i,'scenario':s} for i,s in case_plan],'acceptanceIncludes':['sameUidReentry','frameLevelDom','actualListenerDetach','canonicalAdminProfiles','coachFailClosed','mainFailure','slowMain','firebaseBridgeBeforeApp'],'requiredTimingMarks':marks,'resourceFields':['requestStart','responseEnd','transferSize','encodedBodySize','decodedBodySize'],'longTaskWindows':windows,'collectionActivated':False,'productionSourceMayBeModified':False},ensure_ascii=False,indent=2))
print(json.dumps({'reports':16,'classification':'STARTUP_MEASUREMENT_BLOCKED','recommendation':'MORE_MEASUREMENT_REQUIRED','realAuthRuns':0,'realTraces':0,'offlineRegressions':reg['passed']},indent=2))
