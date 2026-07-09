#!/usr/bin/env node
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

let failures = 0;
function ok(name, condition, details = '') {
  if (condition) {
    console.log(`✅ ${name}`);
  } else {
    failures++;
    console.error(`❌ ${name}${details ? ` — ${details}` : ''}`);
  }
}

const marker = 'debt-zalo-feature-off-20260704-v5n';
const app = read('app.js');
const appPub = read('public/app.js');
const idx = read('index.html');
const idxPub = read('public/index.html');
const main = read('js/main.js');
const mainPub = read('public/js/main.js');
const renderer = read('js/ui/render/computation/studentsRenderer.js');
const rendererPub = read('public/js/ui/render/computation/studentsRenderer.js');
const students = read('js/modules/students.js');
const studentsPub = read('public/js/modules/students.js');
const pkg = read('package.json');

ok('build marker V5N có trong index/app/main', idx.includes(marker) && app.includes('4K-6V5N-debt-zalo-feature-off') && main.includes(marker));
ok('public mirror có build marker V5N', idxPub.includes(marker) && appPub.includes('4K-6V5N-debt-zalo-feature-off') && mainPub.includes(marker));
ok('feature flag tắt Zalo Báo nợ mặc định', app.includes('window.DEBT_ZALO_FEATURE_ENABLED = false') && app.includes('window.isDebtZaloFeatureEnabled = function isDebtZaloFeatureEnabled() { return false; };'));
ok('public feature flag tắt Zalo Báo nợ mặc định', appPub.includes('window.DEBT_ZALO_FEATURE_ENABLED = false') && appPub.includes('window.isDebtZaloFeatureEnabled = function isDebtZaloFeatureEnabled() { return false; };'));
ok('header tab Báo nợ không còn nút Zalo Hàng Loạt clickable', !idx.includes('onclick="openBulkZaloModal()"') && !idxPub.includes('onclick="openBulkZaloModal()"'));
ok('bulkZaloModal bị ẩn bằng data gate + hidden', idx.includes('id="bulkZaloModal" data-debt-zalo-ui hidden aria-hidden="true"') && idx.includes('display:none!important'));
ok('public bulkZaloModal bị ẩn bằng data gate + hidden', idxPub.includes('id="bulkZaloModal" data-debt-zalo-ui hidden aria-hidden="true"') && idxPub.includes('display:none!important'));
ok('legacy app debt row chỉ render Zalo nếu feature gate bật', app.includes('const _debtZaloBtn = (window.isDebtZaloFeatureEnabled && window.isDebtZaloFeatureEnabled())') && app.includes('${_debtZaloBtn}${window.userRole'));
ok('public legacy app debt row chỉ render Zalo nếu feature gate bật', appPub.includes('const _debtZaloBtn = (window.isDebtZaloFeatureEnabled && window.isDebtZaloFeatureEnabled())') && appPub.includes('${_debtZaloBtn}${window.userRole'));
ok('studentsRenderer debt row chỉ render Zalo nếu feature gate bật', renderer.includes('const debtZaloBtn = (typeof window !== \'undefined\' && window.isDebtZaloFeatureEnabled && window.isDebtZaloFeatureEnabled())') && renderer.includes('${debtZaloBtn}${isAdmin'));
ok('public studentsRenderer debt row chỉ render Zalo nếu feature gate bật', rendererPub.includes('const debtZaloBtn = (typeof window !== \'undefined\' && window.isDebtZaloFeatureEnabled && window.isDebtZaloFeatureEnabled())') && rendererPub.includes('${debtZaloBtn}${isAdmin'));
ok('copyAndOpenZalo legacy có fail-safe guard', app.includes('Tính năng Zalo nhắc nợ đang tắt') && app.includes('return false;'));
ok('copyAndOpenZalo module có fail-safe guard', students.includes('Tính năng Zalo nhắc nợ đang tắt') && students.includes('return false;'));
ok('openBulkZaloModal có fail-safe guard', app.includes('Tính năng Zalo hàng loạt đang tắt') && students.includes('Tính năng Zalo hàng loạt đang tắt'));
ok('ZaloPay ví thanh toán không bị tắt nhầm', app.includes("window.ppOpenWallet('ZALOPAY','ZaloPay')") && appPub.includes("window.ppOpenWallet('ZALOPAY','ZaloPay')"));
ok('package có check V5N', pkg.includes('check:v5n-debt-zalo-feature-off'));

if (failures) {
  console.error(`\nV5N debt Zalo feature-off check FAILED: ${failures} lỗi.`);
  process.exit(1);
}
console.log('\nV5N debt Zalo feature-off check PASS.');
