import fs from 'node:fs'; const app=fs.readFileSync('app.js','utf8'), prof=fs.readFileSync('js/listeners/profiles.listeners.js','utf8'), srv=fs.readFileSync('js/core/superAdminServerRefresh.js','utf8'), statsWriter=fs.readFileSync('js/core/clubStatsAutoCache.js','utf8'), policy=fs.readFileSync('js/core/productionAuthorityPolicy.js','utf8'), superadmin=fs.readFileSync('js/modules/superadmin.js','utf8'), main=fs.readFileSync('js/main.js','utf8'); let p=0,f=0; const c=(n,x)=>{(x?(p++,console.log('✅',n)):(f++,console.error('❌',n)))};
c('Auth users verification remains single-flight source', app.includes('_readUserAuthorizationProfileOnce') && app.includes('_verifiedUserProfileFlight'));
const startup=app.slice(app.indexOf('Phase 4K-6V5U6A: Admin notifications'),app.indexOf('//  SUPER ADMIN:',app.indexOf('Phase 4K-6V5U6A: Admin notifications'))); c('Notifications have no normal parallel GET', !/(^|\n)\s*(?:window\.)?checkAdminNotifications\s*\(/m.test(startup));
c('Canonical transaction source remains one listener', (app.match(/const canonicalUnsub = onSnapshot/g)||[]).length===1);
c('Legacy transaction sources remain exactly three', ['const u1 = onSnapshot','const u2 = onSnapshot','const u3 = onSnapshot'].every(x=>app.includes(x)));
c('Canonical/legacy branch remains mutually exclusive', /if \(_desiredTxReadMode === 'canonical'\)[\s\S]{0,900}return canonicalUnsub;[\s\S]{0,900}const u1 = onSnapshot/.test(app));
c('Coach CS1 intentional dual listener remains documented', prof.includes("coachBranch === 'CS1'")&&prof.includes("branch', '==', 'Mặc định'"));
c('Active-zero probe remains conditional first-empty only', prof.includes('activeCount === 0 && _state.activeSnapshotCount === 1'));
c('Full profiles fallback remains guarded', prof.includes('_state.fallbackInProgress')&&prof.includes('maxFallbackPerSession'));
const auto=srv.slice(srv.indexOf('async function maybeAutoRefreshSuperAdminSummaries'),srv.indexOf('function getSuperAdminServerRefreshState'));
c('Production policy selects one client stats writer', policy.includes("mode: 'client-only'") && policy.includes("statsWriter: 'client'") && policy.includes('superAdminServerRefresh: false'));
c('SuperAdmin render has no automatic callable owner', !superadmin.includes('maybeAutoRefreshSuperAdminSummaries(clubDataList'));
c('Callable compatibility path fails closed before lookup', auto.includes('production-policy-client-only') && auto.indexOf('production-policy-client-only') < auto.indexOf('_getFunctionsCallable'));
c('Stats writer requires same-club/month complete coverage', statsWriter.includes('sameClub && sameMonth') && statsWriter.includes('coverage.complete === true'));
c('Incomplete RAM omits financial root and stats payload fields', statsWriter.includes('if (financeComplete)') && statsWriter.includes('financeWriteSkipped'));
c('Normal bootstrap has no automatic legacy recovery owner', !main.includes("runRuntimeDataRecovery?.('app-context-ready')") && !main.includes("runRuntimeDataRecovery('main-replay-context-ready')"));

// Runtime mock: even if an SDK/callable is accidentally present, client-only policy
// must reject both automatic and manual compatibility paths before network.
try {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorLocalStorage = globalThis.localStorage;
  let callableCalls = 0;
  const storage = new Map();
  globalThis.localStorage = { getItem:k=>storage.has(k)?storage.get(k):null, setItem:(k,v)=>storage.set(k,String(v)) };
  globalThis.document = { getElementById:()=>null, createElement:()=>({style:{},innerHTML:''}) };
  globalThis.window = {
    userRole: 'super_admin',
    __store: { userRole: 'super_admin' },
    ProductionAuthorityPolicy: Object.freeze({ mode:'client-only', statsWriter:'client', superAdminServerRefresh:false, legacyRuntimeRecovery:false }),
    __saDisableServerSummaryAutoRefresh: false,
    _firebaseApp: {},
    _fb_init: {
      getFunctions: ()=>({}),
      httpsCallable: ()=>async ({clubId, month}) => {
        callableCalls++;
        return { data: { clubId, month, revenueTotal: 123000 } };
      }
    },
    _saClubData: { clubDataList: [{ cid:'mock-club', data:{} }] },
  };
  const mod = await import(`../js/core/superAdminServerRefresh.js?v5u6e-test=${Date.now()}`);
  const autoRes = await mod.maybeAutoRefreshSuperAdminSummaries(globalThis.window._saClubData.clubDataList, { month:'2026-08', force:true });
  const manualRes = await mod.refreshSuperAdminSummaryForClubViaServer('mock-club', { month:'2026-08' });
  c('runtime: automatic SuperAdmin refresh is policy-disabled', autoRes?.reason==='production-policy-client-only');
  c('runtime: manual compatibility refresh is policy-disabled', manualRes?.reason==='production-policy-client-only');
  c('runtime: policy-disabled paths make zero callable requests', callableCalls===0);
  globalThis.window = priorWindow;
  globalThis.document = priorDocument;
  globalThis.localStorage = priorLocalStorage;
} catch (e) {
  c('runtime: client-only server-refresh isolation simulation completed', false);
  console.error(e);
}

// V5U6C2 Dashboard read-authority freeze: render/hydration cycles may use RAM,
// but only fetchHistoricalDashboardFallback owns normal stats/history Firestore reads.
try {
  const render = fs.readFileSync('js/ui/render.js','utf8');
  const dash = fs.readFileSync('js/modules/dashboard.js','utf8');
  const renderDash = render.slice(render.indexOf('// ── Chart data — 6 tháng gần nhất'), render.indexOf('export function initRender'));
  const legacyStart = dash.indexOf('export async function fetchAndRenderHistoricalCharts');
  const legacyEnd = dash.indexOf('// fetchMonthStats', legacyStart);
  const tryStart = dash.indexOf('export async function tryApplyCurrentMonthStats');
  const tryEnd = dash.indexOf('// initDashboard', tryStart);
  c('Dashboard render has no direct stats Firestore reader', !/\bgetDoc(?:s)?\s*\(/.test(renderDash));
  c('Dashboard render does not invoke legacy historical network owner', !render.includes('fetchAndRenderHistoricalCharts('));
  c('Dashboard render does not invoke standalone current stats network owner', !render.includes('tryApplyCurrentMonthStats(selMonth)'));
  c('Legacy historical API is RAM-only', !/\bgetDoc(?:s)?\s*\(/.test(dash.slice(legacyStart, legacyEnd)));
  c('Current-month compatibility API is RAM-only', !dash.slice(tryStart, tryEnd).includes('fetchMonthStats('));
  c('Canonical Dashboard scheduler/loader remain the single normal authority', dash.includes('scheduleDashboardHistoryFetch') && dash.includes('fetchHistoricalDashboardFallback'));
  c('Dashboard mutation intent routes through existing module namespace', app.includes("window._moduleDashboard.markStatsDirty(monthStr, 'transactions-live-mutation', 'finance')") && prof.includes("window._moduleDashboard.markStatsDirty('', 'profiles-live-mutation', 'members')"));
  const reconcileStart = dash.indexOf('export function reconcileDashboardHydrationEvidence');
  const reconcileEnd = dash.indexOf('function _shouldApplyCanonicalCurrentMonth', reconcileStart);
  const reconcileBlock = dash.slice(reconcileStart, reconcileEnd);
  c('Dashboard hydration reconciliation performs no Firestore read', reconcileStart >= 0 && !/\bgetDoc(?:s)?\s*\(/.test(reconcileBlock));
  c('Dashboard hydration reconciliation creates no second network owner', !reconcileBlock.includes('fetchHistoricalDashboardFallback(') && !reconcileBlock.includes('scheduleDashboardHistoryFetch('));
  c('Dashboard dirty backoff is eligibility-only with no polling owner', dash.includes('nextRevalidateAt') && !/setInterval\s*\(/.test(dash));
  c('Dashboard dirty refresh does not create a second stats reader', dash.includes('monthsToFetch') && dash.includes('Promise.all(monthsToFetch.map') && (dash.slice(dash.indexOf('export async function fetchHistoricalDashboardFallback'), dash.indexOf('export function scheduleDashboardHistoryFetch')).match(/\bgetDoc\s*\(/g)||[]).length===1);
  c('Dashboard same freshness revision preserves single-flight ownership', dash.includes('const _sparkHistoryInFlight = new Map()') && dash.includes('_sparkHistoryInFlight.has(key)'));
  c('Dashboard running flight token remains immutable across newer mutation revision', dash.includes('Object.freeze({ ...requestToken })') && !dash.includes('flight.token = requestToken') && dash.includes('pendingRevision'));
} catch(e) { c('Dashboard parallel-read authority audit completed', false); console.error(e); }

// V5U6D Attendance read-authority freeze: many presentation triggers may
// converge, but only one module-local orchestrator may invoke loadByDate.
try {
  const attendance = fs.readFileSync('js/modules/attendance.js','utf8');
  const attendanceService = fs.readFileSync('js/services/attendance.service.js','utf8');
  const attendanceIslands = fs.readFileSync('js/ui/render/renderAttendance.js','utf8');
  const attendanceListeners = fs.readFileSync('js/listeners/attendance.listeners.js','utf8');
  const uiRender = fs.readFileSync('js/ui/render.js','utf8');
  c('Attendance has one canonical daily orchestrator', attendance.includes('async function _requestAttendanceDailyRefresh('));
  c('Attendance module has exactly one loadByDate invocation', (attendance.match(/AttendanceService\.loadByDate\s*\(/g)||[]).length===1);
  c('Attendance compatibility global delegates to canonical owner', /window\.renderAttendanceList\s*=\s*async[\s\S]{0,180}_requestAttendanceDailyRefresh/.test(attendance));
  c('Attendance daily coalescing is isolated by auth context', attendance.includes('_sameAttendanceContext(running.token, token)') && attendance.includes('currentSnapshotAuthGeneration'));
  c('Profiles invalidation has no direct daily render owner', !prof.includes('window.renderAttendanceList()'));
  c('Legacy and module renderApp paths are RAM presentation only', app.includes("renderDailyFromRam('legacy-renderApp-profile-presentation')") && uiRender.includes("renderDailyFromRam('module-renderApp-profile-presentation')"));
  c('Attendance pseudo-listener fallback is RAM presentation only', attendanceListeners.includes('AttendanceModule?.renderDailyFromRam') && attendanceListeners.includes('presentationOnly: true'));
  c('Attendance shifts have one same-club Promise latch', attendance.includes('let _clubShiftsLoadPromise = null') && attendance.includes('_clubShiftsLoadPromise?.clubId === clubId'));
  c('Attendance Day island blocks hidden monthly owner', attendanceIslands.includes('isMonthSubtabActive') && attendance.includes("skipped: 'month-subtab-hidden'"));
  c('Attendance Month island blocks hidden daily owner', attendanceIslands.includes('isDaySubtabActive') && attendance.includes("skipped: 'day-subtab-hidden'"));
  const ramStart = attendance.indexOf('function _renderAttendanceDailyFromRam(');
  const ramEnd = attendance.indexOf('function _captureAttendanceDailyToken(', ramStart);
  c('Attendance RAM reconciliation performs no service/Firestore read', ramStart >= 0 && !/AttendanceService\.|\bgetDoc(?:s)?\s*\(/.test(attendance.slice(ramStart, ramEnd)));
  c('Attendance Firestore daily query remains service-owned', attendanceService.includes('async loadByDate(date, options = {})') && attendanceService.includes("where('date', '==', date)"));
  const shiftDecisionStart = attendance.indexOf('function _resolveAttendanceShiftAuthority(');
  const shiftDecisionEnd = attendance.indexOf('function _attendanceContextWithShift(', shiftDecisionStart);
  const shiftDecisionBlock = attendance.slice(shiftDecisionStart, shiftDecisionEnd);
  const dailyOwnerStart = attendance.indexOf('async function _requestAttendanceDailyRefresh(');
  const dailyOwnerEnd = attendance.indexOf('function _renderAttCards(', dailyOwnerStart);
  const dailyOwnerBlock = attendance.slice(dailyOwnerStart, dailyOwnerEnd);
  c('Attendance configured blank shift cannot create an all-shift reader', shiftDecisionBlock.includes("mode: 'shift-required'") && dailyOwnerBlock.indexOf('if (!shiftDecision.allowed)') < dailyOwnerBlock.indexOf('AttendanceService.loadByDate('));
  c('Attendance shift decision helper creates no network owner', shiftDecisionStart >= 0 && !/AttendanceService\.|\bgetDoc(?:s)?\s*\(|\bonSnapshot\s*\(/.test(shiftDecisionBlock));
  c('Attendance toggle and bulk share the same shift write authority', attendance.includes("_resolveAttendanceWriteGuard('toggleAttendance')") && attendance.includes("_resolveAttendanceWriteGuard('bulkCheckIn')"));
  c('Attendance shift retry stays on the existing Promise owner', (attendance.match(/AttendanceService\.loadShifts\s*\(/g)||[]).length===1 && attendance.includes('_clubShiftsLoadPromise?.clubId === clubId') && attendance.indexOf('_clubShiftsLoadPromise?.clubId === clubId') < attendance.indexOf('AttendanceService.loadShifts('));
  c('Attendance offline different-context handoff cannot create a parallel writer', attendance.includes('let _offlineAttendanceSyncPromise = null;') && attendance.includes('let _offlineAttendanceActiveContext = null;') && attendance.includes('let _offlineAttendancePendingContext = null;') && attendance.includes('return _offlineAttendanceSyncPromise;'));
  const offlineFlightStart = attendance.indexOf('const _startOfflineAttendanceSyncFlight = (syncContext) =>');
  const offlineFlightEnd = attendance.indexOf('if (!_onlineListenerBound)', offlineFlightStart);
  const offlineFlightBlock = attendance.slice(offlineFlightStart, offlineFlightEnd);
  c('Attendance offline follow-up starts only after active flight is released', offlineFlightBlock.indexOf('_offlineAttendanceSyncPromise = null') >= 0 && offlineFlightBlock.indexOf('_offlineAttendanceSyncPromise = null') < offlineFlightBlock.indexOf('_startOfflineAttendanceSyncFlight(pendingContext)') && offlineFlightBlock.includes('_isOfflineAttendanceSyncContextCurrent(pendingContext)'));
} catch(e) { c('Attendance parallel-read authority audit completed', false); console.error(e); }

console.log(`PASS ${p}/${p+f}`); if(f) process.exit(1);
