/**
 * check-active-render-tdz-order.mjs
 * Phase 4K-5J-3: Kiểm tra useFullProfileActiveRender không bị TDZ trong studentsRenderer.js
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;
function fail(msg) { console.error('❌ FAIL:', msg); failures++; }
function ok(msg)   { console.log ('✅ OK:  ', msg); }

const renderer = readFileSync(join(root, 'js/ui/render/computation/studentsRenderer.js'), 'utf8');

// 1. Tìm index đầu tiên của string useFullProfileActiveRender
const firstUseIndex = renderer.indexOf('useFullProfileActiveRender');

// 2. Tìm index khai báo const useFullProfileActiveRender
const declarationIndex = renderer.indexOf('const useFullProfileActiveRender');

// 3. Kiểm tra khai báo tồn tại
if (declarationIndex === -1) {
  fail('studentsRenderer.js không có khai báo const useFullProfileActiveRender');
} else {
  ok('const useFullProfileActiveRender tìm thấy');
}

// 4. Kiểm tra không có TDZ: firstUse phải nằm TRÊN hoặc BẰng declarationIndex
// firstUseIndex === declarationIndex có nghĩa là dòng đầu tiên dùng chính là dòng khai báo — OK
if (declarationIndex !== -1 && firstUseIndex !== -1) {
  if (firstUseIndex < declarationIndex) {
    // Kiểm tra firstUseIndex có phải nằm trong chính dòng khai báo không
    // Nếu không — TDZ
    fail(
      `useFullProfileActiveRender dùng ở index ${firstUseIndex} ` +
      `nhưng khai báo ở index ${declarationIndex} — TDZ ReferenceError!`
    );
  } else {
    ok(`Không có TDZ: khai báo (index ${declarationIndex}) trước lần dùng đầu tiên (index ${firstUseIndex})`);
  }
}

// 5. Kiểm tra không có 2 lần khai báo const
const allDeclarations = [...renderer.matchAll(/const useFullProfileActiveRender/g)];
if (allDeclarations.length > 1) {
  fail(`Có ${allDeclarations.length} lần khai báo const useFullProfileActiveRender — phải là 1`);
} else if (allDeclarations.length === 1) {
  ok('Chỉ có 1 khai báo const useFullProfileActiveRender');
} else {
  fail('Không tìm thấy khai báo const useFullProfileActiveRender');
}

// 6. Kiểm tra có guard trong PASS 2
if (!renderer.includes('if (pgStudentsActive && pgStudents && !useFullProfileActiveRender)')) {
  fail('studentsRenderer.js thiếu: if (pgStudentsActive && pgStudents && !useFullProfileActiveRender)');
} else {
  ok('PASS 2 guard: if (pgStudentsActive && pgStudents && !useFullProfileActiveRender) có mặt');
}

// 7. Kiểm tra có fullProfilesCount
if (!renderer.includes('fullProfilesCount = Object.keys(allProfiles || {}).length')) {
  fail('studentsRenderer.js thiếu: fullProfilesCount = Object.keys(allProfiles || {}).length');
} else {
  ok('fullProfilesCount = Object.keys(allProfiles || {}).length có mặt');
}

// 8. Kiểm tra khai báo nằm trước PASS 1 (trước _profileEntries.sort)
const passOneIndex = renderer.indexOf('_profileEntries.sort(');
if (declarationIndex !== -1 && passOneIndex !== -1) {
  if (declarationIndex < passOneIndex) {
    ok('useFullProfileActiveRender khai báo trước PASS 1 (_profileEntries.sort)');
  } else {
    fail('useFullProfileActiveRender khai báo SAU PASS 1 — TDZ vẫn còn!');
  }
}

// Tổng kết
console.log(`\n${'─'.repeat(60)}`);
if (failures === 0) {
  console.log('✅ check-active-render-tdz-order: TẤT CẢ PASS');
} else {
  console.error(`❌ check-active-render-tdz-order: ${failures} lỗi`);
  process.exit(1);
}
