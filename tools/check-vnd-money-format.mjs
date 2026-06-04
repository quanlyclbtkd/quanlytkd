#!/usr/bin/env node
/**
 * check-vnd-money-format.mjs
 * Phase 4K-5D: Verify VND money format helpers exist and are wired correctly
 */
import { readFileSync } from 'fs';

let failures = 0;
function fail(msg) { console.error('  FAIL:', msg); failures++; }
function pass(msg) { console.log('  PASS:', msg); }

function findFunctionDef(src, funcExpr) {
    const idx = src.indexOf(funcExpr + ' = function');
    if (idx !== -1) return idx;
    const idx2 = src.indexOf(funcExpr + ' = async function');
    if (idx2 !== -1) return idx2;
    return src.indexOf(funcExpr);
}

const mainJs = readFileSync('js/main.js', 'utf8');

console.log('\n=== check-vnd-money-format ===\n');

// 1. parseVNDNumber must be defined
if (!mainJs.includes('window.parseVNDNumber = function')) {
    fail('window.parseVNDNumber function not defined in main.js');
} else {
    pass('window.parseVNDNumber defined');
}

// 2. formatVNDNumber must be defined
if (!mainJs.includes('window.formatVNDNumber = function')) {
    fail('window.formatVNDNumber function not defined in main.js');
} else {
    pass('window.formatVNDNumber defined');
}

// 3. formatVNDText must be defined
if (!mainJs.includes('window.formatVNDText = function')) {
    fail('window.formatVNDText function not defined in main.js');
} else {
    pass('window.formatVNDText defined');
}

// 4. refreshExamFeeUI must not set bare String(fee) for examFeeInput
const ruIdx = findFunctionDef(mainJs, 'window.refreshExamFeeUI');
if (ruIdx !== -1) {
    const ruBlock = mainJs.slice(ruIdx, ruIdx + 1200);
    // Check it does not use String(fee) directly for examFeeInput assignment
    if (ruBlock.includes('examFeeInput.value = String(fee)')) {
        fail('refreshExamFeeUI still sets examFeeInput.value = String(fee) without VND format');
    } else {
        pass('refreshExamFeeUI does not use bare String(fee) for examFeeInput');
    }
    // Must use formatVNDNumber or toLocaleString
    if (!ruBlock.includes('formatVNDNumber') && !ruBlock.includes("toLocaleString('vi-VN')")) {
        fail('refreshExamFeeUI does not format examFeeInput with formatVNDNumber or toLocaleString');
    } else {
        pass('refreshExamFeeUI formats examFeeInput with VND format');
    }
} else {
    fail('refreshExamFeeUI function definition not found in main.js');
}

// 5. VND input event formatter guard for examFeeInput
if (!mainJs.includes('__vndFormatterBound') && !mainJs.includes('vndFormatterBound')) {
    fail('VND input event formatter for examFeeInput not found (missing __vndFormatterBound guard)');
} else {
    pass('VND input event formatter for examFeeInput exists');
}

// 6. formatVNDText used in save/collect display
if (!mainJs.includes('formatVNDText(fee)') && !mainJs.includes('formatVNDText(currentFee)') && !mainJs.includes('formatVNDText(_getClubExamFee)')) {
    fail('formatVNDText not used in save confirmation / display');
} else {
    pass('formatVNDText used for display in save/collect flow');
}

console.log('');
if (failures === 0) {
    console.log('ALL CHECKS PASSED — VND money format is correct');
    process.exit(0);
} else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
}
