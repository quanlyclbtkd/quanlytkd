#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  app: read('app.js'),
  main: read('js/main.js'),
  branchIdentity: read('js/core/branchIdentity.js'),
  attendance: read('js/modules/attendance.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  rules: read('firestore.rules'),
  publicAttendance: read('public/js/modules/attendance.js'),
  publicProfiles: read('public/js/listeners/profiles.listeners.js'),
  publicBranchIdentity: read('public/js/core/branchIdentity.js'),
};
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }
console.log('\n=== Phase 4K-6V4D7 — Coach Attendance Deep Branch Recovery ===\n');
const build = 'coach-attendance-auth-roster-final-recovery-20260630-v4d8';
check('Entrypoints cache-bust to V4D7', files.index.includes(`app.js?v=${build}`) && files.index.includes(`./js/main.js?v=${build}`));
check('Main imports attendance/profiles with V4D7 cache-bust', files.main.includes(`./modules/attendance.js?v=${build}`) && files.main.includes(`./listeners/profiles.listeners.js?v=${build}`));
check('Configured branch display names normalize to canonical codes', files.branchIdentity.includes('function _codeFromConfiguredName') && files.branchIdentity.includes('opts.config || opts.clubConfig'));
check('Attendance filtering uses profile branch extraction, not only p.branch', files.attendance.includes('function _profileBranchValue') && files.attendance.includes('_sameBranch(_profileBranchValue(p), selBranch)'));
check('Attendance accepts common legacy branch fields', ['branchCode','branchName','coachBranch','facility','base','coso','coSo','location'].every(x => files.attendance.includes(x)));
check('Coach listener defines branch-field query specs', files.profiles.includes('COACH_PROFILE_BRANCH_FIELDS') && files.profiles.includes('function _coachProfileQuerySpecs'));
check('Coach profile queries cover legacy branch fields', ['branchCode','coachBranch','branchName','facility','base','coso','coSo','location'].every(x => files.profiles.includes(`'${x}'`)));
check('Coach fallback remains branch-scoped and never full-club', files.profiles.includes("return loadCoachBranchProfilesFallback('redirected-from-full:") && files.profiles.includes("fbWhere(spec.field, '==', spec.value)"));
check('Legacy app fallback also uses branch-field safe specs', files.app.includes("const _coachFields=['branch','branchCode','branchId','branchLabel'") && files.app.includes('coach-branch-field-safe-fallback'));
check('Firestore Rules allow coach profile reads through legacy branch fields only', files.rules.includes('function resourceProfileBranchMatchesCoach()') && files.rules.includes('resource.data.branchCode') && files.rules.includes('resource.data.branchName') && files.rules.includes('resource.data.coSo'));
check('Attendance writes still require canonical branch field', files.rules.includes('function requestBranchMatchesCoach()') && files.rules.includes("request.resource.data.keys().hasAll(['branch'])"));
check('Public mirror files are synced', files.publicAttendance.includes('function _profileBranchValue') && files.publicProfiles.includes('COACH_PROFILE_BRANCH_FIELDS') && files.publicBranchIdentity.includes('function _codeFromConfiguredName') && files.publicBranchIdentity.includes('4K-6V4D8'));
check('Coach financial/full-club sources remain blocked', files.main.includes('Skip finance module for Coach attendance-only') && files.app.includes('Coach attendance-only: skip full collection probes'));
console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 deep branch recovery checks passed.\n');
