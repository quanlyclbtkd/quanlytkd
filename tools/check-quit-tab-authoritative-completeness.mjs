#!/usr/bin/env node
/** Phase 4K-6V5Q — Quit Authoritative Completeness */
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const profiles=read('js/listeners/profiles.listeners.js');
const store=read('js/data/studentProfileStore.js');
const search=read('js/modules/searchRuntime.js');
const direct=read('js/ui/render/renderStudents.js');
let pass=0,fail=0; const check=(n,o)=>{o?(pass++,console.log('✅',n)):(fail++,console.error('❌',n))};
console.log('\n=== Phase 4K-6V5Q — Quit Authoritative Completeness ===\n');
check('Authority only short-circuits when same-club fresh reconciled + complete', profiles.includes('!forceRefresh && sameClub') && profiles.includes('_state.quitCompletenessReconciled && isQuitComplete()'));
check('One full snapshot sets all buckets as complete', profiles.includes("syncLegacyAllProfiles(fullMap, 'quit-authoritative:") && profiles.includes('{ complete: true }'));
check('Authority state exposes complete/error diagnostics', profiles.includes("quitAuthorityState = 'complete'") && profiles.includes("quitAuthorityState = 'error'"));
check('Store partial sync preserves existing quit data', store.includes('Critical V5Q rule') && store.includes('Partial merge'));
check('Store has separate quitComplete flag', store.includes('quitComplete') && store.includes('markQuitComplete'));
check('Quit search bypasses active-only profile index', search.includes("if (tab === 'quit' && window.QuitProfileBoundary)") && search.includes('quit-authoritative-boundary'));
check('Direct renderer uses same boundary and filters', direct.includes('QuitProfileBoundary.getEntries({ search, branch'));
check('Shared pagination is cleared after authority load', profiles.includes('pg.currentItems = []') && profiles.includes('pg.hasNext = false'));
check('Full fallback also marks quit complete', profiles.includes('markQuitComplete(true)') && profiles.includes('_state.quitCompletenessReconciled = true'));
console.log(`\nTotal ${pass+fail} | PASS ${pass} | FAIL ${fail}`); if(fail) process.exit(1);
