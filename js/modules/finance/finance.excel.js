/**
 * modules/finance/finance.excel.js — Phase 3.3H (Stub)
 * ────────────────────────────────────────────────────────────────
 * Khi hoàn tất tách, file này sẽ chứa toàn bộ Excel export logic:
 *
 *   openExcelExportModal()       — Mở modal chọn kỳ xuất
 *   generateExcel(period)        — Xuất file .xlsx với xlsx-js-style
 *   generateTaxExcel(period)     — Xuất báo cáo thuế TNCN
 *   updateExcelPeriodOptions()   — Cập nhật dropdown kỳ báo cáo
 *   exportStudentList()          — Xuất danh sách võ sinh
 *
 * ĐÂY LÀ LÝ DO NÊN TÁCH RIÊNG:
 *   • Excel export chỉ chạy khi Admin bấm nút — HIẾM KHI DÙNG
 *   • xlsx-js-style là thư viện nặng (đã load qua CDN)
 *   • Với lazy loading (Phase 3.3C), file này có thể import() khi cần:
 *
 *   // Trong main.js hoặc finance.controller.js:
 *   window.openExcelExportModal = async () => {
 *       const { openExcelExportModal } = await import('./finance.excel.js');
 *       openExcelExportModal();
 *   };
 *
 * NGUỒN: app.js Excel export section (lines ~4500–5500 approx)
 *
 * STATUS: 🚧 Stub — logic vẫn trong app.js
 *
 * /// Phase 3.3H — Code Organization
 * /// Phase 3.3C — Lazy Loading candidate
 * ────────────────────────────────────────────────────────────────
 */

export const __stub__ = 'finance.excel — Phase 3.3H stub';
