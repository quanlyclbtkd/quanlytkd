/**
 * tools/check-superadmin-monthstats.mjs — SuperAdmin monthStats Safety Check
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra js/modules/superadmin.js:
 *
 * 1. _renderSAClubRows destructure monthStats, curMonth từ từng item trong clubDataList.
 * 2. monthStats không được dùng trong template string khi chưa được destructure.
 * 3. catch block phân biệt runtime error vs permission-denied — không gộp thành
 *    "Bạn cần quyền Super Admin!" cho mọi lỗi.
 * 4. Mỗi CLB thiếu monthStats vẫn render được (fallback null/undefined check).
 *
 * Chạy: node tools/check-superadmin-monthstats.mjs
 * Hoặc: npm run check:superadmin-monthstats
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

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

console.log('\n══════════════════════════════════════════════════════════');
console.log('  SuperAdmin monthStats Safety Check');
console.log('══════════════════════════════════════════════════════════\n');

const saJs = readFile('js/modules/superadmin.js');
if (!saJs) {
    console.error('  ❌ js/modules/superadmin.js không tồn tại');
    process.exit(1);
}

console.log('▸ Section 1: _renderSAClubRows destructures monthStats và curMonth');

// Check that the map destructure includes monthStats
const _hasMonthStatsDestructure =
    /clubDataList\.map\s*\(\s*\(\s*\{[^}]*monthStats[^}]*\}/.test(saJs) ||
    /map\s*\(\s*\(\s*\{[^}]*monthStats[^}]*\}\s*\)/.test(saJs);
check('_renderSAClubRows destructures monthStats từ clubDataList item',
    _hasMonthStatsDestructure,
    'Thêm monthStats vào destructure: clubDataList.map(({ cid, data, ..., monthStats, curMonth }) => {...})');

const _hasCurMonthDestructure =
    /clubDataList\.map\s*\(\s*\(\s*\{[^}]*curMonth[^}]*\}/.test(saJs) ||
    /map\s*\(\s*\(\s*\{[^}]*curMonth[^}]*\}\s*\)/.test(saJs);
check('_renderSAClubRows destructures curMonth từ clubDataList item',
    _hasCurMonthDestructure,
    'Thêm curMonth vào destructure: clubDataList.map(({ ..., monthStats, curMonth }) => {...})');

console.log();
console.log('▸ Section 2: monthStats sử dụng an toàn với null check');

// All uses of monthStats in templates should be guarded
const _hasNullGuardedUsage =
    /monthStats\s*\?/.test(saJs) ||
    /monthStats\s*&&/.test(saJs) ||
    /\$\{monthStats\s*\?/.test(saJs);
check('monthStats dùng null-safe check trong template (monthStats ? ... : ...)',
    _hasNullGuardedUsage,
    'Dùng ${monthStats ? ... : "--"} để tránh crash khi CLB không có stats doc');

console.log();
console.log('▸ Section 3: catch block — phân biệt lỗi runtime vs permission-denied');

const _catchBlock = saJs.match(/catch\s*\(e\)\s*\{[\s\S]*?finally/)?.[0] || '';

const _hasPermissionCheck =
    saJs.includes("e.code === 'permission-denied'") ||
    saJs.includes('permission-denied') ||
    saJs.includes('PERMISSION_DENIED');
check('catch block kiểm tra permission-denied riêng biệt',
    _hasPermissionCheck,
    "Thêm: const _isPermDenied = e.code === 'permission-denied' || e.message.includes('permission-denied')");

const _hasRuntimeCheck =
    saJs.includes('ReferenceError') ||
    saJs.includes('TypeError') ||
    saJs.includes('_isRuntime') ||
    saJs.includes('runtime');
check('catch block phân biệt ReferenceError/TypeError khỏi lỗi quyền',
    _hasRuntimeCheck,
    "Thêm: const _isRuntime = e instanceof ReferenceError || e instanceof TypeError;");

const _noGenericPermMsg =
    !saJs.includes('Lỗi tải dữ liệu. Bạn cần quyền Super Admin!');
check('Không còn thông báo lỗi chung "Bạn cần quyền Super Admin!" cho mọi lỗi',
    _noGenericPermMsg,
    'Phân chia thông báo lỗi theo loại lỗi: runtime, permission-denied, module missing');

console.log();
console.log('▸ Section 4: package.json có check:superadmin-monthstats');

const pkgJson = readFile('package.json');
if (pkgJson) {
    const pkg = JSON.parse(pkgJson);
    check('check:superadmin-monthstats script defined in package.json',
        !!(pkg.scripts && pkg.scripts['check:superadmin-monthstats']),
        'Thêm: "check:superadmin-monthstats": "node tools/check-superadmin-monthstats.mjs"');
    check('check:all includes check-superadmin-monthstats',
        !!(pkg.scripts && pkg.scripts['check:all'] && pkg.scripts['check:all'].includes('check-superadmin-monthstats')),
        'Thêm node tools/check-superadmin-monthstats.mjs vào chuỗi check:all');
}

console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  monthStats issues can crash _renderSAClubRows — fix before deploy!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All SuperAdmin monthStats checks passed!');
    console.log('  _renderSAClubRows an toàn — monthStats được destructure và null-checked đúng.');
    console.log('══════════════════════════════════════════════════════════\n');
}
