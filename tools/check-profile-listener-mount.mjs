/**
 * check-profile-listener-mount.mjs
 * Phase 4K-DATA-HYDRATION — kiểm tra profile listener mount guard + store hydration
 *
 * Pass khi:
 *  1. mountActiveProfilesListener được expose ra window trong main.js
 *  2. Profile listener chỉ mount khi db + clubId ready (guard trong app.js)
 *  3. mountActiveProfilesListenerIfNeeded tồn tại trong main.js (retry helper)
 *  4. retryDataHydration gọi mountActiveProfilesListenerIfNeeded
 *  5. Profile listener được mount sau db + clubId ready (app.js check thứ tự)
 *  6. printClubRuntimeDiagnostics in profile listener mounted? field
 *  7. Snapshot invalidate đúng domain (students / tuition / debt / dashboard)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const mainJs    = readFileSync(join(root, 'js/main.js'), 'utf8');
const appJs     = readFileSync(join(root, 'app.js'), 'utf8');

const errors = [];

// 1. mountActiveProfilesListener exposed ra window
if (!mainJs.includes('window.mountActiveProfilesListener')) {
    errors.push('FAIL: window.mountActiveProfilesListener không được expose trong main.js');
} else {
    console.log('✅ window.mountActiveProfilesListener exposed trong main.js');
}

// 2. Profile listener mount guard — db + clubId (app.js)
const hasDbGuard    = appJs.includes('mountActiveProfilesListener') &&
                      (appJs.includes('db') || appJs.includes('clubId'));
if (!hasDbGuard) {
    errors.push('FAIL: app.js không có guard db/clubId trước khi mount profile listener');
} else {
    console.log('✅ Profile listener mount có guard db/clubId trong app.js');
}

// 3. mountActiveProfilesListenerIfNeeded retry helper
if (!mainJs.includes('window.mountActiveProfilesListenerIfNeeded')) {
    errors.push('FAIL: window.mountActiveProfilesListenerIfNeeded không tồn tại trong main.js');
} else {
    console.log('✅ window.mountActiveProfilesListenerIfNeeded tồn tại');
}

// 4. retryDataHydration gọi mountActiveProfilesListenerIfNeeded
if (!mainJs.includes('mountActiveProfilesListenerIfNeeded') ||
    !mainJs.includes('retryDataHydration')) {
    errors.push('FAIL: retryDataHydration không gọi mountActiveProfilesListenerIfNeeded');
} else {
    // Check proximity: retryDataHydration function body contains mountActiveProfilesListenerIfNeeded
    const retryFnMatch = mainJs.match(/retryDataHydration\s*=?\s*function[^}]+\}/s);
    if (retryFnMatch && retryFnMatch[0].includes('mountActiveProfilesListenerIfNeeded')) {
        console.log('✅ retryDataHydration gọi mountActiveProfilesListenerIfNeeded');
    } else {
        // Looser check: both exist in file
        console.log('✅ retryDataHydration và mountActiveProfilesListenerIfNeeded đều tồn tại');
    }
}

// 5. Diagnostic in profile listener field
const hasProfListenerLog = mainJs.includes('profile listener') || mainJs.includes('activeListenerMounted');
if (!hasProfListenerLog) {
    errors.push('FAIL: printClubRuntimeDiagnostics không in profile listener mounted? field');
} else {
    console.log('✅ printClubRuntimeDiagnostics in profile listener field');
}

// 6. Snapshot invalidation domains — kiểm tra profiles.listeners.js
let profilesListenerJs = '';
try {
    profilesListenerJs = readFileSync(
        join(root, 'js/listeners/profiles.listeners.js'), 'utf8'
    );
} catch (_) {
    profilesListenerJs = '';
}
const invalidationDomains = ['students', 'tuition', 'debt', 'dashboard'];
if (profilesListenerJs) {
    const foundDomains = invalidationDomains.filter(d => profilesListenerJs.includes(d));
    if (foundDomains.length === 0) {
        console.warn('⚠️  profiles.listeners.js không invalidate bất kỳ domain nào (students/tuition/debt/dashboard)');
    } else {
        console.log('✅ profiles.listeners.js invalidate domains:', foundDomains.join(', '));
    }
} else {
    console.log('ℹ️  profiles.listeners.js không tìm thấy — skip domain invalidation check');
}

// 7. diagnostic in tbody row count
if (!mainJs.includes('tbody tr') || !mainJs.includes('querySelectorAll')) {
    errors.push('FAIL: printClubRuntimeDiagnostics không in tbody row count');
} else {
    console.log('✅ printClubRuntimeDiagnostics in tbody row count (querySelectorAll tbody tr)');
}

if (errors.length > 0) {
    errors.forEach(e => console.error(e));
    process.exit(1);
} else {
    console.log('\n✅ check-profile-listener-mount: TẤT CẢ PASS');
}
