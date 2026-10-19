/**
 * tools/check-search-bindings.mjs — Phase 4J-9B
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra search binding không bị double-mount và các lỗi còn lại.
 *
 * Chạy: node tools/check-search-bindings.mjs
 * Hoặc: npm run check:search-bindings
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

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
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
console.log('  Phase 4J-9B — Search Bindings & Stability Check');
console.log('══════════════════════════════════════════════════════════\n');

// ── Section 1: students.search.js không còn Stub ──────────────────
console.log('▸ Section 1: students.search.js');
const searchJs = readFile('js/modules/students/students.search.js');
check('students.search.js exists', !!searchJs, 'Tạo file js/modules/students/students.search.js');
if (searchJs) {
    check('Không còn STATUS: Stub', !searchJs.includes('STATUS: 🚧 Stub') && !searchJs.includes('STATUS: Stub'), 'Xoá marker "STATUS: 🚧 Stub" — file phải là production code');
    check('Export normalizeSearchInput', searchJs.includes('normalizeSearchInput'), 'Thêm export function normalizeSearchInput(str)');
    check('Export initStudentSearchController', searchJs.includes('initStudentSearchController'), 'Thêm export function initStudentSearchController()');
    check('Export disposeStudentSearchController', searchJs.includes('disposeStudentSearchController'), 'Thêm export function disposeStudentSearchController()');
    check('Có quản lý __studentSearchControllerMounted', searchJs.includes('__studentSearchControllerMounted'), 'Export/set window.__studentSearchControllerMounted trong module');
}
console.log();

// ── Section 2: Search binding — PRIMARY controller guard ──────────
console.log('▸ Section 2: Search binding guards');
const appJs = readFile('app.js');
const studentsJs = readFile('js/modules/students.js');
const eventsJs = readFile('js/events/students.events.js');

if (appJs) {
    check('app.js oninput có guard __studentSearchControllerMounted',
        appJs.includes('__studentSearchControllerMounted') && appJs.includes('oninput'),
        'app.js oninput cần check window.__studentSearchControllerMounted trước khi chạy');
    check('app.js destructure startAfter, startAt, endAt',
        appJs.includes('startAfter') && appJs.includes('startAt') && appJs.includes('endAt'),
        'Thêm startAfter, startAt, endAt vào destructuring của window._fb_init ở đầu IIFE');
}
if (studentsJs) {
    check('students.js set __studentSearchControllerMounted = true',
        studentsJs.includes('__studentSearchControllerMounted = true'),
        'Sau khi bind search input, set window.__studentSearchControllerMounted = true');
    check('students.js có debounce search (350ms)',
        studentsJs.includes('350') && studentsJs.includes('debounce') || studentsJs.includes('clearTimeout'),
        'Search phải debounce 300-400ms, không trigger mỗi keystroke');
}
if (eventsJs) {
    check('students.events.js guard __studentSearchControllerMounted',
        eventsJs.includes('__studentSearchControllerMounted'),
        'students.events.js phải check window.__studentSearchControllerMounted trước khi bind search');

    // Phase 4J-9B FIXED2: runtime guard phải nằm BÊN TRONG callback, không chỉ tại thời điểm bind.
    // Nếu chỉ check khi bind, PRIMARY controller mount sau sẽ không ngăn fallback tiếp tục fire.
    const hasRuntimeGuard = eventsJs.includes("if (window.__studentSearchControllerMounted) return;")
        || eventsJs.includes("if(window.__studentSearchControllerMounted)return;")
        || (eventsJs.includes('addEventListener') && eventsJs.includes('__studentSearchControllerMounted') && eventsJs.includes('return;'));
    check('students.events.js fallback callback có runtime guard bên trong',
        hasRuntimeGuard,
        'Thêm: if (window.__studentSearchControllerMounted) return; ngay đầu callback addEventListener("input", () => { ... })');
}
console.log();

// ── Section 3: Parent Portal retirement boundary ─────────────────
console.log('▸ Section 3: Parent Portal hard-disable boundary');
if (appJs) {
    const _ppStart = appJs.indexOf('window.ppLookupLogin = async () => {');
    const _ppEnd = appJs.indexOf('// ── Ghi nhận lịch sử đăng nhập', _ppStart);
    const _ppBody = _ppStart >= 0 && _ppEnd > _ppStart ? appJs.slice(_ppStart, _ppEnd) : '';
    check('Parent Portal compatibility no-op remains but reader is retired',
        _ppBody.includes('Cổng Phụ huynh hiện không được cung cấp.') &&
        !/\b(?:signInAnonymously|getDoc|getDocs|onSnapshot|collection|query|where|fetchQueryPages)\s*\(/.test(_ppBody),
        'Parent Portal H2/H3 must remain fail-closed with zero Auth/Firestore lookup');
    check('Active runtime has no parentCode search query',
        !/where\(\s*['"]parentCode['"]/.test(appJs),
        'Retired Parent Portal must not regain parentCode Firestore search');
}
console.log();

// ── Section 4: Transaction listener duplicate guard ───────────────
console.log('▸ Section 4: Transaction listener guard');
if (appJs) {
    check('listenToData có cleanupListenersByOwner',
        appJs.includes('cleanupListenersByOwner'),
        'listenToData phải cleanup listeners cũ trước khi subscribe mới');
    check('listenToData có safeRegisterSnapshot guard',
        appJs.includes('safeRegisterSnapshot'),
        'Dùng safeRegisterSnapshot để ngăn duplicate subscription cùng key');
    check('Transaction listener key có clubId + monthStr',
        appJs.includes("'finance:tx:'") || appJs.includes('"finance:tx:"'),
        'Key listener phải gồm clubId + monthStr để cleanup đúng khi đổi tháng');
}
console.log();

// ── Section 5: Attendance limit guard ────────────────────────────
console.log('▸ Section 5: Attendance limit guard');
const attendanceService = readFile('js/services/attendance.service.js');
const attendanceModule = readFile('js/modules/attendance.js');
if (appJs && attendanceService && attendanceModule) {
    check('Attendance dùng attendanceDailyLimit từ scaleConfig',
        appJs.includes('attendanceDailyLimit') && attendanceService.includes('attendanceDailyLimit'),
        'Scale config ở app.js và canonical service phải cùng dùng attendanceDailyLimit');
    check('Attendance có server-side shift filter khi chọn ca',
        attendanceService.includes("if (shiftId) constraints.push(where('shiftId', '==', shiftId))") && attendanceModule.includes('shiftId: token.shiftId') && attendanceModule.includes("requireShift: shiftDecision.mode === 'explicit-shift'"),
        'Canonical module phải truyền shiftId và service phải lọc ở Firestore query');
    check('Attendance warning khi chạm limit có date + shift info',
        attendanceService.includes('hitLimit') && attendanceService.includes('shiftInfo') && attendanceService.includes('warnUnsafeLimit'),
        'Service phải cảnh báo limit hit với ngày/ca và metrics');
}
console.log();

// ── Section 6: Business calculation limits ────────────────────────
console.log('▸ Section 6: Business calculation limits');
if (appJs) {
    const _hasUnsafeCalcLimit = appJs.includes('UNSAFE_LIMIT_FOR_CALCULATION');
    const _unsafeCount = (appJs.match(/UNSAFE_LIMIT_FOR_CALCULATION/g) || []).length;
    check('Không còn UNSAFE_LIMIT_FOR_CALCULATION cho nghiệp vụ tính toán tài chính',
        _unsafeCount === 0,
        'Còn ' + _unsafeCount + ' chỗ đánh dấu UNSAFE_LIMIT_FOR_CALCULATION — cần sửa hoặc chuyển sang paginated/stats');
    check('fetchQueryPages được dùng cho paginated business calculation',
        appJs.includes('fetchQueryPages'),
        'Dùng fetchQueryPages để thay thế limit() cứng trong tính toán tài chính');
    check('SA revenue không còn limit(1000) cứng',
        !appJs.includes('limit(1000)') || appJs.includes('// limit(1000)') || !appJs.includes('sa-revenue'),
        'SA revenue phải dùng fetchQueryPages, không dùng limit(1000) cứng');
}
console.log();

// ── Section 7: searchNameTokens support ──────────────────────────
console.log('▸ Section 7: searchNameTokens — mid-name search');
const serviceJs = readFile('js/services/students.service.js');
if (serviceJs) {
    check('searchProfilesServerSide có searchNameTokens array-contains',
        serviceJs.includes('searchNameTokens') && serviceJs.includes('array-contains'),
        'Thêm where("searchNameTokens","array-contains",token) cho mid-name search (VD: "Văn A")');
    check('searchProfilesServerSide destructure where từ _sdk()',
        serviceJs.includes('where') && serviceJs.includes('_sdk()'),
        'Thêm where vào destructuring của _sdk() trong searchProfilesServerSide');
}
if (appJs) {
    check('buildStudentSearchIndex tạo searchNameTokens',
        appJs.includes('searchNameTokens'),
        'buildStudentSearchIndex phải ghi searchNameTokens (mảng token từ tên normalize)');
}
console.log();

// ── Final Summary ─────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Search bindings & stability — all clear!');
    console.log('══════════════════════════════════════════════════════════\n');
}
