#!/usr/bin/env node
import fs from 'fs';

const app = fs.readFileSync('app.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

add('has debugExcelImportVtfUpsert', app.includes('window.debugExcelImportVtfUpsert'));
add('has normalized name matching', app.includes('_normalizeImportNameKey') && app.includes('_resolveExistingProfileForImport'));
add('has memberId/VTF aliases', app.includes('Mã hội viên VTF') && app.includes('Mã HV VTF') && app.includes('VTF Code') && app.includes('Member ID'));
add('updates existing profile with merge', /batch\.set\(docRef,\s*payload,\s*\{\s*merge:\s*true\s*\}\)/s.test(app));
add('does not skip existing system names before update', !/reason:\s*['"]Trùng tên hệ thống['"][\s\S]{0,220}return;/.test(app));
add('protects paidUntil for existing students', app.includes('Không cập nhật paidUntil cho võ sinh đã tồn tại'));
add('prevents duplicate VTF in system', app.includes('Trùng mã VTF hệ thống') && app.includes('Mã VTF đã tồn tại'));
add('prevents duplicate VTF in file', app.includes('Trùng mã VTF trong file') && app.includes('memberIdSeenInFile'));
add('supports batch chunking', app.includes('_commitImportBatchIfNeeded') && app.includes('batchOps >= 450'));
add('reports updated count', app.includes('updatedCount') && app.includes('updatedList') && app.includes('CẬP NHẬT'));
add('refreshes students after excel upsert', app.includes('excel-import-upsert') && app.includes('invalidateStudents'));
add('has phase version in main', main.includes("4K-6I-I-excel-import-vtf-upsert-20260608"));
add('has cache bust in index', index.includes('excel-import-vtf-upsert-20260608'));
add('package script registered', pkg.scripts && pkg.scripts['check:excel-import-vtf-upsert']);
add('check:all includes script', pkg.scripts?.['check:all']?.includes('check:excel-import-vtf-upsert'));
add('check:all:critical includes script', pkg.scripts?.['check:all:critical']?.includes('check:excel-import-vtf-upsert'));

let fail = checks.filter(c => !c.ok);
console.log('Phase 4K-6I-I Excel Import VTF Upsert Check');
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
if (fail.length) {
  console.error(`\nFAILED: ${fail.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`\nPASS: ${checks.length}/${checks.length} checks passed`);
