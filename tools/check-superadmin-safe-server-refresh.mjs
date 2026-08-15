#!/usr/bin/env node
// Compatibility gate updated by V5U6E: the callable helper/source remains
// archived, but client-only production runtime must fail closed before network.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];
function must(cond, msg) { if (!cond) failures.push(msg); }

const index = read('index.html');
const main = read('js/main.js');
const superadmin = read('js/modules/superadmin.js');
const helper = read('js/core/superAdminServerRefresh.js');
const policy = read('js/core/productionAuthorityPolicy.js');
const firebase = JSON.parse(read('firebase.json'));
const functionsArchive = JSON.parse(read('firebase.functions.json'));
const pkg = JSON.parse(read('package.json'));

must(!index.includes('firebase-functions.js'), 'client-only index must not load Firebase Functions SDK');
must(!('functions' in firebase), 'default firebase.json must not deploy Functions');
must(Array.isArray(functionsArchive.functions), 'explicit functions archive config must preserve Functions source');
must(policy.includes("mode: 'client-only'") && policy.includes('superAdminServerRefresh: false'), 'client-only authority policy must disable server refresh');
must(main.includes('initProductionAuthorityPolicy()'), 'main must install production authority policy');
must(main.includes('initSuperAdminServerRefresh()'), 'compatibility helper must remain initialized');
must(helper.includes('production-policy-client-only') && helper.includes('_policyAllowsServerRefresh'), 'callable helper must fail closed by policy');
must(helper.indexOf("reason: 'production-policy-client-only'") < helper.indexOf('const fn = _getFunctionsCallable()'), 'policy guard must run before callable lookup');
must(!superadmin.includes('maybeAutoRefreshSuperAdminSummaries(clubDataList'), 'SuperAdmin render must not auto-dispatch callable refresh');
must(superadmin.includes('refreshSuperAdminSummaryForClubViaServer'), 'manual compatibility API remains available but policy-disabled');
must(!superadmin.includes('queueSuperAdminCountRefresh(cid, clubData, { manual: true })'), 'manual SuperAdmin path must not restore client aggregation');
must(helper.includes('runAggregationQuery') === false && helper.includes('getCountFromServer') === false, 'helper must not own client aggregation reads');
must(pkg.scripts?.['check:superadmin-safe-server-refresh'], 'package script must remain registered');

if (failures.length) {
  console.error('[check-superadmin-safe-server-refresh] FAIL');
  failures.forEach(f => console.error(' - ' + f));
  process.exit(1);
}
console.log('[check-superadmin-safe-server-refresh] PASS — client-only policy closes callable runtime');
