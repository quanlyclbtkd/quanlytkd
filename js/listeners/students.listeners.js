/**
 * listeners/students.listeners.js — Phase 3.6 Listener Ownership Isolation
 * ────────────────────────────────────────────────────────────────
 * Stub lịch sử — lifecycle listener Students / Profiles đã migrate sang profiles.listeners.js (Phase 3.7B).
 *
 * TRẠNG THÁI PHASE 3.7B — MIGRATION COMPLETE:
 *   Profiles listener (onSnapshot(profRef,...) trong app.js) là GLOBAL listener
 *   nền tảng nhất của app — cung cấp allProfiles cho TẤT CẢ tab:
 *     - Tab Đang tập / Đã nghỉ (student list rendering)
 *     - Tab Điểm danh (danh sách võ sinh điểm danh)
 *     - Tab Thi đai (danh sách thi đai)
 *     - Tab Báo nợ (public nợ per student)
 *     - Tab Tổng quan (member count, branch stats)
 *
 *   Đã được đánh dấu owner: 'students', scope: 'global' trong app.js.
 *   Key: 'global:profiles:{clubId}'
 *
 *   CHƯA migrate sang tab-scoped vì:
 *   1. allProfiles là dữ liệu nền tảng — mọi tab đều phụ thuộc
 *   2. Attendance, exam, debt, dashboard đều đọc allProfiles
 *   3. Risk cực cao nếu chuyển sang tab-scoped: các tab khác mất data
 *
 *   Snapshot invalidation (đã implement trong app.js):
 *     profiles snapshot → invalidateStudents('profiles-snapshot')
 *                       → invalidateDashboard('profiles-snapshot')
 *
 * TODO Phase 3.6B: Migrate students listener ownership.
 *   Có thể split:
 *     - active-profiles listener (where status in ['active','trial']) → vẫn global
 *     - quit-student cache → lazy load khi vào tab Đã nghỉ
 *   Thay đổi này là Phase 3.4 query optimization, không chỉ là Phase 3.6.
 * ────────────────────────────────────────────────────────────────
 */

import { cleanupListenersByOwner } from '../utils/listeners.js';

// ─────────────────────────────────────────────────────────────────
// KEY BUILDER
// ─────────────────────────────────────────────────────────────────

/**
 * Key cho profiles listener.
 * @param {string} clubId
 * @returns {string}
 */
export function getProfilesListenerKey(clubId) {
    return `global:profiles:${clubId}`;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * Cleanup students listeners — gọi khi logout/club switch.
 * @param {string} [reason]
 */
export function cleanupStudentsListeners(reason = 'students-cleanup') {
    // TODO Phase 3.6B: migrate students listener ownership
    cleanupListenersByOwner('students', reason);
}

/**
 * Mount students listeners — STUB.
 * Hiện tại app.js xử lý qua onSnapshot(profRef,...).
 * @param {{ clubId?: string }} [context]
 */
export function mountStudentsListeners(context = {}) {
    // TODO Phase 3.6B: migrate students listener ownership
    // app.js onSnapshot(profRef,...) đang xử lý
    void context;
}
