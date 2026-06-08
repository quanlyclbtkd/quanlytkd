#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];
const warns = [];
function must(cond, msg) { if (!cond) failures.push(msg); }
function warn(cond, msg) { if (!cond) warns.push(msg); }

const index = read('index.html');
const main = read('js/main.js');
const app = read('app.js');
const superadmin = read('js/modules/superadmin.js');
const helperExists = fs.existsSync(path.join(root, 'js/core/superAdminServerRefresh.js'));
const helper = helperExists ? read('js/core/superAdminServerRefresh.js') : '';
const pkg = JSON.parse(read('package.json'));

must(helperExists, 'Missing js/core/superAdminServerRefresh.js');
must(index.includes('firebase-functions.js'), 'index.html must import firebase-functions.js');
must(index.includes('getFunctions') && index.includes('httpsCallable'), 'index.html must expose getFunctions/httpsCallable in _fb_init');
must(app.includes('window._firebaseApp = app'), 'app.js must expose window._firebaseApp for Functions client');
must(main.includes("import { initSuperAdminServerRefresh }"), 'main.js must import initSuperAdminServerRefresh');
must(main.includes('initSuperAdminServerRefresh()'), 'main.js must initialize SuperAdmin server refresh helper');
must(helper.includes('refreshSuperAdminSummaryForClub'), 'helper must call refreshSuperAdminSummaryForClub callable');
must(helper.includes('getFunctions') && helper.includes('httpsCallable'), 'helper must use Firebase Functions SDK');
must(helper.includes('maybeAutoRefreshSuperAdminSummaries'), 'helper must expose maybeAutoRefreshSuperAdminSummaries');
must(helper.includes('refreshSuperAdminSummaryForClubViaServer'), 'helper must expose refreshSuperAdminSummaryForClubViaServer');
must(helper.includes('localStorage') && helper.includes('CLUB_THROTTLE_MS'), 'helper must include localStorage per-club throttle');
must(helper.includes('AUTO_MAX_PER_SESSION'), 'helper must limit auto refresh per session');
must(helper.includes('runAggregationQuery') === false && helper.includes('getCountFromServer') === false, 'helper must not use client aggregation/getCountFromServer');
must(superadmin.includes('maybeAutoRefreshSuperAdminSummaries(clubDataList'), 'superadmin.js must trigger safe server refresh for missing cache');
must(superadmin.includes('refreshSuperAdminSummaryForClubViaServer'), 'manual refresh must use server callable helper');
must(!superadmin.includes('queueSuperAdminCountRefresh(cid, clubData, { manual: true })'), 'manual SuperAdmin refresh must not use old client aggregation queue');
must(main.includes('debugSuperAdminServerRefresh'), 'runtime smoke test should include debugSuperAdminServerRefresh');
must(main.includes('superAdminServerRefreshOk'), 'runtime smoke summary should include superAdminServerRefreshOk');
must(main.includes("4K-6I-H-superadmin-safe-server-refresh-20260608") || main.includes("4K-6I-I-excel-import-vtf-upsert-20260608"), 'APP_BUILD_VERSION must be 4K-6I-H or later compatible phase');
must(index.includes('superadmin-safe-server-refresh-20260608') || index.includes('excel-import-vtf-upsert-20260608'), 'index.html cache bust must be 4K-6I-H or later compatible phase');
must(pkg.scripts && pkg.scripts['check:superadmin-safe-server-refresh'], 'package.json missing check:superadmin-safe-server-refresh script');
must((pkg.scripts['check:all'] || '').includes('check:superadmin-safe-server-refresh'), 'check:all must include check:superadmin-safe-server-refresh');
must((pkg.scripts['check:all:critical'] || '').includes('check:superadmin-safe-server-refresh'), 'check:all:critical must include check:superadmin-safe-server-refresh');
warn(helper.includes('functions-not-deployed'), 'helper should explicitly handle functions-not-deployed state');

if (warns.length) {
  console.warn('[check-superadmin-safe-server-refresh] WARNINGS');
  warns.forEach(w => console.warn(' - ' + w));
}
if (failures.length) {
  console.error('[check-superadmin-safe-server-refresh] FAIL');
  failures.forEach(f => console.error(' - ' + f));
  process.exit(1);
}
console.log('[check-superadmin-safe-server-refresh] PASS');
