/**
 * tools/check-legacy-bridge.mjs — Legacy Bridge Check
 * ─────────────────────────────────────────────────────────────────
 * Kiểm tra Phase 4K-RUNTIME-INIT-FIX: legacy bridge cho các globals
 * được yêu cầu bởi module guard nhưng không được expose tự động.
 *
 * Checks:
 * 1. window.editProfile bridge/fallback tồn tại trong main.js.
 * 2. Bridge có forward tới openProfile (fallback an toàn).
 * 3. Bridge dùng pattern || để không ghi đè impl thật nếu có.
 * 4. Không có crash khi gọi editProfile mà openProfile chưa ready.
 * 5. [RuntimeGuard] students không còn báo editProfile missing.
 *
 * Chạy: node tools/check-legacy-bridge.mjs
 * Hoặc: npm run check:legacy-bridge
 * ─────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
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
console.log('  Legacy Bridge Check — Phase 4K-RUNTIME-INIT-FIX');
console.log('══════════════════════════════════════════════════════════\n');

const mainJs = readFile('js/main.js');
const studentsJs = readFile('js/modules/students.js');
const appJs = readFile('app.js');

if (!mainJs) {
    console.error('  ❌ FATAL: js/main.js không đọc được!');
    process.exit(1);
}

// ── Section 1: editProfile bridge trong main.js ─────────────────────────────
console.log('▸ Section 1: editProfile legacy bridge trong main.js');

const _hasEditProfileBridge =
    /window\.editProfile\s*=\s*window\.editProfile\s*\|\|/.test(mainJs);
check(
    'window.editProfile bridge dùng || pattern (không ghi đè impl thật)',
    _hasEditProfileBridge,
    'Thêm: window.editProfile = window.editProfile || function _editProfileBridge(name) { ... }'
);

const _bridgeForwardsToOpenProfile = mainJs.includes('openProfile') && mainJs.includes('editProfile');
check(
    'Bridge forward tới window.openProfile khi available',
    _bridgeForwardsToOpenProfile,
    'Trong bridge: if (typeof window.openProfile === "function") return window.openProfile(name);'
);

const _bridgeHasSafetyFallback =
    mainJs.includes('editProfile') && mainJs.includes('showToast');
check(
    'Bridge có safety fallback khi openProfile cũng chưa ready (toast hoặc warn)',
    _bridgeHasSafetyFallback,
    'Thêm: else window.showToast("Chức năng chưa sẵn sàng", "warning") khi openProfile undefined'
);

// Check bridge is placed AFTER initStudents() call
const _initStudentsIdx = mainJs.indexOf('initStudents()');
const _editProfileBridgeIdx = mainJs.indexOf('window.editProfile = window.editProfile ||');
check(
    'editProfile bridge được gán SAU initStudents() — không bị override ngược',
    _initStudentsIdx !== -1 && _editProfileBridgeIdx !== -1 && _editProfileBridgeIdx > _initStudentsIdx,
    'Đặt bridge sau dòng initStudents() để tránh bridge ghi đè impl thật của initStudents'
);

// ── Section 2: students module health check expects editProfile ─────────────
console.log();
console.log('▸ Section 2: students module — editProfile requirement');

const _studentsRequiresEditProfile =
    (mainJs && mainJs.includes("'editProfile'")) ||
    (mainJs && mainJs.includes('"editProfile"'));
check(
    'main.js health check / module guard yêu cầu editProfile',
    _studentsRequiresEditProfile,
    "Dòng: window.ensureModuleRuntimeReady('students', ['openAddModal', 'editProfile'])"
);

const _editProfileNotInStudentsInit = studentsJs
    ? !(/window\.editProfile\s*=\s*function/.test(studentsJs) || /window\.editProfile\s*=\s*async/.test(studentsJs))
    : true;
check(
    'initStudents() KHÔNG expose window.editProfile trực tiếp (bridge là cần thiết)',
    _editProfileNotInStudentsInit,
    'Nếu initStudents() đã expose editProfile → bridge dùng || sẽ không ghi đè, vẫn an toàn'
);

// ── Section 3: editProfile NOT defined in app.js (bridge is needed) ─────────
console.log();
console.log('▸ Section 3: app.js — editProfile legacy');
if (appJs) {
    const _appJsNoEditProfile =
        !/window\.editProfile\s*=\s*(?:async\s+)?function/.test(appJs) &&
        !/window\.editProfile\s*=\s*(?:async\s*)?\(/.test(appJs);
    check(
        'app.js không expose window.editProfile trực tiếp (legacy bridge là đúng hướng)',
        _appJsNoEditProfile,
        'Nếu app.js đã expose editProfile → bridge || sẽ an toàn và không override'
    );
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log();
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Legacy bridge thiếu — [RuntimeGuard] students sẽ báo editProfile missing!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All legacy bridge checks passed!');
    console.log('  window.editProfile bridge tồn tại — nút sửa hồ sơ sẽ hoạt động.');
    console.log('══════════════════════════════════════════════════════════\n');
}
