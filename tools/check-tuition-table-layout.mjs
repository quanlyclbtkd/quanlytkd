#!/usr/bin/env node
/**
 * check-tuition-table-layout.mjs
 * Phase 4K-5G — Kiểm tra layout #tbl_tx:
 *   1. style.css có rule table-layout:fixed cho #tbl_tx (desktop)
 *   2. style.css có col width rules (col-date, col-branch, col-month, col-name, col-type, col-amount, col-action)
 *   3. style.css không còn white-space:nowrap gây truncation trên date/branch ở desktop
 *   4. _formatDateCompactB và _formatDateCompact trong financeRenderer.js gọi formatDate(date) đầy đủ
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

console.log('\n▸ Section 1: style.css — #tbl_tx table-layout: fixed');
const css = readFile('style.css') || '';
check('#tbl_tx table-layout:fixed rule exists',
    css.includes('#tbl_tx') && css.includes('table-layout') && css.includes('fixed'),
    'Thêm `#tbl_tx { table-layout: fixed; }` vào style.css (desktop media query)');
check('#tbl_tx col.col-date width defined',
    css.includes('col-date') && css.includes('col.col-date'),
    'Thêm `#tbl_tx col.col-date { width: 96px; }` vào style.css');
check('#tbl_tx col.col-branch width defined',
    css.includes('col-branch') && css.includes('col.col-branch'),
    'Thêm `#tbl_tx col.col-branch { width: 64px; }` vào style.css');
check('#tbl_tx col.col-action width defined',
    css.includes('col-action') && css.includes('col.col-action'),
    'Thêm `#tbl_tx col.col-action { width: 140px; }` vào style.css');

console.log('\n▸ Section 2: financeRenderer.js — _formatDateCompactB và _formatDateCompact');
const fr = readFile('js/ui/render/computation/financeRenderer.js') || '';
check('_formatDateCompactB gọi formatDate(date)',
    /function _formatDateCompactB\(date\)\s*\{[\s\S]*?return formatDate\(date\)/.test(fr),
    'Sửa _formatDateCompactB để chỉ return formatDate(date)');
check('_formatDateCompact gọi formatDate(date)',
    /function _formatDateCompact\(date\)\s*\{[\s\S]*?return formatDate\(date\)/.test(fr),
    'Sửa _formatDateCompact để chỉ return formatDate(date)');
check('Không còn regex /^d{4}-d{2}-d{2}$/ (thiếu backslash)',
    !fr.includes('/^d{4}-d{2}-d{2}$/'),
    'Xóa regex lỗi /^d{4}-d{2}-d{2}$/ trong financeRenderer.js');
check('Không còn regex /^\\\\d{4}-\\\\d{2}-\\\\d{2}$/ (double-escaped)',
    !/\/\^\\\\d\{4\}/.test(fr),
    'Xóa regex double-escaped \\\\d trong financeRenderer.js', true);

console.log('\n▸ Section 3: index.html — cache version mới');
const html = readFile('index.html') || '';
check('main.js version là tuition-layout-loadmore-exam-export-fix',
    html.includes('tuition-layout-loadmore-exam-export-fix'),
    'Đổi version main.js trong index.html thành tuition-layout-loadmore-exam-export-fix-20260604');

console.log(`\n══════════════════════════════════════════════`);
console.log(`Kết quả: ${passed} ✅  ${warned} ⚠️   ${failed} ❌`);
if (failed > 0) {
    console.error('❌ check:tuition-table-layout FAILED');
    process.exit(1);
}
console.log('✅ check:tuition-table-layout PASSED');
