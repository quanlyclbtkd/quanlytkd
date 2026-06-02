/**
 * tools/check-attendance-shift-filter.mjs — Phase 4J-9B FIXED2
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra logic attendance shift filter trong app.js không còn lỗi.
 *
 * Lỗi cũ:
 *   if (_currentShiftId ? (_docShift !== _currentShiftId) : (_docShift !== '')) return;
 *   → Khi không chọn ca, bỏ qua record có shiftId (sai).
 *
 * Logic đúng:
 *   if (_currentShiftId && _docShift !== _currentShiftId) return;
 *   → Không chọn ca: lấy tất cả record.
 *   → Có chọn ca: chỉ lấy đúng ca đó.
 *
 * Chạy: node tools/check-attendance-shift-filter.mjs
 * Hoặc: npm run check:attendance-shift-filter
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint, fileRef) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        const loc = fileRef ? ' [' + fileRef + ']' : '';
        console.error('  ❌ ' + label + loc);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4J-9B FIXED2 — Attendance Shift Filter Check');
console.log('══════════════════════════════════════════════════════════\n');

const appJs = readFile('app.js');

console.log('▸ Section 1: app.js — Attendance shift filter logic');

check('app.js exists', !!appJs, 'app.js không tồn tại', 'app.js');

if (appJs) {
    // Kiểm tra pattern lỗi KHÔNG còn tồn tại
    const badPattern1 = /\(\s*_currentShiftId\s*\?\s*\(\s*_docShift\s*!==\s*_currentShiftId\s*\)\s*:\s*\(\s*_docShift\s*!==\s*''\s*\)\s*\)/;
    const badPattern2 = /_currentShiftId\s*\?\s*\(_docShift\s*!==\s*_currentShiftId\s*\)\s*:\s*\(_docShift\s*!==\s*''\s*\)/;

    check(
        'Không còn logic sai: ternary filter bỏ qua record có shiftId khi không chọn ca',
        !badPattern1.test(appJs) && !badPattern2.test(appJs),
        'Xóa: if (_currentShiftId ? (_docShift !== _currentShiftId) : (_docShift !== \'\')) return;\n     Thay bằng: if (_currentShiftId && _docShift !== _currentShiftId) return;',
        'app.js → renderAttendanceList'
    );

    // Kiểm tra pattern đúng TỒN TẠI
    const goodPattern = /if\s*\(\s*_currentShiftId\s*&&\s*_docShift\s*!==\s*_currentShiftId\s*\)\s*return\s*;/;
    check(
        'Có logic đúng: if (_currentShiftId && _docShift !== _currentShiftId) return;',
        goodPattern.test(appJs),
        'Thêm: if (_currentShiftId && _docShift !== _currentShiftId) return;',
        'app.js → renderAttendanceList → snap.forEach'
    );

    // Kiểm tra _attendanceCache vẫn còn
    check(
        '_attendanceCache vẫn được gán trong renderAttendanceList',
        appJs.includes('_attendanceCache[d.id]') && appJs.includes('_mapLegacyStatus'),
        '_attendanceCache[d.id] = _mapLegacyStatus(...) phải còn sau lệnh if',
        'app.js → renderAttendanceList'
    );

    // Kiểm tra backward-compat comment hoặc shiftId
    check(
        'Có ghi chú tương thích ngược cho record không có shiftId',
        appJs.includes('shiftId') && appJs.includes('_docShift'),
        'Giữ _docShift = _sd.shiftId || "" để tương thích record cũ không có shiftId',
        'app.js → renderAttendanceList'
    );

    // Kiểm tra attendanceDailyLimit vẫn còn
    check(
        'attendanceDailyLimit vẫn được dùng (không hard-code limit)',
        appJs.includes('attendanceDailyLimit'),
        'Giữ window.__scaleConfig.attendanceDailyLimit thay vì hard-code limit(500)',
        'app.js → renderAttendanceList'
    );

    // Kiểm tra warning khi chạm limit vẫn còn
    check(
        'Warning khi snap.size >= limit vẫn còn',
        appJs.includes('snap.size >= _attLimit') || appJs.includes('snap.size>=_attLimit'),
        'Giữ warning khi attendance hit limit để dễ debug production',
        'app.js → renderAttendanceList'
    );
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Attendance shift filter — all clear!');
    console.log('══════════════════════════════════════════════════════════\n');
}
