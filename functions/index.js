/**
 * functions/index.js — Firebase Cloud Functions Entry Point
 * ─────────────────────────────────────────────────────────────────────
 * Taekwondo Club Management System — Phase 3 Backend
 *
 * Hai nhóm chính:
 *   1. debtCalculation  — Tính nợ học phí server-side, ghi flags vào profile
 *   2. statsAggregation — Tổng hợp thu/chi thời gian thực vào stats docs
 *
 * DEPLOY:
 *   firebase deploy --only functions
 *
 * REGION: asia-southeast1 (Singapore — gần Việt Nam nhất)
 * ─────────────────────────────────────────────────────────────────────
 */

const admin = require('firebase-admin');

// Khởi tạo Firebase Admin một lần duy nhất (singleton)
admin.initializeApp();

// ── Group 1: Debt Calculation ─────────────────────────────────────────
const debtCalc = require('./src/debtCalculation');

/**
 * Trigger khi profile võ sinh thay đổi
 * → Tính lại isOwed / owedMonths ngay lập tức
 */
exports.onProfileWriteDebt = debtCalc.onProfileWriteDebt;

/**
 * Trigger khi transaction học phí được thêm/xóa
 * → Tính lại nợ cho võ sinh đó
 */
exports.onTuitionTxWriteDebt = debtCalc.onTuitionTxWriteDebt;

/**
 * Chạy tự động lúc 6:00 SA mỗi ngày (giờ Việt Nam)
 * → Refresh debt flags cho TẤT CẢ võ sinh đang active
 * → Quan trọng: cập nhật khi tháng mới bắt đầu
 */
exports.scheduledDebtRecalculation = debtCalc.scheduledDebtRecalculation;

/**
 * Callable từ client: HLV/Admin gọi để tính lại nợ thủ công
 * Usage: firebase.functions().httpsCallable('recalcDebtForClub')({ clubId, month })
 */
exports.recalcDebtForClub = debtCalc.recalcDebtForClub;

// ── Group 2: Stats Aggregation ────────────────────────────────────────
const statsAgg = require('./src/statsAggregation');

/**
 * Trigger khi tạo giao dịch mới
 * → Cộng vào stats doc của tháng tương ứng
 */
exports.onTransactionCreate = statsAgg.onTransactionCreate;

/**
 * Trigger khi xóa giao dịch
 * → Trừ khỏi stats doc
 */
exports.onTransactionDelete = statsAgg.onTransactionDelete;

/**
 * Trigger khi sửa giao dịch
 * → Điều chỉnh stats (trừ cũ, cộng mới)
 */
exports.onTransactionUpdate = statsAgg.onTransactionUpdate;

/**
 * Callable từ client: Admin gọi để rebuild stats từ đầu
 * Dùng khi migrate data hoặc khi stats bị lệch
 * Usage: firebase.functions().httpsCallable('rebuildStatsForClub')({ clubId, year: 2026 })
 */
exports.rebuildStatsForClub = statsAgg.rebuildStatsForClub;
