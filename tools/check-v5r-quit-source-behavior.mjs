#!/usr/bin/env node
// Dynamic regression for the two bugs that caused recurring incomplete/stale quit lists.
globalThis.window = {};
const store = await import('../js/data/studentProfileStore.js?v5r-store=' + Date.now());
let pass=0, fail=0; const check=(n,o)=>{o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n))};

store.resetStudentProfileStore('v5r-test');
store.setQuitProfiles({ studentA:{status:'quit', name:'Student A'} }, 'authority', {complete:true});
store.setActiveProfiles({ studentA:{status:'active', name:'Student A'}, activeB:{status:'active'} }, 'active-snapshot');
check('active listener restore removes id from quit bucket', !store.getQuitProfiles().studentA && !!store.getActiveProfiles().studentA);
store.setQuitProfiles({ activeB:{status:'quit'} }, 'quit-update', {complete:true});
check('quit update removes id from active bucket', !store.getActiveProfiles().activeB && !!store.getQuitProfiles().activeB);

window.allProfiles = { staleQuit:{status:'quit', name:'Stale Quit'} };
window.__store = { profiles:{ staleQuit:{status:'quit', name:'Stale Quit'} }, pagination:{students:{currentItems:[]}} };
window.studentProfileStore = {
  getQuitProfiles: () => ({ realQuit:{status:'quit', name:'Real Quit'} }),
  getAllProfilesCompat: () => ({ staleQuit:{status:'quit', name:'Stale Quit'}, realQuit:{status:'quit', name:'Real Quit'} })
};
window.isQuitProfilesComplete = () => true;
const boundary = await import('../js/data/quitProfileBoundary.js?v5r-boundary=' + Date.now());
let map = boundary.getAuthoritativeQuitMap('complete-test');
check('complete boundary ignores stale broad sources', !map.staleQuit && !!map.realQuit && Object.keys(map).length === 1);
window.isQuitProfilesComplete = () => false;
map = boundary.getAuthoritativeQuitMap('preview-test');
check('incomplete boundary may show preview union while loading', !!map.staleQuit && !!map.realQuit);
check('boundary mode reports preview vs complete', boundary.getQuitBoundaryMetrics().lastMode === 'loading-preview-union');

console.log(`\nPASS ${pass}/${pass+fail}`); if(fail) process.exit(1);
