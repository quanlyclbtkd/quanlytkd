/**
 * tools/check-syntax.mjs — Phase 4.0B-3 Syntax Checker
 * ─────────────────────────────────────────────────────────────
 * Duyệt toàn bộ file .js trong project + inline <script> trong
 * index.html và kiểm tra syntax bằng `node --check`.
 *
 * Dùng:
 *   node tools/check-syntax.mjs
 *   node tools/check-syntax.mjs --verbose
 *
 * Exit code:
 *   0 — tất cả OK
 *   1 — có lỗi syntax
 */

import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const VERBOSE = process.argv.includes('--verbose');
const TMP    = tmpdir();

const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
]);

const SKIP_FIRST_SEGS = new Set([
    'functions',
    '.git',
]);

// ── 1. Collect all .js files recursively ────────────────────────
function collectJsFiles(dir, result = []) {
    let entries;
    try { entries = readdirSync(dir); } catch { return result; }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const fullPath = join(dir, entry);
        const rel      = relative(ROOT, fullPath);
        const firstSeg = rel.split('/')[0];
        if (SKIP_FIRST_SEGS.has(firstSeg)) continue;
        try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                collectJsFiles(fullPath, result);
            } else if (extname(entry) === '.js') {
                result.push(fullPath);
            }
        } catch { /* skip unreadable */ }
    }
    return result;
}

// ── 2. Check a JS file via `node --check <file>` ────────────────
function checkFile(filePath) {
    const res = spawnSync(process.execPath, ['--check', filePath], {
        encoding: 'utf8',
        timeout: 10_000,
    });
    if (res.status !== 0) {
        const msg = (res.stderr || res.stdout || '').trim();
        return { ok: false, error: msg };
    }
    return { ok: true };
}

// ── 3. Check inline code via temp file ──────────────────────────
let _tmpIdx = 0;
function checkInlineCode(code, isModule) {
    const ext  = '.js';
    const name = `_syntax_check_${process.pid}_${++_tmpIdx}${ext}`;
    const path = join(TMP, name);
    // For module mode: keep as-is. For script mode: wrap to allow top-level return-like patterns.
    const src  = isModule ? code : `(function(){\n${code}\n})();`;
    try {
        writeFileSync(path, src, 'utf8');
        // For module code we'd need --input-type but --check on a .js file uses script mode.
        // Workaround: for module syntax, detect "import"/"export" and use node's ESM loader
        // via a wrapper, but that's complex. For now: use script check for both — catches
        // the most common SyntaxErrors (unclosed braces, unexpected tokens, etc.)
        const res = spawnSync(process.execPath, ['--check', path], {
            encoding: 'utf8',
            timeout: 10_000,
        });
        if (res.status !== 0) {
            const raw = (res.stderr || res.stdout || '').trim();
            // Strip temp file path from error message for clarity
            const msg = raw.replace(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<inline>');
            return { ok: false, error: msg };
        }
        return { ok: true };
    } finally {
        try { unlinkSync(path); } catch { /* ignore cleanup errors */ }
    }
}

// ── 4. Extract inline scripts from index.html ───────────────────
function extractInlineScripts(htmlPath) {
    let html;
    try { html = readFileSync(htmlPath, 'utf8'); } catch { return []; }
    const results = [];
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    let idx = 0;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1] || '';
        const code  = m[2] || '';
        if (/\bsrc\s*=/.test(attrs)) continue;   // skip external scripts
        if (!code.trim()) continue;                // skip empty
        const isModule = /type\s*=\s*["']module["']/.test(attrs);
        idx++;
        results.push({
            label: `index.html <script#${idx}${isModule ? ' type=module' : ''}>`,
            code,
            isModule,
        });
    }
    return results;
}

// ── 5. Main ─────────────────────────────────────────────────────
let errors  = 0;
let checked = 0;

console.log('[SyntaxCheck] Scanning project JS files and index.html inline scripts...');
if (VERBOSE) console.log('[SyntaxCheck] Root:', ROOT);
console.log('');

// Check all .js files
const jsFiles = collectJsFiles(ROOT);
for (const filePath of jsFiles) {
    const rel    = relative(ROOT, filePath);
    const result = checkFile(filePath);
    checked++;
    if (!result.ok) {
        errors++;
        console.error(`❌ SYNTAX ERROR — ${rel}`);
        console.error(`   ${result.error}`);
    } else if (VERBOSE) {
        console.log(`   ✅ ${rel}`);
    }
}

// Check inline scripts in index.html
const htmlPath = join(ROOT, 'index.html');
const inlineScripts = extractInlineScripts(htmlPath);
for (const { label, code, isModule } of inlineScripts) {
    const result = checkInlineCode(code, isModule);
    checked++;
    if (!result.ok) {
        errors++;
        console.error(`❌ SYNTAX ERROR — ${label}`);
        console.error(`   ${result.error}`);
    } else if (VERBOSE) {
        console.log(`   ✅ ${label}`);
    }
}

console.log('');
console.log(`[SyntaxCheck] Checked: ${checked} items`);
console.log(`              JS files: ${jsFiles.length}`);
console.log(`              Inline scripts in index.html: ${inlineScripts.length}`);
console.log('');

if (errors > 0) {
    console.error(`[SyntaxCheck] ❌ FAILED — ${errors} syntax error(s) found.`);
    process.exit(1);
} else {
    console.log('[SyntaxCheck] OK — JS files and inline scripts are valid.');
    process.exit(0);
}
