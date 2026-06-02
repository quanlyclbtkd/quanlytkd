/**
 * modules/students/index.js — Phase 3.3H
 * ────────────────────────────────────────────────────────────────
 * Students module entry point — barrel re-export.
 *
 * Phase 3.3H splits students.js (1114 lines) into focused sub-modules:
 *
 *   students.controller.js  — initStudents() + window.X delegation (core business)
 *   students.render.js      — Row rendering helpers, achievement list render
 *   students.search.js      — filterStudents(), search + filter logic
 *   students.pagination.js  — initStudentPagination(), cursor pagination (Phase 3.2A)
 *   students.modal.js       — Modal open/close, form population, profile edit
 *
 * Để tương thích ngược, file này re-export tất cả từ ../students.js.
 * Khi từng sub-module được tách hoàn toàn, swap import source ở đây.
 *
 * MIGRATION STATUS:
 * ┌────────────────────────────┬──────────────────────────────────┐
 * │ Sub-module                 │ Trạng thái                        │
 * ├────────────────────────────┼──────────────────────────────────┤
 * │ students.controller.js     │ 🚧 Stub (logic vẫn ở students.js) │
 * │ students.render.js         │ 🚧 Stub                           │
 * │ students.search.js         │ 🚧 Stub                           │
 * │ students.pagination.js     │ 🚧 Stub                           │
 * │ students.modal.js          │ 🚧 Stub                           │
 * └────────────────────────────┴──────────────────────────────────┘
 *
 * /// Phase 3.3H — Code Organization
 * ────────────────────────────────────────────────────────────────
 */

// Re-export tất cả từ file gốc để backward-compatible
export { initStudents, initStudentPagination } from '../students.js';
