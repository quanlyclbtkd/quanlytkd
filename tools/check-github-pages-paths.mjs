/**
 * tools/check-github-pages-paths.mjs — GitHub Pages Module Path Check
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra source không có absolute /js/ paths bị broken trên GitHub Pages
 * project sites (https://user.github.io/repo-name/).
 *
 * Vấn đề:
 *   - GitHub Pages project site: https://user.github.io/repo-name/
 *   - Absolute path /js/main.js → https://user.github.io/js/main.js  (WRONG ❌)
 *   - Relative path ./js/main.js → https://user.github.io/repo-name/js/main.js (OK ✅)
 *
 * Phát hiện:
 *   1. src="/js/main.js" hoặc src="/js/..." trong index.html runtime code
 *   2. import('/js/...') hoặc import("/js/...") trong runtime JS
 *   3. Thiếu file js/main.js hoặc js/modules/superadmin.js
 *   4. index.html không load main.js với relative path
 *   5. Thiếu .nojekyll (GitHub Pages Jekyll có thể bỏ qua _prefix files)
 *
 * Chạy: node tools/check-github-pages-paths.mjs
 * Hoặc: npm run check:github-pages-paths
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
    try { return readFileSync(resolve(root, relPath), 'utf8'); }
    catch (_) { return null; }
}

function fileExists(relPath) {
    return existsSync(resolve(root, relPath));
}

function walkJs(dir) {
    const files = [];
    try {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            try {
                const st = statSync(full);
                if (st.isDirectory() && entry !== 'node_modules' && entry !== '.git') {
                    files.push(...walkJs(full));
                } else if (st.isFile() && (entry.endsWith('.js') || entry.endsWith('.mjs'))) {
                    files.push(full);
                }
            } catch (_) {}
        }
    } catch (_) {}
    return files;
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

function warn(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.warn('  ⚠️  ' + label + (hint ? ' — ' + hint : ''));
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  GitHub Pages Module Path Check');
console.log('══════════════════════════════════════════════════════════\n');

// ── Section 1: Required files exist ──────────────────────────────────
console.log('▸ Section 1: Required JS files exist');

check('js/main.js exists',
    fileExists('js/main.js'),
    'CRITICAL: js/main.js missing — SuperAdmin and all ES modules will not load. Check ZIP/upload includes js/ directory.');

check('js/modules/superadmin.js exists',
    fileExists('js/modules/superadmin.js'),
    'js/modules/superadmin.js missing — SuperAdmin dashboard will not work');

check('js/modules/dashboard.js exists',
    fileExists('js/modules/dashboard.js'),
    'js/modules/dashboard.js missing');

check('js/modules/students.js exists',
    fileExists('js/modules/students.js'),
    'js/modules/students.js missing');

check('index.html exists',
    fileExists('index.html'),
    'index.html missing — app cannot be served');

warn('.nojekyll exists (prevents Jekyll from processing files with _ prefix)',
    fileExists('.nojekyll'),
    'Create empty .nojekyll file in repo root to prevent GitHub Pages Jekyll processing');
console.log();

// ── Section 2: index.html path safety ────────────────────────────────
console.log('▸ Section 2: index.html — module path safety');
const indexHtml = readFile('index.html');
if (indexHtml) {
    // Strip single-line JS comments to avoid false positives
    const indexStripped = indexHtml.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Must NOT have absolute /js/ paths in src= attributes
    const _hasAbsSrc = /src\s*=\s*["']\s*\/js\//.test(indexStripped);
    check('index.html has no absolute src="/js/..." script tags',
        !_hasAbsSrc,
        'Replace src="/js/main.js" with src="./js/main.js" — absolute paths break GitHub Pages project sites');

    // Must NOT have dynamic imports with absolute /js/ path
    const _hasAbsImport = /import\s*\(\s*["']\s*\/js\//.test(indexStripped);
    check('index.html has no absolute import("/js/...") calls',
        !_hasAbsImport,
        'Replace import("/js/...") with import("./js/...") in any inline scripts');

    // Should load main.js with relative path (including versioned query string like ?v=...)
    const _hasRelMainJs = /s\.src\s*=\s*["']\.\/js\/main\.js(\?[^"']*)?["']/.test(indexStripped) ||
        /s\.src\s*=\s*["']js\/main\.js(\?[^"']*)?["']/.test(indexStripped) ||
        /src\s*=\s*["']\.\/js\/main\.js(\?[^"']*)?["']/.test(indexStripped) ||
        /src\s*=\s*["']js\/main\.js(\?[^"']*)?["']/.test(indexStripped);
    check('index.html loads main.js with relative path (./js/main.js or js/main.js)',
        _hasRelMainJs,
        'Use s.src = "./js/main.js" in the dynamic script injection block');

    // Should NOT use type="module" with absolute /js/ src
    const _hasAbsModuleSrc = /<script[^>]+type=["']module["'][^>]+src=["']\/js\//.test(indexStripped);
    check('No <script type="module" src="/js/..."> with absolute path',
        !_hasAbsModuleSrc,
        'Replace with <script type="module" src="./js/main.js"> or use dynamic injection');

    // Has onerror handler for main.js
    check('main.js dynamic injection has onerror handler',
        indexHtml.includes('s.onerror') || indexHtml.includes('onerror'),
        'Add s.onerror handler to show helpful error when main.js fails to load on GitHub Pages');

    // Has file:// guard
    check('index.html has file:// guard (prevents ES module load on file:// protocol)',
        indexHtml.includes("location.protocol === 'file:'") || indexHtml.includes('file://'),
        'Keep the file:// guard: if (window.location.protocol === "file:") { ... }');
}
console.log();

// ── Section 3: Runtime JS files — no absolute /js/ paths ─────────────
console.log('▸ Section 3: Runtime JS — no absolute /js/ paths in imports');
const jsRoot = resolve(root, 'js');
const allJsFiles = walkJs(jsRoot);
let absolutePathIssues = [];

for (const file of allJsFiles) {
    const content = readFile(file.replace(root + '/', '').replace(root + '\\', ''));
    if (!content) continue;
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        // Check for absolute /js/ paths in import statements
        if (/import\s*\(\s*["']\/js\//.test(line) || /from\s+["']\/js\//.test(line)) {
            absolutePathIssues.push({ file: file.replace(root, ''), line: idx + 1, text: trimmed.slice(0, 100) });
        }
    });
}

check('No absolute /js/ paths in runtime ES module imports (' + allJsFiles.length + ' files scanned)',
    absolutePathIssues.length === 0,
    absolutePathIssues.length > 0
        ? 'Fix these absolute paths:\n' + absolutePathIssues.map(i => `  ${i.file}:${i.line}: ${i.text}`).join('\n')
        : '');

if (absolutePathIssues.length > 0) {
    absolutePathIssues.forEach(i => {
        console.error('     ' + i.file + ':' + i.line + ' → ' + i.text);
    });
}
console.log();

// ── Section 4: main.js import structure ──────────────────────────────
console.log('▸ Section 4: main.js — imports use relative paths');
const mainJs = readFile('js/main.js');
if (mainJs) {
    check('js/main.js exists (already verified)', true, '');

    // All static imports must use relative ./ paths
    const _hasAbsStaticImport = /^import\s+.*from\s+["']\/js\//m.test(mainJs);
    check('main.js static imports do not use absolute /js/ paths',
        !_hasAbsStaticImport,
        'Use relative paths in main.js: from "./store.js" not from "/js/store.js"');

    // Dynamic imports for superadmin must be relative
    // A cache-bust query does not change the GitHub Pages-relative module path.
    const _hasDynImport = /import\(\s*['"]\.\/modules\/superadmin\.js(?:\?[^'"]*)?['"]\s*\)/.test(mainJs);
    check('main.js dynamic import for superadmin uses relative path (./modules/superadmin.js)',
        _hasDynImport,
        'Use: await import("./modules/superadmin.js") — relative to main.js location in js/');

    // ensureSuperAdminModule must exist
    check('main.js defines window.ensureSuperAdminModule',
        mainJs.includes('window.ensureSuperAdminModule'),
        'window.ensureSuperAdminModule must be defined in main.js for retry logic to work');
}
console.log();

// ── Section 5: app.js absolute path check ────────────────────────────
console.log('▸ Section 5: app.js — no absolute /js/ paths');
const appJs = readFile('app.js');
if (appJs) {
    const appLines = appJs.split('\n');
    const appAbsIssues = [];
    appLines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (/import\s*\(\s*["']\/js\//.test(line) && !line.includes('console.') && !line.includes('//')) {
            appAbsIssues.push({ line: idx + 1, text: trimmed.slice(0, 100) });
        }
    });
    check('app.js has no absolute /js/ dynamic imports',
        appAbsIssues.length === 0,
        appAbsIssues.map(i => `line ${i.line}: ${i.text}`).join(', '));
}
console.log();

// ── Final Summary ────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Fix these issues before deploying to GitHub Pages!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All GitHub Pages path checks passed!');
    console.log('  Source có relative paths đúng — an toàn để deploy lên GitHub Pages.');
    console.log('══════════════════════════════════════════════════════════\n');
}
