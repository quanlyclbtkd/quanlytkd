/**
 * tools/check-active-student-sort.mjs — Phase 4K-4G
 *
 * Kiểm tra static: đảm bảo tab ĐANG TẬP sort mới nhất lên đầu
 * dựa vào getStudentJoinTimestamp.
 *
 * Chạy: npm run check:active-student-sort
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    const abs = resolve(root, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
}

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';

let failures = 0;
let total = 0;

function check(label, condition, hint) {
    total++;
    if (condition) {
        console.log(`${PASS}  ${label}`);
    } else {
        console.log(`${FAIL}  ${label}`);
        if (hint) console.log(`       💡 ${hint}`);
        failures++;
    }
}

console.log('\n🔍 Phase 4K-4G — Active Student Sort (Newest-First) Check\n');

const studentsRenderer = readFile('js/ui/render/computation/studentsRenderer.js');
const monthlyHelpers   = readFile('js/utils/monthlyHelpers.js');
const mainJs           = readFile('js/main.js');

// ── 1. studentsRenderer.js — PASS 1 sort dùng join timestamp ─────────────
console.log('▸ Section 1: js/ui/render/computation/studentsRenderer.js — PASS 1');

if (studentsRenderer) {
    check('PASS 1 không dùng Object.keys(allProfiles).sort() nữa',
        !studentsRenderer.includes('Object.keys(allProfiles).sort().forEach'),
        'Thay Object.keys(allProfiles).sort().forEach bằng sort theo getStudentJoinTimestamp');

    check('PASS 1 dùng Object.entries (lấy cả profile object)',
        studentsRenderer.includes('Object.entries(allProfiles'),
        'Thay bằng: const _profileEntries = Object.entries(allProfiles || {});');

    check('PASS 1 sort dùng getStudentJoinTimestamp',
        studentsRenderer.includes('getStudentJoinTimestamp'),
        '_profileEntries.sort dùng window.getStudentJoinTimestamp để lấy timestamp');

    check('PASS 1 sort theo thứ tự giảm dần (tb - ta = newest-first)',
        studentsRenderer.includes('tb - ta') || studentsRenderer.includes('tb !== ta'),
        'Sort: if (tb !== ta) return tb - ta; (mới nhất lên đầu)');

    check('PASS 1 dùng localeCompare vi khi bằng timestamp',
        studentsRenderer.includes("localeCompare") && studentsRenderer.includes("'vi'"),
        "Tiebreak: return String(nameA).localeCompare(String(nameB), 'vi');");
}

// ── 2. monthlyHelpers.js — getStudentJoinTimestamp đầy đủ ────────────────
console.log('\n▸ Section 2: js/utils/monthlyHelpers.js — getStudentJoinTimestamp');

if (monthlyHelpers) {
    check('export function getStudentJoinTimestamp tồn tại',
        monthlyHelpers.includes('export function getStudentJoinTimestamp'),
        'Thêm: export function getStudentJoinTimestamp(name, profile)');

    check('getStudentJoinTimestamp kiểm tra p.createdAt',
        monthlyHelpers.includes('createdAt'),
        'Thử p.createdAt, p.joinedAt, p.joinDate, p.dateJoin, p.enrollDate, ...');

    check('getStudentJoinTimestamp xử lý Firestore Timestamp (toMillis)',
        monthlyHelpers.includes('toMillis'),
        'Xử lý Firestore Timestamp object: if (typeof v.toMillis === "function") return v.toMillis()');

    check('getStudentJoinTimestamp xử lý numeric timestamp',
        monthlyHelpers.includes('typeof v === \'number\'') || monthlyHelpers.includes("typeof v === \"number\""),
        'Xử lý: if (typeof v === "number") return v;');

    check('export function isNewStudent tồn tại',
        monthlyHelpers.includes('export function isNewStudent'),
        'Thêm: export function isNewStudent(name, profile, days = 30)');

    check('export function debugActiveStudentSort tồn tại',
        monthlyHelpers.includes('export function debugActiveStudentSort'),
        'Thêm: export function debugActiveStudentSort(limit = 20)');

    check('initMonthlyHelpers đăng ký window.getStudentJoinTimestamp',
        monthlyHelpers.includes('window.getStudentJoinTimestamp'),
        'initMonthlyHelpers() phải: window.getStudentJoinTimestamp = getStudentJoinTimestamp;');

    check('initMonthlyHelpers đăng ký window.debugActiveStudentSort',
        monthlyHelpers.includes('window.debugActiveStudentSort'),
        'initMonthlyHelpers() phải: window.debugActiveStudentSort = debugActiveStudentSort;');
}

// ── 3. main.js — debugRuntimeSmokeTest tham chiếu activeStudentSort ──────
console.log('\n▸ Section 3: js/main.js — debugRuntimeSmokeTest');

if (mainJs) {
    check('debugRuntimeSmokeTest tham chiếu debugActiveStudentSort',
        mainJs.includes('debugActiveStudentSort'),
        'Thêm safeCall cho debugActiveStudentSort vào window.debugRuntimeSmokeTest');

    check('summary có activeStudentSortOk',
        mainJs.includes('activeStudentSortOk'),
        'Thêm activeStudentSortOk: !!out.activeStudentSort.ok vào summary');

    check('main.js import initMonthlyHelpers',
        mainJs.includes("from './utils/monthlyHelpers.js'"),
        "import { initMonthlyHelpers } from './utils/monthlyHelpers.js';");

    check('main.js gọi initMonthlyHelpers() trước initDashboard()',
        (function() {
            const initMonthlyIdx = mainJs.indexOf('initMonthlyHelpers()');
            const initDashIdx    = mainJs.indexOf('initDashboard()');
            return initMonthlyIdx !== -1 && initDashIdx !== -1 && initMonthlyIdx < initDashIdx;
        })(),
        'initMonthlyHelpers() phải được gọi TRƯỚC initDashboard() để helpers sẵn sàng');
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
    console.log(`\x1b[32m🎉 Tất cả ${total} checks passed — Active Student Sort OK!\x1b[0m\n`);
    process.exit(0);
} else {
    console.log(`\x1b[31m❌ ${failures}/${total} checks FAILED\x1b[0m\n`);
    process.exit(1);
}
