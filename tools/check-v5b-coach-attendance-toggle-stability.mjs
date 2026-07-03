#!/usr/bin/env node
import fs from 'node:fs';
const attendance = fs.readFileSync('js/modules/attendance.js','utf8');
const service = fs.readFileSync('js/services/attendance.service.js','utf8');
const publicAttendance = fs.existsSync('public/js/modules/attendance.js') ? fs.readFileSync('public/js/modules/attendance.js','utf8') : '';
let pass=0, fail=0;
function check(name, ok){ if(ok){pass++; console.log('✅', name);} else {fail++; console.error('❌', name);} }
console.log('\n=== Phase 4K-6V5B — Coach Attendance Toggle Stability ===\n');
check('attendance module has pending write guard state', attendance.includes('_attendancePendingWrites') && attendance.includes('_attendanceWriteSeq'));
check('render reload preserves pending optimistic attendance values', attendance.includes('preserve optimistic Coach/Admin writes') && attendance.includes('nextCache[_id] = _attendancePendingWrites[_id].status'));
check('toggle accepts event argument and stops duplicate bubbling', attendance.includes('eventOrIdx, maybeIdxOrName') && attendance.includes('_eventObj.preventDefault()') && attendance.includes('_eventObj.stopPropagation()'));
check('card onclick passes event to canonical toggle', attendance.includes('onclick="window.toggleAttendance(event,'));
check('duplicate tap guard prevents synthesized double fire', attendance.includes('function _isDuplicateAttendanceTap') && attendance.includes('now - last.at < 140'));
check('toggle calculates from pending optimistic status first', attendance.includes('_attendancePendingWrites[docId].pending ? _attendancePendingWrites[docId].status'));
check('toggle saves attendance branch using branchCode before legacy branch', attendance.includes("branch: p.branchCode || p.branch || ''"));
check('toggle clears pending only for matching write sequence', attendance.includes('_attendancePendingWrites[docId].seq === writeSeq'));
check('toggle rollback restores old UI through helper', attendance.includes('_applyAttendanceCardState(idx, currentStatus)'));
check('coach roster filter can use canonical profile branch matcher', attendance.includes('function _profileBranchMatchesAttendance') && attendance.includes('window.profileBranchMatchesFilter'));
check('active attendance filter can use canonical active helper', attendance.includes('window.isProfileActiveForAttendance'));
check('AttendanceService still blocks coach full-club queries when branch is missing', service.includes('Coach chưa được gán cơ sở'));
check('public attendance mirror is synced', publicAttendance.includes('_attendancePendingWrites') && publicAttendance.includes('onclick="window.toggleAttendance(event,'));
console.log(`\nTotal: ${pass+fail} | PASS: ${pass} | FAIL: ${fail}`);
if(fail) process.exit(1);
