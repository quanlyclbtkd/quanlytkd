/**
 * tools/rebuild-transaction-stats.mjs — Phase 4K-FIX
 * ─────────────────────────────────────────────────────────────────────
 * Tool hỗ trợ rebuild stats docs cho transactions.
 *
 * CÁCH CHẠY:
 *   Script này KHÔNG tự chạy khi app load.
 *   Chỉ chạy thủ công bởi developer/admin khi cần rebuild stats.
 *
 * CÁCH DÙNG:
 *   Script này in hướng dẫn gọi rebuildStatsForClub() Callable Function
 *   từ browser DevTools console — không cần deploy thêm code.
 *
 *   rebuildStatsForClub là Callable Function đã deploy trong functions/index.js
 *   → Admin gọi trực tiếp từ client (browser), không cần tool thêm trên server.
 *
 * CÁC THAM SỐ HỖ TRỢ:
 *   --clubId <id>     Chỉ rebuild cho 1 CLB cụ thể
 *   --month  <YYYY>   Chỉ rebuild cho năm cụ thể (VD: 2026)
 *   --dry             Chế độ thử — chỉ in hướng dẫn, không ghi gì
 *   --all             Hướng dẫn rebuild tất cả CLB (cần thực hiện thủ công từng CLB)
 *
 * VÍ DỤ:
 *   node tools/rebuild-transaction-stats.mjs --clubId abc123 --month 2026
 *   node tools/rebuild-transaction-stats.mjs --dry
 *   node tools/rebuild-transaction-stats.mjs --all
 *
 * [Phase 4K-FIX Lỗi 5+6+7] CẬP NHẬT:
 *   - rebuildStatsForClub bây giờ dùng cursor pagination (batch 400 docs/lần)
 *     → không đọc toàn bộ transactions một lần → không timeout với CLB lớn
 *   - txCount định nghĩa nhất quán: chỉ đếm GD có classifyTx() != null
 *     → đồng nhất giữa trigger và rebuild
 *   - Field doanh thu: income.total (nested) — tương thích dashboard và SuperAdmin
 *   - Log: totalTx (tổng đọc), totalValid (GD hợp lệ), pages (số batch)
 *
 * QUAN TRỌNG:
 *   - KHÔNG deploy Firebase trong phase này
 *   - KHÔNG chạy tool này trên production data mà không kiểm tra kỹ
 *   - Nên chạy --dry trước để xem lệnh sẽ chạy gì
 *   - rebuildStatsForClub xóa stats cũ rồi rebuild — không thể rollback ngay
 *   - Chỉ dùng khi stats bị lệch hoặc migrate data từ version cũ
 * ─────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

// ── Parse CLI args ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const clubIdArg = args[args.indexOf('--clubId') + 1] || null;
const monthArg  = args[args.indexOf('--month')  + 1] || null;
const isDry     = args.includes('--dry') || args.includes('--dry-run');
const isAll     = args.includes('--all');

// ── Header ───────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  Phase 4K — Rebuild Transaction Stats Tool');
console.log('══════════════════════════════════════════════════════════');
console.log('  MODE: ' + (isDry ? 'DRY-RUN (chỉ in hướng dẫn)' : isAll ? 'ALL CLUBS GUIDE' : clubIdArg ? 'SINGLE CLUB: ' + clubIdArg : 'INFO'));
console.log('══════════════════════════════════════════════════════════\n');

// ── Verify Cloud Function exists ─────────────────────────────────────
const fnIndex = existsSync(resolve(root, 'functions/index.js'))
    ? readFileSync(resolve(root, 'functions/index.js'), 'utf8')
    : null;
const fnStats = existsSync(resolve(root, 'functions/src/statsAggregation.js'))
    ? readFileSync(resolve(root, 'functions/src/statsAggregation.js'), 'utf8')
    : null;

if (!fnIndex || !fnIndex.includes('rebuildStatsForClub')) {
    console.error('❌ rebuildStatsForClub không được export trong functions/index.js!');
    console.error('   Thêm: exports.rebuildStatsForClub = statsAgg.rebuildStatsForClub;');
    process.exit(1);
}
if (!fnStats || !fnStats.includes('rebuildStatsForClub')) {
    console.error('❌ rebuildStatsForClub chưa được implement trong functions/src/statsAggregation.js!');
    process.exit(1);
}

console.log('✅ rebuildStatsForClub Callable Function đã được define trong functions/');
console.log('');

// ── Stats path info ──────────────────────────────────────────────────
console.log('📁 STATS DOC PATH:');
console.log('   clubs/{clubId}/stats/{YYYY_MM}');
console.log('   VD: clubs/abc123/stats/2026_05');
console.log('   (Doc ID dùng underscore thay dấu gạch ngang)');
console.log('');

// ── How to call from browser ─────────────────────────────────────────
const yearArg = monthArg || new Date().getFullYear().toString();

if (isDry) {
    console.log('🔍 DRY-RUN MODE — Không thực hiện gì. Dưới đây là lệnh sẽ chạy:');
    console.log('');
}

console.log('══════════════════════════════════════════════════════════');
console.log('  CÁCH REBUILD STATS TỪ BROWSER DEVTOOLS CONSOLE');
console.log('══════════════════════════════════════════════════════════');
console.log('');
console.log('Bước 1: Đăng nhập với tài khoản SuperAdmin vào app');
console.log('Bước 2: Mở Browser DevTools → Console');
console.log('Bước 3: Chạy lệnh sau:');
console.log('');

if (clubIdArg) {
    console.log('// Rebuild cho CLB cụ thể: ' + clubIdArg);
    console.log('const fn = window._fb_init?.httpsCallable?.(window.__store?.functions, "rebuildStatsForClub");');
    console.log('// Hoặc nếu dùng Firebase SDK v8 compat:');
    console.log('// const fn = firebase.functions().httpsCallable("rebuildStatsForClub");');
    console.log('');
    console.log('const result = await fn({');
    console.log('  clubId: "' + clubIdArg + '",');
    console.log('  year:   ' + yearArg);
    console.log('});');
    console.log('console.log("✅ Rebuilt:", result.data);');
    console.log('// → result.data = { rebuilt: N, months: [...], totalTx: N }');
} else if (isAll) {
    console.log('// Rebuild cho TẤT CẢ CLB (chạy từng CLB một):');
    console.log('// Thay "CLUB_ID_1", "CLUB_ID_2", ... bằng ID thực của các CLB');
    console.log('');
    console.log('const clubIds = ["CLUB_ID_1", "CLUB_ID_2"]; // <-- cập nhật danh sách');
    console.log('const year = ' + yearArg + ';');
    console.log('');
    console.log('for (const clubId of clubIds) {');
    console.log('  console.log("Rebuilding", clubId, "...");');
    console.log('  try {');
    console.log('    const fn = window._fb_init?.httpsCallable?.(window.__store?.functions, "rebuildStatsForClub");');
    console.log('    const result = await fn({ clubId, year });');
    console.log('    console.log("✅", clubId, "→", result.data.rebuilt, "tháng,", result.data.totalTx, "giao dịch");');
    console.log('  } catch(e) {');
    console.log('    console.error("❌", clubId, e.message);');
    console.log('  }');
    console.log('}');
    console.log('console.log("Hoàn thành rebuild tất cả CLB");');
} else {
    console.log('// Thay CLUB_ID bằng ID thực của CLB cần rebuild');
    console.log('const fn = window._fb_init?.httpsCallable?.(window.__store?.functions, "rebuildStatsForClub");');
    console.log('// Hoặc nếu dùng Firebase SDK v8 compat:');
    console.log('// const fn = firebase.functions().httpsCallable("rebuildStatsForClub");');
    console.log('');
    console.log('const result = await fn({');
    console.log('  clubId: "CLUB_ID",    // <-- thay bằng ID CLB');
    console.log('  year:   ' + yearArg + '          // <-- năm cần rebuild');
    console.log('});');
    console.log('console.log("✅ Rebuilt:", result.data);');
}

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  KIỂM TRA SAU KHI REBUILD');
console.log('══════════════════════════════════════════════════════════');
console.log('');
console.log('// Kiểm tra stats doc đã được tạo:');
console.log('const { getDoc, doc } = window._fb_init;');
console.log('const db = window.__store.db;');
console.log('const month = "2026_05"; // <-- thay bằng tháng cần kiểm tra');
console.log('const snap = await getDoc(doc(db, "clubs", "CLUB_ID", "stats", month));');
console.log('console.log(snap.exists() ? snap.data() : "Stats doc chưa tồn tại");');
console.log('');
console.log('// Kiểm tra metrics:');
console.log('window.printTxListenerMetrics?.();');
console.log('window.printReadScaleMetrics?.();');
console.log('');
console.log('// Xác nhận kết quả rebuild có pagination:');
console.log('// result.data.totalTx   = tổng TX đọc (paginated)');
console.log('// result.data.totalValid = TX hợp lệ (classifyTx != null)');
console.log('// result.data.pages     = số batch đã đọc (batch size = 400)');
console.log('// result.data.rebuilt   = số stats doc đã ghi');
console.log('');

// ── Warnings ─────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════════');
console.log('  LƯU Ý QUAN TRỌNG');
console.log('══════════════════════════════════════════════════════════');
console.log('');
console.log('⚠️  rebuildStatsForClub XÓA stats cũ rồi rebuild từ đầu.');
console.log('   → KHÔNG thể rollback ngay nếu ghi sai.');
console.log('   → Chạy trên 1 CLB test trước khi rebuild tất cả.');
console.log('');
console.log('⚠️  Cloud Function giới hạn 9 phút timeout (540 giây).');
console.log('   → CLB có >10.000 giao dịch/năm có thể cần split rebuild theo quý.');
console.log('');
console.log('⚠️  Cần quyền SuperAdmin (email admin@tstquynhon.com) hoặc');
console.log('   là admin của CLB đó mới gọi được callable.');
console.log('');
console.log('⚠️  Sau rebuild, F5 lại app để dashboard load stats mới.');
console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  KỊCH BẢN SỬ DỤNG');
console.log('══════════════════════════════════════════════════════════');
console.log('');
console.log('1. Lần đầu deploy Cloud Functions (chưa có stats docs):');
console.log('   → Rebuild ALL để có stats cho các tháng lịch sử');
console.log('');
console.log('2. Stats bị lệch (dashboard hiện sai số):');
console.log('   → Rebuild CLB cụ thể cho năm bị sai');
console.log('');
console.log('3. Migrate data từ version cũ (thiếu txMonth field):');
console.log('   → Update transactions để có txMonth trước, rồi rebuild');
console.log('');
console.log('══════════════════════════════════════════════════════════\n');

if (isDry) {
    console.log('✅ DRY-RUN hoàn thành. Không có gì bị thay đổi.\n');
}
