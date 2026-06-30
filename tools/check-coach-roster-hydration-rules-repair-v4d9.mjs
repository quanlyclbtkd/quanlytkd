#!/usr/bin/env node
/** Phase 4K-6V4D9 — Coach Roster Hydration Rules Repair */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const build = 'coach-roster-hydration-rules-repair-20260630-v4d9';
const index = read('index.html');
const app = read('app.js');
const main = read('js/main.js');
const profiles = read('js/listeners/profiles.listeners.js');
const attendance = read('js/modules/attendance.js');
const attendanceService = read('js/services/attendance.service.js');
const rules = read('firestore.rules');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('✅', name); } else { fail++; console.error('❌', name); } }

console.log('\n=== Phase 4K-6V4D9 — Coach Roster Hydration Rules Repair ===\n');
check('Index/main/app use V4D9 cache-bust', index.includes(`app.js?v=${build}`) && index.includes(`./js/main.js?v=${build}`) && app.includes('4K-6V4D9-coach-roster-hydration-rules-repair-20260630'));
check('Main imports and exposes loadCoachBranchProfilesFallback early', main.includes('loadCoachBranchProfilesFallback,') && main.includes('expose profile listener APIs immediately') && main.indexOf('window.mountActiveProfilesListener   = mountActiveProfilesListener') < main.indexOf('(async function bootstrap'));
check('Main early-exposes mountActiveProfilesListener before async bootstrap can delay it', main.includes('window.mountActiveProfilesListener   = mountActiveProfilesListener') && main.includes('window.loadCoachBranchProfilesFallback = loadCoachBranchProfilesFallback'));
check('app.js retries Coach scoped profile mount instead of dead-ending module unavailable', app.includes('_retryMountCoachProfiles') && app.includes('coach-deferred-profile-mount-attempt') && app.includes('kept full-club fallback blocked'));
check('app.js still blocks full-club fallback for Coach', app.includes('Never fall back to full-club reads for Coach') && !app.includes('Coach profiles module unavailable — blocked full-club fallback'));
check('Coach runtime recovery skips full datasource probe', app.includes('Coach scoped session — skip full datasource probe') && main.includes("if (window.RoleReadBoundary?.isCoachAttendanceOnly?.() === true) return;"));
check('Attendance service normalizes Coach/HLV role through RoleReadBoundary context', attendanceService.includes('function _normalizeRole') && attendanceService.includes("role === 'hlv'") && attendanceService.includes('RoleReadBoundary.readContext'));
check('Attendance service uses assigned Coach branch from context, not only window.userRole === coach', attendanceService.includes('function _coachBranchValue') && attendanceService.includes('coach ? _coachBranchValue() : options.branch'));
check('Attendance UI uses robust Coach role helper and assigned branch for daily/monthly views', attendance.includes('function _isCoachRole') && attendance.includes('_coachBranchValue()') && attendance.includes('branch: _dailyBranch'));
check('Coach branch fallback remains branch-only and never full-club', profiles.includes('COACH BRANCH-SAFE FALLBACK') && profiles.includes("const fields = ['branch', 'branchCode', 'coachBranch', 'branchName']") && profiles.includes('setActiveProfiles(mergedActiveMap'));

check('Rules use independent branch-field matching so Coach queries by branch/branchCode/branchName are provable',
  rules.includes('function dataHasAssignedBranch(data)') &&
  rules.includes("data.get('branchCode', '')") &&
  rules.includes('resourceBranchMatchesCoach()') &&
  !rules.includes('return branchMatchesAssigned(assignedBranch(resource.data));'));
check('Coach branch fallback uses a Coach-only guard and does not consume generic full fallback budget',
  profiles.includes('coachBranchFallbackInProgress') &&
  profiles.includes('maxCoachBranchFallbackPerSession') &&
  !profiles.includes('if (_state.fallbackInProgress || _state.fallbackCount >= _state.maxFallbackPerSession) return false'));
check('Coach fallback refuses to mark roster loaded when every alias query is permission-denied',
  profiles.includes('all-branch-specs-denied') && profiles.includes('return false;') && profiles.indexOf('all-branch-specs-denied') < profiles.indexOf('setActiveProfiles(mergedActiveMap'));
check('Attendance roster filter matches all legacy profile branch fields, not only p.branch',
  attendance.includes('function _profileBranchValue') && attendance.includes('function _profileMatchesBranch') &&
  attendance.includes('p.branchCode') && attendance.includes('_profileMatchesBranch(p, selBranch)'));
check('Settings snapshot reruns Coach fallback after custom branch names become available',
  app.includes('settings-ready-branch-aliases') && app.includes('loadCoachBranchProfilesFallback'));

check('Rules syntax repaired for branch10 alias', rules.includes('function isBranch10Alias') && !rules.includes("branchName10', '');\n        ||"));
check('Rules still include login_history create permission', rules.includes('match /login_history/{docId}') && rules.includes('allow create: if signedIn()'));

console.log(`\nTotal: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
if (fail) process.exit(1);
console.log('Phase 4K-6V4D9 checks passed.\n');
