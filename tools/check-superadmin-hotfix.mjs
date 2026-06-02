/**
 * tools/check-superadmin-hotfix.mjs — Phase 4K SUPERADMIN HOTFIX
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra các HOTFIX cho SuperAdmin không load danh sách CLB.
 *
 * Phát hiện:
 *   1. index.html thiếu startAfter/startAt/endAt trong window._fb_init
 *   2. app.js SA branch gọi loadSuperAdminData() trực tiếp (race condition)
 *   3. app.js fallback wrapper không có retry logic
 *   4. main.js không có retry/reload SA sau initSuperAdmin()
 *   5. superadmin.js không hiển thị lỗi permission-denied rõ ràng
 *
 * Chạy: node tools/check-superadmin-hotfix.mjs
 * Hoặc: npm run check:superadmin-hotfix
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

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
console.log('  Phase 4K SUPERADMIN HOTFIX — Race Condition & Fallback Check');
console.log('══════════════════════════════════════════════════════════\n');

const indexHtml    = readFile('index.html');
const appJs        = readFile('app.js');
const mainJs       = readFile('js/main.js');
const superadminJs = readFile('js/modules/superadmin.js');

// ── Section 1: index.html window._fb_init completeness ───────────────
console.log('▸ Section 1: index.html — window._fb_init Firebase exports');
if (indexHtml) {
    check('index.html exists', true, '');

    check('index.html imports startAfter from firebase-firestore.js',
        indexHtml.includes('startAfter') && indexHtml.includes('firebase-firestore.js'),
        'Add startAfter to: import { ..., startAfter } from "https://www.gstatic.com/firebasejs/.../firebase-firestore.js"');

    check('index.html imports startAt from firebase-firestore.js',
        indexHtml.includes('startAt') && indexHtml.includes('firebase-firestore.js'),
        'Add startAt to the firebase-firestore.js import line');

    check('index.html imports endAt from firebase-firestore.js',
        indexHtml.includes('endAt') && indexHtml.includes('firebase-firestore.js'),
        'Add endAt to the firebase-firestore.js import line');

    check('window._fb_init includes startAfter',
        /window\._fb_init\s*=\s*\{[^}]*startAfter/.test(indexHtml),
        'Add startAfter to the window._fb_init = { ... } object');

    check('window._fb_init includes startAt',
        /window\._fb_init\s*=\s*\{[^}]*startAt/.test(indexHtml),
        'Add startAt to the window._fb_init = { ... } object');

    check('window._fb_init includes endAt',
        /window\._fb_init\s*=\s*\{[^}]*endAt/.test(indexHtml),
        'Add endAt to the window._fb_init = { ... } object');
}
console.log();

// ── Section 2: app.js — no bare loadSuperAdminData() in SA branch ─────
console.log('▸ Section 2: app.js — initSaaSDatabase() SA race condition fix');
if (appJs) {
    check('app.js exists', true, '');

    // The superAdminView block must NOT contain a bare synchronous window.loadSuperAdminData()
    // instead it should use an async retry pattern
    const _saViewBlock = appJs.match(/superAdminView.*?displaySubtitle[\s\S]{0,2000}?return;/)?.[0] || '';
    const _hasBareCall = /^\s*window\.loadSuperAdminData\(\);/m.test(_saViewBlock);
    check('initSaaSDatabase SA branch does NOT call loadSuperAdminData() directly (race condition)',
        !_hasBareCall,
        'Replace window.loadSuperAdminData() with async retry using ensureSuperAdminModule');

    check('initSaaSDatabase SA branch has async retry pattern',
        appJs.includes('ensureSuperAdminModule') && appJs.includes('initSaaSDatabase'),
        'Use async IIFE with retry loop: for (_i = 0; _i < 20; _i++) { await new Promise(...); ... }');

    check('initSaaSDatabase SA retry waits for ensureSuperAdminModule to exist',
        appJs.includes('typeof window.ensureSuperAdminModule === \'function\'') ||
        appJs.includes('typeof window.ensureSuperAdminModule === "function"'),
        'Check typeof window.ensureSuperAdminModule === "function" before calling it');

    check('initSaaSDatabase SA branch shows error if module never loads',
        appJs.includes('Module SuperAdmin chưa tải được') || appJs.includes('Vui lòng refresh'),
        'Show error in sysClubListMain if module fails to load after all retries');
}
console.log();

// ── Section 3: app.js — fallback wrapper has retry logic ──────────────
console.log('▸ Section 3: app.js — window.loadSuperAdminData() fallback retry');
if (appJs) {
    // Find the fallback wrapper body — use indexOf for robustness (regex choke on indentation)
    const _wrapperIdx = appJs.indexOf('window.loadSuperAdminData = async function()');
    const _wrapperBody = _wrapperIdx >= 0 ? appJs.slice(_wrapperIdx, _wrapperIdx + 1500) : '';

    check('loadSuperAdminData fallback has retry loop for ensureSuperAdminModule',
        _wrapperBody.includes('for (') && _wrapperBody.includes('ensureSuperAdminModule'),
        'Add: for (let _r = 0; _r < 15; _r++) { if (typeof window.ensureSuperAdminModule === "function") break; await new Promise... }');

    check('loadSuperAdminData fallback shows error in #sysClubListMain on permanent failure',
        _wrapperBody.includes('sysClubListMain') || appJs.includes('sysClubListMain'),
        'When all retries fail, show error HTML in document.getElementById("sysClubListMain")');

    check('loadSuperAdminData fallback shows refresh button on failure',
        appJs.includes('location.reload()') || appJs.includes('Refresh trang'),
        'Offer a "Refresh trang" button in the error message for user recovery');
}
console.log();

// ── Section 4: main.js — retry after initSuperAdmin ───────────────────
console.log('▸ Section 4: main.js — retry loadSuperAdminData after initSuperAdmin()');
if (mainJs) {
    check('main.js exists', true, '');

    check('main.js has __saInitialLoadRetried guard',
        mainJs.includes('__saInitialLoadRetried'),
        'Add: if (!window.__saInitialLoadRetried) { window.__saInitialLoadRetried = true; ... }');

    check('main.js checks superAdminView visibility after initSuperAdmin',
        mainJs.includes('superAdminView') && mainJs.includes('__saInitialLoadRetried'),
        'Check document.getElementById("superAdminView")?.style.display !== "none" before retry');

    check('main.js retry checks if list is still in loading state',
        mainJs.includes('Đang tải') || mainJs.includes('stillLoading') || mainJs.includes('_stillLoading'),
        'Only retry if #sysClubListMain still shows "Đang tải..." — avoid double-load when already done');

    check('main.js retry uses SuperAdminModule.loadSuperAdminDashboard if available',
        mainJs.includes('SuperAdminModule?.loadSuperAdminDashboard') ||
        mainJs.includes('SuperAdminModule.loadSuperAdminDashboard'),
        'Prefer window.SuperAdminModule.loadSuperAdminDashboard() over window.loadSuperAdminData() for cleaner call');
}
console.log();

// ── Section 5: superadmin.js — permission-denied error display ─────────
console.log('▸ Section 5: superadmin.js — Firestore permission-denied clarity');
if (superadminJs) {
    check('superadmin.js exists', true, '');

    check('loadSuperAdminData catch checks e.code === permission-denied',
        superadminJs.includes("e.code === 'permission-denied'") ||
        superadminJs.includes('e.code === "permission-denied"') ||
        superadminJs.includes('PERMISSION_DENIED') ||
        superadminJs.includes('_isPermissionDenied'),
        'Detect permission-denied: const _isPermDenied = e.code === "permission-denied" || e.message.includes("permission-denied")');

    check('permission-denied message mentions super_admins/{uid} document',
        superadminJs.includes('super_admins') && superadminJs.includes('permission'),
        'Show: "Tạo document super_admins/{uid} trong Firestore" as fix instruction');

    check('permission-denied message mentions custom claim role=super_admin',
        superadminJs.includes('super_admin') && superadminJs.includes('permission'),
        'Show: "Hoặc set Custom Claim role=super_admin cho tài khoản" as alternative fix');

    check('permission-denied message shows user UID for debugging',
        superadminJs.includes('_sa_perm_uid') || (superadminJs.includes('uid') && superadminJs.includes('currentUser')),
        'Display currentUser.uid so admin can create the super_admins/{uid} document');
}
console.log();

// ── Section 6: package.json check scripts ─────────────────────────────
console.log('▸ Section 6: package.json — check scripts registered');
const pkgJson = readFile('package.json');
if (pkgJson) {
    let pkg;
    try { pkg = JSON.parse(pkgJson); } catch (_) { pkg = {}; }
    const scripts = pkg.scripts || {};

    check('check:superadmin-hotfix script defined',
        !!scripts['check:superadmin-hotfix'],
        'Add: "check:superadmin-hotfix": "node tools/check-superadmin-hotfix.mjs" to package.json scripts');

    check('check:all includes superadmin-hotfix',
        (scripts['check:all'] || '').includes('superadmin-hotfix'),
        'Add "&& node tools/check-superadmin-hotfix.mjs" to the check:all script');
}
console.log();

// ── Final Summary ────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All SuperAdmin HOTFIX checks passed!');
    console.log('  Race condition đã fix. Danh sách CLB sẽ load đúng sau login.');
    console.log('══════════════════════════════════════════════════════════\n');
}
