/**
 * check-real-load-more-wiring.mjs
 * Phase 4K-5H: Kiểm tra wiring load more thật cho Học Phí, Đang Tập, Báo Nợ
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;
function fail(msg) { console.error('❌ FAIL:', msg); failures++; }
function ok(msg)   { console.log ('✅ OK:  ', msg); }

const finance  = readFileSync(join(root, 'js/modules/finance.js'), 'utf8');
const students = readFileSync(join(root, 'js/modules/students.js'), 'utf8');

// --- finance.js: _pgWrap không chèn vào txList.parentNode ---
if (finance.includes('txList.parentNode.insertBefore(ctrlEl, txList.nextSibling)'))
  fail('finance.js vẫn chèn pgWrap_txList bằng txList.parentNode.insertBefore');
else ok('finance.js không còn chèn div vào trong <table>');

// --- finance.js: _mergedAllItems ---
if (!finance.includes('_mergedAllItems'))
  fail('finance.js thiếu _mergedAllItems (không lưu all items cho load more)');
else ok('finance.js có _mergedAllItems');

// --- finance.js: _pgNext_transactions xử lý _mergedAllItems ---
if (!finance.includes('pgState._mergedAllItems') || !finance.includes('nextSlice'))
  fail('_pgNext_transactions không xử lý _mergedAllItems append mode');
else ok('_pgNext_transactions có _mergedAllItems append mode');

// --- finance.js: đổi label "Tiếp" thành "Tải thêm giao dịch" ---
if (!finance.includes('Tải thêm giao dịch'))
  fail('finance.js chưa đổi label "Tiếp →" thành "⬇ Tải thêm giao dịch"');
else ok('finance.js label đã đổi thành "Tải thêm giao dịch"');

// --- students.js: _pgNext_students append oldItems ---
if (!students.includes('_pendingAppendOldItems'))
  fail('students.js _pgNext_students chưa lưu oldItems để append');
else ok('students.js _pgNext_students có _pendingAppendOldItems logic');

// --- students.js: đổi label Tiếp → Tải thêm võ sinh ---
if (!students.includes('Tải thêm võ sinh'))
  fail('students.js chưa đổi label "Tiếp →" thành "⬇ Tải thêm võ sinh"');
else ok('students.js đã đổi label thành "Tải thêm võ sinh"');

// --- students.js: loadAllProfilesForDebt ---
if (!students.includes('loadAllProfilesForDebt'))
  fail('students.js thiếu loadAllProfilesForDebt');
else ok('students.js có loadAllProfilesForDebt');

// --- students.js: ensureDebtProfilesReady dùng loadAllProfilesForDebt ---
if (!students.includes('await window.loadAllProfilesForDebt'))
  fail('ensureDebtProfilesReady không gọi loadAllProfilesForDebt — vẫn chỉ reloadStudentsPage');
else ok('ensureDebtProfilesReady gọi loadAllProfilesForDebt');

// --- students.js: debugListPaginationCoverage báo control DOM/text ---
if (!students.includes('hasControlDom'))
  fail('debugListPaginationCoverage không báo control DOM presence');
else ok('debugListPaginationCoverage có hasControlDom');

// --- Tổng kết ---
console.log(`\n${'─'.repeat(50)}`);
if (failures === 0) {
  console.log('✅ check-real-load-more-wiring: TẤT CẢ PASS');
} else {
  console.error(`❌ check-real-load-more-wiring: ${failures} lỗi`);
  process.exit(1);
}
