import fs from 'fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(cond, msg) {
  if (!cond) {
    console.error('❌ ' + msg);
    process.exitCode = 1;
  } else {
    console.log('✅ ' + msg);
  }
}

const app = read('app.js');
const publicApp = read('public/app.js');
const cache = read('js/core/clubStatsAutoCache.js');
const publicCache = read('public/js/core/clubStatsAutoCache.js');
const index = read('index.html');
const main = read('js/main.js');
const pkg = JSON.parse(read('package.json'));
const build = 'attendance-status-quit-sync-20260704-v5m';

assert(index.includes(build), 'index.html dùng cache-bust V5L');
assert(app.includes("4K-6V5M-attendance-status-quit-sync-20260704") || app.includes("4K-6V5L-superadmin-revenue-cache-fallback-20260704"), 'app.js cập nhật APP_PATCH_VERSION V5L/V5M');
assert(main.includes("4K-6V5M-attendance-status-quit-sync-20260704") || main.includes("4K-6V5L-superadmin-revenue-cache-fallback-20260704"), 'main.js cập nhật APP_PATCH_VERSION V5L/V5M');
assert(app.includes('function _saReadClubRevenueCache'), 'app.js có helper đọc root cache SuperAdmin revenue');
assert(app.includes('function _saReadStatsIncomeTotal'), 'app.js có helper đọc stats income tương thích nhiều schema');
assert(app.includes('function _saReadStatsTxCount'), 'app.js có helper đọc txCount tương thích nhiều schema');
assert(app.includes('if (_rootCache.hasRevenue)'), 'loadSARevenue ưu tiên root club cache trước stats/tx scan');
assert(app.includes("'club-cache-month'"), 'root cache có source club-cache-month');
assert(app.includes("source: 'stats'"), 'stats doc vẫn được dùng khi hợp lệ');
assert(!app.includes('Stats doc tồn tại cho CLB'), 'đã loại bỏ console.warn stats doc tồn tại nhưng không đọc được income');
assert(app.includes('_saRevenueDebugEnabled()'), 'debug warning chỉ bật khi saRevenueDebug hoặc __SA_REVENUE_DEBUG');
assert(app.includes("Revenue = 0 là giá trị hợp lệ"), 'zero revenue được coi là giá trị hợp lệ');
assert(cache.includes("'income.total': stats.monthlyIncome"), 'clubStatsAutoCache ghi flat income.total');
assert(cache.includes('totalIncome: stats.monthlyIncome'), 'clubStatsAutoCache ghi totalIncome alias');
assert(cache.includes('monthlyTxCount: stats.monthlyTxCount'), 'clubStatsAutoCache ghi monthlyTxCount alias');
assert(publicApp.includes('function _saReadClubRevenueCache'), 'public/app.js đồng bộ helper root cache');
assert(publicCache.includes("'income.total': stats.monthlyIncome"), 'public clubStatsAutoCache đồng bộ flat income.total');
assert(pkg.scripts['check:v5l-superadmin-revenue-cache-fallback'] === 'node tools/check-v5l-superadmin-revenue-cache-fallback.mjs', 'package.json có script check V5L');

if (process.exitCode) {
  console.error('\nPhase 4K-6V5L gate FAILED');
  process.exit(process.exitCode);
}
console.log('\n🎉 Phase 4K-6V5L gate passed');
