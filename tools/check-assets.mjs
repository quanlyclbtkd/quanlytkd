/**
 * tools/check-assets.mjs — Phase 4.0B-4A Asset Path Checker
 * ──────────────────────────────────────────────────────────
 * Kiểm tra tất cả file static và import references cần thiết
 * để app hoạt động đúng khi deploy lên Firebase Hosting.
 *
 * Dùng:
 *   node tools/check-assets.mjs
 *
 * Exit code:
 *   0 — tất cả asset tồn tại
 *   1 — thiếu file bắt buộc
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors  = 0;
let checked = 0;

function check(rel, required = true) {
    checked++;
    const fullPath = join(ROOT, rel);
    const exists   = existsSync(fullPath);
    if (exists) {
        console.log(`[AssetCheck] PASS  ${rel}`);
    } else if (required) {
        console.error(`[AssetCheck] FAIL  ${rel}  ← FILE MISSING`);
        errors++;
    } else {
        console.warn(`[AssetCheck] WARN  ${rel}  ← optional, not found`);
    }
    return exists;
}

console.log('[AssetCheck] Kiểm tra static assets và module imports...');
console.log('');

// ── 1. Root HTML / CSS ──────────────────────────────────────────
check('index.html');
check('style.css');

// ── 2. Core JS entry points ─────────────────────────────────────
check('app.js');
check('js/main.js');

// ── 3. Các module chính bắt buộc ────────────────────────────────
const REQUIRED_MODULES = [
    'js/modules/superadmin.js',
    'js/modules/reports.js',
    'js/modules/students.js',
    'js/modules/finance.js',
    'js/modules/inventory.js',
    'js/modules/attendance.js',
    'js/modules/dashboard.js',
];

for (const mod of REQUIRED_MODULES) {
    check(mod);
}

// ── 4. Phân tích import statements trong js/main.js ─────────────
console.log('');
console.log('[AssetCheck] Phân tích import trong js/main.js...');
console.log('');

const mainJsPath = join(ROOT, 'js', 'main.js');
let importErrors = 0;

if (existsSync(mainJsPath)) {
    const src = readFileSync(mainJsPath, 'utf-8');
    // Lấy tất cả import ... from '...' hoặc import('...')
    const RE_STATIC  = /^\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    const RE_DYNAMIC = /\bimport\(['"]([^'"]+)['"]\)/g;

    const refs = new Set();
    let m;
    while ((m = RE_STATIC.exec(src))  !== null) refs.add(m[1]);
    while ((m = RE_DYNAMIC.exec(src)) !== null) refs.add(m[1]);

    for (const ref of refs) {
        // Bỏ qua URL tuyệt đối (CDN, https://)
        if (ref.startsWith('http://') || ref.startsWith('https://')) continue;
        // Bỏ qua bare specifier (không có ./ hoặc ../)
        if (!ref.startsWith('./') && !ref.startsWith('../')) continue;

        // Resolve từ thư mục js/
        const jsDir   = join(ROOT, 'js');
        const absPath = resolve(jsDir, ref);
        const relPath = absPath.slice(ROOT.length + 1);

        checked++;
        if (existsSync(absPath)) {
            console.log(`[AssetCheck] PASS  ${relPath}  (import in main.js)`);
        } else {
            console.error(`[AssetCheck] FAIL  ${relPath}  ← IMPORT NOT FOUND`);
            importErrors++;
            errors++;
        }
    }
} else {
    console.error('[AssetCheck] FAIL  js/main.js  ← không thể phân tích imports');
}

// ── 5. Kết quả ──────────────────────────────────────────────────
console.log('');
console.log(`[AssetCheck] Đã kiểm tra: ${checked} items`);

if (errors > 0) {
    console.error(`[AssetCheck] ❌ FAILED — ${errors} file(s) bị thiếu.`);
    process.exit(1);
} else {
    console.log('[AssetCheck] ✅ OK — Tất cả assets và imports đều tồn tại.');
    process.exit(0);
}
