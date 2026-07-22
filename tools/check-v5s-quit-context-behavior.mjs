#!/usr/bin/env node
let pass=0, fail=0; const check=(n,o)=>o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n));

// Boundary single-flight and false-result backoff.
globalThis.window = {
  isQuitProfilesComplete: () => false,
  addEventListener: () => {},
  getCurrentActiveTabId: () => 'quit',
};
let calls=0;
let resolveLoader;
window.ensureQuitProfilesComplete = () => {
  calls++;
  return new Promise(resolve => { resolveLoader = resolve; });
};
const boundary = await import('../js/data/quitProfileBoundary.js?v5s-boundary=' + Date.now());
const p1=boundary.ensureQuitAuthority('one');
const p2=boundary.ensureQuitAuthority('two');
await new Promise(r=>setTimeout(r,0));
check('concurrent ensure calls share one loader', calls===1 && p1===p2);
resolveLoader(false);
check('shared false result resolves safely', (await p1)===false && (await p2)===false);
const before=calls;
check('immediate retry is suppressed by backoff', (await boundary.ensureQuitAuthority('backoff'))===false && calls===before);

// Profiles listener can recover context from window.__store without active listener mount.
window = globalThis.window = {
  __store: { db:{id:'db'}, clubId:'clubA', currentClubId:'clubA', profRef:{path:'clubs/clubA/profiles'}, userRole:'admin', profiles:{} },
  userRole: 'admin',
  currentClubId: 'clubA',
  _fb_init: {
    getDocs: async () => ({
      size: 2,
      forEach(fn) {
        fn({id:'activeA', data:()=>({status:'active', name:'Active A'})});
        fn({id:'quitB', data:()=>({status:'quit', name:'Quit B'})});
      }
    })
  },
  getCurrentActiveTabId: () => 'quit',
  getAppContext: () => ({db:{id:'db'}, currentClubId:'clubA', clubId:'clubA', profRef:{path:'clubs/clubA/profiles'}, userRole:'admin'}),
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage={getItem:()=>null};
const listener = await import('../js/listeners/profiles.listeners.js?v5s-listener=' + Date.now());
const loaded=await listener.loadQuitProfilesIfNeeded('behavior-context-recovery');
const metrics=listener.getProfilesListenerMetrics();
check('quit authority loads from recovered runtime context', loaded===true && metrics.quitAuthorityState==='complete');
check('full snapshot classifies only quit profile into quit bucket', metrics.quitAuthorityDocsRead===2 && metrics.quitCompletenessReconciled===true);
check('context recovery is measured, not warned repeatedly', metrics.quitContextRecoveryCount>=1 && metrics.quitMissingContextCount===0);

console.log(`\nPASS ${pass}/${pass+fail}`); if(fail) process.exit(1);
