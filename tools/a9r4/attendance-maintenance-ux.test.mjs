/** Ensure maintenance is visible, fail closed and has no Coach reader/writer. */
import fs from 'node:fs';import assert from 'node:assert/strict';
const mod=fs.readFileSync('js/modules/attendance.js','utf8'),rules=fs.readFileSync('firestore.rules','utf8'),contract=fs.readFileSync('js/core/attendanceContract.js','utf8');
assert(contract.includes('export const HISTORY_COACH_ACCESS = false'));
assert(/function coachAttendanceCutoverOpen\(\)\s*\{\s*return false;\s*\}/.test(rules));
const s=mod.slice(mod.indexOf("async function _requestAttendanceDailyRefresh("),mod.indexOf("const dateEl = document.getElementById('att_date')",mod.indexOf("async function _requestAttendanceDailyRefresh(")));
assert(s.includes('coachMaintenance'));assert(s.includes("el.dataset.coachMaintenance='1'"));
assert(s.includes("if(id==='att_bulk_btn')el.style.display='none'"));
assert(s.includes("reason:'attendance-maintenance'"));
assert(!/\b(getDocs|onSnapshot|setDoc|writeBatch|addDoc|updateDoc|deleteDoc)\s*\(/.test(s));
console.log('A9R4 attendance maintenance guard+UX source 5/5 PASS; S01 history NOT VERIFIED');
