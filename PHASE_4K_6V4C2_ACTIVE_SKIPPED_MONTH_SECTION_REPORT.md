# Phase 4K-6V4C2 — Active Skipped Month Section Restore

## Mục tiêu
Khôi phục phần **Báo nghỉ tháng** ở tab **Đang tập** để các võ sinh đã báo nghỉ tháng hiện tại vẫn hiển thị đúng trong khung miễn học phí, không bị ẩn bởi dữ liệu legacy hoặc cache render.

## Nguyên nhân chính
1. Khung `skippedSection` trong `js/ui/render.js` và legacy `app.js` còn dùng điều kiện raw:
   - `status === 'active'`
   - `skippedMonths.includes(selMonth)`
2. Các hồ sơ thực tế có thể dùng trạng thái legacy như `trial`, thiếu `status`, hoặc được phân loại active qua `classifyProfileStatus()`/canonical state.
3. `skippedMonths` có thể lưu bằng nhiều định dạng: `2026-06`, `Tháng Sáu 2026`, `06/2026`, `Tháng 6 - 2026`. So sánh raw bằng `includes(selMonth)` làm danh sách báo nghỉ bị rỗng.
4. `renderApp()` có early-return khi `_dataVersion` không đổi. Khi chỉ chuyển tab hoặc đổi tháng, computation nặng được skip đúng, nhưng khung **Báo nghỉ tháng** cũng không được refresh.
5. `syncStudentSkippedMonthLocal()` chỉ refresh `students.debtList` và `dashboard.summary`, chưa refresh `students.activeList`/khung báo nghỉ đang tập ngay sau khi báo nghỉ hoặc hủy báo nghỉ.

## Sửa đổi chính
- Thêm canonical helpers trong `js/ui/render.js`:
  - `_normalizeSkippedMonthValue()`
  - `_isActiveProfileForSkippedSection()`
  - `_hasSkippedMonthForSelectedMonth()`
  - `_getSkippedMonthNames()`
  - `_renderSkippedMonthSection()`
- Expose API runtime:
  - `window.updateSkippedMonthSection(profiles, month)`
- Khi `renderApp()` early-return vì dataVersion không đổi, nếu đang ở tab `active` vẫn update riêng khung **Báo nghỉ tháng**.
- Sửa `studentsRenderer.js` để `m_skipped` dùng tháng canonical, không dùng `skippedMonths.includes(selMonth)` raw.
- Sửa legacy `app.js` để fallback render cũng dùng canonical status/month.
- Sửa `syncStudentSkippedMonthLocal()` để refresh cả:
  - `students.activeList`
  - `students.debtList`
  - `dashboard.summary`
  - gọi ngay `window.updateSkippedMonthSection(...)`
- Đồng bộ thư mục `public/`.
- Thêm gate kiểm thử `tools/check-active-skipped-month-section-v4c2.mjs` và đưa vào `npm run check` / `check:all:critical`.

## Không thay đổi
- Không thêm Firestore query/listener.
- Không ghi/migration dữ liệu.
- Không thay đổi logic Báo nợ V4C/V4C1.
- Không thay đổi Firestore Rules.

## Cách kiểm tra sau deploy
1. Mở đúng bản có cache-bust: `active-skipped-month-section-20260628-v4c2`.
2. Chọn tháng hiện tại ở bộ lọc tháng.
3. Mở tab **Đang tập**.
4. Khung trên đầu tab phải hiện: `⏸ Báo nghỉ tháng MM/YYYY — N võ sinh miễn học phí` nếu có võ sinh đã báo nghỉ tháng đó.
5. Nếu vừa bấm báo nghỉ/hủy báo nghỉ, khung phải cập nhật ngay mà không cần tải lại trang.

## Console helper
```js
window.updateSkippedMonthSection?.()
```
