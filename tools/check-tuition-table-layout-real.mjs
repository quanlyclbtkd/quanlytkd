/**
 * check-tuition-table-layout-real.mjs
 * Phase 4K-5H: Kiểm tra colgroup thật và CSS desktop layout cho bảng Học Phí
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;
function fail(msg) { console.error('❌ FAIL:', msg); failures++; }
function ok(msg)   { console.log ('✅ OK:  ', msg); }

// --- Kiểm tra index.html ---
const html = readFileSync(join(root, 'index.html'), 'utf8');

const hasTblTx = html.includes('<table id="tbl_tx">');
if (!hasTblTx) fail('index.html không có <table id="tbl_tx">');
else ok('<table id="tbl_tx"> tồn tại');

const hasColgroup = html.includes('<table id="tbl_tx"><colgroup>') ||
                    html.includes('<table id="tbl_tx"> <colgroup>') ||
                    (html.includes('<table id="tbl_tx">') && html.includes('<colgroup>'));
if (!hasColgroup) fail('index.html thiếu <colgroup> trong #tbl_tx');
else ok('#tbl_tx có <colgroup>');

const colClasses = ['tx-col-date', 'tx-col-branch', 'tx-col-action'];
for (const cls of colClasses) {
  if (!html.includes(`class="${cls}"`)) fail(`index.html thiếu col class="${cls}"`);
  else ok(`<col class="${cls}"> tồn tại`);
}

// --- Kiểm tra style.css ---
const css = readFileSync(join(root, 'style.css'), 'utf8');

if (!css.includes('#tbl_tx th:nth-child(1)')) fail('style.css thiếu #tbl_tx th:nth-child(1)');
else ok('style.css có #tbl_tx th:nth-child(1)');

if (!css.includes('#tbl_tx th:nth-child(2)')) fail('style.css thiếu #tbl_tx th:nth-child(2)');
else ok('style.css có #tbl_tx th:nth-child(2)');

if (!css.includes('#tbl_tx th:nth-child(7)')) fail('style.css thiếu #tbl_tx th:nth-child(7)');
else ok('style.css có #tbl_tx th:nth-child(7)');

if (!css.includes('table-layout: fixed !important')) fail('style.css thiếu table-layout: fixed !important cho #tbl_tx');
else ok('style.css có table-layout: fixed !important');

if (css.includes('#tbl_tx col.col-date') && !css.includes('tx-col-date')) {
  fail('style.css vẫn dùng col.col-date cũ mà không có tx-col-date mới');
} else ok('style.css dùng tx-col-date colgroup class');

// --- Kiểm tra finance.js ---
const finance = readFileSync(join(root, 'js/modules/finance.js'), 'utf8');

if (!finance.includes('_getTxControlsHost')) fail('finance.js thiếu _getTxControlsHost()');
else ok('finance.js có _getTxControlsHost()');

if (finance.includes('txList.parentNode.insertBefore(ctrlEl, txList.nextSibling)'))
  fail('finance.js vẫn còn chèn div vào txList.parentNode (bên trong table)');
else ok('finance.js không còn chèn div vào trong table');

if (!finance.includes('_mergedAllItems')) fail('finance.js thiếu _mergedAllItems');
else ok('finance.js có _mergedAllItems');

// --- Kiểm tra debugTuitionTableLayout ---
const students = readFileSync(join(root, 'js/modules/students.js'), 'utf8');
if (!students.includes('debugTuitionTableLayout')) fail('students.js thiếu debugTuitionTableLayout');
else ok('students.js có debugTuitionTableLayout');

// --- Tổng kết ---
console.log(`\n${'─'.repeat(50)}`);
if (failures === 0) {
  console.log('✅ check-tuition-table-layout-real: TẤT CẢ PASS');
} else {
  console.error(`❌ check-tuition-table-layout-real: ${failures} lỗi`);
  process.exit(1);
}
