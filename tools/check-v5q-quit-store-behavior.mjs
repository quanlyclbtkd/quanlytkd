#!/usr/bin/env node
// Behavioral regression: partial pagination/search hydration must never erase quit data.
globalThis.window = {};
const mod = await import('../js/data/studentProfileStore.js?behavior=' + Date.now());
let pass=0, fail=0; const check=(n,o)=>{o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n))};
mod.resetStudentProfileStore('test');
mod.setQuitProfiles({ oldQuit:{status:'quit', name:'Old Quit'} }, 'authority', {complete:true});
mod.setActiveProfiles({ activeA:{status:'active', name:'Active A'} }, 'active');
mod.syncLegacyAllProfiles({ activeB:{status:'active', name:'Active B'} }, 'pagination-profile-hydrate');
check('partial page preserves existing quit profile', !!mod.getQuitProfiles().oldQuit);
check('partial page keeps quit completeness', mod.isQuitComplete() === true);
check('partial page merges active item', !!mod.getActiveProfiles().activeB);
mod.syncLegacyAllProfiles({ activeC:{status:'active'}, quitC:{status:'Đã nghỉ'} }, 'quit-authoritative:test', {complete:true});
check('full authority replaces old quit map', !mod.getQuitProfiles().oldQuit && !!mod.getQuitProfiles().quitC);
check('full authority remains complete', mod.isQuitComplete() === true);
console.log(`\nPASS ${pass}/${pass+fail}`); if(fail) process.exit(1);
