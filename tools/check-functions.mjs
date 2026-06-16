/**
 * tools/check-functions.mjs — Phase 4.0B-4A Cloud Functions Checker
 * ───────────────────────────────────────────────────────────────────
 * Kiểm tra Cloud Functions source: file tồn tại và syntax hợp lệ.
 * Không deploy. Không cần functions/node_modules khi check syntax.
 *
 * Dùng:
 *   node tools/check-functions.mjs
 *
 * Exit code:
 *   0 — tất cả OK (hoặc chỉ warning)
 *   1 — có lỗi nghiêm trọng
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

let errors   = 0;
let warnings = 0;

function pass(msg)  { console.log(`[FunctionsCheck] PASS  ${msg}`); }
function fail(msg)  { console.error(`[FunctionsCheck] FAIL  ${msg}`); errors++; }
function warn(msg)  { console.warn(`[FunctionsCheck] WARN  ${msg}`); warnings++; }

console.log('[FunctionsCheck] Kiểm tra Cloud Functions source...');
console.log('');

// ── 1. Kiểm tra file tồn tại ────────────────────────────────────
const REQUIRED_FILES = [
    'functions/package.json',
    'functions/index.js',
    'functions/src/debtCalculation.js',
    'functions/src/statsAggregation.js',
    'functions/src/superAdminSummary.js',
    'functions/src/accountProvisioning.js',
];

const OPTIONAL_FILES = [
    'functions/src/helpers.js',
];

for (const rel of REQUIRED_FILES) {
    const fullPath = join(ROOT, rel);
    if (existsSync(fullPath)) {
        pass(`${rel} tồn tại`);
    } else {
        fail(`${rel}  ← FILE MISSING`);
    }
}

for (const rel of OPTIONAL_FILES) {
    const fullPath = join(ROOT, rel);
    if (existsSync(fullPath)) {
        pass(`${rel} tồn tại (optional)`);
    } else {
        warn(`${rel}  ← optional, không tìm thấy`);
    }
}

// ── 2. Kiểm tra syntax của các file JS ──────────────────────────
console.log('');
console.log('[FunctionsCheck] Kiểm tra syntax...');

const SYNTAX_FILES = [
    'functions/index.js',
    'functions/src/debtCalculation.js',
    'functions/src/statsAggregation.js',
    'functions/src/superAdminSummary.js',
    'functions/src/accountProvisioning.js',
];

for (const rel of SYNTAX_FILES) {
    const fullPath = join(ROOT, rel);
    if (!existsSync(fullPath)) continue; // đã báo fail ở trên

    const res = spawnSync(process.execPath, ['--check', fullPath], {
        encoding: 'utf-8',
        timeout:  10_000,
    });

    if (res.status === 0) {
        pass(`syntax OK — ${rel}`);
    } else {
        const msg = (res.stderr || res.stdout || '').trim();
        fail(`SYNTAX ERROR — ${rel}\n         ${msg}`);
    }
}

// ── 3. Kiểm tra functions/node_modules ──────────────────────────
console.log('');
console.log('[FunctionsCheck] Kiểm tra node_modules...');

const nodeModulesPath = join(ROOT, 'functions', 'node_modules');
if (!existsSync(nodeModulesPath)) {
    warn('functions/node_modules missing — chạy "cd functions && npm install" trước khi deploy functions.');
} else {
    pass('functions/node_modules tồn tại');
}

// ── 4. Kiểm tra functions/package.json có "main" field ──────────
if (existsSync(join(ROOT, 'functions', 'package.json'))) {
    try {
        const { readFileSync } = await import('fs');
        const pkg = JSON.parse(readFileSync(join(ROOT, 'functions', 'package.json'), 'utf-8'));
        if (pkg.main) {
            pass(`functions package.json "main": "${pkg.main}"`);
        } else {
            warn('functions/package.json không có "main" field — Firebase Functions mặc định dùng index.js');
        }
        if (pkg.engines && pkg.engines.node) {
            pass(`functions Node.js target: ${pkg.engines.node}`);
        }
    } catch (e) {
        warn(`Không parse được functions/package.json: ${e.message}`);
    }
}

// ── 5. Nhắc nhở deploy an toàn ──────────────────────────────────
console.log('');
console.log('[FunctionsCheck] NOTE: Tool này KHÔNG deploy. Để deploy functions, chạy:');
console.log('                       firebase deploy --only functions');
console.log('                       (sau khi đã cd functions && npm install)');

// ── 6. Tổng kết ─────────────────────────────────────────────────
console.log('');
if (errors > 0) {
    console.error(`[FunctionsCheck] ❌ FAILED — ${errors} lỗi, ${warnings} cảnh báo.`);
    process.exit(1);
} else {
    if (warnings > 0) {
        console.log(`[FunctionsCheck] ✅ OK — Functions source hợp lệ (${warnings} cảnh báo nhỏ).`);
    } else {
        console.log('[FunctionsCheck] ✅ OK — Functions source hoàn toàn hợp lệ.');
    }
    process.exit(0);
}
