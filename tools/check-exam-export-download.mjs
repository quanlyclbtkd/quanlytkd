#!/usr/bin/env node
/**
 * check-exam-export-download.mjs
 * Phase 4K-5G — Kiểm tra exportExamPaidList:
 *   1. Canonical ledger branch không dùng `t.branch`, `t.id`, `curTs` (undefined)
 *   2. Canonical ledger branch dùng `r.branch`, `r.txId`, `r.timestamp` (đúng)
 *   3. try/catch bao quanh paidData build block
 *   4. window.debugExamExportReadiness defined
 *   5. debugRuntimeSmokeTest tham chiếu examExportReadiness
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0, failed = 0, warned = 0;

function check(label, condition, fix, isWarn = false) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else if (isWarn) {
        console.warn(`  ⚠️  ${label}`);
        if (fix) console.warn(`     → ${fix}`);
        warned++;
    } else {
        console.error(`  ❌ ${label}`);
        if (fix) console.error(`     → ${fix}`);
        failed++;
    }
}

function readFile(rel) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf8');
}

const reportsJs = readFile('js/modules/reports.js') || '';
const mainJs    = readFile('js/main.js') || '';

console.log('\n▸ Section 1: reports.js — canonical ledger branch không dùng undefined t/curTs');

// Extract the canonical ledger block (between buildCanonicalExamPaymentLedger call and else block)
const ledgerBlockMatch = reportsJs.match(/buildCanonicalExamPaymentLedger[\s\S]*?(?=\}\s*else\s*\{)/);
const ledgerBlock = ledgerBlockMatch ? ledgerBlockMatch[0] : '';

check('Canonical ledger branch không dùng t.branch (undefined variable)',
    !ledgerBlock.includes('t.branch') || ledgerBlock.includes('r.sourceTx'),
    'Thay `t.branch` bằng `r.branch || (r.sourceTx && r.sourceTx.branch)` trong _ledger.records.forEach');
check('Canonical ledger branch không dùng t.id (undefined variable)',
    !ledgerBlock.includes('t.id ||') || ledgerBlock.includes('r.txId'),
    'Thay `t.id` bằng `r.txId` trong _ledger.records.forEach');
check('Canonical ledger branch không dùng curTs (undefined variable)',
    !ledgerBlock.includes('timestamp: curTs'),
    'Thay `timestamp: curTs` bằng `timestamp: Number(r.timestamp || ...)` trong _ledger.records.forEach');
check('Canonical ledger branch dùng r.branch',
    reportsJs.includes('r.branch') && reportsJs.includes('r.sourceTx'),
    'Thêm `branch: r.branch || (r.sourceTx && r.sourceTx.branch) || profile.branch` vào paidData');
check('Canonical ledger branch dùng r.txId',
    reportsJs.includes('r.txId'),
    'Thêm `txId: r.txId || (r.sourceTx && r.sourceTx.id)` vào paidData');
check('Canonical ledger branch dùng r.timestamp',
    reportsJs.includes('r.timestamp') || reportsJs.includes('Number(r.timestamp'),
    'Thêm `timestamp: Number(r.timestamp || ...)` vào paidData');

console.log('\n▸ Section 2: reports.js — try/catch bao quanh paidData build');
check('try/catch trong exportExamPaidList bao paidData build',
    reportsJs.includes('_paidDataErr') || reportsJs.includes('try {') && reportsJs.includes('paidData'),
    'Wrap khối paidData if/else trong try { ... } catch(_paidDataErr) { ... }');

console.log('\n▸ Section 3: reports.js — debugExamExportReadiness');
check('window.debugExamExportReadiness defined in reports.js',
    reportsJs.includes('window.debugExamExportReadiness'),
    'Thêm window.debugExamExportReadiness vào js/modules/reports.js');

console.log('\n▸ Section 4: main.js — debugRuntimeSmokeTest tham chiếu examExportReadiness');
check('debugRuntimeSmokeTest gọi debugExamExportReadiness',
    mainJs.includes('examExportReadiness') && mainJs.includes('debugExamExportReadiness'),
    'Thêm safeCall cho debugExamExportReadiness vào window.debugRuntimeSmokeTest trong main.js');
check('summary.examExportReadinessOk in summary',
    mainJs.includes('examExportReadinessOk'),
    'Thêm `examExportReadinessOk: !!out.examExportReadiness.ok` vào summary object');

console.log(`\n══════════════════════════════════════════════`);
console.log(`Kết quả: ${passed} ✅  ${warned} ⚠️   ${failed} ❌`);
if (failed > 0) {
    console.error('❌ check:exam-export-download FAILED');
    process.exit(1);
}
console.log('✅ check:exam-export-download PASSED');
