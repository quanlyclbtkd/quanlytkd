/**
 * functions/src/statsAggregation.js — Phase 3: Thống Kê Tài Chính Thời Gian Thực
 * ───────────────────────────────────────────────────────────────────────────────
 *
 * TẠI SAO CẦN CLOUD FUNCTIONS CHO THỐNG KÊ?
 * ───────────────────────────────────────────
 * Client hiện tại (render.js):
 *   1. Load TẤT CẢ transactions của tháng (có thể 5.000+ giao dịch/tháng)
 *   2. Loop để cộng dồn: incTuition += t.amount, ...
 *   3. Với 10.000 võ sinh → có thể 100.000+ giao dịch/năm → KHÔNG thể load hết
 *
 * Cloud Functions thay thế:
 *   1. Trigger khi có giao dịch mới → cập nhật FieldValue.increment() vào 1 doc
 *   2. Doc: clubs/{clubId}/stats/{YYYY_MM}  (ví dụ: stats/2026_05)
 *   3. Client chỉ cần đọc 1 doc duy nhất để vẽ dashboard chart
 *
 * FORMAT STATS DOC (clubs/{clubId}/stats/YYYY_MM):
 * ──────────────────────────────────────────────────
 * {
 *   month:           'YYYY-MM',         // Tháng, ví dụ: '2026-05'
 *   income: {
 *     tuition:       number,            // Tổng học phí
 *     exam:          number,            // Tổng lệ phí thi
 *     other:         number,            // Thu khác
 *     uniform:       number,            // Thu võ phục
 *     total:         number,            // Tổng thu
 *   },
 *   expense: {
 *     operations:    number,            // Chi phí hoạt động
 *     exam:          number,            // Chi phí kỳ thi
 *     uniform:       number,            // Chi nhập võ phục
 *     total:         number,            // Tổng chi
 *   },
 *   profit:          number,            // Lợi nhuận = tổng thu - tổng chi
 *   txCount:         number,            // Số giao dịch trong tháng
 *   updatedAt:       Timestamp,         // Lần cập nhật gần nhất
 * }
 *
 * TRIGGERS:
 * ─────────
 * 1. onTransactionCreate — Cộng giao dịch mới vào stats
 * 2. onTransactionDelete — Trừ giao dịch đã xóa khỏi stats
 * 3. onTransactionUpdate — Điều chỉnh (trừ cũ + cộng mới)
 * 4. rebuildStatsForClub — Callable: rebuild stats từ đầu (dùng khi migrate)
 *
 * ───────────────────────────────────────────────────────────────────────────────
 */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

const { getTxMonth, classifyTx } = require('./helpers');

const db = admin.firestore();

// ════════════════════════════════════════════════════════════════
// HELPER: Cập nhật stats doc cho một tháng
// multiplier: +1 khi tạo mới, -1 khi xóa
// ════════════════════════════════════════════════════════════════

async function updateStats(clubId, month, tx, multiplier) {
    if (!month || !clubId || !tx) return null;

    // Stats doc ID: '2026-05' → '2026_05' (Firestore không chứa '-' trong doc ID tốt)
    const docId    = month.replace('-', '_');
    const statsRef = db.doc(`clubs/${clubId}/stats/${docId}`);

    // Phân loại giao dịch
    const classified = classifyTx(tx);
    if (!classified) return null; // Loại không tính vào stats

    // Chuẩn hóa thành mảng entries
    const entries = Array.isArray(classified) ? classified : [classified];

    // Tính delta cho income và expense riêng (tránh double-count profit)
    let incDelta = 0;
    let expDelta = 0;

    const update = {
        month,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        txCount:   admin.firestore.FieldValue.increment(multiplier),
    };

    for (const entry of entries) {
        if (!entry || !entry.field || typeof entry.value !== 'number') continue;

        update[entry.field] = admin.firestore.FieldValue.increment(
            entry.value * multiplier
        );

        if (entry.field.startsWith('income'))  incDelta += entry.value * multiplier;
        if (entry.field.startsWith('expense')) expDelta += entry.value * multiplier;
    }

    // Cộng dồn totals và profit
    if (incDelta !== 0) {
        update['income.total'] = admin.firestore.FieldValue.increment(incDelta);
    }
    if (expDelta !== 0) {
        update['expense.total'] = admin.firestore.FieldValue.increment(expDelta);
    }
    // Profit = thu - chi
    const profitDelta = incDelta - expDelta;
    if (profitDelta !== 0) {
        update['profit'] = admin.firestore.FieldValue.increment(profitDelta);
    }

    // set + merge: true → tạo doc nếu chưa tồn tại, chỉ cập nhật fields đã có
    return statsRef.set(update, { merge: true });
}

// ════════════════════════════════════════════════════════════════
// TRIGGER 1: onTransactionCreate
// Khi thêm giao dịch mới → cộng vào stats
// ════════════════════════════════════════════════════════════════

exports.onTransactionCreate = functions
    .region('asia-southeast1')
    .firestore
    .document('clubs/{clubId}/transactions/{txId}')
    .onCreate(async (snap, context) => {
        const { clubId } = context.params;
        const tx         = snap.data();
        const month      = getTxMonth(tx);

        if (!month) return null;
        return updateStats(clubId, month, tx, +1);
    });

// ════════════════════════════════════════════════════════════════
// TRIGGER 2: onTransactionDelete
// Khi xóa giao dịch → trừ khỏi stats
// ════════════════════════════════════════════════════════════════

exports.onTransactionDelete = functions
    .region('asia-southeast1')
    .firestore
    .document('clubs/{clubId}/transactions/{txId}')
    .onDelete(async (snap, context) => {
        const { clubId } = context.params;
        const tx         = snap.data();
        const month      = getTxMonth(tx);

        if (!month) return null;
        return updateStats(clubId, month, tx, -1);
    });

// ════════════════════════════════════════════════════════════════
// TRIGGER 3: onTransactionUpdate
// Khi sửa giao dịch → trừ cái cũ, cộng cái mới
// QUAN TRỌNG: Cần xử lý trường hợp txMonth thay đổi (ít gặp nhưng có thể xảy ra)
// ════════════════════════════════════════════════════════════════

exports.onTransactionUpdate = functions
    .region('asia-southeast1')
    .firestore
    .document('clubs/{clubId}/transactions/{txId}')
    .onUpdate(async (change, context) => {
        const { clubId } = context.params;
        const before     = change.before.data();
        const after      = change.after.data();

        const monthBefore = getTxMonth(before);
        const monthAfter  = getTxMonth(after);

        // Trừ phiên bản cũ
        if (monthBefore) await updateStats(clubId, monthBefore, before, -1);
        // Cộng phiên bản mới
        if (monthAfter)  await updateStats(clubId, monthAfter,  after,  +1);

        return null;
    });

// ════════════════════════════════════════════════════════════════
// CALLABLE: rebuildStatsForClub
// Admin gọi để rebuild toàn bộ stats từ giao dịch gốc
//
// DÙNG KHI:
//   - Migrate data từ phiên bản cũ (lần đầu deploy Cloud Functions)
//   - Stats bị lệch vì trigger lỗi trong quá khứ
//   - Kiểm tra tính nhất quán dữ liệu
//
// Client side gọi:
//   const fn = firebase.functions().httpsCallable('rebuildStatsForClub');
//   const result = await fn({ clubId: 'abc123', year: 2026 });
//   console.log(`Rebuilt ${result.data.rebuilt} months`);
// ════════════════════════════════════════════════════════════════

exports.rebuildStatsForClub = functions
    .region('asia-southeast1')
    .runWith({
        timeoutSeconds: 540,  // 9 phút (max 9 phút cho HTTP callable)
        memory:         '1GB',
    })
    .https
    .onCall(async (data, context) => {

        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'Bạn chưa đăng nhập!'
            );
        }

        const { clubId, year } = data;
        if (!clubId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Thiếu tham số clubId!'
            );
        }

        // Kiểm tra quyền
        const userDoc  = await db.doc(`users/${context.auth.uid}`).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const isSuperAdmin = context.auth.token.email === 'admin@tstquynhon.com';

        if (!isSuperAdmin && userData.clubId !== clubId) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Bạn không có quyền truy cập câu lạc bộ này!'
            );
        }

        const yearStr = String(year || new Date().getFullYear());

        functions.logger.info(
            `[rebuildStatsForClub] Bắt đầu rebuild: Club=${clubId}, Year=${yearStr}`
        );

        // Bước 1: Xóa stats docs cũ của năm đó để rebuild sạch
        const statsSnap = await db.collection(`clubs/${clubId}/stats`).get();
        const deleteOps = statsSnap.docs
            .filter(d => d.id.startsWith(yearStr))
            .map(d => d.ref.delete());
        if (deleteOps.length > 0) {
            await Promise.all(deleteOps);
            functions.logger.info(`[rebuildStatsForClub] Đã xóa ${deleteOps.length} stats docs cũ`);
        }

        // Bước 2: Lấy transactions theo pagination để tránh timeout với CLB lớn
        // [Phase 4K-FIX Lỗi 5] Dùng cursor pagination thay vì get() toàn bộ
        // [Phase 4K-FIX Lỗi 6] txCount chỉ tăng cho transaction hợp lệ (classifyTx != null)
        // — đồng nhất với trigger onTransactionCreate/Update/Delete
        const REBUILD_PAGE_SIZE = 400; // batch 400 docs/lần — an toàn với RAM và timeout
        const MAX_PAGES = 500;         // guard chống loop vô hạn (tối đa 200.000 tx)

        let txBaseQuery = db.collection(`clubs/${clubId}/transactions`);
        if (year) {
            txBaseQuery = txBaseQuery
                .where('txMonth', '>=', `${yearStr}-01`)
                .where('txMonth', '<=', `${yearStr}-12`);
        }
        // Cần orderBy để startAfter hoạt động đúng
        txBaseQuery = txBaseQuery.orderBy('txMonth');

        const statsByMonth = {};
        let lastDoc         = null;
        let totalTxRead     = 0;
        let totalTxValid    = 0; // số tx hợp lệ (classifyTx != null)
        let pageCount       = 0;

        functions.logger.info(`[rebuildStatsForClub] Bắt đầu pagination rebuild: Club=${clubId}, Year=${yearStr}, pageSize=${REBUILD_PAGE_SIZE}`);

        while (pageCount < MAX_PAGES) {
            let pageQuery = txBaseQuery.limit(REBUILD_PAGE_SIZE);
            if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);

            const snap = await pageQuery.get();
            if (snap.empty) break;

            totalTxRead += snap.size;
            pageCount++;

            for (const txDoc of snap.docs) {
                const tx    = txDoc.data();
                const month = getTxMonth(tx);
                if (!month) continue;

                if (!statsByMonth[month]) {
                    statsByMonth[month] = {
                        month,
                        'income.tuition':    0,
                        'income.exam':       0,
                        'income.other':      0,
                        'income.uniform':    0,
                        'income.total':      0,
                        'expense.operations':0,
                        'expense.exam':      0,
                        'expense.uniform':   0,
                        'expense.total':     0,
                        profit:              0,
                        // [Phase 4K-FIX Lỗi 6] txCount = số GD hợp lệ (classifyTx != null)
                        // Đồng nhất với trigger: updateStats() chỉ tăng txCount khi classifyTx != null
                        txCount: 0,
                    };
                }

                // [Phase 4K-FIX Lỗi 6] Phân loại TRƯỚC, tăng txCount SAU — đồng nhất với trigger
                const classified = classifyTx(tx);
                if (!classified) continue; // bỏ qua TX loại không tính stats (Tặng Võ phục, ...)

                const s       = statsByMonth[month];
                s.txCount++;   // chỉ tăng cho TX hợp lệ — khớp với trigger behavior
                totalTxValid++;

                const entries = Array.isArray(classified) ? classified : [classified];
                for (const entry of entries) {
                    if (!entry || !entry.field) continue;
                    if (s[entry.field] === undefined) s[entry.field] = 0;
                    s[entry.field] += entry.value;

                    if (entry.field.startsWith('income')) {
                        s['income.total'] += entry.value;
                        s.profit           += entry.value;
                    }
                    if (entry.field.startsWith('expense')) {
                        s['expense.total'] += entry.value;
                        s.profit           -= entry.value;
                    }
                }
            }

            lastDoc = snap.docs[snap.docs.length - 1];
            if (snap.size < REBUILD_PAGE_SIZE) break; // trang cuối
        }

        functions.logger.info(`[rebuildStatsForClub] Đọc xong: ${totalTxRead} GD tổng / ${totalTxValid} GD hợp lệ / ${pageCount} trang`);

        // Bước 4: Ghi tất cả stats docs
        const writes = Object.entries(statsByMonth).map(([month, statsData]) => {
            const docId = month.replace('-', '_');
            return db.doc(`clubs/${clubId}/stats/${docId}`).set({
                ...statsData,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        await Promise.all(writes);

        const result = {
            rebuilt:     Object.keys(statsByMonth).length,
            months:      Object.keys(statsByMonth).sort(),
            totalTx:     totalTxRead,   // tổng TX đọc (paginated)
            totalValid:  totalTxValid,  // TX hợp lệ (classifyTx != null)
            pages:       pageCount,
            yearStr,
        };

        functions.logger.info(
            `[rebuildStatsForClub] ✅ Hoàn thành: ${result.rebuilt} tháng, ${result.totalTx} giao dịch`
        );

        return result;
    });
