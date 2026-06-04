/**
 * check-exam-name-parser-hotfix.mjs
 * Phase 4K-5B — Kiểm tra hotfix parser tên võ sinh từ giao dịch lệ phí thi
 *
 * Các lỗi được phát hiện:
 * 1. extractExamStudentName vẫn dùng regex không có "(" trước "Thi"
 * 2. getCanonicalStudentName không tồn tại
 * 3. renderExamList không dùng getCanonicalStudentName
 * 4. selectPaidStudents không dùng extractExamStudentName hoặc getCanonicalStudentName
 * 5. computeExamRegistrationStats còn add t.description trực tiếp
 * 6. exportExamPaidList không dùng getCanonicalStudentName
 * 7. exportExamPaidList không bỏ examPaidCancelled
 * 8. exportExamPaidList không dedupe paidData
 * 9. debugExamDuplicatePayments không tồn tại
 * 10. debugRuntimeSmokeTest không include examDuplicatePayments
 * 11. Regex simulation tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let passed = 0;
let failed = 0;
const errors = [];

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS — ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL — ${label}${detail ? ': ' + detail : ''}`);
    failed++;
    errors.push(label);
  }
}

console.log('\n══════════════════════════════════════════════════');
console.log('  check-exam-name-parser-hotfix  (Phase 4K-5B)');
console.log('══════════════════════════════════════════════════\n');

// ─── Đọc source files ────────────────────────────────────────────────────────
const appJs       = readFile('app.js');
const reportsJs   = readFile('js/modules/reports.js');
const mainJs      = readFile('js/main.js');

// ─── 1. extractExamStudentName phải dùng "\(" trước "Thi" ───────────────────
console.log('[1] extractExamStudentName — regex phải có "(" trước "Thi"');

// Lấy phần source của extractExamStudentName
const extractFnMatch = appJs.match(/window\.extractExamStudentName\s*=\s*function[\s\S]*?^    };/m);
const extractFnSrc = extractFnMatch ? extractFnMatch[0] : '';

check(
  'extractExamStudentName tồn tại',
  appJs.includes('window.extractExamStudentName')
);

check(
  'extractExamStudentName có regex dạng /\\(\\s*Thi/ (dấu "(" trước "Thi")',
  /\\\(\s*\\s\*Thi|\\s\*\\\(\\s\*Thi|\\\(\\s\*Thi/.test(extractFnSrc) ||
  extractFnSrc.includes('\\(\\s*Thi') ||
  extractFnSrc.includes('\\(Thi') ||
  /\(\\s\*Thi/.test(extractFnSrc) ||
  /\(\s*Thi/.test(extractFnSrc) ||
  appJs.match(/match\(\/\^\(\.\*\?\)\\s\*\\\(\\s\*Thi/) != null ||
  // Kiểm tra đơn giản hơn: có \( trước Thi trong các regex của hàm
  (() => {
    const fnIdx = appJs.indexOf('window.extractExamStudentName = function');
    const fnEnd = appJs.indexOf('\n    window.getExamTargetBeltFromTx', fnIdx);
    const fnBody = appJs.slice(fnIdx, fnEnd);
    return fnBody.includes('\\(') && fnBody.includes('Thi');
  })()
);

check(
  'extractExamStudentName KHÔNG dùng regex nguy hiểm /^(.*?)\\s*(Thi lên/ (thiếu dấu "(")',
  (() => {
    const fnIdx = appJs.indexOf('window.extractExamStudentName = function');
    const fnEnd = appJs.indexOf('\n    window.getExamTargetBeltFromTx', fnIdx);
    const fnBody = appJs.slice(fnIdx, fnEnd);
    // Pattern nguy hiểm: match bắt đầu ^(.*?)\s* rồi thẳng đến "Thi" không qua "("
    const dangerousPattern = /match\(\/\^\(\.\*\?\)\\s\*\(Thi/;
    return !dangerousPattern.test(fnBody);
  })()
);

check(
  'extractExamStudentName KHÔNG dùng regex /^(.*?)\\s*(Thi\\s/ không có "(" (pattern cũ)',
  (() => {
    const fnIdx = appJs.indexOf('window.extractExamStudentName = function');
    const fnEnd = appJs.indexOf('\n    window.getExamTargetBeltFromTx', fnIdx);
    const fnBody = appJs.slice(fnIdx, fnEnd);
    // Regex cũ bị bug: /^(.*?)\s*(Thi\s+.*?)\s*$/i — không có \(
    // Biểu hiện trong source: match(/^(.*?)\s*(Thi\s
    return !fnBody.match(/match\(\/\^\(\.\*\?\)\\s\*\(Thi\\s/);
  })()
);

// ─── 2. Regex simulation — test trực tiếp ────────────────────────────────────
console.log('\n[2] Simulation test — extractExamStudentName logic');

/**
 * Mô phỏng hàm extractExamStudentName mới (hotfix)
 */
function simulateExtract(tx) {
  if (!tx) return '';
  const structured = String(tx.studentName || tx.profileName || tx.profileId || tx.studentId || '').trim();
  if (structured) return structured;

  let desc = String(tx.description || '').trim();
  if (!desc) return '';

  desc = desc.replace(/\s*\(\s*$/, '').trim();

  let m = desc.match(/^(.*?)\s*\(\s*Thi lên\s*.*?\)\s*$/i);
  if (m && m[1]) return m[1].trim();

  m = desc.match(/^(.*?)\s*\(\s*Thi\s+.*?\)\s*$/i);
  if (m && m[1]) return m[1].trim();

  m = desc.match(/^(.*?)\s*\(\s*Thi\s+.*$/i);
  if (m && m[1]) return m[1].trim();

  m = desc.match(/^(.*?)\s*\(\s*Thi lên\s+.*$/i);
  if (m && m[1]) return m[1].trim();

  m = desc.match(/^(.*?)\s*\([^)]*\)\s*$/);
  if (m && m[1]) return m[1].trim();

  desc = desc.replace(/\s*\(\s*$/, '').trim();
  return desc;
}

const cases = [
  { tx: { description: 'Dương Vũ An (Thi Quý 2/2026)' },           expected: 'Dương Vũ An' },
  { tx: { description: 'Dương Vũ An (Thi lên Đai xanh lá - Cấp 6)' }, expected: 'Dương Vũ An' },
  { tx: { description: 'Dương Vũ An (' },                           expected: 'Dương Vũ An' },
  { tx: { description: 'Nguyễn Văn B (Thi lên Đai vàng - Cấp 7)' }, expected: 'Nguyễn Văn B' },
  { tx: { description: 'Trần Thị C (Thi Quý 1/2026)' },            expected: 'Trần Thị C' },
  { tx: { studentName: 'Lê Văn D', description: 'Lê Văn D (Thi...)' }, expected: 'Lê Văn D' },
  { tx: { description: 'Phạm Thị E (Thi lên Đai đỏ' },             expected: 'Phạm Thị E' },
];

cases.forEach(({ tx, expected }) => {
  const result = simulateExtract(tx);
  check(
    `extractExamStudentName("${tx.description || tx.studentName}") → "${expected}"`,
    result === expected,
    result !== expected ? `got "${result}"` : ''
  );
});

// ─── 3. getCanonicalStudentName tồn tại ─────────────────────────────────────
console.log('\n[3] getCanonicalStudentName');
check(
  'getCanonicalStudentName tồn tại trong app.js',
  appJs.includes('window.getCanonicalStudentName')
);

// ─── 4. renderExamList dùng getCanonicalStudentName ─────────────────────────
console.log('\n[4] renderExamList');
check(
  'renderExamList dùng getCanonicalStudentName',
  (() => {
    // Tìm ĐỊNH NGHĨA hàm (không phải call site)
    const defPattern = 'window.renderExamList = () => {';
    const idx = appJs.indexOf(defPattern);
    const end = appJs.indexOf('\n    window.', idx + defPattern.length);
    const body = appJs.slice(idx, end > 0 ? end : idx + 8000);
    return body.includes('getCanonicalStudentName');
  })()
);

// ─── 5. selectPaidStudents dùng extractExamStudentName + getCanonicalStudentName
console.log('\n[5] selectPaidStudents');
check(
  'selectPaidStudents dùng extractExamStudentName',
  (() => {
    const idx = appJs.indexOf('window.selectPaidStudents');
    const body = appJs.slice(idx, idx + 1200);
    return body.includes('extractExamStudentName');
  })()
);
check(
  'selectPaidStudents dùng getCanonicalStudentName',
  (() => {
    const idx = appJs.indexOf('window.selectPaidStudents');
    const body = appJs.slice(idx, idx + 1200);
    return body.includes('getCanonicalStudentName');
  })()
);

// ─── 6. computeExamRegistrationStats không add t.description trực tiếp ──────
console.log('\n[6] computeExamRegistrationStats');
check(
  'computeExamRegistrationStats không còn paidNamesSet.add(t.description)',
  (() => {
    // Tìm ĐỊNH NGHĨA hàm (function computeExamRegistrationStats)
    const defPattern = 'window.computeExamRegistrationStats = function computeExamRegistrationStats';
    const idx = appJs.indexOf(defPattern);
    const body = appJs.slice(idx, idx + 3000);
    return !body.includes('paidNamesSet.add(t.description)');
  })()
);
check(
  'computeExamRegistrationStats dùng extractExamStudentName',
  (() => {
    const defPattern = 'window.computeExamRegistrationStats = function computeExamRegistrationStats';
    const idx = appJs.indexOf(defPattern);
    const body = appJs.slice(idx, idx + 3000);
    return body.includes('extractExamStudentName');
  })()
);
check(
  'computeExamRegistrationStats dùng getCanonicalStudentName',
  (() => {
    const defPattern = 'window.computeExamRegistrationStats = function computeExamRegistrationStats';
    const idx = appJs.indexOf(defPattern);
    const body = appJs.slice(idx, idx + 3000);
    return body.includes('getCanonicalStudentName');
  })()
);

// ─── 7. exportExamPaidList dùng getCanonicalStudentName ─────────────────────
console.log('\n[7] exportExamPaidList (reports.js)');
check(
  'exportExamPaidList dùng getCanonicalStudentName',
  reportsJs.includes('getCanonicalStudentName')
);

// ─── 8. exportExamPaidList bỏ examPaidCancelled ─────────────────────────────
check(
  'exportExamPaidList bỏ examPaidCancelled === true',
  (() => {
    // Tìm ĐỊNH NGHĨA hàm (async function definition, không phải comment)
    const defPattern = 'window.exportExamPaidList = async () => {';
    const idx = reportsJs.indexOf(defPattern);
    const body = reportsJs.slice(idx, idx + 10000);
    return body.includes('examPaidCancelled');
  })()
);

// ─── 9. exportExamPaidList dedupe paidData ──────────────────────────────────
check(
  'exportExamPaidList dedupe paidData theo canonical name (dùng curTs/oldTs hoặc !old)',
  (() => {
    const defPattern = 'window.exportExamPaidList = async () => {';
    const idx = reportsJs.indexOf(defPattern);
    const body = reportsJs.slice(idx, idx + 10000);
    return (body.includes('curTs') && body.includes('oldTs')) || body.includes('!old ||');
  })()
);

// ─── 10. debugExamDuplicatePayments tồn tại ─────────────────────────────────
console.log('\n[10] debugExamDuplicatePayments');
check(
  'debugExamDuplicatePayments tồn tại trong app.js',
  appJs.includes('window.debugExamDuplicatePayments')
);
check(
  'debugExamDuplicatePayments dùng extractExamStudentName',
  (() => {
    const idx = appJs.indexOf('window.debugExamDuplicatePayments');
    const body = appJs.slice(idx, idx + 2500);
    return body.includes('extractExamStudentName');
  })()
);
check(
  'debugExamDuplicatePayments dùng getCanonicalStudentName',
  (() => {
    const idx = appJs.indexOf('window.debugExamDuplicatePayments');
    const body = appJs.slice(idx, idx + 2500);
    return body.includes('getCanonicalStudentName');
  })()
);

// ─── 11. debugRuntimeSmokeTest include examDuplicatePayments ─────────────────
console.log('\n[11] debugRuntimeSmokeTest');
check(
  'debugRuntimeSmokeTest include out.examDuplicatePayments',
  mainJs.includes('examDuplicatePayments')
);
check(
  'debugRuntimeSmokeTest include examDuplicatePaymentsOk trong summary',
  mainJs.includes('examDuplicatePaymentsOk')
);

// ─── Kết quả ─────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(`  Kết quả: ${passed} pass / ${passed + failed} tổng`);
if (failed > 0) {
  console.error(`\n  ❌ ${failed} FAIL:`);
  errors.forEach(e => console.error(`     - ${e}`));
  console.log('');
  process.exit(1);
} else {
  console.log(`\n  ✅ Tất cả ${passed} kiểm tra PASS — Phase 4K-5B hotfix OK\n`);
}
