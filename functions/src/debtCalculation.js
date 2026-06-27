/**
 * functions/src/debtCalculation.js — Phase 3: Tính Nợ Học Phí Server-Side
 * ─────────────────────────────────────────────────────────────────────────
 *
 * TẠI SAO CẦN CLOUD FUNCTIONS CHO TÍNH NỢ?
 * ──────────────────────────────────────────
 * Client-side hiện tại (render.js):
 *   1. Load TOÀN BỘ profiles vào RAM (10.000 võ sinh = ~10MB JSON)
 *   2. Loop tất cả để tính owedMonths từng người
 *   3. Kết quả: chậm, tốn băng thông, không scale được
 *
 * Cloud Functions thay thế:
 *   1. Trigger khi profile thay đổi → tính ngay, ghi isOwed/owedMonths vào doc
 *   2. Client chỉ cần: WHERE('isOwed', '==', true) → trả về đúng người nợ
 *   3. Kết quả: O(1) từ client, scale vô hạn
 *
 * DATA ĐƯỢC GHI VÀO PROFILE:
 * ───────────────────────────
 * {
 *   isOwed:     boolean,    // true nếu đang nợ (tháng hiện tại)
 *   owedMonths: string[],   // ['2026-03', '2026-04', '2026-05']
 *   owedCount:  number,     // 3 (số tháng nợ)
 *   debtCalcAt: Timestamp,  // Thời điểm Cloud Function tính gần nhất
 * }
 *
 * TRIGGERS:
 * ─────────
 * 1. onProfileWriteDebt       — Khi paidUntil/skippedMonths/status thay đổi
 * 2. onTuitionTxWriteDebt     — Khi transaction học phí được thêm/xóa
 * 3. scheduledDebtRecalculation — Mỗi ngày 6:00 SA (VN) → refresh tất cả
 * 4. recalcDebtForClub        — Callable: admin gọi thủ công
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

const functions = require('firebase-functions');
const { requireClubAdmin } = require('./authz');
const admin     = require('firebase-admin');

const { calcDebt, getCurrentMonthVN } = require('./helpers');

const db = admin.firestore();

// ════════════════════════════════════════════════════════════════
// TRIGGER 1: onProfileWriteDebt
// Khi profile võ sinh được ghi (tạo mới / cập nhật) → tính lại nợ ngay
// ════════════════════════════════════════════════════════════════

exports.onProfileWriteDebt = functions
    .region('asia-southeast1')
    .firestore
    .document('clubs/{clubId}/profiles/{studentId}')
    .onWrite(async (change, context) => {

        // Profile bị XÓA → không cần tính nợ
        if (!change.after.exists) return null;

        const newData = change.after.data();
        const oldData = change.before.exists ? change.before.data() : {};

        // Chỉ tính lại khi các field LIÊN QUAN đến nợ thay đổi.
        // Tránh vòng lặp vô hạn: khi chính hàm này ghi isOwed/owedMonths,
        // trigger sẽ kích lại — nhưng không có field nào trong danh sách dưới thay đổi
        // nên sẽ return null ngay.
        const relevantFields = [
            'paidUntil', 'paidMonths', 'skippedMonths',
            'status', 'feeExempt', 'createdAt', 'tuitionFee',
        ];
        const hasRelevantChange = relevantFields.some(f =>
            JSON.stringify(newData[f]) !== JSON.stringify(oldData[f])
        );
        if (!hasRelevantChange) return null;

        const currentMonth = getCurrentMonthVN();
        const debtInfo     = calcDebt(newData, currentMonth);

        // Ghi debt flags vào profile — chỉ 4 fields, không ghi đè data khác
        return change.after.ref.update({
            isOwed:     debtInfo.isOwed,
            owedMonths: debtInfo.owedMonths,
            owedCount:  debtInfo.owedCount,
            debtCalcAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

// ════════════════════════════════════════════════════════════════
// TRIGGER 2: onTuitionTxWriteDebt
// Khi transaction học phí được thêm / xóa → tính lại nợ cho võ sinh đó
//
// VÍ DỤ: HLV xóa giao dịch học phí tháng 5 → võ sinh đó trở lại nợ tháng 5
// ════════════════════════════════════════════════════════════════

exports.onTuitionTxWriteDebt = functions
    .region('asia-southeast1')
    .firestore
    .document('clubs/{clubId}/transactions/{txId}')
    .onWrite(async (change, context) => {
        const { clubId } = context.params;

        // Lấy data của bản ghi còn tồn tại (sau khi tạo hoặc trước khi xóa)
        const data = change.after.exists ? change.after.data() : change.before.data();

        // Chỉ quan tâm giao dịch học phí — bỏ qua các loại khác
        const isTuition = data && (
            data.type === 'Học phí' ||
            data.type === 'Học phí + Lệ phí thi'
        );
        if (!isTuition) return null;

        const studentName = (data.description || '').trim();
        if (!studentName) return null;

        // Lấy profile mới nhất từ Firestore (không dùng cache cũ)
        const profRef  = db.doc(`clubs/${clubId}/profiles/${studentName}`);
        const profSnap = await profRef.get();
        if (!profSnap.exists) return null;

        const currentMonth = getCurrentMonthVN();
        const debtInfo     = calcDebt(profSnap.data(), currentMonth);

        return profRef.update({
            isOwed:     debtInfo.isOwed,
            owedMonths: debtInfo.owedMonths,
            owedCount:  debtInfo.owedCount,
            debtCalcAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

// ════════════════════════════════════════════════════════════════
// TRIGGER 3: scheduledDebtRecalculation
// Chạy tự động lúc 6:00 SA mỗi ngày (giờ Việt Nam = 23:00 UTC hôm trước)
//
// TẠI SAO CẦN SCHEDULED JOB?
// Khi bước sang tháng mới (ví dụ: ngày 01/06/2026), các võ sinh đã đóng
// đủ tới tháng 5 sẽ BẮT ĐẦU NỢ tháng 6, nhưng không có trigger nào kích
// vì profile không thay đổi. Scheduled job xử lý trường hợp này.
// ════════════════════════════════════════════════════════════════

exports.scheduledDebtRecalculation = functions
    .region('asia-southeast1')
    .pubsub
    // Cron: 0 23 * * * = mỗi ngày lúc 23:00 UTC = 6:00 AM VN (UTC+7)
    .schedule('0 23 * * *')
    .timeZone('UTC')
    .onRun(async () => {
        const currentMonth = getCurrentMonthVN();
        functions.logger.info(`[scheduledDebtRecalc] Bắt đầu tính nợ cho tháng ${currentMonth}`);

        // Lấy tất cả clubs
        const clubsSnap = await db.collection('clubs').get();

        let totalUpdated  = 0;
        let totalProfiles = 0;

        for (const clubDoc of clubsSnap.docs) {
            const clubId = clubDoc.id;

            // Chỉ quét ACTIVE profiles — không cần quét toàn bộ 10.000 người nghỉ
            const profilesSnap = await db
                .collection(`clubs/${clubId}/profiles`)
                .where('status', '==', 'active')
                .get();

            // Dùng batch writes để giảm số lần round-trip (500 ops/batch)
            const BATCH_SIZE = 400;
            let batch        = db.batch();
            let opsInBatch   = 0;

            for (const profDoc of profilesSnap.docs) {
                totalProfiles++;
                const profile  = profDoc.data();
                const debtInfo = calcDebt(profile, currentMonth);

                // Chỉ update nếu có thay đổi — tránh ghi không cần thiết
                const needsUpdate =
                    profile.isOwed     !== debtInfo.isOwed     ||
                    profile.owedCount  !== debtInfo.owedCount   ||
                    JSON.stringify(profile.owedMonths || []) !== JSON.stringify(debtInfo.owedMonths);

                if (needsUpdate) {
                    batch.update(profDoc.ref, {
                        isOwed:     debtInfo.isOwed,
                        owedMonths: debtInfo.owedMonths,
                        owedCount:  debtInfo.owedCount,
                        debtCalcAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    opsInBatch++;
                    totalUpdated++;
                }

                // Commit batch khi đầy
                if (opsInBatch >= BATCH_SIZE) {
                    await batch.commit();
                    batch      = db.batch();
                    opsInBatch = 0;
                }
            }

            // Commit phần còn lại
            if (opsInBatch > 0) await batch.commit();
        }

        functions.logger.info(
            `[scheduledDebtRecalc] ✅ Hoàn thành: ${totalUpdated}/${totalProfiles} profiles được cập nhật cho tháng ${currentMonth}`
        );
        return null;
    });

// ════════════════════════════════════════════════════════════════
// CALLABLE: recalcDebtForClub
// Chỉ Admin/SuperAdmin gọi thủ công để refresh debt flags ngay lập tức
//
// Client side gọi:
//   const fn = firebase.functions().httpsCallable('recalcDebtForClub');
//   const result = await fn({ clubId: 'abc123', month: '2026-05' });
//   console.log(result.data.debtors); // Danh sách võ sinh đang nợ
// ════════════════════════════════════════════════════════════════

exports.recalcDebtForClub = functions
    .region('asia-southeast1')
    .runWith({ timeoutSeconds: 300, memory: '512MB' })
    .https
    .onCall(async (data, context) => {

        // Bắt buộc phải đăng nhập
        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'Bạn chưa đăng nhập!'
            );
        }

        const { clubId, month } = data;
        const currentMonth = month || getCurrentMonthVN();

        if (!clubId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Thiếu tham số clubId!'
            );
        }

        // Phase 4K-6V4B: callable này đọc/ghi toàn bộ hồ sơ nợ của CLB,
        // vì vậy Coach/Viewer không được phép gọi dù cùng clubId.
        await requireClubAdmin({ db, functions, context, clubId });

        // Query chỉ active profiles
        const profilesSnap = await db
            .collection(`clubs/${clubId}/profiles`)
            .where('status', '==', 'active')
            .get();

        const debtors    = [];
        const BATCH_SIZE = 400;
        let batch        = db.batch();
        let opsInBatch   = 0;
        let totalUpdated = 0;

        for (const profDoc of profilesSnap.docs) {
            const profile  = profDoc.data();
            const debtInfo = calcDebt(profile, currentMonth);

            batch.update(profDoc.ref, {
                isOwed:     debtInfo.isOwed,
                owedMonths: debtInfo.owedMonths,
                owedCount:  debtInfo.owedCount,
                debtCalcAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            opsInBatch++;
            totalUpdated++;

            // Thu thập danh sách người nợ để trả về client
            if (debtInfo.isOwed) {
                debtors.push({
                    id:        profDoc.id,
                    name:      profDoc.id,
                    owedMonths: debtInfo.owedMonths,
                    owedCount:  debtInfo.owedCount,
                    tuitionFee: Number(profile.tuitionFee) || 0,
                    branch:    profile.branch || 'CS1',
                    phone:     profile.phone  || '',
                });
            }

            if (opsInBatch >= BATCH_SIZE) {
                await batch.commit();
                batch      = db.batch();
                opsInBatch = 0;
            }
        }

        if (opsInBatch > 0) await batch.commit();

        functions.logger.info(
            `[recalcDebtForClub] Club=${clubId}, Month=${currentMonth}, ` +
            `Updated=${totalUpdated}, Debtors=${debtors.length}`
        );

        // Trả về kết quả cho client để hiển thị ngay mà không cần reload
        return {
            month:        currentMonth,
            totalActive:  profilesSnap.size,
            totalDebtors: debtors.length,
            totalUpdated,
            debtors,
        };
    });
