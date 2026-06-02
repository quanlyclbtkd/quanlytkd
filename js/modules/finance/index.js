/**
 * modules/finance/index.js — Phase 3.3H
 * ────────────────────────────────────────────────────────────────
 * Finance module entry point — barrel re-export.
 *
 * Phase 3.3H splits finance.js (1387 lines) into focused sub-modules:
 *
 *   finance.controller.js  — initFinance() + window.X delegation (core logic)
 *   finance.pagination.js  — initTransactionPagination() (Phase 3.2A)
 *   finance.excel.js       — Excel export logic (openExcelExportModal, generateExcel)
 *   finance.receipt.js     — Receipt / QR code generation
 *   finance.zalo.js        — Zalo notification messages
 *
 * Để tương thích ngược, file này re-export tất cả từ ../finance.js.
 * Khi từng sub-module được tách hoàn toàn, swap import source ở đây.
 *
 * MIGRATION STATUS:
 * ┌────────────────────────────┬──────────────────────────────────┐
 * │ Sub-module                 │ Trạng thái                        │
 * ├────────────────────────────┼──────────────────────────────────┤
 * │ finance.controller.js      │ 🚧 Stub (logic vẫn ở finance.js)  │
 * │ finance.pagination.js      │ 🚧 Stub                           │
 * │ finance.excel.js           │ 🚧 Stub                           │
 * │ finance.receipt.js         │ 🚧 Stub                           │
 * │ finance.zalo.js            │ 🚧 Stub                           │
 * └────────────────────────────┴──────────────────────────────────┘
 *
 * /// Phase 3.3H — Code Organization
 * ────────────────────────────────────────────────────────────────
 */

export { initFinance, initTransactionPagination } from '../finance.js';
