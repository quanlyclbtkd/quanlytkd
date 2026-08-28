import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name, detail); }
};

const initStart = app.indexOf('async function initSaaSDatabase(clubId)');
const initEnd = app.indexOf('//  SUPER ADMIN:', initStart) > initStart
  ? app.indexOf('//  SUPER ADMIN:', initStart)
  : app.indexOf('async function listenToData', initStart);
const init = app.slice(initStart, initEnd > initStart ? initEnd : initStart + 120000);
const helperStart = app.indexOf('// Phase 4K-6V5U6B — ONE clubs/{clubId} authority');
const helperEnd = app.indexOf('async function initSaaSDatabase(clubId)', helperStart);
const helper = app.slice(helperStart, helperEnd);

check('V5U6B bootstrap helper exists', helperStart >= 0 && helper.includes('_mountClubRootAuthority'));
check('normal tenant init has no clubs/{clubId} point getDoc', !/getDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["']clubs["']\s*,\s*clubId\s*\)\s*\)/.test(init));
check('legacy clubDocForExpiry bootstrap read removed', !init.includes('clubDocForExpiry'));
check('root club has exactly one onSnapshot authority in app.js', (app.match(/onSnapshot\s*\(\s*clubRef\b/g) || []).length === 1);
check('root listener uses canonical key global:club:{clubId}', helper.includes("const clubKey = 'global:club:' + clubId"));
check('root listener registered through safeRegisterSnapshot', helper.includes('window.safeRegisterSnapshot(') && helper.includes("owner: 'club'") && helper.includes("scope: 'global'"));
check('root listener has first snapshot promise', helper.includes('firstSnapshotPromise') && helper.includes('finishFirst'));
check('first snapshot promise settles at most once', helper.includes('if (settled) return;') && helper.includes('settled = true'));
check('registration failure settles first snapshot promise', /listener-registration-failed[\s\S]{0,500}finishFirst\(\{ accepted: false/.test(helper));
check('duplicate registration has one stale-owner cleanup path', /window\.removeListener\(clubKey, ['\"]v5u6(?:b|h5)-stale-bootstrap-owner['\"]\)/.test(helper));
check('duplicate registration remount is bounded to one explicit retry', (helper.match(/registered\s*=\s*register\(\)/g) || []).length === 2 && !helper.includes('while (registered'));
check('listener remains mounted after accepted first snapshot', helper.includes('_applyAcceptedClubRootSnapshot') && !/_applyAcceptedClubRootSnapshot[\s\S]{0,450}removeListener\(clubKey/.test(helper));
check('blocked cleanup explicitly preserves root listener key', helper.includes('entry.key !== clubKey'));
check('same root listener owns future access revalidation', helper.includes('const handleSnapshot = (snap) =>') && helper.includes('_validateClubAccessSnapshot(snap)'));
check('listener error callback is part of same onSnapshot', /onSnapshot\(clubRef, handleSnapshot, handleError\)/.test(helper));
check('no replacement club listener exists after access await', (init.match(/onSnapshot\s*\(\s*clubRef\b/g) || []).length === 0);
check('init awaits the root first snapshot before proceeding', init.includes('await _clubBootstrap.firstSnapshotPromise'));
check('first snapshot acceptance gates protected runtime', /await _clubBootstrap\.firstSnapshotPromise[\s\S]{0,500}if \(!_clubFirstSnapshot\?\.accepted \|\| _clubAccessBootstrapState\.ready !== true\) return false;/.test(init));
check('no getDocFromServer/getDocFromCache replacement introduced', !helper.includes('getDocFromServer(') && !helper.includes('getDocFromCache(') && !init.includes('getDocFromServer('));
check('no polling/retry interval in club bootstrap helper', !helper.includes('setInterval(') && (helper.match(/setTimeout\s*\(/g) || []).length === 1 && helper.includes('_LISTENER_REGISTRY_READY_TIMEOUT_MS') && !/_waitForListenerRegistryReady\s*\([^)]*\)[\s\S]*?_waitForListenerRegistryReady\s*\(/.test(helper));

console.log(`\nPASS ${pass}/${pass + fail}`);
if (fail) process.exit(1);
