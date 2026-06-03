/**
 * tools/check-reports-module-syntax.mjs — Phase 4K-4E
 * ─────────────────────────────────────────────────────────────────────
 * Kiểm tra js/modules/reports.js không bị lỗi syntax vì function
 * nằm trong import block.
 *
 * Fail nếu:
 *  1. function _classifyInvTxForReport nằm giữa "import {" và "} from"
 *  2. node --check js/modules/reports.js fail
 *  3. reports.js không export được initReports
 *  4. reports.js không còn _classifyInvTxForReport
 *
 * Chạy: node tools/check-reports-module-syntax.mjs
 * Hoặc: npm run check:reports-module-syntax
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
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
console.log('  Phase 4K-4E — reports.js Module Syntax Safety Check');
console.log('══════════════════════════════════════════════════════════\n');

const reportsJs = readFile('js/modules/reports.js');

console.log('▸ Section 1: reports.js file check');
check('js/modules/reports.js exists', !!reportsJs, 'File not found');

if (reportsJs) {
    // Check: function NOT inside import block
    // Find all "import {" ... "} from" blocks and verify no function declarations inside
    const importBlockRe = /import\s*\{([^}]*)\}\s*from/gs;
    let hasInsideImport = false;
    let match;
    while ((match = importBlockRe.exec(reportsJs)) !== null) {
        const blockContent = match[1];
        if (/function\s+\w+/.test(blockContent) || /^\s*function/m.test(blockContent)) {
            hasInsideImport = true;
            break;
        }
    }
    check('No function declaration inside import {} block',
        !hasInsideImport,
        'Move _classifyInvTxForReport (or any function) OUT of the import { } block to after it');

    // Check: _classifyInvTxForReport still exists
    check('_classifyInvTxForReport helper is present',
        reportsJs.includes('_classifyInvTxForReport'),
        'Helper _classifyInvTxForReport must not be deleted — only moved outside import block');

    // Check: initReports exported
    check('initReports is exported',
        reportsJs.includes('export') && reportsJs.includes('initReports'),
        'reports.js must export initReports function');

    // Check: import comes before function declarations
    const importIdx   = reportsJs.indexOf('import {');
    const functionIdx = reportsJs.indexOf('function _classifyInvTxForReport');
    if (importIdx >= 0 && functionIdx >= 0) {
        // Find last "} from" before functionIdx
        const fromBeforeFunc = reportsJs.lastIndexOf('} from', functionIdx);
        check('import block ends before _classifyInvTxForReport',
            fromBeforeFunc >= importIdx && fromBeforeFunc < functionIdx,
            'The function must appear AFTER the closing } from "..." of the import block');
    }

    // Check: getLocalToday import is inside import block (not missing)
    check('getLocalToday imported correctly',
        reportsJs.includes('getLocalToday') && reportsJs.includes("from '../utils/format.js'"),
        "getLocalToday must be imported from '../utils/format.js'");
}
console.log();

// Section 2: node --check syntax verification
console.log('▸ Section 2: node --check syntax verification');
let syntaxOk = false;
let syntaxError = '';
try {
    execSync('node --check ' + resolve(root, 'js/modules/reports.js'), {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    syntaxOk = true;
} catch (e) {
    syntaxError = (e.stderr || e.stdout || e.message || '').slice(0, 300);
}
check('node --check js/modules/reports.js passes',
    syntaxOk,
    syntaxError ? 'Syntax error: ' + syntaxError : 'Run: node --check js/modules/reports.js');
console.log();

// Section 3: finance.js companion check
console.log('▸ Section 3: finance.js companion (no regression)');
const financeJs = readFile('js/modules/finance.js');
if (financeJs) {
    let finSyntaxOk = false;
    try {
        execSync('node --check ' + resolve(root, 'js/modules/finance.js'), {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        });
        finSyntaxOk = true;
    } catch (_) {}
    check('node --check js/modules/finance.js passes (no regression)',
        finSyntaxOk,
        'finance.js syntax broken — check _classifyInvTxForFinance insertion');
}
console.log();

// Final Summary
console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);
if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All reports.js module syntax checks passed!');
    console.log('  Không còn lỗi "Unexpected reserved word" khi import reports.js.');
    console.log('══════════════════════════════════════════════════════════\n');
}
