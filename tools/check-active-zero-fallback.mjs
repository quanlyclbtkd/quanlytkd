/**
 * tools/check-active-zero-fallback.mjs — Phase 4K-STUDENT-LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiểm tra active profiles listener có fallback khi active query = 0 nhưng
 * profiles collection có docs (data cũ thiếu status):
 * 1. Có probe getDocs(limit(1)) khi activeCount === 0
 * 2. Gọi loadFullProfilesFallback('active-zero-but-profiles-exist')
 * 3. loadFullProfilesFallback dùng classifyProfileStatus để split active/quit
 * 4. Sau fallback có invalidateList('students.activeList')
 * 5. Có guard không chạy fallback vô hạn (maxFallbackPerSession)
 *
 * Chạy: node tools/check-active-zero-fallback.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(p) {
    try { return readFileSync(resolve(root, p), 'utf8'); } catch (_) { return null; }
}

let pass = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) { console.log('  ✅ ' + label); pass++; }
    else { console.error('  ❌ ' + label); if (hint) console.error('     → ' + hint); errors.push(label); }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Active-Zero Fallback Check — Phase 4K-STUDENT-LIST');
console.log('══════════════════════════════════════════════════════════\n');

const listenersJs = readFile('js/listeners/profiles.listeners.js');

if (!listenersJs) {
    console.error('  ❌ FATAL: js/listeners/profiles.listeners.js không tìm thấy');
    process.exit(1);
}

console.log('▸ Section 1: Active-zero probe trong snapshot handler');
check('Có kiểm tra activeCount === 0 trên snapshot đầu tiên',
    listenersJs.includes('activeCount === 0') &&
    (listenersJs.includes('activeSnapshotCount === 1') || listenersJs.includes('snapshotCount === 1')),
    'Thêm: if (activeCount === 0 && _state.activeSnapshotCount === 1) { ... probe ... }');

check('Có getDocs(limit(1)) probe để kiểm tra collection không trống',
    listenersJs.includes('limit(1)') ||
    listenersJs.includes('_pL4k(1)') ||
    listenersJs.includes('fbLimit(1)'),
    'Dùng getDocs(query(profRef, limit(1))) để probe nhẹ, không đọc full collection');

check('Gọi loadFullProfilesFallback khi probe phát hiện collection có docs',
    listenersJs.includes("loadFullProfilesFallback('active-zero-but-profiles-exist')") ||
    listenersJs.includes('active-zero-but-profiles-exist'),
    "Thêm: loadFullProfilesFallback('active-zero-but-profiles-exist')");

console.log();
console.log('▸ Section 2: loadFullProfilesFallback dùng classifyProfileStatus');
check('loadFullProfilesFallback import classifyProfileStatus',
    listenersJs.includes('classifyProfileStatus'),
    'Thêm classifyProfileStatus vào import từ profileStatusConfig.js');

check('loadFullProfilesFallback phân loại active/quit bằng classifyProfileStatus',
    listenersJs.includes('classifyProfileStatus(') &&
    (listenersJs.includes('_fallbackActive') || listenersJs.includes('fallbackActive') ||
     listenersJs.includes('_classifiedActive') || listenersJs.includes('classifiedActive')),
    'Trong loadFullProfilesFallback: dùng classifyProfileStatus(data) để split active/quit');

check('setActiveProfiles được gọi với classified active map (không chỉ fullMap)',
    listenersJs.includes('setActiveProfiles(_fallbackActive') ||
    listenersJs.includes('setActiveProfiles(_classifiedActive') ||
    (listenersJs.includes('setActiveProfiles(') && listenersJs.includes('full-fallback-active')),
    'Thêm: setActiveProfiles(activeMap, \'full-fallback-active:...\')');

console.log();
console.log('▸ Section 3: Post-fallback invalidation');
check('Sau fallback có invalidateList students.activeList',
    listenersJs.includes("invalidateList('students.activeList'") ||
    listenersJs.includes('invalidateList(\'students.activeList\'') ||
    listenersJs.includes('"students.activeList"'),
    "Thêm: window.invalidateList('students.activeList', 'full-profiles-fallback')");

console.log();
console.log('▸ Section 4: Guard vô hạn fallback');
check('Có maxFallbackPerSession guard',
    listenersJs.includes('maxFallbackPerSession') || listenersJs.includes('fallbackCount'),
    'profiles.listeners.js phải có guard chặn fallback vô hạn (fallbackCount >= maxFallbackPerSession)');

check('Có fallbackInProgress guard',
    listenersJs.includes('fallbackInProgress'),
    'profiles.listeners.js phải có fallbackInProgress guard để tránh concurrent calls');

console.log();
console.log('══════════════════════════════════════════════════════════');
const total = pass + errors.length;
console.log('  Total: ' + total + ' | ✅ ' + pass + ' | ❌ ' + errors.length);
if (errors.length > 0) {
    errors.forEach(e => console.error('  ❌ ' + e));
    console.error('\n  ⚠️  Active-zero fallback chưa đủ — võ sinh có data cũ sẽ không hiển thị!');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Active-zero fallback checks passed!');
    console.log('  Listener tự phát hiện data cũ thiếu status và trigger full fallback.');
    console.log('══════════════════════════════════════════════════════════\n');
}
