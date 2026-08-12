import fs from 'node:fs'; const app=fs.readFileSync('app.js','utf8'), prof=fs.readFileSync('js/listeners/profiles.listeners.js','utf8'), srv=fs.readFileSync('js/core/superAdminServerRefresh.js','utf8'); let p=0,f=0; const c=(n,x)=>{(x?(p++,console.log('✅',n)):(f++,console.error('❌',n)))};
c('Auth users verification remains single-flight source', app.includes('_readUserAuthorizationProfileOnce') && app.includes('_verifiedUserProfileFlight'));
const startup=app.slice(app.indexOf('Phase 4K-6V5U6A: Admin notifications'),app.indexOf('//  SUPER ADMIN:',app.indexOf('Phase 4K-6V5U6A: Admin notifications'))); c('Notifications have no normal parallel GET', !/(^|\n)\s*(?:window\.)?checkAdminNotifications\s*\(/m.test(startup));
c('Canonical transaction source remains one listener', (app.match(/const canonicalUnsub = onSnapshot/g)||[]).length===1);
c('Legacy transaction sources remain exactly three', ['const u1 = onSnapshot','const u2 = onSnapshot','const u3 = onSnapshot'].every(x=>app.includes(x)));
c('Canonical/legacy branch remains mutually exclusive', /if \(_desiredTxReadMode === 'canonical'\)[\s\S]{0,900}return canonicalUnsub;[\s\S]{0,900}const u1 = onSnapshot/.test(app));
c('Coach CS1 intentional dual listener remains documented', prof.includes("coachBranch === 'CS1'")&&prof.includes("branch', '==', 'Mặc định'"));
c('Active-zero probe remains conditional first-empty only', prof.includes('activeCount === 0 && _state.activeSnapshotCount === 1'));
c('Full profiles fallback remains guarded', prof.includes('_state.fallbackInProgress')&&prof.includes('maxFallbackPerSession'));
const auto=srv.slice(srv.indexOf('async function maybeAutoRefreshSuperAdminSummaries'),srv.indexOf('function getSuperAdminServerRefreshState'));
c('SuperAdmin auto refresh does not trigger full loader', !auto.includes('loadSuperAdminData'));
c('SuperAdmin auto refresh applies existing RAM data', auto.includes('_renderSAClubRows')&&auto.includes('renderSummaryFromLoadedData'));

// Runtime mock: successful callable refresh must mutate loaded RAM and rerender without
// invoking the full Firestore loader. The module itself contains no Firestore getDoc/getDocs.
try {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorLocalStorage = globalThis.localStorage;
  let fullLoads = 0, rowRenders = 0, summaryRenders = 0, callableCalls = 0;
  const storage = new Map();
  globalThis.localStorage = { getItem:k=>storage.has(k)?storage.get(k):null, setItem:(k,v)=>storage.set(k,String(v)) };
  globalThis.document = { getElementById:()=>null, createElement:()=>({style:{},innerHTML:''}) };
  globalThis.window = {
    userRole: 'super_admin',
    __store: { userRole: 'super_admin' },
    __saDisableServerSummaryAutoRefresh: false,
    _firebaseApp: {},
    _fb_init: {
      getFunctions: ()=>({}),
      httpsCallable: ()=>async ({clubId, month}) => {
        callableCalls++;
        return { data: { clubId, month, activeCount: 12, profileCount: 15, revenueTotal: 123000, txCount: 4 } };
      }
    },
    _saClubData: { clubDataList: [{ cid:'mock-club', data:{} }], today: new Date(), in30Days: new Date() },
    _renderSAClubRows: ()=>{ rowRenders++; },
    SuperAdminModule: { renderSummaryFromLoadedData: ()=>{ summaryRenders++; } },
    loadSuperAdminData: ()=>{ fullLoads++; }
  };
  const mod = await import(`../js/core/superAdminServerRefresh.js?v5u6a-test=${Date.now()}`);
  const res = await mod.maybeAutoRefreshSuperAdminSummaries(globalThis.window._saClubData.clubDataList, { month:'2026-08', maxPerSession:1, delayMs:0, force:true });
  const item = globalThis.window._saClubData.clubDataList[0];
  c('runtime: server refresh callable executes once', callableCalls===1 && res?.refreshed===1);
  c('runtime: server response updates loaded club RAM', item?.studentCountForSummary===12 && item?.revenueTotal===123000);
  c('runtime: rows and aggregate rerender from RAM', rowRenders===1 && summaryRenders===1);
  c('runtime: successful auto refresh never calls full loader', fullLoads===0);
  globalThis.window = priorWindow;
  globalThis.document = priorDocument;
  globalThis.localStorage = priorLocalStorage;
} catch (e) {
  c('runtime: server refresh simulation completed', false);
  console.error(e);
}

console.log(`PASS ${p}/${p+f}`); if(f) process.exit(1);
