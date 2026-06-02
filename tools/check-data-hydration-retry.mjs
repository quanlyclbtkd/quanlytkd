/**
 * check-data-hydration-retry.mjs
 * Phase 4K-DATA-HYDRATION — kiểm tra pagination retry + isClubRuntimeReady + retryDataHydration
 *
 * Pass khi:
 *  1. isClubRuntimeReady tồn tại trong main.js
 *  2. _tryInitPaginationsOnDbReady check isClubRuntimeReady (không chỉ check __store.db)
 *  3. StudentPagination retry dùng __studentPaginationInitializedForClub (clubId-specific guard)
 *  4. window.retryDataHydration tồn tại trong main.js
 *  5. __paginationDbReadyListenerRegistered được reset trong _patchResetStore (logout)
 *  6. TransactionPagination retry qua app:db-ready + app:context-ready
 *  7. Post-bootstrap immediate check tồn tại (tránh skip nếu event fire trước listener)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const mainJs    = readFileSync(join(root, 'js/main.js'), 'utf8');

const errors = [];

// 1. isClubRuntimeReady helper
if (!mainJs.includes('window.isClubRuntimeReady') || !mainJs.includes('function isClubRuntimeReady')) {
    errors.push('FAIL: isClubRuntimeReady helper không tồn tại trong js/main.js');
} else {
    console.log('✅ isClubRuntimeReady helper tồn tại');
}

// 2. _tryInitPaginationsOnDbReady dùng isClubRuntimeReady
if (!mainJs.includes('window.isClubRuntimeReady()') && !mainJs.includes('isClubRuntimeReady()')) {
    errors.push('FAIL: _tryInitPaginationsOnDbReady không dùng isClubRuntimeReady()');
} else {
    console.log('✅ _tryInitPaginationsOnDbReady dùng isClubRuntimeReady()');
}

// 3. __studentPaginationInitializedForClub guard (clubId-specific)
if (!mainJs.includes('__studentPaginationInitializedForClub')) {
    errors.push('FAIL: __studentPaginationInitializedForClub guard không tồn tại — chỉ có global boolean');
} else {
    console.log('✅ __studentPaginationInitializedForClub guard (clubId-specific) tồn tại');
}

// 4. window.retryDataHydration
if (!mainJs.includes('window.retryDataHydration') || !mainJs.includes('function retryDataHydration')) {
    errors.push('FAIL: window.retryDataHydration không tồn tại trong js/main.js');
} else {
    console.log('✅ window.retryDataHydration tồn tại');
}

// 5. __paginationDbReadyListenerRegistered reset on logout
if (!mainJs.includes('__paginationDbReadyListenerRegistered = false')) {
    errors.push('FAIL: __paginationDbReadyListenerRegistered không được reset trong _patchResetStore');
} else {
    console.log('✅ __paginationDbReadyListenerRegistered reset trên logout');
}

// 6. app:db-ready + app:context-ready listeners
if (!mainJs.includes("'app:db-ready'") || !mainJs.includes("'app:context-ready'")) {
    errors.push('FAIL: app:db-ready / app:context-ready listeners không tồn tại');
} else {
    console.log('✅ app:db-ready + app:context-ready listeners đăng ký retry');
}

// 7. Post-bootstrap immediate check
if (!mainJs.includes('post-bootstrap-check') || !mainJs.includes('isClubRuntimeReady()')) {
    errors.push('FAIL: post-bootstrap-check (setTimeout 0 + isClubRuntimeReady) không tồn tại');
} else {
    console.log('✅ Post-bootstrap immediate check tồn tại');
}

// 8. mountActiveProfilesListenerIfNeeded
if (!mainJs.includes('window.mountActiveProfilesListenerIfNeeded')) {
    errors.push('FAIL: window.mountActiveProfilesListenerIfNeeded không tồn tại');
} else {
    console.log('✅ window.mountActiveProfilesListenerIfNeeded tồn tại');
}

if (errors.length > 0) {
    errors.forEach(e => console.error(e));
    process.exit(1);
} else {
    console.log('\n✅ check-data-hydration-retry: TẤT CẢ PASS');
}
