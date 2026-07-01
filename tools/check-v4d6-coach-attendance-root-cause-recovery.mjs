#!/usr/bin/env node
/** Phase 4K-6V4D7 — Coach attendance root-cause recovery gate. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('app.js');
const main = read('js/main.js');
const publicApp = read('public/app.js');
const publicMain = read('public/js/main.js');
const profiles = read('js/listeners/profiles.listeners.js');
const publicProfiles = read('public/js/listeners/profiles.listeners.js');
const students = read('js/modules/students.js');
const finance = read('js/modules/finance.js');
const index = read('index.html');

const build = 'coach-reminder-attendance-stability-20260701-v5b';
let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}

console.log('\n=== Phase 4K-6V4D7 — Coach Attendance Root-Cause Recovery ===\n');

check('Entrypoint cache-bust uses V4D6', index.includes(`./js/main.js?v=${build}`) && index.includes(`app.js?v=${build}`));
check('resolveActiveDataSource skips full collection probes for Coach',
  app.includes("source: 'coach-scoped'") &&
  app.includes('Coach attendance-only: skip full collection probes') &&
  app.includes('not-probed-for-coach'));
check('Runtime recovery treats coach-scoped as successful, not permission-error',
  app.includes("src.source === 'coach-scoped'") &&
  app.includes('không chạy full-club recovery'));
check('Settings snapshot reconciles Coach roster after branchName aliases load',
  app.includes('settings-snapshot-branch-aliases') &&
  app.includes('ensureCoachBranchProfilesReady') &&
  app.includes('loadCoachBranchProfilesFallback'));
check('Finance module is no longer a static dependency of main.js',
  !main.includes("import { initFinance, initTransactionPagination, registerFinanceUiGlobals } from './modules/finance.js") &&
  main.includes('ensureFinanceModuleLoaded') &&
  main.includes('Finance module unavailable; attendance runtime remains active'));
check('Coach sessions skip lazy finance loading',
  main.includes('Skip finance module for Coach attendance-only session') &&
  main.includes('_coachAttendanceOnlyRuntime()'));
check('Finance service cache-bust updated to V4D6',
  finance.includes(`finance.service.js?v=${build}`) && finance.includes(`students.service.js?v=${build}`));
check('Students service cache-bust updated to V4D6',
  students.includes(`students.service.js?v=${build}`));
check('Profiles listener exports coach roster ready helper',
  profiles.includes('export async function ensureCoachBranchProfilesReady') &&
  profiles.includes('return loadCoachBranchProfilesFallback'));
check('Main exposes coach roster fallback helpers globally',
  main.includes('loadCoachBranchProfilesFallback,') &&
  main.includes('ensureCoachBranchProfilesReady,') &&
  main.includes('window.ensureCoachBranchProfilesReady = ensureCoachBranchProfilesReady'));
check('Coach fallback remains branch-alias scoped, never full-club',
  (profiles.includes('fbGetDocs(fbQuery(ctx.profRef, fbWhere(\'branch\', \'==\', alias)))') || profiles.includes("fbGetDocs(fbQuery(ctx.profRef, fbWhere(spec.field, '==', spec.value)))")) &&
  !profiles.includes('await fbGetDocs(ctx.profRef);\n        const activeMap'));
check('Public mirror is synced for hosted build',
  publicApp.includes("source: 'coach-scoped'") &&
  publicMain.includes('ensureFinanceModuleLoaded') &&
  publicProfiles.includes('ensureCoachBranchProfilesReady'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 checks passed.\n');
