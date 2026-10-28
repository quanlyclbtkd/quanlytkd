#!/usr/bin/env node
import {verifyRuntimeProfile} from './v11r2/runtime-profile.mjs';
import {buildImportGraph} from './v11r2/import-graph.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
let pass = 0;
function check(name, condition, detail = '') {
  if (condition) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const build = 'attendance-excel-documentid-sdk-fix-20260801-v5u2e';
const patch = '4K-6V5U-2E-attendance-excel-documentid-sdk-fix-20260801';
const index = read('index.html');
const publicIndex = read('public/index.html');
const config = read('js/firebase/config.js');
const publicConfig = read('public/js/firebase/config.js');
const report = read('js/modules/reports/attendanceExcelReport.js');
const service = read('js/services/attendance.service.js');
const publicReport = read('public/js/modules/reports/attendanceExcelReport.js');
const facade = read('js/modules/reports/reportExportFacade.js');
const publicFacade = read('public/js/modules/reports/reportExportFacade.js');
const main = read('js/main.js');
const publicMain = read('public/js/main.js');
const app = read('app.js');
const publicApp = read('public/app.js');
const rules = read('firestore.rules');
const attendanceContract = read('js/core/attendanceContract.js');
const pkg = JSON.parse(read('package.json'));
const publicPkgExists = fs.existsSync(path.join(root, 'public/package.json'));
const searchBuild = 'student-given-name-priority-20260811-v5u3';
const v5u5Build = 'canonical-security-truth-20260811-v5u5';
const dashboardBuild = 'dashboard-mutation-aware-cache-freshness-20260812-v5u6c1';

console.log('\n🔎 Phase 4K-6V5U-2E — Attendance Excel Firebase SDK Dependency Fix\n');

check('Firebase CDN import includes documentId', /import \{[^}]*\bdocumentId\b[^}]*\} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.1\/firebase-firestore\.js"/.test(index));
check('window._fb_init exposes documentId', /window\._fb_init = \{[^}]*\bdocumentId\b[^}]*\}/.test(index));
check('public index exposes documentId identically', publicIndex.includes('orderBy, documentId, where') && publicIndex.includes('query, orderBy, documentId, where'));
check('firebase/config exports documentId in shared sdk', config.includes('query, orderBy, documentId, where') && publicConfig.includes('query, orderBy, documentId, where'));
check('attendance report requires stable documentId ordering', report.includes('documentOrder:true') && service.includes('orderBy(documentId())') && service.includes('attendance/monthly-pagination-unavailable'));
check('attendance report source/public mirrors match', report === publicReport);
// SDK compatibility checks require a pinned runtime, matching client/Rules
// gates and a complete cache graph. Deployment/cutover authorization is owned
// by release-gate.mjs; a historical CUTOVER_PROOF is not an SDK dependency.
function attendanceProfileMatches() {
  try {
    return !!verifyRuntimeProfile(root);
  } catch { return false; }
}
check('attendance SDK profile: pinned source, gate alignment and exact cache graph', attendanceProfileMatches());
check('report facade source/public mirrors match', facade === publicFacade);
const mainFacadeImport = main.match(/reportExportFacade\.js\?v=([^'"\s)]+)/)?.[0] || '';
const publicMainFacadeImport = publicMain.match(/reportExportFacade\.js\?v=([^'"\s)]+)/)?.[0] || '';
check('main cache-busts report facade', /^reportExportFacade\.js\?v=.+/.test(mainFacadeImport));
check('main source/public mirrors match for report import', mainFacadeImport !== '' && publicMainFacadeImport === mainFacadeImport);
function coherentEntryHTML(html){try{const profile=verifyRuntimeProfile(root),m=JSON.parse(read(profile.identity.manifest)),g=buildImportGraph(root);return ['app.js','js/main.js'].every(f=>g.edges.some(e=>{if(e.from!=='index.html'||e.to!==f||!html.includes(e.url))return false;const u=new URL(e.url,'https://qa/');return u.pathname+u.search+u.hash===m.canonicalModuleURLs[f];}));}catch{return false;}}
check('index cache-busts app/main with current pinned coherent lineage',coherentEntryHTML(index));
check('public index cache-busts app/main with current pinned coherent lineage',coherentEntryHTML(publicIndex));
const activeProfile=verifyRuntimeProfile(root);
check('stale entrypoint token is rejected by coherence check',!coherentEntryHTML(index.replaceAll(activeProfile.identity.buildTag,'STALE_TEST_BUILD')));
check('APP patch marker updated in app/main', app.includes(patch) && main.includes(patch));
check('public APP patch marker updated', publicApp.includes(patch) && publicMain.includes(patch));
check('report remains read-only', !/(?:setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|onSnapshot)\s*\(/.test(report));
check('no second attendance export query path introduced', (report.match(/loadAttendanceMonthPaginated\(/g) || []).length === 2 && (report.match(/getDocs\(/g) || []).length === 0 && ((report.match(/AttendanceService\.loadByMonth\(/g) || []).length + (report.match(/owner\.readMonth\(/g) || []).length) === 1);
check('package exposes V5U-2E check', pkg.scripts?.['check:v5u2e-attendance-excel-sdk-fix'] === 'node tools/check-v5u2e-attendance-excel-sdk-fix.mjs');
check('build:public keeps public as runtime-only output', !publicPkgExists);

// Lightweight behavior test: verifies documentId is used and cursor pagination returns all mocked docs.
globalThis.window = globalThis;
const {HISTORY_AUTHORITY}=await import(pathToFileURL(path.join(root,'js/core/attendanceContract.js')).href);
const serviceModule=await import(pathToFileURL(path.join(root,'js/services/attendance.service.js')).href);
window.APP_BUILD_VERSION=verifyRuntimeProfile(root).identity.buildTag;window.AttendanceModule={getHistoryReadOwner:()=>serviceModule.AttendanceHistoryReadOwner};
const testDb={};window.userRole='admin';window.__store={db:testDb,clubId:'club-a',currentClubId:'club-a',userRole:'admin',currentUser:{uid:'sdk-test'}};window.__verifiedAuthContextState={uid:'sdk-test',role:'admin',clubId:'club-a',ready:true,generation:1};
let documentIdCalls = 0;
let orderByArg = null;
let queryConstraints = [];
const pageDocs = [
  { id: 'att_001', data: () => ({ month: '2026-08', status: 1,profileId:'P1',branch:'CS1',historyAuthority:HISTORY_AUTHORITY,id:'FORGED_DATA_ID' }) },
  { id: 'att_002', data: () => ({ month: '2026-08', status: 2,profileId:'P2',branch:'CS1',historyAuthority:HISTORY_AUTHORITY }) },
];
window._fb_init = {
  collection: (...args) => ({ type: 'collection', args }),
  query: (ref, ...constraints) => { queryConstraints = constraints; return { ref, constraints }; },
  where: (...args) => ({ type: 'where', args }),
  orderBy: (arg) => { orderByArg = arg; return { type: 'orderBy', arg }; },
  documentId: () => { documentIdCalls++; return '__DOCUMENT_ID__'; },
  limit: (n) => ({ type: 'limit', n }),
  startAfter: (cursor) => ({ type: 'startAfter', cursor }),
  getDocs: async () => ({ docs: pageDocs,metadata:{fromCache:false,hasPendingWrites:false} }),
};
try {
  const mod = await import(pathToFileURL(path.join(root, 'js/modules/reports/attendanceExcelReport.js')).href + `?test=${Date.now()}`);
  const result = await mod.loadAttendanceMonthPaginated({ db: testDb, clubId: 'club-a', month: '2026-08',branch:'CS1' });
  check('behavior: documentId helper is invoked once', documentIdCalls === 1);
  check('behavior: orderBy receives documentId sentinel', orderByArg === '__DOCUMENT_ID__');
  check('behavior: bounded query includes where/orderBy/limit', queryConstraints.some(x => x.type === 'where') && queryConstraints.some(x => x.type === 'orderBy') && queryConstraints.some(x => x.type === 'limit'));
  check('behavior: all mocked attendance docs returned', result.items.length === 2 && result.items[0].id === 'att_001' && result.truncated === false);
} catch (err) {
  check('behavior: attendance pagination executes without missing documentId', false, err?.stack || err?.message || String(err));
}

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL.`);
if (fail) process.exit(1);
console.log('V5U-2E Attendance Excel SDK Fix PASS.\n');
