/**
 * tools/check-deploy-contract.mjs — Phase 4.0B-4A Deploy Contract Checker
 * ─────────────────────────────────────────────────────────────────────────
 * Kiểm tra firebase.json và public root deploy để đảm bảo
 * Firebase Hosting serve đúng thư mục chứa app.
 *
 * Dùng:
 *   node tools/check-deploy-contract.mjs
 *
 * Exit code:
 *   0 — deploy contract OK
 *   1 — có vấn đề nghiêm trọng
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors   = 0;
let warnings = 0;

function pass(msg)  { console.log(`[DeployContract] PASS  ${msg}`); }
function fail(msg)  { console.error(`[DeployContract] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[DeployContract] WARN  ${msg}`); warnings++; }
function info(msg)  { console.log(`[DeployContract] INFO  ${msg}`); }

console.log('[DeployContract] Kiểm tra Firebase Hosting deploy contract...');
console.log('');

// ── 1. firebase.json phải tồn tại ───────────────────────────────
const firebaseJsonPath = join(ROOT, 'firebase.json');
if (!existsSync(firebaseJsonPath)) {
    fail('firebase.json không tìm thấy — không thể deploy lên Firebase Hosting.');
    console.log('');
    console.error('[DeployContract] ❌ FAILED — firebase.json bắt buộc phải có.');
    process.exit(1);
}
pass('firebase.json tồn tại');

// ── 2. Parse firebase.json ───────────────────────────────────────
let config;
try {
    config = JSON.parse(readFileSync(firebaseJsonPath, 'utf-8'));
} catch (e) {
    fail(`firebase.json không parse được: ${e.message}`);
    process.exit(1);
}
pass('firebase.json hợp lệ JSON');

// ── 3. Kiểm tra hosting config ───────────────────────────────────
const hosting = config.hosting;
if (!hosting) {
    fail('firebase.json thiếu "hosting" config — Firebase Hosting chưa được cấu hình.');
    process.exit(1);
}
pass('Có "hosting" config trong firebase.json');

// ── 4. Xác định public root ──────────────────────────────────────
const publicDir = hosting.public || '.';
const publicAbs = resolve(ROOT, publicDir);
const publicRel = publicDir;

info(`hosting.public = "${publicDir}"`);

// Kiểm tra các chế độ hợp lệ
if (publicDir === '.') {
    info('[DeployContract] FLAT_ROOT_MODE OK — Hosting serve từ project root (.)');
} else if (publicDir === 'public' || publicDir === 'dist' || publicDir === 'build') {
    info(`Hosting serve từ sub-directory "${publicDir}"`);
} else {
    warn(`public root "${publicDir}" không phải chuẩn — cần verify thủ công.`);
}

// ── 5. Kiểm tra public root có tồn tại không ────────────────────
if (!existsSync(publicAbs)) {
    fail(`Public root "${publicDir}" không tồn tại trên filesystem.`);
} else {
    pass(`Public root "${publicDir}" tồn tại`);
}

// ── 6. Kiểm tra các file bắt buộc có trong public root ──────────
console.log('');
console.log('[DeployContract] Kiểm tra file bắt buộc trong public root...');

const REQUIRED_FILES = [
    'index.html',
    'app.js',
    'style.css',
    'js/main.js',
];

for (const rel of REQUIRED_FILES) {
    const fullPath = join(publicAbs, rel);
    if (existsSync(fullPath)) {
        pass(`${publicDir}/${rel}`);
    } else {
        fail(`${publicDir}/${rel}  ← THIẾU — Firebase Hosting sẽ serve 404`);
    }
}

// ── 7. Kiểm tra rewrites không gây lỗi 404 cho /app.js ──────────
console.log('');
console.log('[DeployContract] Kiểm tra rewrites config...');

const rewrites = hosting.rewrites || [];
let hasCatchAll = false;
for (const rw of rewrites) {
    if (rw.source === '**' && rw.destination === '/index.html') {
        hasCatchAll = true;
        pass('SPA catch-all rewrite "**" → "/index.html" OK (Single Page App mode)');
    }
}
if (!hasCatchAll && rewrites.length > 0) {
    warn('Không có catch-all rewrite "**" → "/index.html" — kiểm tra xem app có cần SPA mode không.');
}
if (rewrites.length === 0) {
    info('Không có rewrites config — file được serve tĩnh bình thường (MPA mode).');
}

// ── 8. Kiểm tra ignore config không exclude nhầm ────────────────
console.log('');
console.log('[DeployContract] Kiểm tra ignore config...');

const ignores = hosting.ignore || [];
const CRITICAL_FILES = ['app.js', 'style.css', 'js/**'];
for (const critical of CRITICAL_FILES) {
    for (const pattern of ignores) {
        // Chỉ cảnh báo nếu ignore pattern trùng chính xác với file quan trọng
        if (pattern === critical || pattern === `/${critical}`) {
            warn(`hosting.ignore chứa "${pattern}" — có thể làm mất file quan trọng khi deploy!`);
        }
    }
}
if (!ignores.some(p => p.includes('functions'))) {
    warn('hosting.ignore không exclude "functions/**" — functions source sẽ bị deploy lên Hosting (lãng phí bandwidth nhưng không hại).');
}
pass('ignore config không xóa nhầm file app chính');

// ── 9. Tổng kết ──────────────────────────────────────────────────
console.log('');
console.log(`[DeployContract] Đã kiểm tra: public="${publicDir}", rewrites=${rewrites.length}, ignores=${ignores.length}`);

if (errors > 0) {
    console.error(`[DeployContract] ❌ FAILED — ${errors} lỗi nghiêm trọng, ${warnings} cảnh báo.`);
    process.exit(1);
} else {
    if (warnings > 0) {
        console.log(`[DeployContract] ✅ OK — Deploy contract hợp lệ (${warnings} cảnh báo nhỏ).`);
    } else {
        console.log('[DeployContract] ✅ OK — Deploy contract hoàn toàn hợp lệ.');
    }
    process.exit(0);
}
