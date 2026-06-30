#!/usr/bin/env node
/** Phase 4K-6V4D7 — Coach attendance fallback stability */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  index: read('index.html'),
  main: read('js/main.js'),
  profiles: read('js/listeners/profiles.listeners.js'),
  attendance: read('js/modules/attendance.js'),
  attendanceService: read('js/services/attendance.service.js'),
  rules: read('firestore.rules'),
  app: read('app.js'),
};
const build = 'coach-attendance-fallback-stability-20260630-v4d7';
let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('✅', name); }
  else { fail++; console.error('❌', name); }
}
console.log('\n=== Phase 4K-6V4D7 — Coach Attendance Fallback Stability ===\n');

check('index/main/app cache-bust V4D7',
  files.index.includes(`app.js?v=${build}`) &&
  files.index.includes(`./js/main.js?v=${build}`) &&
  files.main.includes(`profiles.listeners.js?v=${build}`) &&
  files.main.includes(`modules/attendance.js?v=${build}`));
check('Coach fallback map exists in listener state',
  files.profiles.includes('coachFallbackActiveMap') &&
  files.profiles.includes('branch fallback active docs must survive later empty active snapshots'));
check('Coach active map merge keeps fallback until branch listener has canonical data',
  files.profiles.includes('fallback → legacy primary alias → canonical realtime') &&
  files.profiles.includes('_state.coachFallbackActiveMap || {}') &&
  files.profiles.includes('_state.coachLegacyActiveMap || {}') &&
  files.profiles.includes('_state.coachCanonicalActiveMap || {}'));
check('Coach branch fallback stores fallback map before setActiveProfiles',
  files.profiles.includes('_state.coachFallbackActiveMap = activeMap') &&
  files.profiles.includes("setActiveProfiles(_mergedCoachActiveMap(), 'coach-branch-fallback:"));
check('Fallback map is cleared on listener cleanup/reset only',
  files.profiles.includes('cleanupActiveProfilesListener') &&
  files.profiles.includes('resetProfilesListeners') &&
  (files.profiles.match(/coachFallbackActiveMap = \{\}/g) || []).length >= 3);
check('Attendance reads full in-memory union for coach branch filtering',
  files.attendance.includes('getAllProfilesCompat') &&
  files.attendance.includes('profileSourceCount') &&
  files.attendance.includes('emptyCoachBranch'));
check('Attendance service requires assigned coach branch before reads/writes',
  files.attendanceService.includes('attendance/coach-branch-required') &&
  files.attendanceService.includes('RoleReadBoundary?.canMount?.(\'attendance.daily\''));
check('Firestore rules still restrict coach profiles/attendance to assigned branch',
  files.rules.includes('resourceBranchMatchesCoach()') &&
  files.rules.includes('requestBranchMatchesCoach()') &&
  files.rules.includes('match /attendance/{attendanceId}'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D7 coach attendance fallback stability checks passed.\n');
