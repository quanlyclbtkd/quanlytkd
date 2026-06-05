/**
 * tools/check-mobile-superadmin-guard.mjs
 * Phase 4K-5Q — Kiểm tra Mobile SuperAdmin Guard
 *
 * Fail nếu:
 * 1. Không có isSuperAdminRole
 * 2. openMobileMenu còn hiển thị mmsAdminBtn cho admin
 * 3. openNewClubModal không guard super_admin
 * 4. createNewClubSystem không guard super_admin
 * 5. Không có debugMobileSuperAdminGuard
 * 6. debugRuntimeSmokeTest không include mobileSuperAdminGuard
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

function readFile(rel) {
    return readFileSync(join(root, rel), 'utf8');
}

const errors = [];
const warnings = [];

// ── Check app.js ──────────────────────────────────────────────────────────────

let appJs = '';
try {
    appJs = readFile('app.js');
} catch (e) {
    errors.push('❌ Không đọc được app.js: ' + e.message);
}

if (appJs) {
    // 1. isSuperAdminRole phải tồn tại
    if (!appJs.includes('window.isSuperAdminRole')) {
        errors.push('❌ FAIL 1: window.isSuperAdminRole không tồn tại trong app.js');
    } else {
        console.log('✅ window.isSuperAdminRole: OK');
    }

    // 2. openMobileMenu không được dùng admin||super_admin cho superBtn
    if (appJs.includes("window.userRole === 'admin' || window.userRole === 'super_admin') ? 'block'")) {
        const mobileMenuSection = appJs.match(/window\.openMobileMenu[\s\S]{0,600}/)?.[0] || '';
        if (mobileMenuSection.includes("window.userRole === 'admin' || window.userRole === 'super_admin'")) {
            errors.push('❌ FAIL 2: openMobileMenu vẫn hiển thị mmsAdminBtn cho admin (role check cũ)');
        }
    } else {
        console.log('✅ openMobileMenu không dùng admin||super_admin cho superBtn: OK');
    }

    // 2b. openMobileMenu phải dùng isSuperAdminRole
    if (!appJs.includes('isSuperAdminRole()') ||
        !appJs.match(/openMobileMenu[\s\S]{0,500}isSuperAdminRole/)) {
        errors.push('❌ FAIL 2b: openMobileMenu không dùng isSuperAdminRole()');
    } else {
        console.log('✅ openMobileMenu sử dụng isSuperAdminRole(): OK');
    }

    // 3. openNewClubModal phải guard super_admin
    const openNewClubMatch = appJs.match(/window\.openNewClubModal[\s\S]{0,500}/)?.[0] || '';
    if (!openNewClubMatch.includes('isSuperAdminRole')) {
        errors.push('❌ FAIL 3: openNewClubModal không guard isSuperAdminRole');
    } else {
        console.log('✅ openNewClubModal guard isSuperAdminRole: OK');
    }

    // 4. createNewClubSystem phải guard super_admin
    const createClubMatch = appJs.match(/window\.createNewClubSystem[\s\S]{0,500}/)?.[0] || '';
    if (!createClubMatch.includes('isSuperAdminRole')) {
        errors.push('❌ FAIL 4: createNewClubSystem không guard isSuperAdminRole');
    } else {
        console.log('✅ createNewClubSystem guard isSuperAdminRole: OK');
    }

    // 5. debugMobileSuperAdminGuard phải tồn tại
    if (!appJs.includes('window.debugMobileSuperAdminGuard')) {
        errors.push('❌ FAIL 5: window.debugMobileSuperAdminGuard không tồn tại trong app.js');
    } else {
        console.log('✅ window.debugMobileSuperAdminGuard: OK');
    }
}

// ── Check main.js ─────────────────────────────────────────────────────────────

let mainJs = '';
try {
    mainJs = readFile('js/main.js');
} catch (e) {
    errors.push('❌ Không đọc được js/main.js: ' + e.message);
}

if (mainJs) {
    // 6. debugRuntimeSmokeTest phải include mobileSuperAdminGuard
    if (!mainJs.includes('mobileSuperAdminGuard') || !mainJs.includes('debugMobileSuperAdminGuard')) {
        errors.push('❌ FAIL 6: debugRuntimeSmokeTest không include mobileSuperAdminGuard');
    } else {
        console.log('✅ debugRuntimeSmokeTest includes mobileSuperAdminGuard: OK');
    }

    if (!mainJs.includes('mobileSuperAdminGuardOk')) {
        warnings.push('⚠️  mobileSuperAdminGuardOk không có trong summary (không fatal)');
    } else {
        console.log('✅ summary.mobileSuperAdminGuardOk: OK');
    }
}

// ── Result ────────────────────────────────────────────────────────────────────

console.log('');
if (warnings.length) warnings.forEach(w => console.warn(w));

if (errors.length) {
    console.error('\n[check-mobile-superadmin-guard] FAILED:');
    errors.forEach(e => console.error('  ' + e));
    process.exit(1);
} else {
    console.log('[check-mobile-superadmin-guard] ✅ Tất cả kiểm tra qua — Mobile SuperAdmin Guard OK');
}
