#!/usr/bin/env node
/** Phase 4K-6V5Q — Quit Tab Completeness + Single Authority */
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const profiles=read('js/listeners/profiles.listeners.js');
const renderer=read('js/ui/render/computation/studentsRenderer.js');
const status=read('js/data/profileStatusConfig.js');
const boundary=read('js/data/quitProfileBoundary.js');
let pass=0,fail=0; const check=(n,o)=>{o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n))};
console.log('\n=== Phase 4K-6V5Q — Quit Tab Completeness ===\n');
check('Coach quit reads remain blocked', profiles.includes("canMount?.('profiles.quit'") && profiles.includes('return false;'));
check('Admin quit loader uses one full authoritative collection read', profiles.includes('const snap = await fbGetDocs(ctx.profRef)') && profiles.includes('queryCount: 1'));
check('Targeted multi-query fan-out is removed', !profiles.includes('const quitQueries = []') && !profiles.includes('legacyQuitSignals.forEach'));
check('Every full document is classified locally', profiles.includes("classifyProfileStatus(data) === 'quit'"));
check('Loaded and complete states are separate', profiles.includes('quitCompletenessReconciled') && profiles.includes('isQuitComplete()'));
check('Quit renderer uses the single boundary', renderer.includes('const _quitBoundaryEntries') && renderer.includes('studentsRenderer.compute'));
check('Pagination cannot override boundary quit rows', renderer.includes('const useFullProfileQuitRender = buildQuit && (_useQuitBoundary'));
check('Boundary unions legacy/canonical sources only during preview and locks dedicated source when complete', ['window.allProfiles','store.profiles','canonical.quitProfiles','studentProfileStore.quitProfiles'].every(x=>boundary.includes(x)));
check('Boundary centralizes branch and search filters', boundary.includes('getFilteredQuitEntries') && boundary.includes('_branchPass') && boundary.includes('_profileBlob'));
check('Status classifier covers boolean/date legacy signals', status.includes('profile.active === false') && status.includes('ngayNghiTap') && status.includes('nghiHocDate'));
console.log(`\nTotal ${pass+fail} | PASS ${pass} | FAIL ${fail}`); if(fail) process.exit(1);
