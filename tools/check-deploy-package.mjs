/**
 * tools/check-deploy-package.mjs — Deploy Package Structure Check
 * ────────────────────────────────────────────────────────────────
 * Kiểm tra tất cả file/thư mục bắt buộc phải có mặt trước khi đóng gói ZIP deploy.
 *
 * Fail nếu thiếu bất kỳ mục nào trong danh sách bắt buộc.
 *
 * Chạy: node tools/check-deploy-package.mjs
 * Hoặc: npm run check:deploy-package
 * ────────────────────────────────────────────────────────────────
 */

import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function exists(relPath) {
    return existsSync(resolve(root, relPath));
}

function isDir(relPath) {
    try { return statSync(resolve(root, relPath)).isDirectory(); }
    catch (_) { return false; }
}

let pass = 0;
let fail = 0;
const errors = [];

function check(label, condition, hint) {
    if (condition) {
        console.log('  ✅ ' + label);
        pass++;
    } else {
        console.error('  ❌ ' + label);
        if (hint) console.error('     → ' + hint);
        fail++;
        errors.push(label);
    }
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Deploy Package Structure Check');
console.log('══════════════════════════════════════════════════════════\n');

console.log('▸ Root files bắt buộc');
check('index.html tồn tại',
    exists('index.html'),
    'index.html là entry point — không có thì app không chạy được');

check('app.js tồn tại (legacy standalone mode)',
    exists('app.js'),
    'app.js phải tồn tại — đây là fallback khi main.js chưa load hoặc file:// protocol');

check('style.css tồn tại',
    exists('style.css'),
    'style.css thiếu — giao diện sẽ bị vỡ');

check('package.json tồn tại',
    exists('package.json'),
    'package.json cần thiết cho npm scripts và type=module');

check('.nojekyll tồn tại (GitHub Pages — ngăn Jekyll bỏ qua _prefix files)',
    exists('.nojekyll'),
    'Tạo file rỗng .nojekyll ở root để GitHub Pages phục vụ đầy đủ static files');

console.log();
console.log('▸ Module JS files bắt buộc');

check('js/main.js tồn tại (ES module entry point)',
    exists('js/main.js'),
    'CRITICAL: js/main.js missing — KHÔNG TẠO FILE GIẢ. Kiểm tra ZIP đầu vào hoặc upload lại đầy đủ source');

check('js/modules/superadmin.js tồn tại',
    exists('js/modules/superadmin.js'),
    'CRITICAL: js/modules/superadmin.js missing — SuperAdmin dashboard sẽ không hoạt động. Kiểm tra ZIP nguồn');

check('js/modules/dashboard.js tồn tại',
    exists('js/modules/dashboard.js'),
    'js/modules/dashboard.js thiếu — trang dashboard không load được');

check('js/modules/students.js tồn tại',
    exists('js/modules/students.js'),
    'js/modules/students.js thiếu');

console.log();
console.log('▸ Thư mục bắt buộc');

check('js/ thư mục tồn tại',
    isDir('js'),
    'Thư mục js/ không tồn tại — toàn bộ ES module layer bị mất');

check('js/modules/ thư mục tồn tại',
    isDir('js/modules'),
    'Thư mục js/modules/ không tồn tại — các module chức năng bị mất');

check('js/services/ thư mục tồn tại',
    isDir('js/services'),
    'Thư mục js/services/ không tồn tại — service layer bị mất');

console.log();

console.log('══════════════════════════════════════════════════════════');
console.log('  Total: ' + (pass + fail) + ' checks | ✅ Pass: ' + pass + ' | ❌ Fail: ' + fail);

if (fail > 0) {
    console.error('\nFailed checks:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\n  ⚠️  Deploy package thiếu file — KHÔNG đóng gói ZIP cho đến khi fix xong!');
    console.error('  ⚠️  Nếu thiếu js/main.js hoặc js/modules/superadmin.js: đây là lỗi source, không tạo file giả.');
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(1);
} else {
    console.log('\n  🎉 Deploy package structure hợp lệ!');
    console.log('  Tất cả file/thư mục bắt buộc đều có mặt — an toàn để đóng gói ZIP.');
    console.log('══════════════════════════════════════════════════════════\n');
}
